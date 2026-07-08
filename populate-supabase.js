/**
 * populate-supabase.js
 * Envia os resultados do data.json para o Supabase
 */
const fs = require('fs');
const fetch = require('node-fetch');

const SUPABASE_URL = "https://diyptbtsaqfjnucwakpn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpeXB0YnRzYXFmam51Y3dha3BuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzUzNjI0NSwiZXhwIjoyMDk5MTEyMjQ1fQ.CeIaG5WR1RdcRslf_KNNdvn8O99e5a0J4XJqJrdSijA";

async function populate() {
  console.log("Lendo data.json...");
  const raw = fs.readFileSync('data.json', 'utf8');
  const data = JSON.parse(raw);
  const results = data.results || data;
  
  console.log(`Encontrados ${results.length} resultados. Preparando envio...`);
  
  // Vamos enviar em lotes de 500 para não estourar o payload
  const batchSize = 500;
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize).map(r => {
      // Converte a data de dd/mm/yyyy para yyyy-mm-dd
      let dateParts = r.data.split('/');
      let dateIso = null;
      if (dateParts.length === 3) {
        dateIso = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      }
      
      return {
        concurso: r.concurso,
        data_sorteio: dateIso,
        dezenas: r.dezenas,
        acumulado: r.acumulado || false,
        ganhadores: r.ganhadores || 0,
        premio_sena: 0
      };
    });

    console.log(`Enviando lote de ${i} a ${i + batch.length}...`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/resultados`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(batch)
    });
    
    if (!res.ok) {
      console.error("Erro no envio do lote:", await res.text());
    }
  }
  
  console.log("Finalizado!");
}

populate().catch(console.error);
