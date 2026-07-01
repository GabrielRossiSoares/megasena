#!/usr/bin/env node
/**
 * build.js — Gera os arquivos estáticos para o GitHub Pages
 * ─────────────────────────────────────────────────────────────
 * Lê o data.json canônico (raiz) e escreve, dentro de public/:
 *   - public/data.json   (os concursos)
 *   - public/stats.json  (estatísticas pré-calculadas)
 * Assim o site funciona 100% estático, sem servidor Node.
 */
const fs = require("fs");
const path = require("path");
const { calcStats } = require("./stats");

const ROOT_DATA = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");

function writeJSON(file, obj) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

(function main() {
  if (!fs.existsSync(ROOT_DATA)) {
    console.error("❌ data.json não encontrado. Rode: node fetch-history.js");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(ROOT_DATA, "utf8"));
  const results = (raw.results || raw)
    .filter((r) => r?.concurso && Array.isArray(r?.dezenas) && r.dezenas.length === 6)
    .sort((a, b) => b.concurso - a.concurso);

  const lastConcurso = results[0]?.concurso ?? 0;
  const stats = calcStats(results);

  const dataOut = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    lastConcurso,
    nextConcurso: lastConcurso + 1,
    results,
  };

  writeJSON(path.join(PUBLIC_DIR, "data.json"), dataOut);
  writeJSON(path.join(PUBLIC_DIR, "stats.json"), stats);

  console.log(
    `✅ build: ${results.length} concursos (#${stats.firstConcurso} → #${lastConcurso}) → public/data.json + public/stats.json`,
  );
})();
