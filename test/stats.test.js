const test = require("node:test");
const assert = require("node:assert/strict");
const { calcStats } = require("../stats");

test("calcula estatísticas básicas e uma sugestão válida", () => {
  const results = [
    { concurso: 2, data: "02/01/2026", dezenas: [2, 12, 22, 32, 42, 52], ganhadores: 0 },
    { concurso: 1, data: "01/01/2026", dezenas: [1, 11, 21, 31, 41, 51], ganhadores: 1, premio: 100 },
  ];
  const stats = calcStats(results);

  assert.equal(stats.total, 2);
  assert.equal(stats.firstConcurso, 1);
  assert.equal(stats.freq.length, 60);
  assert.equal(stats.suggestion.length, 6);
  assert.equal(new Set(stats.suggestion).size, 6);
  assert.ok(stats.suggestion.every((number) => number >= 1 && number <= 60));
});
