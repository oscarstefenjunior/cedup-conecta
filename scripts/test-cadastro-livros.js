// Execute com: node scripts/test-cadastro-livros.js
// Requer @electric-sql/pglite instalado localmente, sem conexão com o banco real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'server.js'));

function carregar(arquivo, substituicoes) {
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    require: nome => substituicoes[nome] || localRequire(nome),
    module: modulo, exports: modulo.exports, __dirname: root,
    process: { env: { NODE_ENV: 'production' } }, console, Buffer
  }, { filename: arquivo });
  return modulo.exports;
}

async function main() {
  const postgres = new PGlite();
  const pool = {
    query: async (sql, params) => params ? postgres.query(sql, params) : (await postgres.exec(sql)).at(-1),
    connect: async () => ({ query: pool.query, release() {} })
  };
  const db = carregar('database.js', { pg: { Pool: function () { return pool; } } });
  let server;
  try {
    await db.init();
    await assert.rejects(db.prepare('INSERT INTO livros (id, titulo) VALUES (?, ?)').run(Date.now(), 'Erro antigo'), e => e.code === '22003');
    console.log('Confirmado: o código anterior falha com INTEGER fora do limite.');

    const bcrypt = localRequire('bcryptjs');
    await db.prepare('INSERT INTO usuarios (matricula, nome, senha_hash, is_admin) VALUES (?, ?, ?, ?)').run('teste-admin', 'Administrador de teste', await bcrypt.hash('senha-teste', 4), 1);
    await db.prepare('INSERT INTO livros (id, titulo) VALUES (?, ?)').run(3, 'Livro existente');
    const app = carregar('server.js', { './database': db, './session': {
      criarAutenticacao: banco => localRequire('./session').criarAutenticacao(banco, { seguro: false })
    } });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    async function post(url, body) {
      return fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cedup-Request': '1', Cookie: cookie }, body: JSON.stringify(body) });
    }
    const login = await post('/api/login', { matricula: 'teste-admin', senha: 'senha-teste' });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie').split(';')[0];
    const capa = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'images.png')).toString('base64');
    for (const [indice, imagem] of ['', capa].entries()) {
      const detalhes = indice ? { editora: 'Editora teste', edicao: '2ª edição', isbn: '978-85-02-08920-4' } : {};
      const response = await post('/api/livros', { titulo: 'Livro teste ' + indice, autor: 'Autor teste', categoria: 'Romance', sinopse: 'Teste', capa: imagem, ...detalhes });
      assert.equal(response.status, 200, await response.clone().text());
      const { id } = await response.json();
      assert.equal(id, 4 + indice);
      const livro = await db.prepare('SELECT * FROM livros WHERE id = ?').get(id);
      assert.equal(livro.capa, imagem);
      assert.equal(livro.categoria, 'Romance');
      for (const campo of ['editora', 'edicao', 'isbn']) assert.equal(livro[campo], detalhes[campo] || '');
      const publicado = await (await fetch(base + '/api/livros/' + id, { headers: { Cookie: cookie } })).json();
      for (const campo of ['editora', 'edicao', 'isbn']) assert.equal(publicado[campo], detalhes[campo] || '');
    }
    assert.equal((await post('/api/livros', { titulo: 'ISBN inválido', isbn: '123' })).status, 400);
    const invalida = await post('/api/livros', { titulo: 'Inválida', capa: 'data:image/svg+xml;base64,PHN2Zz4=' });
    assert.equal(invalida.status, 400);
    const grande = await post('/api/livros', { titulo: 'Grande', capa: 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') });
    assert.equal(grande.status, 400);
    assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM livros').get()).total, 3);
    const professor = await post('/api/admin/alunos', { nome: 'Professor teste', matricula: '1234567890', tipo: 'professor' });
    assert.equal(professor.status, 200);
    const promover = await post('/api/admin/alunos', { nome: 'Admin indevido', matricula: '1234567891', tipo: 'professor', isAdmin: true });
    assert.equal(promover.status, 400);
    const loginProfessor = await post('/api/login', { matricula: '1234567890', senha: '123456' });
    assert.equal(loginProfessor.status, 200);
    const perfilProfessor = (await loginProfessor.json()).usuario;
    assert.equal(perfilProfessor.isAdmin, false);
    assert.equal(perfilProfessor.isProfessor, true);
    cookie = loginProfessor.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/livros', { titulo: 'Professor não pode cadastrar' })).status, 403);
    assert.equal((await post('/api/admin/alunos', { nome: 'Outro', matricula: '1234567892' })).status, 403);
    const novoDesafio = await post('/api/desafios', { titulo: '2º ano — Leitura', xp: 100, tipo: 'atividade' });
    assert.equal(novoDesafio.status, 200, await novoDesafio.clone().text());
    const desafio = (await novoDesafio.json()).desafio;
    assert.equal(desafio.id, 1);
    assert.equal((await db.prepare('SELECT titulo FROM desafios WHERE id = ?').get(desafio.id)).titulo, '2º ano — Leitura');
    const excluir = await fetch(base + '/api/desafios/' + desafio.id, { method: 'DELETE', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Cedup-Request': '1' }, body: '{}' });
    assert.equal(excluir.status, 403);
    for (const url of ['/api/admin/alunos', '/api/admin/stats', '/api/admin/export/csv']) {
      assert.equal((await fetch(base + url, { headers: { Cookie: cookie } })).status, 403);
    }
    assert.equal((await post('/api/achados', { nome: 'Teste' })).status, 403);
    assert.equal((await post('/api/desafios', { titulo: 'XP excessivo', xp: 1000 })).status, 400);
    const perfil = await (await fetch(base + '/api/usuario/perfil', { headers: { Cookie: cookie } })).json();
    assert.equal(perfil.isProfessor, true);
    assert.equal(perfil.isAdmin, false);
    await db.prepare('INSERT INTO usuarios (matricula, nome, senha_hash) VALUES (?, ?, ?)').run('aluno-teste', 'Aluno teste', await bcrypt.hash('senha-teste', 4));
    const loginAluno = await post('/api/login', { matricula: 'aluno-teste', senha: 'senha-teste' });
    assert.equal(loginAluno.status, 200);
    cookie = loginAluno.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/desafios', { titulo: 'Aluno não cria', xp: 100 })).status, 403);
    const lista = await (await fetch(base + '/api/desafios', { headers: { Cookie: cookie } })).json();
    assert.equal(lista.desafios.some(d => d.id === desafio.id), true);
    console.log('OK: professor cria desafios visíveis para alunos, mas não exclui nem acessa administração; aluno não cria.');
    cookie = '';
    assert.equal((await post('/api/livros', { titulo: 'Sem sessão' })).status, 401);
    const acervo = await (await fetch(base + '/api/livros')).json();
    assert.equal(acervo.find(l => l.id === 5).capa, capa);
    console.log('OK: login real, cadastro com/sem capa, IDs, persistência, consulta, validações e sessão obrigatória.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await postgres.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
