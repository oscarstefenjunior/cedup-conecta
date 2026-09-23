require('dotenv').config();
const db = require('../database');

async function main() {
  await db.init();
  console.log('Schema criado/verificado no PostgreSQL (Supabase)');
  await db.pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Erro ao criar schema:', err);
  process.exit(1);
});