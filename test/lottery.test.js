const test = require("node:test");
const assert = require("node:assert/strict");
const LotteryMath = require("../public/lottery");

test("calcula combinações de um fechamento completo", () => {
  assert.equal(LotteryMath.combinationCount(6, 6), 1);
  assert.equal(LotteryMath.combinationCount(7, 6), 7);
  assert.equal(LotteryMath.combinationCount(15, 6), 5005);
  assert.equal(LotteryMath.combinationCount(60, 6), 50063860);
});

test("calcula investimento, prêmios e resultado líquido", () => {
  const draw = {
    premio: 5000000,
    quina: { premio: 50000 },
    quadra: { premio: 1000 },
  };
  const bets = [{ hits: 4 }, { hits: 5 }, { hits: 2 }];
  const summary = LotteryMath.calculateBetSummary(bets, (bet) => ({
    acertos: bet.hits,
    draw,
  }));

  assert.equal(LotteryMath.SIMPLE_BET_PRICE, 6);
  assert.equal(summary.totalSpent, 18);
  assert.equal(summary.totalWon, 51000);
  assert.equal(summary.net, 50982);
  assert.equal(summary.bestHits, 5);
  assert.equal(summary.wins, 2);
});
