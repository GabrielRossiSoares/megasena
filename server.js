const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { normalize, saveDataAtomic, SENA_ODDS } = require("./caixa");
const { calcStats } = require("./stats");

const app = express();
const PORT = 3000;
const POLL_INTERVAL = 5 * 60 * 1000;
const DATA_FILE = path.join(__dirname, "data.json");
const BETS_FILE = path.join(__dirname, "bets.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let cache = { results: [], lastConcurso: 0, lastUpdated: null };
const SSE_CLIENTS = new Set();

// Seed removido. Os dados vêm do data.json.

// ---- Bets persistence helpers ----------------------------------------
function loadBets() {
  if (fs.existsSync(BETS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(BETS_FILE, "utf8"));
      return raw && Array.isArray(raw.bets) ? raw.bets : [];
    } catch (_) {}
  }
  return [];
}

function saveBets(bets) {
  fs.writeFileSync(BETS_FILE, JSON.stringify({ bets }, null, 2));
}

function findMatchingBets(concurso, resultDezenas) {
  const bets = loadBets();
  const resultSet = new Set(resultDezenas);
  return bets
    .filter((b) => b.concurso === concurso)
    .map((b) => {
      const matched = b.dezenas.filter((d) => resultSet.has(d));
      return { ...b, acertos: matched.length, dezenasAcertadas: matched };
    })
    .filter((b) => b.acertos > 0);
}

// normalize() agora vem de ./caixa (fonte única, compartilhada com fetch-history.js)

function mergeResults(base, incoming) {
  const map = new Map(base.map((r) => [r.concurso, r]));
  incoming.forEach((r) => {
    if (r?.concurso) map.set(r.concurso, r);
  });
  return Array.from(map.values()).sort((a, b) => b.concurso - a.concurso);
}

function loadInitialData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const results = (raw.results || raw).filter(
        (r) =>
          r?.concurso && Array.isArray(r?.dezenas) && r.dezenas.length === 6,
      );
      if (results.length > 0) {
        results.sort((a, b) => b.concurso - a.concurso);
        console.log(
          `📂 data.json: ${results.length} concursos (#${results[results.length - 1].concurso} → #${results[0].concurso})`,
        );
        return results;
      }
    } catch (e) {
      console.warn("⚠️  data.json invalido:", e.message);
    }
  }
  console.log(`📦 Sem data.json. Rode: node fetch-history.js`);
  return [];
}

// calcStats() agora vem de ./stats (compartilhado com build.js e update.js)

const fmt = (n) => String(n).padStart(2, "0");

// ---- Memoizacao de calcStats -----------------------------------------
// calcStats varre todos os pares/trios (pesado). So recalcula quando o
// conjunto de resultados muda (novo concurso).
let _statsCache = null;
let _statsKey = "";
function getStats() {
  const key = `${cache.results.length}:${cache.lastConcurso}`;
  if (key !== _statsKey) {
    _statsCache = calcStats(cache.results);
    _statsKey = key;
  }
  return _statsCache;
}

// ---- SSE broadcast ---------------------------------------------------
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  SSE_CLIENTS.forEach((res) => res.write(msg));
}

// ---- Fetch de um concurso especifico ---------------------------------
async function fetchConcurso(n) {
  const url = n
    ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${n}`
    : `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena`;
  try {
    const r = await fetch(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (!r.ok) return null;
    return normalize(await r.json());
  } catch (_) {
    return null;
  }
}

// ---- Poll por novos concursos (com preenchimento de lacunas) ---------
async function poll() {
  console.log(
    `[${new Date().toLocaleTimeString("pt-BR")}] Verificando novidades (atual #${cache.lastConcurso})...`,
  );
  try {
    // 1) Descobre o ultimo concurso REAL disponivel (endpoint sem numero)
    const latest = await fetchConcurso(null);
    if (!latest || !latest.concurso) {
      console.log("  API indisponivel.");
      return;
    }
    if (latest.concurso <= cache.lastConcurso) {
      console.log("  Sem novidades.");
      return;
    }

    // 2) Busca TODOS os concursos faltantes entre o cache e o mais recente.
    //    Assim, se a Caixa publicar #3026 e #3027 entre dois polls, ou se um
    //    numero foi pulado, nada fica para tras.
    const novos = [];
    for (let n = cache.lastConcurso + 1; n <= latest.concurso; n++) {
      const rec = n === latest.concurso ? latest : await fetchConcurso(n);
      if (rec && rec.concurso) {
        novos.push(rec);
        console.log(`✅ Novo: #${rec.concurso} — ${rec.dezenas.join(" ")}`);
      } else {
        console.warn(`  ⚠️  Nao consegui buscar #${n} agora (tento no proximo poll).`);
        break; // nao pula buracos: retoma daqui no proximo ciclo
      }
    }

    if (novos.length === 0) return;

    cache.results = mergeResults(cache.results, novos);
    cache.lastConcurso = cache.results[0].concurso;
    cache.lastUpdated = new Date().toISOString();

    // 3) Persiste de forma atomica (tmp + rename)
    try {
      saveDataAtomic(DATA_FILE, cache.results);
    } catch (e) {
      console.error("  Falha ao salvar data.json:", e.message);
    }

    const stats = getStats();

    // 4) Notifica os clientes de cada novo resultado (do mais antigo ao novo)
    novos
      .sort((a, b) => a.concurso - b.concurso)
      .forEach((n) => {
        const matchedBets = findMatchingBets(n.concurso, n.dezenas);
        broadcast("new-result", {
          result: n,
          stats,
          lastUpdated: cache.lastUpdated,
          nextConcurso: cache.lastConcurso + 1,
          lastConcurso: cache.lastConcurso,
          matchedBets: matchedBets.length > 0 ? matchedBets : undefined,
        });
      });
  } catch (e) {
    console.error("Poll error:", e.message);
  }
}

// ---- Inicializacao ---------------------------------------------------
cache.results = loadInitialData();
cache.lastConcurso = cache.results[0]?.concurso ?? 0;
cache.lastUpdated = new Date().toISOString();

// ---- Rotas -----------------------------------------------------------
app.get("/api/data", (req, res) =>
  res.json({
    results: cache.results,
    stats: getStats(),
    lastUpdated: cache.lastUpdated,
    lastConcurso: cache.lastConcurso,
    nextConcurso: cache.lastConcurso + 1,
  }),
);

app.get("/api/stats", (req, res) => res.json(getStats()));

app.get("/api/last-concurso", (req, res) =>
  res.json({ lastConcurso: cache.lastConcurso }),
);

app.get("/api/fetch-one/:n", async (req, res) => {
  const n = parseInt(req.params.n);
  if (isNaN(n)) return res.status(400).json({ error: "invalid number" });

  const cached = cache.results.find((r) => r.concurso === n);
  if (cached) return res.json(cached);

  try {
    const r = await fetch(
      `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${n}`,
      {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      },
    );
    if (!r.ok) return res.status(404).json({ error: "not found" });
    const norm = normalize(await r.json());
    if (!norm) return res.status(404).json({ error: "parse error" });
    cache.results = mergeResults(cache.results, [norm]);
    if (norm.concurso > cache.lastConcurso) cache.lastConcurso = norm.concurso;
    return res.json(norm);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Bets endpoints --------------------------------------------------
app.get("/api/bets", (req, res) => {
  const bets = loadBets();
  res.json({ bets });
});

app.post("/api/bets", (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming)) {
    return res
      .status(400)
      .json({ error: "Body must be a JSON array of bets" });
  }
  for (const bet of incoming) {
    if (
      !bet.id ||
      !bet.concurso ||
      !Array.isArray(bet.dezenas) ||
      bet.dezenas.length !== 6 ||
      !bet.createdAt
    ) {
      return res.status(400).json({
        error:
          "Each bet must have: id, concurso, dezenas (array of 6 numbers), createdAt",
      });
    }
  }
  const existing = loadBets();
  const map = new Map(existing.map((b) => [b.id, b]));
  incoming.forEach((b) => map.set(b.id, b));
  const merged = Array.from(map.values());
  saveBets(merged);
  res.json({ bets: merged, added: incoming.length });
});

app.delete("/api/bets/:id", (req, res) => {
  const bets = loadBets();
  const idx = bets.findIndex((b) => String(b.id) === String(req.params.id));
  if (idx === -1) {
    return res.status(404).json({ error: "Bet not found" });
  }
  const removed = bets.splice(idx, 1)[0];
  saveBets(bets);
  res.json({ removed, bets });
});

app.post("/api/bets/check", (req, res) => {
  const { dezenas } = req.body;
  if (!Array.isArray(dezenas) || dezenas.length !== 6) {
    return res
      .status(400)
      .json({ error: "Body must have dezenas (array of 6 numbers)" });
  }
  const betSet = new Set(dezenas.map(Number));
  const matches = cache.results
    .map((r) => {
      const matched = r.dezenas.filter((d) => betSet.has(d));
      return {
        concurso: r.concurso,
        data: r.data,
        dezenas: r.dezenas,
        acertos: matched.length,
        dezenasAcertadas: matched,
      };
    })
    .filter((m) => m.acertos > 0)
    .sort((a, b) => b.acertos - a.acertos || b.concurso - a.concurso);
  res.json({ checked: dezenas, totalResults: cache.results.length, matches });
});

// ---- SSE endpoint ----------------------------------------------------
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const stats = getStats();

  res.write(
    `event: init\ndata: ${JSON.stringify({
      results: cache.results,
      stats,
      lastUpdated: cache.lastUpdated,
      lastConcurso: cache.lastConcurso,
      nextConcurso: cache.lastConcurso + 1,
    })}\n\n`,
  );

  const hb = setInterval(() => res.write(": ping\n\n"), 30000);
  SSE_CLIENTS.add(res);
  req.on("close", () => {
    clearInterval(hb);
    SSE_CLIENTS.delete(res);
  });
});

// ---- Start -----------------------------------------------------------
app.listen(PORT, () => {
  const s = getStats();
  console.log(`\n🎰  Dashboard → http://localhost:${PORT}`);
  console.log(
    `📊  ${cache.results.length} concursos | #${s.firstConcurso} (${s.firstData}) → #${cache.lastConcurso}`,
  );
  console.log(`🔄  Polling a cada ${POLL_INTERVAL / 60000}min\n`);
  setInterval(poll, POLL_INTERVAL);
  setTimeout(poll, 5000);
});
