// node scripts/importar-professores.js caminho/para/professores.json [--aplicar]
// JSON privado: [{ "matricula": "123456", "nome": "Nome" }].
require('dotenv').config();
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const db = require('../database');

async function importar(registros, aplicar = false) {
  const vistos = new Set();
  const lista = registros.map(item => {
    const matricula = String(item.matricula).replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(matricula) || !item.nome?.trim() || vistos.has(matricula)) throw new Error('Lista inválida ou matrícula repetida.');
    vistos.add(matricula);
    return { matricula, nome: item.nome.trim() };
  });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (aplicar) await db.initSessions();
    await client.query('LOCK TABLE usuarios IN SHARE ROW EXCLUSIVE MODE');
    const resumo = { novos: 0, existentes: 0, conflitos: 0, aplicado: aplicar };
    for (const item of lista) {
      const { rows } = await client.query('SELECT nome, is_professor FROM usuarios WHERE matricula = $1', [item.matricula]);
      if (rows.length) {
        resumo.existentes++;
        if (rows[0].nome.trim().toLocaleUpperCase('pt-BR') !== item.nome.toLocaleUpperCase('pt-BR') || rows[0].is_professor !== 1) resumo.conflitos++;
        continue;
      }
      resumo.novos++;
      if (aplicar) await client.query('INSERT INTO usuarios (matricula, nome, senha_hash, avatar, is_professor, trocar_senha) VALUES ($1,$2,$3,$4,1,1)', [item.matricula, item.nome, await bcrypt.hash(item.matricula, 10), item.nome.charAt(0)]);
    }
    if (resumo.conflitos && aplicar) throw new Error(`${resumo.conflitos} conflitos com contas existentes. Importação cancelada integralmente.`);
    await client.query(aplicar ? 'COMMIT' : 'ROLLBACK');
    return resumo;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

module.exports = { importar };
if (require.main === module) {
  (async () => {
    if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para consultar/importar o banco.');
    const registros = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    console.log(await importar(registros, process.argv.includes('--aplicar')));
  })().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.pool.end());
}
