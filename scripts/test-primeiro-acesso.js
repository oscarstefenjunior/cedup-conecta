const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
function carregar(file, mocks) {
  const module = { exports: {} };
  const req = createRequire(path.join(root, file));
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    require: name => mocks[name] || req(name), module, exports: module.exports,
    __dirname: path.dirname(path.join(root, file)), process: { env: { NODE_ENV: 'production' } }, console, Buffer
  });
  return module.exports;
}
async function main() {
  const pg = new PGlite();
  const pool = { query: async (sql, args) => args ? pg.query(sql, args) : (await pg.exec(sql)).at(-1) };
  pool.connect = async () => ({ query: pool.query, release() {} });
  const db = carregar('database.js', { pg: { Pool: function () { return pool; } } });
  let server;
  try {
    await db.init();
    const { importar } = carregar('scripts/importar-professores.js', { '../database': db });
    const lista = [{ matricula: '123456-7-01', nome: 'Professor Teste' }];
    assert.equal((await importar(lista)).novos, 1);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM usuarios').get()).n, 0);
    assert.equal((await importar(lista, true)).novos, 1);
    const app = carregar('server.js', { './database': db, './session': { criarAutenticacao: banco => require('../session').criarAutenticacao(banco, { seguro: false }) } });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const call = (url, body) => fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Cedup-Request': '1', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const login = await call('/api/login', { matricula: '123456', senha: '123456' });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).usuario.trocarSenha, true);
    cookie = login.headers.get('set-cookie').split(';')[0];
    const anterior = cookie;
    assert.equal((await call('/api/emprestimos/ativos')).status, 403);
    assert.equal((await (await call('/api/usuario/perfil')).json()).trocarSenha, true);
    assert.equal((await call('/api/usuario/senha', { novaSenha: '123456', confirmacao: '123456' })).status, 400);
    assert.equal((await call('/api/usuario/senha', { novaSenha: 'nova-senha-teste', confirmacao: 'diferente' })).status, 400);
    const troca = await call('/api/usuario/senha', { novaSenha: 'nova-senha-teste', confirmacao: 'nova-senha-teste' });
    assert.equal(troca.status, 200);
    assert.equal((await troca.json()).usuario.trocarSenha, false);
    cookie = troca.headers.get('set-cookie').split(';')[0];
    assert.equal((await call('/api/emprestimos/ativos')).status, 200);
    cookie = anterior;
    assert.equal((await call('/api/usuario/perfil')).status, 401);
    assert.equal((await call('/api/login', { matricula: '123456', senha: '123456' })).status, 401);
    assert.equal((await importar(lista, true)).existentes, 1);
    assert.equal((await call('/api/login', { matricula: '123456', senha: 'nova-senha-teste' })).status, 200);
    await assert.rejects(importar([{ matricula: '654321', nome: 'Novo' }, { matricula: '123456', nome: 'Outra pessoa' }], true));
    assert.equal(await db.prepare('SELECT * FROM usuarios WHERE matricula = ?').get('654321'), undefined);
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    console.log('OK: importação, conflitos, preservação de senha, bloqueio inicial, troca, revogação de sessão e sintaxe da interface.');
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await pg.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

