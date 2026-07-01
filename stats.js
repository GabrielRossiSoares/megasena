/**
 * stats.js — Cálculo de estatísticas (fonte única)
 * ─────────────────────────────────────────────────────────────
 * Usado por server.js (API ao vivo), build.js (gera stats.json
 * para o site estático) e update.js (robô do GitHub Actions).
 * Recebe a lista de resultados (mais recente primeiro).
 */
const { SENA_ODDS } = require("./caixa");

function calcStats(results) {
  const N = results.length;
  if (N === 0) return {};

  const freq = new Array(61).fill(0);
  const lastSeen = new Array(61).fill(999);

  results.forEach((r, idx) =>
    r.dezenas.forEach((x) => {
      freq[x]++;
      if (idx < lastSeen[x]) lastSeen[x] = idx;
    }),
  );

  const sorted = Array.from({ length: 60 }, (_, i) => i + 1).sort(
    (a, b) => freq[b] - freq[a],
  );
  const sums = results.map((r) => r.dezenas.reduce((a, b) => a + b, 0));
  const maxF = Math.max(...freq.slice(1));
  const minF = Math.min(...freq.slice(1));

  const decadeFreq = [0, 0, 0, 0, 0, 0];
  results.forEach((r) =>
    r.dezenas.forEach((x) => {
      decadeFreq[Math.floor((x - 1) / 10)]++;
    }),
  );

  // Sugestao rapida (usada pelo server, o frontend gera as 3)
  function score(n) {
    return (freq[n] / maxF) * 0.5 + (lastSeen[n] / N) * 0.5;
  }
  const cands = Array.from({ length: 60 }, (_, i) => i + 1)
    .map((n) => ({ n, s: score(n) }))
    .sort((a, b) => b.s - a.s);
  const pick = [],
    dec = [0, 0, 0, 0, 0, 0];
  let ev = 0;
  for (const c of cands) {
    if (pick.length >= 6) break;
    const d = Math.floor((c.n - 1) / 10),
      ie = c.n % 2 === 0;
    if (dec[d] >= 2 || (ev > 3 && ie) || (pick.length - ev > 3 && !ie))
      continue;
    pick.push(c.n);
    dec[d]++;
    if (ie) ev++;
  }

  const fmt = (n) => String(n).padStart(2, "0");

  // Pares e trios frequentes
  const pairs = new Map();
  const triplets = new Map();

  results.forEach(r => {
    const d = [...r.dezenas].sort((a,b) => a-b);
    for(let i=0; i<d.length; i++) {
      for(let j=i+1; j<d.length; j++) {
        const p = `${fmt(d[i])}-${fmt(d[j])}`;
        pairs.set(p, (pairs.get(p) || 0) + 1);
        for(let k=j+1; k<d.length; k++) {
          const t = `${fmt(d[i])}-${fmt(d[j])}-${fmt(d[k])}`;
          triplets.set(t, (triplets.get(t) || 0) + 1);
        }
      }
    }
  });

  const topPairs = Array.from(pairs.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p, f]) => ({ pair: p, count: f }));

  const topTriplets = Array.from(triplets.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t, f]) => ({ triplet: t, count: f }));

  // Maior atraso historico por numero
  const maxDelay = new Array(61).fill(0);
  const currentDelay = new Array(61).fill(0);

  // Vamos varrer os resultados do mais antigo (final do array) pro mais novo (inicio)
  const reversedResults = [...results].reverse();
  reversedResults.forEach(r => {
    // Incrementa o atraso de todos
    for(let i=1; i<=60; i++) {
      currentDelay[i]++;
    }
    // Zera o atraso dos que sairam
    r.dezenas.forEach(n => {
      if(currentDelay[n] > maxDelay[n]) {
        maxDelay[n] = currentDelay[n];
      }
      currentDelay[n] = 0;
    });
  });

  // Atualiza com o atraso final
  for(let i=1; i<=60; i++) {
    if(currentDelay[i] > maxDelay[i]) {
      maxDelay[i] = currentDelay[i];
    }
  }

  // Estatisticas financeiras
  const totalPrizes = results.reduce((acc, r) => acc + (r.premio || 0), 0);
  let consecutiveAcc = 0;
  let maxConsecutiveAcc = 0;

  reversedResults.forEach(r => {
    if(r.acumulado) {
      consecutiveAcc++;
      if(consecutiveAcc > maxConsecutiveAcc) {
        maxConsecutiveAcc = consecutiveAcc;
      }
    } else {
      consecutiveAcc = 0;
    }
  });

  // ── Números que GANHARAM + valor + probabilidade ─────────────────
  // Concursos que efetivamente premiaram a sena (houve ganhador).
  const winningDraws = results.filter((r) => (r.ganhadores || 0) > 0);
  const nWins = winningDraws.length;

  // Por número: quantas vezes saiu num sorteio premiado, e quanto valor
  // total (soma dos prêmios da sena) esse número "acompanhou".
  const winFreq = new Array(61).fill(0);
  const winValue = new Array(61).fill(0);
  winningDraws.forEach((r) => {
    const val = r.premioTotalSena || (r.premio || 0) * (r.ganhadores || 0) || r.premio || 0;
    r.dezenas.forEach((x) => {
      winFreq[x]++;
      winValue[x] += val;
    });
  });

  // Ranking dos números "mais premiados" (mais presentes em jogos com ganhador)
  const luckyNumbers = Array.from({ length: 60 }, (_, i) => i + 1)
    .map((n) => ({
      n,
      wins: winFreq[n],
      value: Math.round(winValue[n]),
      // probabilidade empírica de esse número sair em qualquer sorteio
      probPct: +((freq[n] / N) * 100).toFixed(2),
    }))
    .sort((a, b) => b.wins - a.wins || b.value - a.value);

  // Estatísticas de valor
  const senaPrizes = winningDraws.map((r) => r.premio || 0).filter((v) => v > 0);
  const biggestPrizeDraw = winningDraws
    .slice()
    .sort((a, b) => (b.premio || 0) - (a.premio || 0))[0];
  const avgSenaPrize = senaPrizes.length
    ? Math.round(senaPrizes.reduce((a, b) => a + b, 0) / senaPrizes.length)
    : 0;
  const totalSenaGanhadores = winningDraws.reduce((a, r) => a + (r.ganhadores || 0), 0);

  // Cidades mais sorteadas (onde a sena mais saiu).
  // Apostas pela internet vêm com município vazio ou "CANAL ELETRONICO":
  // agrupamos todas como "Canal Eletrônico (online)".
  const cityMap = new Map();
  winningDraws.forEach((r) =>
    (r.cidades || []).forEach((c) => {
      // normaliza: MAIÚSCULAS e sem acento, p/ mesclar "São Paulo"/"SAO PAULO"
      const norm = (s) =>
        (s || "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toUpperCase()
          .trim();
      const mun = norm(c.municipio);
      const uf = norm((c.uf || "").replace(/-+/g, ""));
      let label;
      if (!mun || /CANAL\s*ELETR/.test(mun)) label = "Canal Eletrônico (online)";
      else label = uf ? `${mun}/${uf}` : mun;
      cityMap.set(label, (cityMap.get(label) || 0) + (c.ganhadores || 1));
    }),
  );
  const topCities = Array.from(cityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  // Jackpot / próximo concurso (vem do concurso mais recente)
  const latest = results[0] || {};

  // Probabilidades fixas da sena por tipo de aposta (jogos de 6 a 15 dezenas)
  // odds = C(60,6) / C(k,6)
  const comb = (n, k) => {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
  };
  const betOdds = Array.from({ length: 10 }, (_, i) => i + 6).map((k) => ({
    dezenas: k,
    // 1 em X
    odds: Math.round(SENA_ODDS / comb(k, 6)),
    apostas: comb(k, 6),
  }));

  return {
    total: N,
    freq: freq.slice(1),
    lastSeen: lastSeen.slice(1),
    top10: sorted.slice(0, 10),
    bot10: sorted.slice(50),
    sumAvg: Math.round(sums.reduce((a, b) => a + b, 0) / N),
    sumMin: Math.min(...sums),
    sumMax: Math.max(...sums),
    evenAvg: +(
      results
        .map((r) => r.dezenas.filter((x) => x % 2 === 0).length)
        .reduce((a, b) => a + b, 0) / N
    ).toFixed(2),
    highAvg: +(
      results
        .map((r) => r.dezenas.filter((x) => x > 30).length)
        .reduce((a, b) => a + b, 0) / N
    ).toFixed(2),
    decadeFreq,
    maxFreq: maxF,
    minFreq: minF,
    suggestion: pick.sort((a, b) => a - b),
    winners: results.filter((r) => r.ganhadores > 0).length,
    accumulated: results.filter((r) => r.acumulado).length,
    firstConcurso: results[results.length - 1]?.concurso,
    firstData: results[results.length - 1]?.data,
    topPairs,
    topTriplets,
    maxDelay: maxDelay.slice(1),
    totalPrizes,
    maxConsecutiveAcc,

    // ── Ganhadores / valor / probabilidade ──
    senaOdds: SENA_ODDS,
    winningDrawsCount: nWins,
    winRatePct: +((nWins / N) * 100).toFixed(1),
    totalSenaGanhadores,
    totalSenaPaid: Math.round(senaPrizes.reduce((a, b) => a + b, 0)),
    avgSenaPrize,
    biggestPrize: biggestPrizeDraw
      ? {
          concurso: biggestPrizeDraw.concurso,
          data: biggestPrizeDraw.data,
          premio: biggestPrizeDraw.premio,
          ganhadores: biggestPrizeDraw.ganhadores,
          dezenas: biggestPrizeDraw.dezenas,
        }
      : null,
    luckyNumbers: luckyNumbers.slice(0, 15),
    winFreq: winFreq.slice(1),
    topCities,
    betOdds,
    jackpot: {
      acumuladoProx: latest.acumuladoProx || 0,
      estimativaProx: latest.estimativaProx || 0,
      arrecadacao: latest.arrecadacao || 0,
      ultimoConcurso: latest.concurso || 0,
    },
  };
}

module.exports = { calcStats };
