const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, SENA_ODDS } = require("../caixa");

test("normaliza a resposta atual da Caixa", () => {
  const result = normalize({
    numero: 42,
    dataApuracao: "13/07/2026",
    listaDezenas: ["60", "01", "12", "25", "34", "48"],
    listaRateioPremio: [
      { faixa: 1, numeroDeGanhadores: 2, valorPremio: 1000 },
      { faixa: 2, numeroDeGanhadores: 10, valorPremio: 100 },
      { faixa: 3, numeroDeGanhadores: 100, valorPremio: 10 },
    ],
  });

  assert.deepEqual(result.dezenas, [1, 12, 25, 34, 48, 60]);
  assert.equal(result.ganhadores, 2);
  assert.equal(result.premioTotalSena, 2000);
  assert.equal(result.acumulado, false);
  assert.equal(SENA_ODDS, 50063860);
});

test("rejeita respostas sem seis dezenas", () => {
  assert.equal(normalize({ numero: 1, listaDezenas: ["01"] }), null);
});
