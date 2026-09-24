require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');
const { criarAutenticacao } = require('./session');

const app = express();
const PORT = process.env.PORT || 3000;
const sessao = criarAutenticacao(db);
const { autenticar } = sessao;

app.use('/api', sessao.protegerRequisicao);
app.use('/api/livros', (req, res, next) => {
  if (!['POST', 'PUT'].includes(req.method)) return next();
  autenticar(req, res, () => adminOnly(req, res, () => express.json({ limit: '3mb' })(req, res, next)));
});
app.use(express.json());

const serveEstatico = express.static(path.join(__dirname), { dotfiles: 'deny', index: false });
app.use((req, res, next) => {
  const caminho = (req.path || '/').split('?')[0].replace(/^\/+/, '');
  const permitido = caminho === '' || caminho === 'index.html' || caminho.startsWith('capas/') || caminho === 'images.png';
  if (permitido) return serveEstatico(req, res, next);
  return next();
});

function adminOnly(req, res, next) {
  if (!req.usuario.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
  next();
}

const handle = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ==================== AUTH ====================

app.post('/api/login', handle(async (req, res) => {
  const { matricula, senha } = req.body;
  if (typeof matricula !== 'string' || typeof senha !== 'string' || !matricula || !senha || matricula.length > 100 || senha.length > 200) {
    return res.status(400).json({ erro: 'Matrícula e senha obrigatórias e válidas' });
  }

  const user = await db.prepare('SELECT * FROM usuarios WHERE matricula = ?').get(matricula);
  if (!user) return res.status(401).json({ erro: 'Matrícula ou senha inválidas' });

  const senhaValida = await bcrypt.compare(senha, user.senhaHash);
  if (!senhaValida) return res.status(401).json({ erro: 'Matrícula ou senha inválidas' });

  const isAdmin = await db.prepare('SELECT 1 FROM admins_matriculas WHERE matricula = ?').get(matricula);

  await sessao.iniciar(req, res, user);
  res.json({ usuario: sessao.perfil({ ...user, adminLista: !!isAdmin }) });
}));

app.post('/api/logout', handle(sessao.encerrar));

// ==================== USUARIO ====================

app.get('/api/usuario/perfil', autenticar, handle(async (req, res) => {
  res.json(req.usuario);
}));

app.put('/api/usuario/xp', autenticar, handle(async (req, res) => {
  const { xp, adicionar } = req.body;
  if (adicionar) {
    await db.prepare('UPDATE usuarios SET xp = COALESCE(xp, 0) + ? WHERE matricula = ?').run(adicionar, req.usuario.matricula);
    const user = await db.prepare('SELECT xp FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
    return res.json({ ok: true, xp: user.xp });
  }
  await db.prepare('UPDATE usuarios SET xp = ? WHERE matricula = ?').run(xp || 0, req.usuario.matricula);
  res.json({ ok: true });
}));

// ==================== LIVROS ====================

app.get('/api/livros', handle(async (req, res) => {
  const livros = await db.prepare('SELECT * FROM livros').all();
  res.json(livros.map(l => ({ ...l, disponivel: !!l.disponivel })));
}));

app.get('/api/livros/:id', autenticar, handle(async (req, res) => {
  const livro = await db.prepare('SELECT * FROM livros WHERE id = ?').get(req.params.id);
  if (!livro) return res.status(404).json({ erro: 'Livro não encontrado' });
  const resenhas = await db.prepare('SELECT * FROM resenhas WHERE id_livro = ? ORDER BY data DESC').all(livro.id);
  const resenhasComCurtidas = [];
  for (const r of resenhas) {
    const curtidas = await db.prepare('SELECT COUNT(*) as total FROM curtidas_resenhas WHERE id_resenha = ?').get(r.id);
    const jaCurtiu = await db.prepare('SELECT 1 FROM curtidas_resenhas WHERE id_resenha = ? AND matricula = ?').get(r.id, req.usuario.matricula);
    resenhasComCurtidas.push({ ...r, curtidas: curtidas.total, jaCurtiu: !!jaCurtiu });
  }
  res.json({ ...livro, disponivel: !!livro.disponivel, resenhas: resenhasComCurtidas });
}));

const salvarLivro = handle(async (req, res) => {
  const existente = req.params.id ? await db.prepare('SELECT * FROM livros WHERE id = ?').get(req.params.id) : null;
  if (req.params.id && !existente) return res.status(404).json({ erro: 'Livro não encontrado' });
  const { titulo, autor, editora = '', edicao = '', isbn = '', categoria, formato, paginas, ano, sinopse, previa, capa = '' } = { ...existente, ...req.body };
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  if (typeof editora !== 'string' || editora.length > 200 || typeof edicao !== 'string' || edicao.length > 100 || typeof isbn !== 'string' || isbn.length > 32) {
    return res.status(400).json({ erro: 'Confira os campos Editora, Edição e ISBN.' });
  }
  const isbnLimpo = isbn.replace(/[\s-]/g, '').toUpperCase();
  if (isbnLimpo && isbn !== existente?.isbn && !/^(\d{9}[\dX]|\d{13})$/.test(isbnLimpo)) {
    return res.status(400).json({ erro: 'Informe um ISBN com 10 ou 13 caracteres, ou deixe em branco.' });
  }
  if (typeof capa !== 'string' || (capa && capa !== existente?.capa && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(capa) || Buffer.from(capa.split(',')[1], 'base64').length > 2 * 1024 * 1024))) {
    return res.status(400).json({ erro: 'Envie uma capa JPG, PNG ou WebP de até 2 MB.' });
  }
  let id;
  if (existente) {
    const result = await db.prepare(`UPDATE livros SET titulo = ?, autor = ?, editora = ?, edicao = ?, isbn = ?, categoria = ?,
      formato = ?, paginas = ?, ano = ?, sinopse = ?, previa = ?, capa = ? WHERE id = ?`).run(
      titulo, autor || '', editora.trim(), edicao.trim(), isbn.trim(), categoria || 'Geral', formato || 'Fisico',
      paginas || 0, ano || '', sinopse || '', previa || '', capa, existente.id);
    if (!result.changes) return res.status(404).json({ erro: 'Livro não encontrado' });
    id = existente.id;
  } else {
    id = await db.cadastrarLivro({ titulo, autor, editora: editora.trim(), edicao: edicao.trim(), isbn: isbn.trim(), categoria, formato, paginas, ano, sinopse, previa, capa });
  }
  res.json({ id, ok: true });
});
app.post('/api/livros', autenticar, adminOnly, salvarLivro);
app.put('/api/livros/:id', autenticar, adminOnly, salvarLivro);

app.delete('/api/livros/:id', autenticar, adminOnly, handle(async (req, res) => {
  await db.prepare('DELETE FROM livros WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.put('/api/livros/:id/status', autenticar, adminOnly, handle(async (req, res) => {
  const livro = await db.prepare('SELECT disponivel FROM livros WHERE id = ?').get(req.params.id);
  if (!livro) return res.status(404).json({ erro: 'Livro não encontrado' });
  const novo = livro.disponivel ? 0 : 1;
  await db.prepare('UPDATE livros SET disponivel = ? WHERE id = ?').run(novo, req.params.id);
  res.json({ ok: true, disponivel: !!novo });
}));

// ==================== EMPRESTIMOS LIVROS ====================

app.get('/api/emprestimos/ativos', autenticar, handle(async (req, res) => {
  const emprestimos = await db.prepare(`
    SELECT e.*, l.titulo, l.formato, l.capa
    FROM emprestimos_livros e
    JOIN livros l ON e.id_livro = l.id
    WHERE e.matricula = ? AND e.status = 'ativo'
    ORDER BY e.data_emprestimo DESC
  `).all(req.usuario.matricula);
  res.json(emprestimos);
}));

app.post('/api/emprestimos', autenticar, handle(async (req, res) => {
  const { idLivro } = req.body;
  const livro = await db.prepare('SELECT * FROM livros WHERE id = ?').get(idLivro);
  if (!livro) return res.status(404).json({ erro: 'Livro não encontrado' });
  if (!livro.disponivel) return res.status(400).json({ erro: 'Livro não disponível' });

  const emprestimoAtivo = await db.prepare('SELECT 1 FROM emprestimos_livros WHERE id_livro = ? AND matricula = ? AND status = ?').get(idLivro, req.usuario.matricula, 'ativo');
  if (emprestimoAtivo) return res.status(400).json({ erro: 'Você já possui este livro emprestado' });

  const dataEmprestimo = new Date();
  const dataDevolucao = new Date(dataEmprestimo);
  dataDevolucao.setDate(dataDevolucao.getDate() + 7);

  const result = await db.prepare('INSERT INTO emprestimos_livros (id_livro, matricula, data_emprestimo, data_devolucao) VALUES (?, ?, ?, ?) RETURNING id').run(
    idLivro, req.usuario.matricula, dataEmprestimo.toISOString(), dataDevolucao.toISOString()
  );
  await db.prepare('UPDATE livros SET disponivel = 0 WHERE id = ?').run(idLivro);

  res.json({ ok: true, idEmprestimo: result.lastInsertRowid, dataDevolucao: dataDevolucao.toISOString() });
}));

app.post('/api/emprestimos/:id/prorrogar', autenticar, handle(async (req, res) => {
  const emp = await db.prepare('SELECT * FROM emprestimos_livros WHERE id = ? AND matricula = ? AND status = ?').get(req.params.id, req.usuario.matricula, 'ativo');
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado' });
  if (emp.prorrogas >= 2) return res.status(400).json({ erro: 'Limite de 2 renovações atingido' });

  const novaData = new Date(emp.dataDevolucao);
  novaData.setDate(novaData.getDate() + 7);

  await db.prepare('UPDATE emprestimos_livros SET data_devolucao = ?, prorrogas = prorrogas + 1 WHERE id = ?').run(novaData.toISOString(), emp.id);
  res.json({ ok: true, novaData: novaData.toISOString(), prorrogas: emp.prorrogas + 1 });
}));

app.post('/api/emprestimos/:id/devolver', autenticar, handle(async (req, res) => {
  const emp = await db.prepare('SELECT * FROM emprestimos_livros WHERE id = ? AND status = ?').get(req.params.id, 'ativo');
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado' });

  await db.prepare('UPDATE emprestimos_livros SET status = ? WHERE id = ?').run('devolvido', emp.id);
  await db.prepare('UPDATE livros SET disponivel = 1 WHERE id = ?').run(emp.idLivro);
  res.json({ ok: true });
}));

// ==================== RESERVAS PCs ====================

app.get('/api/reservas/pcs', autenticar, handle(async (req, res) => {
  const reservas = await db.prepare(`
    SELECT r.id, r.id_pc, r.nome_pc, r.local, r.matricula,
      to_char(r.data, 'YYYY-MM-DD') AS data,
      to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio,
      to_char(r.hora_fim, 'HH24:MI') AS hora_fim,
      u.nome AS nome_aluno
    FROM reservas_pcs r
    LEFT JOIN usuarios u ON r.matricula = u.matricula
    ORDER BY r.data DESC, r.hora_inicio DESC
  `).all();
  res.json(reservas);
}));

app.get('/api/reservas/pcs/minhas', autenticar, handle(async (req, res) => {
  const reservas = await db.prepare(`
    SELECT id, id_pc, nome_pc, local, matricula,
      to_char(data, 'YYYY-MM-DD') AS data,
      to_char(hora_inicio, 'HH24:MI') AS hora_inicio,
      to_char(hora_fim, 'HH24:MI') AS hora_fim
    FROM reservas_pcs WHERE matricula = ? ORDER BY data DESC, hora_inicio DESC
  `).all(req.usuario.matricula);
  res.json(reservas);
}));

app.post('/api/reservas/pcs', autenticar, handle(async (req, res) => {
  const { idPc, nomePc, local, data, horaInicio, horaFim } = req.body;
  if (!idPc || !data || !horaInicio || !horaFim) return res.status(400).json({ erro: 'Dados incompletos' });

  const conflito = await db.prepare(`
    SELECT 1 FROM reservas_pcs WHERE id_pc = ? AND data = ?
    AND ((hora_inicio < ? AND hora_fim > ?) OR (hora_inicio < ? AND hora_fim > ?) OR (hora_inicio >= ? AND hora_fim <= ?))
  `).get(idPc, data, horaFim, horaFim, horaInicio, horaInicio, horaInicio, horaFim);
  if (conflito) return res.status(400).json({ erro: 'Horário já reservado para este PC' });

  const hoje = new Date().toISOString().split('T')[0];
  if (data < hoje) return res.status(400).json({ erro: 'Não é possível reservar para datas passadas' });

  await db.prepare('INSERT INTO reservas_pcs (id_pc, nome_pc, local, matricula, data, hora_inicio, hora_fim) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    idPc, nomePc || `PC-${String(idPc).padStart(2, '0')}`, local || 'Biblioteca', req.usuario.matricula, data, horaInicio, horaFim
  );
  res.json({ ok: true });
}));

app.delete('/api/reservas/pcs/:id', autenticar, handle(async (req, res) => {
  const reserva = await db.prepare('SELECT * FROM reservas_pcs WHERE id = ?').get(req.params.id);
  if (!reserva) return res.status(404).json({ erro: 'Reserva não encontrada' });
  if (reserva.matricula !== req.usuario.matricula && !req.usuario.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
  await db.prepare('DELETE FROM reservas_pcs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ==================== ITENS BIBLIOTECA ====================

app.get('/api/itens', handle(async (req, res) => {
  const itens = await db.prepare('SELECT * FROM itens_biblioteca').all();
  res.json(itens);
}));

app.get('/api/itens/emprestimos', autenticar, handle(async (req, res) => {
  const emprestimos = await db.prepare('SELECT * FROM emprestimos_itens WHERE matricula = ? AND status = ?').all(req.usuario.matricula, 'ativo');
  res.json(emprestimos);
}));

app.get('/api/itens/emprestimos/todos', autenticar, adminOnly, handle(async (req, res) => {
  const emprestimos = await db.prepare('SELECT * FROM emprestimos_itens WHERE status = ? ORDER BY data_emprestimo DESC').all('ativo');
  res.json(emprestimos);
}));

app.post('/api/itens/emprestar', autenticar, handle(async (req, res) => {
  const { idItem } = req.body;
  const item = await db.prepare('SELECT * FROM itens_biblioteca WHERE id = ?').get(idItem);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  if (item.qtdDisponivel <= 0) return res.status(400).json({ erro: 'Item indisponível' });

  const emprestimoAtivo = await db.prepare('SELECT 1 FROM emprestimos_itens WHERE id_item = ? AND matricula = ? AND status = ?').get(idItem, req.usuario.matricula, 'ativo');
  if (emprestimoAtivo) return res.status(400).json({ erro: 'Você já possui este item emprestado' });

  const countItens = await db.prepare('SELECT COUNT(*) as total FROM emprestimos_itens WHERE matricula = ? AND status = ?').get(req.usuario.matricula, 'ativo');
  if (countItens.total >= 2) return res.status(400).json({ erro: 'Limite de 2 itens atingido' });

  const agora = new Date();
  const devolucao = new Date(agora.getTime() + 4 * 60 * 60 * 1000);
  const user = await db.prepare('SELECT nome FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);

  await db.prepare('INSERT INTO emprestimos_itens (id_item, nome_item, categoria, icone, matricula, nome_aluno, data_emprestimo, data_devolucao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    item.id, item.nome, item.categoria, item.icone, req.usuario.matricula, user?.nome || '', agora.toISOString(), devolucao.toISOString()
  );
  await db.prepare('UPDATE itens_biblioteca SET qtd_disponivel = qtd_disponivel - 1 WHERE id = ?').run(item.id);
  res.json({ ok: true });
}));

app.post('/api/itens/devolver/:id', autenticar, adminOnly, handle(async (req, res) => {
  const emp = await db.prepare('SELECT * FROM emprestimos_itens WHERE id = ? AND status = ?').get(req.params.id, 'ativo');
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado' });

  await db.prepare('UPDATE emprestimos_itens SET status = ? WHERE id = ?').run('devolvido', emp.id);
  await db.prepare('UPDATE itens_biblioteca SET qtd_disponivel = qtd_disponivel + 1 WHERE id = ?').run(emp.idItem);
  res.json({ ok: true });
}));

// ==================== RESENHAS ====================

app.post('/api/resenhas', autenticar, handle(async (req, res) => {
  const { idLivro, texto } = req.body;
  if (!texto || texto.length < 10) return res.status(400).json({ erro: 'Texto deve ter pelo menos 10 caracteres' });
  if (texto.length > 3000) return res.status(400).json({ erro: 'Texto deve ter no máximo 3000 caracteres' });

  const livro = await db.prepare('SELECT * FROM livros WHERE id = ?').get(idLivro);
  const user = await db.prepare('SELECT nome FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);

  await db.prepare('INSERT INTO resenhas (id_livro, titulo_livro, autor_livro, matricula, nome_aluno, texto) VALUES (?, ?, ?, ?, ?, ?)').run(
    idLivro, livro?.titulo || 'Livro', livro?.autor || '', req.usuario.matricula, user?.nome || '', texto
  );
  res.json({ ok: true, xp: 300 });
}));

app.post('/api/resenhas/:id/curtir', autenticar, handle(async (req, res) => {
  const existente = await db.prepare('SELECT 1 FROM curtidas_resenhas WHERE id_resenha = ? AND matricula = ?').get(req.params.id, req.usuario.matricula);
  if (existente) {
    await db.prepare('DELETE FROM curtidas_resenhas WHERE id_resenha = ? AND matricula = ?').run(req.params.id, req.usuario.matricula);
    res.json({ ok: true, curtido: false });
  } else {
    await db.prepare('INSERT INTO curtidas_resenhas (id_resenha, matricula) VALUES (?, ?)').run(req.params.id, req.usuario.matricula);
    res.json({ ok: true, curtido: true, xp: 10 });
  }
}));

// ==================== ACHADOS E PERDIDOS ====================

app.get('/api/achados', handle(async (req, res) => {
  const itens = await db.prepare(`
    SELECT id, nome, local, to_char(data, 'YYYY-MM-DD') AS data, categoria, descricao, status
    FROM achados_perdidos ORDER BY data DESC
  `).all();
  res.json(itens);
}));

app.post('/api/achados', autenticar, adminOnly, handle(async (req, res) => {
  const { nome, local, data, categoria, descricao } = req.body;
  if (!nome || !local || !data) return res.status(400).json({ erro: 'Nome, local e data obrigatórios' });

  await db.prepare('INSERT INTO achados_perdidos (nome, local, data, categoria, descricao) VALUES (?, ?, ?, ?, ?)').run(
    nome, local, data, categoria || 'Outro', descricao || ''
  );
  res.json({ ok: true });
}));

app.put('/api/achados/:id/devolver', autenticar, adminOnly, handle(async (req, res) => {
  await db.prepare('UPDATE achados_perdidos SET status = ? WHERE id = ?').run('devolvido', req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/achados/:id', autenticar, adminOnly, handle(async (req, res) => {
  await db.prepare('DELETE FROM achados_perdidos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ==================== DESAFIOS ====================

app.get('/api/desafios', autenticar, handle(async (req, res) => {
  const desafios = await db.prepare('SELECT * FROM desafios').all();
  const quizzesRespondidos = await db.prepare('SELECT id_desafio, acertou FROM quizzes_respondidos WHERE matricula = ?').all(req.usuario.matricula);
  const respondidos = {};
  quizzesRespondidos.forEach(q => { respondidos[q.idDesafio] = q.acertou === 1; });
  res.json({ desafios, quizzesRespondidos: respondidos });
}));

app.post('/api/desafios', autenticar, handle(async (req, res) => {
  if (!req.usuario.isAdmin && !req.usuario.isProfessor) return res.status(403).json({ erro: 'Acesso negado' });
  const { titulo, xp = 100, prazo, tipo, frase, opcoes, respostaCorreta } = req.body;
  if (typeof titulo !== 'string' || !titulo.trim()) return res.status(400).json({ erro: 'Título obrigatório' });
  if (!Number.isInteger(xp) || xp < 0 || xp > 300) return res.status(400).json({ erro: 'A recompensa deve ser de 0 a 300 XP.' });
  const id = await db.cadastrarDesafio({ titulo: titulo.trim(), tipo: tipo || 'atividade', frase: frase || '',
    opcoes: opcoes || [], respostaCorreta: respostaCorreta || 0, xp, prazo: prazo || 'Semanal' });
  res.json({
    ok: true,
    desafio: {
      id, titulo, tipo: tipo || 'atividade', frase: frase || '',
      opcoes: JSON.parse(JSON.stringify(opcoes || [])),
      respostaCorreta: respostaCorreta || 0,
      xp,
      prazo: prazo || 'Semanal'
    }
  });
}));

app.delete('/api/desafios/:id', autenticar, adminOnly, handle(async (req, res) => {
  await db.prepare('DELETE FROM desafios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

app.post('/api/desafios/:id/responder', autenticar, handle(async (req, res) => {
  const { respostaIndex } = req.body;
  const desafio = await db.prepare('SELECT * FROM desafios WHERE id = ?').get(req.params.id);
  if (!desafio) return res.status(404).json({ erro: 'Desafio não encontrado' });

  const existente = await db.prepare('SELECT 1 FROM quizzes_respondidos WHERE matricula = ? AND id_desafio = ?').get(req.usuario.matricula, desafio.id);
  if (existente) return res.status(400).json({ erro: 'Você já respondeu este desafio' });

  const acertou = respostaIndex === desafio.respostaCorreta ? 1 : 0;
  await db.prepare('INSERT INTO quizzes_respondidos (matricula, id_desafio, acertou) VALUES (?, ?, ?)').run(req.usuario.matricula, desafio.id, acertou);

  res.json({ ok: true, acertou: !!acertou, xpGanho: acertou ? desafio.xp : 0 });
}));

// ==================== MEDALHAS ====================

app.get('/api/medalhas/progresso', autenticar, handle(async (req, res) => {
  const progresso = {};
  const rows = await db.prepare('SELECT chave, valor FROM progresso_aluno WHERE matricula = ?').all(req.usuario.matricula);
  rows.forEach(r => { progresso[r.chave] = r.valor; });
  const medalhas = await db.prepare('SELECT id_medalha FROM medalhas_desbloqueadas WHERE matricula = ?').all(req.usuario.matricula);
  const desbloqueadas = medalhas.map(m => m.idMedalha);
  res.json({ progresso, desbloqueadas });
}));

app.post('/api/medalhas/incrementar', autenticar, handle(async (req, res) => {
  const { chave, valor } = req.body;
  const v = valor || 1;
  const existente = await db.prepare('SELECT valor FROM progresso_aluno WHERE matricula = ? AND chave = ?').get(req.usuario.matricula, chave);
  if (existente) {
    await db.prepare('UPDATE progresso_aluno SET valor = valor + ? WHERE matricula = ? AND chave = ?').run(v, req.usuario.matricula, chave);
  } else {
    await db.prepare('INSERT INTO progresso_aluno (matricula, chave, valor) VALUES (?, ?, ?)').run(req.usuario.matricula, chave, v);
  }
  res.json({ ok: true });
}));

app.post('/api/medalhas/desbloquear', autenticar, handle(async (req, res) => {
  const { idMedalha, xp } = req.body;
  const existente = await db.prepare('SELECT 1 FROM medalhas_desbloqueadas WHERE matricula = ? AND id_medalha = ?').get(req.usuario.matricula, idMedalha);
  if (!existente) {
    await db.prepare('INSERT INTO medalhas_desbloqueadas (matricula, id_medalha) VALUES (?, ?)').run(req.usuario.matricula, idMedalha);
  }
  res.json({ ok: true });
}));

// ==================== LEITURA DIGITAL ====================

app.post('/api/leituras', autenticar, handle(async (req, res) => {
  const { idLivro } = req.body;
  const user = await db.prepare('SELECT nome FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
  await db.prepare('INSERT INTO leituras_digital (id_livro, matricula, concluida) VALUES (?, ?, 0)').run(idLivro, req.usuario.matricula);
  res.json({ ok: true });
}));

app.post('/api/leituras/concluir', autenticar, handle(async (req, res) => {
  const { idLivro } = req.body;
  const result = await db.prepare('UPDATE leituras_digital SET concluida = 1 WHERE id_livro = ? AND matricula = ? AND concluida = 0 RETURNING id').run(idLivro, req.usuario.matricula);
  res.json({ ok: true, novo: result.changes > 0 });
}));

// ==================== ADMIN ====================

app.get('/api/admin/stats', autenticar, adminOnly, handle(async (req, res) => {
  const totalAlunos = (await db.prepare('SELECT COUNT(*) as total FROM usuarios').get()).total;
  const totalLivros = (await db.prepare('SELECT COUNT(*) as total FROM livros').get()).total;
  const emprestimosAtivos = (await db.prepare('SELECT COUNT(*) as total FROM emprestimos_livros WHERE status = ?').get('ativo')).total;
  const reservasAtivas = (await db.prepare('SELECT COUNT(*) as total FROM reservas_pcs').get()).total;
  const achadosPendentes = (await db.prepare("SELECT COUNT(*) as total FROM achados_perdidos WHERE status = 'pendente'").get()).total;
  const itensEmprestados = (await db.prepare("SELECT COUNT(*) as total FROM emprestimos_itens WHERE status = 'ativo'").get()).total;
  res.json({ totalAlunos, totalLivros, emprestimosAtivos, reservasAtivas, achadosPendentes, itensEmprestados });
}));

app.get('/api/admin/alunos', autenticar, adminOnly, handle(async (req, res) => {
  const alunos = await db.prepare(`
    SELECT u.matricula, u.nome, u.avatar, u.xp, u.is_admin, u.is_professor,
      (SELECT 1 FROM admins_matriculas am WHERE am.matricula = u.matricula) AS admin_flag
    FROM usuarios u ORDER BY u.nome
  `).all();
  res.json(alunos.map(a => ({ ...a, isAdmin: !!a.isAdmin || !!a.adminFlag })));
}));

app.post('/api/admin/alunos', autenticar, adminOnly, handle(async (req, res) => {
  const { nome, matricula, tipo = 'aluno' } = req.body;
  if (!nome || !matricula) return res.status(400).json({ erro: 'Nome e matrícula obrigatórios' });
  if (!['aluno', 'professor'].includes(tipo) || req.body.isAdmin) {
    return res.status(400).json({ erro: 'Novos usuários podem ser estudantes ou professores, sem poderes administrativos.' });
  }

  const existente = await db.prepare('SELECT 1 FROM usuarios WHERE matricula = ?').get(matricula);
  if (existente) return res.status(400).json({ erro: 'Matrícula já cadastrada' });

  const senha_hash = bcrypt.hashSync(matricula.substring(0, 6), 10);
  await db.prepare('INSERT INTO usuarios (matricula, nome, senha_hash, avatar, is_admin, is_professor) VALUES (?, ?, ?, ?, 0, ?)').run(
    matricula, nome, senha_hash, nome.charAt(0).toUpperCase(), tipo === 'professor' ? 1 : 0
  );
  res.json({ ok: true });
}));

app.delete('/api/admin/alunos/:matricula', autenticar, adminOnly, handle(async (req, res) => {
  await db.prepare('DELETE FROM usuarios WHERE matricula = ?').run(req.params.matricula);
  res.json({ ok: true });
}));

app.put('/api/admin/alunos/:matricula/toggle-admin', autenticar, adminOnly, handle(async (req, res) => {
  res.status(403).json({ erro: 'Alterações de administradores estão temporariamente desativadas enquanto as permissões são definidas.' });
}));

app.put('/api/admin/alunos/:matricula/xp', autenticar, adminOnly, handle(async (req, res) => {
  const valor = parseInt(req.body.qtd, 10) || 0;
  if (!valor) return res.status(400).json({ erro: 'Quantidade de XP inválida' });
  const user = await db.prepare('SELECT 1 FROM usuarios WHERE matricula = ?').get(req.params.matricula);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
  await db.prepare('UPDATE usuarios SET xp = COALESCE(xp, 0) + ? WHERE matricula = ?').run(valor, req.params.matricula);
  res.json({ ok: true, xp: valor });
}));

app.get('/api/admin/ranking', autenticar, adminOnly, handle(async (req, res) => {
  const ranking = await db.prepare('SELECT nome, matricula, xp FROM usuarios ORDER BY xp DESC LIMIT 50').all();
  res.json(ranking);
}));

// ==================== EXPORT ====================

app.get('/api/admin/export/csv', autenticar, adminOnly, handle(async (req, res) => {
  const alunos = await db.prepare('SELECT matricula, nome, xp FROM usuarios ORDER BY nome').all();
  let csv = 'Matrícula;Nome;XP\n';
  alunos.forEach(a => { csv += `${a.matricula};${a.nome};${a.xp || 0}\n`; });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=cedupconecta_alunos.csv');
  res.send('\uFEFF' + csv);
}));

// ==================== START ====================

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

app.use((err, req, res, next) => {
  console.error('Erro na rota:', err);
  const status = err.type === 'entity.parse.failed' ? 400 : err.status === 413 ? 413 : 500;
  res.status(status).json({ erro: status === 400 ? 'JSON inválido' : status === 413 ? 'Requisição muito grande' : 'Erro interno. Tente novamente.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
