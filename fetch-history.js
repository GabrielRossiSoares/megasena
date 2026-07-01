#!/usr/bin/env node
/**
 * fetch-history.js — Mega-Sena histórico completo desde 1996
 * ─────────────────────────────────────────────────────────────
 * ✅ Auto-detecta o último concurso disponível na API da Caixa
 * ✅ Busca SEQUENCIALMENTE (1 por vez) para não ser bloqueado
 * ✅ Salva progresso a cada concurso (pode retomar com Ctrl+C)
 * ✅ Resiliência com retry e backoff
 *
 * Execute:  node fetch-history.js
 * Retomar:  node fetch-history.js          (detecta automaticamente)
 * Forçar:   node fetch-history.js --reset
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { normalize, saveDataAtomic } = require("./caixa");

const DATA_FILE = path.join(__dirname, "data.json");
const FIRST_CONCURSO = 1;

// --enrich: re-baixa TODOS os concursos ja existentes para preencher os
// campos novos (jackpot, arrecadacao, cidades, quina/quadra).
const ENRICH = process.argv.includes("--enrich");

const DELAY_BETWEEN = 350;   // ms entre requests
const DELAY_LONG = 2000;     // pausa extra a cada 50 concursos
const TIMEOUT = 15000;
const MAX_RETRIES = 5;

// ─── Utilitários ──────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bar(done, total, width = 40) {
  const pct = done / total;
  const fill = Math.round(pct * width);
  return `[${"█".repeat(fill)}${" ".repeat(width - fill)}] ${Math.round(pct * 100)}%`;
}

// ─── Auto-detecta o último concurso ──────────────────────────
async function detectLastConcurso() {
  console.log("🔍 Detectando último concurso disponível...");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(
        "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena",
        {
          timeout: TIMEOUT,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
            Referer: "https://loterias.caixa.gov.br/",
          },
        }
      );
      if (!r.ok) { await sleep(2000); continue; }
      const d = await r.json();
      if (d?.numero) {
        console.log(`✅ Último concurso: #${d.numero} (${d.dataApuracao || ""})\n`);
        return d.numero;
      }
    } catch (e) {
      console.warn(`   Tentativa ${attempt + 1} falhou: ${e.message}`);
      await sleep(2000);
    }
  }
  console.log("📌 Usando fallback: 3025\n");
  return 3025;
}

// normalize() agora vem de ./caixa (fonte única, compartilhada com server.js)

// ─── Fetch com retry e backoff ───────────────────────────────
async function fetchConcurso(n) {
  const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/${n}`;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        timeout: TIMEOUT,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://loterias.caixa.gov.br/",
        },
      });
      if (res.status === 404) return { concurso: n, status: "not_found" };
      if (res.status === 429) {
        console.log(`\n⏳ Rate limited no #${n}, aguardando 8s...`);
        await sleep(8000);
        continue;
      }
      if (!res.ok) {
        if (attempt < MAX_RETRIES - 1) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        return { concurso: n, status: "error", code: res.status };
      }
      const json = await res.json();
      const data = normalize(json);
      if (!data) return { concurso: n, status: "parse_error" };
      return { concurso: n, status: "ok", data };
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  return { concurso: n, status: "timeout" };
}

// ─── Carrega data.json existente ─────────────────────────────
function loadExisting() {
  if (!fs.existsSync(DATA_FILE)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const list = raw.results || raw;
    const map = new Map();
    if (Array.isArray(list)) {
      list.forEach((r) => {
        if (r?.concurso && r.dezenas?.length === 6) map.set(r.concurso, r);
      });
    }
    return map;
  } catch (_) {
    return new Map();
  }
}

// ─── Salva data.json (escrita atômica: tmp + rename) ──────────
function saveData(map) {
  return saveDataAtomic(DATA_FILE, Array.from(map.values()));
}

// ─── MAIN ─────────────────────────────────────────────────────
(async () => {
  console.log("\n┌──────────────────────────────────────────────────────────┐");
  console.log("│   🎰  MEGA-SENA — Download Histórico Completo (1996→hoje) │");
  console.log("└──────────────────────────────────────────────────────────┘\n");

  // Auto-detecta o último concurso
  const LAST_CONCURSO = await detectLastConcurso();

  // Carrega dados já existentes
  const existing = loadExisting();
  console.log(`📂 Dados existentes: ${existing.size} concursos\n`);

  // Quais concursos precisamos buscar? (do mais antigo ao mais recente)
  // Modo --enrich: rebusca TODOS para preencher os campos novos.
  const toFetch = [];
  for (let n = FIRST_CONCURSO; n <= LAST_CONCURSO; n++) {
    if (ENRICH || !existing.has(n)) toFetch.push(n);
  }

  if (ENRICH) {
    console.log("♻️  Modo --enrich: rebaixando todos para preencher jackpot/cidades/premiações.\n");
  }

  if (toFetch.length === 0) {
    console.log("✅ Todos os concursos já estão em data.json!\n");
    process.exit(0);
  }

  const total = toFetch.length;
  console.log(
    `🎯 Concursos a buscar: ${total}  (${existing.size} já baixados)`,
  );
  console.log(
    "📡 Modo sequencial (1 request por vez) para máxima confiabilidade\n",
  );
  console.log(
    "Pressione Ctrl+C a qualquer momento — o progresso é salvo automaticamente.\n",
  );

  let fetched = 0;
  let errors = 0;
  let notFound = 0;
  let consecutiveNotFound = 0;
  const startTs = Date.now();

  // Processa SEQUENCIALMENTE (1 por vez)
  for (let i = 0; i < toFetch.length; i++) {
    const n = toFetch[i];
    const result = await fetchConcurso(n);

    if (result.status === "ok") {
      existing.set(result.data.concurso, result.data);
      fetched++;
      consecutiveNotFound = 0;
    } else if (result.status === "not_found") {
      notFound++;
      consecutiveNotFound++;
    } else {
      errors++;
      consecutiveNotFound = 0;
    }

    // Salva data.json a cada 20 concursos
    if (i % 20 === 0 || i === toFetch.length - 1) {
      saveData(existing);
    }

    // Status
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
    const rate = (fetched + notFound + errors) / Math.max(elapsed, 1);
    const remain = Math.round((total - i - 1) / Math.max(rate, 0.1));
    const rmStr =
      remain > 3600
        ? `${Math.floor(remain / 3600)}h${Math.floor((remain % 3600) / 60)}min`
        : remain > 60
          ? `${Math.floor(remain / 60)}min${remain % 60}s`
          : `${remain}s`;

    process.stdout.write(
      `\r${bar(i + 1, total)} | ✅ ${fetched} | ❌ ${errors} | 🔍 ${notFound} 404s | ⏱ ~${rmStr}  `,
    );

    // Pausa extra a cada 50 concursos
    if ((i + 1) % 50 === 0) {
      await sleep(DELAY_LONG);
    } else {
      await sleep(DELAY_BETWEEN);
    }
  }

  // Salva final
  const total_saved = saveData(existing);

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  const sorted = Array.from(existing.values()).sort(
    (a, b) => a.concurso - b.concurso,
  );

  console.log("\n\n══════════════════════════════════════════════════════════");
  console.log(`✅ Concluído! ${total_saved} concursos em data.json`);
  if (sorted.length > 0) {
    console.log(
      `   Do #${sorted[0]?.concurso} (${sorted[0]?.data}) → #${sorted[sorted.length - 1]?.concurso} (${sorted[sorted.length - 1]?.data})`,
    );
  }
  console.log(`   Tempo: ${elapsed}s | Novos: ${fetched} | Erros: ${errors} | 404s: ${notFound}`);
  console.log("\n▶  Agora reinicie o servidor:  node server.js\n");
})();

// ─── Salva ao Ctrl+C ──────────────────────────────────────────
let saving = false;
process.on("SIGINT", () => {
  if (saving) return;
  saving = true;
  console.log(
    "\n\n⚠️  Interrompido. Os dados já foram salvos — rode novamente para retomar.\n",
  );
  process.exit(0);
});
