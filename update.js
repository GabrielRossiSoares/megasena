#!/usr/bin/env node
/**
 * update.js — Robô de atualização (usado pelo GitHub Actions)
 * ─────────────────────────────────────────────────────────────
 * Busca no site da Caixa apenas os concursos NOVOS (desde o último
 * que já temos) e os adiciona ao data.json. Preenche lacunas.
 * Reaproveita normalize() e saveDataAtomic() de caixa.js.
 *
 * Sai com código 0 sempre. Escreve "changed=true/false" no
 * GITHUB_OUTPUT para o workflow decidir se faz commit.
 */
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { normalize, saveDataAtomic } = require("./caixa");

const DATA_FILE = path.join(__dirname, "data.json");
const API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
  Referer: "https://loterias.caixa.gov.br/",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setOutput(changed, extra = {}) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(out, `changed=${changed}\n`);
    for (const [k, v] of Object.entries(extra)) fs.appendFileSync(out, `${k}=${v}\n`);
  }
}

async function fetchOne(n) {
  const url = n ? `${API}/${n}` : API;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { timeout: 15000, headers: HEADERS });
      if (r.status === 429) { await sleep(8000); continue; }
      if (!r.ok) { await sleep(1500 * (attempt + 1)); continue; }
      return normalize(await r.json());
    } catch (_) {
      await sleep(1500 * (attempt + 1));
    }
  }
  return null;
}

(async () => {
  const map = new Map();
  if (fs.existsSync(DATA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    (raw.results || raw).forEach((r) => {
      if (r?.concurso && r.dezenas?.length === 6) map.set(r.concurso, r);
    });
  }
  const known = map.size ? Math.max(...map.keys()) : 0;
  console.log(`📂 ${map.size} concursos (último #${known})`);

  const latest = await fetchOne(null);
  if (!latest || !latest.concurso) {
    console.log("⚠️  API indisponível — nada a fazer.");
    setOutput(false);
    process.exit(0);
  }
  if (latest.concurso <= known) {
    console.log(`✅ Já estamos atualizados (#${known}).`);
    setOutput(false);
    process.exit(0);
  }

  let added = 0;
  for (let n = known + 1; n <= latest.concurso; n++) {
    const rec = n === latest.concurso ? latest : await fetchOne(n);
    if (rec && rec.concurso) {
      map.set(rec.concurso, rec);
      added++;
      console.log(`✅ Novo: #${rec.concurso} — ${rec.dezenas.join(" ")}`);
    } else {
      console.warn(`⚠️  Falha ao buscar #${n} — paro aqui (retomo na próxima).`);
      break;
    }
    await sleep(400);
  }

  if (added === 0) {
    setOutput(false);
    process.exit(0);
  }

  const total = saveDataAtomic(DATA_FILE, Array.from(map.values()));
  const last = Math.max(...map.keys());
  console.log(`💾 data.json salvo: ${total} concursos (novos: ${added}, último #${last}).`);
  setOutput(true, { added, last });
})();
