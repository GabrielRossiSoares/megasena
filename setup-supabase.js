/**
 * Aplica as migrations do Supabase usando uma conexão PostgreSQL direta.
 *
 * Uso (PowerShell):
 *   $env:SUPABASE_DB_URL="postgresql://..."
 *   node setup-supabase.js
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL não configurada. Consulte .env.example.");
  process.exit(1);
}

const migrationFile = path.join(
  __dirname,
  "supabase",
  "migrations",
  "20260713_secure_user_data.sql",
);

async function main() {
  const sql = fs.readFileSync(migrationFile, "utf8");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("Migração de segurança aplicada com sucesso.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Falha ao aplicar migração:", error.message);
  process.exitCode = 1;
});
