/**
 * setup-supabase.js  — usa @supabase/supabase-js com rpc para criar tabelas
 * Execute: node setup-supabase.js
 */
const fetch = require("node-fetch");

const URL  = "https://diyptbtsaqfjnucwakpn.supabase.co";
const SKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpeXB0YnRzYXFmam51Y3dha3BuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzUzNjI0NSwiZXhwIjoyMDk5MTEyMjQ1fQ.CeIaG5WR1RdcRslf_KNNdvn8O99e5a0J4XJqJrdSijA";

const headers = {
  "apikey": SKEY,
  "Authorization": `Bearer ${SKEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal",
};

// Tenta inserir dados usando REST API (confirma que tabela existe)
async function tableExists(table) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id&limit=1`, {
    headers,
  });
  return r.status !== 404;
}

// Usa o endpoint /rest/v1/rpc/<function_name> se existir, 
// ou tenta criar tabelas via SQL usando o Supabase SQL API
async function execSQL(sql) {
  // Endpoint direto do Supabase para executar SQL (requer service_role)
  const r = await fetch(`${URL}/rest/v1/rpc/exec`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql }),
  });
  return { status: r.status, body: await r.text() };
}

async function main() {
  console.log("🔍 Verificando tabelas existentes...\n");
  const tables = ["apostas", "sugestoes_historico", "resultados", "meus_jogos"];
  for (const t of tables) {
    const exists = await tableExists(t);
    console.log(`  ${exists ? "✅" : "❌"} ${t}`);
  }

  console.log("\n📊 Tentando criar via SQL RPC...");
  const r = await execSQL("SELECT 1");
  console.log("RPC exec result:", r.status, r.body.slice(0, 200));
}

main().catch(console.error);
