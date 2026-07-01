/**
 * caixa.js — Módulo compartilhado (fonte única da verdade)
 * ─────────────────────────────────────────────────────────────
 * Usado por server.js (polling) e fetch-history.js (backfill).
 * Antes existiam DUAS funções normalize() divergentes: a do
 * server.js lia campos antigos (dezenas/premiacoes) que a API não
 * retorna mais, então TODO concurso novo era descartado no polling.
 * Agora ambos usam exatamente a mesma lógica.
 */
const fs = require("fs");

// Odds fixas da Mega-Sena: C(60,6) = 50.063.860
const SENA_ODDS = 50063860;

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// ─── Normaliza a resposta da API da Caixa (formato REAL atual) ──────────
function normalize(d) {
  if (!d?.numero) return null;

  // A API usa "listaDezenas" (array de strings), não "dezenas"
  const dezenas = d.listaDezenas || d.dezenas;
  if (!Array.isArray(dezenas) || dezenas.length !== 6) return null;

  // A API usa "listaRateioPremio" com "numeroDeGanhadores"
  const premios = d.listaRateioPremio || d.premiacoes || [];
  const faixa = (f) => premios.find((p) => p.faixa === f) || {};
  const sena = faixa(1);
  const quina = faixa(2);
  const quadra = faixa(3);

  const ganhadores = sena.numeroDeGanhadores ?? sena.ganhadores ?? 0;
  const premio = toNum(sena.valorPremio);

  const cidades = Array.isArray(d.listaMunicipioUFGanhadores)
    ? d.listaMunicipioUFGanhadores
        .filter((c) => c && (c.municipio || c.uf))
        .map((c) => ({
          municipio: c.municipio || "",
          uf: c.uf || "",
          ganhadores: toNum(c.ganhadores) || 1,
        }))
    : [];

  return {
    // ── Campos originais (compatibilidade) ──
    concurso: d.numero,
    data: d.dataApuracao || d.data || "",
    dezenas: dezenas.map(Number).sort((a, b) => a - b),
    ganhadores,
    premio,
    acumulado: d.acumulado ?? ganhadores === 0,

    // ── Campos novos (valor / jackpot / premiações) ──
    // total pago na sena; a API às vezes zera valorTotalPremioFaixaUm,
    // então caímos para premio-por-ganhador × nº de ganhadores.
    premioTotalSena: toNum(d.valorTotalPremioFaixaUm) || premio * ganhadores,
    arrecadacao: toNum(d.valorArrecadado),
    acumuladoProx: toNum(d.valorAcumuladoProximoConcurso),
    estimativaProx: toNum(d.valorEstimadoProximoConcurso),
    quina: {
      ganhadores: toNum(quina.numeroDeGanhadores),
      premio: toNum(quina.valorPremio),
    },
    quadra: {
      ganhadores: toNum(quadra.numeroDeGanhadores),
      premio: toNum(quadra.valorPremio),
    },
    cidades,
  };
}

// ─── Escrita atômica: grava em .tmp e renomeia (rename é atômico no
//     mesmo volume). Evita corromper o data.json se o processo cair
//     no meio de um writeFileSync de ~700 KB. ──────────────────────
function saveDataAtomic(file, results, extra = {}) {
  const sorted = [...results].sort((a, b) => b.concurso - a.concurso);
  const payload = {
    generatedAt: new Date().toISOString(),
    total: sorted.length,
    ...extra,
    results: sorted,
  };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, file);
  return sorted.length;
}

module.exports = { normalize, saveDataAtomic, toNum, SENA_ODDS };
