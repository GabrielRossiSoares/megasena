(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LotteryMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  const SIMPLE_BET_PRICE = 6;

  function combinationCount(n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
    return Math.round(result);
  }

  function prizeForHits(draw, hits) {
    if (!draw) return 0;
    if (hits === 6) return Number(draw.premio) || 0;
    if (hits === 5) return Number(draw.quina?.premio) || 0;
    if (hits === 4) return Number(draw.quadra?.premio) || 0;
    return 0;
  }

  function calculateBetSummary(bets, resultForBet) {
    let bestHits = 0;
    let totalWon = 0;
    let wins = 0;

    const results = bets.map((bet) => {
      const result = resultForBet(bet);
      bestHits = Math.max(bestHits, result.acertos || 0);
      const prize = prizeForHits(result.draw, result.acertos);
      if (prize > 0) wins++;
      totalWon += prize;
      return { bet, res: result, prize };
    });

    const totalSpent = bets.length * SIMPLE_BET_PRICE;
    return {
      results,
      bestHits,
      wins,
      totalSpent,
      totalWon,
      net: totalWon - totalSpent,
    };
  }

  return {
    SIMPLE_BET_PRICE,
    combinationCount,
    prizeForHits,
    calculateBetSummary,
  };
});
