/**
 * Envia data.json para a tabela pública de resultados.
 * A service_role deve existir apenas no ambiente local/CI, nunca no Git.
 */
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Consulte .env.example.",
  );
  process.exit(1);
}

function toIsoDate(value) {
  const [day, month, year] = String(value || "").split("/");
  return day && month && year ? `${year}-${month}-${day}` : null;
}

async function populate() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data.json"), "utf8"),
  );
  const results = raw.results || raw;
  console.log(`Enviando ${results.length} resultados...`);

  const batchSize = 500;
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize).map((result) => ({
      concurso: result.concurso,
      data_sorteio: toIsoDate(result.data),
      dezenas: result.dezenas,
      acumulado: Boolean(result.acumulado),
      ganhadores: result.ganhadores || 0,
      premio_sena: result.premio || 0,
    }));

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/resultados?on_conflict=concurso`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      },
    );

    if (!response.ok) {
      throw new Error(`Lote ${i}-${i + batch.length}: ${await response.text()}`);
    }
    console.log(`Lote ${i + 1}-${i + batch.length} concluído.`);
  }
}

populate().catch((error) => {
  console.error("Falha na importação:", error.message);
  process.exitCode = 1;
});
