require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (!req.usuario.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
  next();
}

// ==================== AUTH ====================

app.post('/api/login', (req, res) => {
  const { matricula, senha } = req.body;
  if (!matricula || !senha) return res.status(400).json({ erro: 'Matrícula e senha obrigatórias' });

  const user = db.prepare('SELECT * FROM usuarios WHERE matricula = ?').get(matricula);
  if (!user) return res.status(401).json({ erro: 'Matrícula não encontrada' });

  const senhaValida = bcrypt.compareSync(senha, user.senha_hash);
  if (!senhaValida) return res.status(401).json({ erro: 'Senha incorreta' });

  const isAdmin = db.prepare('SELECT 1 FROM admins_matriculas WHERE matricula = ?').get(matricula);

  const token = jwt.sign({
    matricula: user.matricula,
    nome: user.nome,
    isAdmin: !!isAdmin || user.isAdmin === 1
  }, JWT_SECRET, { expiresIn: '12h' });

  res.json({
    token,
    usuario: {
      nome: user.nome,
      matricula: user.matricula,
      avatar: user.avatar || user.nome.charAt(0).toUpperCase(),
      curso: user.curso || (isAdmin ? 'Professor & Administrador CEDUP' : 'Estudante CEDUP Hermann Hering'),
      isAdmin: !!isAdmin || user.isAdmin === 1,
      xp: user.xp || 0
    }
  });
});

// ==================== USUARIO ====================

app.get('/api/usuario/perfil', autenticar, (req, res) => {
  const user = db.prepare('SELECT matricula, nome, avatar, curso, xp FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const isAdmin = db.prepare('SELECT 1 FROM admins_matriculas WHERE matricula = ?').get(req.usuario.matricula);
  res.json({ ...user, isAdmin: !!isAdmin || user.isAdmin === 1 });
});

app.put('/api/usuario/xp', autenticar, (req, res) => {
  const { xp } = req.body;
  db.prepare('UPDATE usuarios SET xp = ? WHERE matricula = ?').run(xp, req.usuario.matricula);
  res.json({ ok: true });
});

// ==================== LIVROS ====================

app.get('/api/livros', (req, res) => {
  const livros = db.prepare('SELECT * FROM livros').all();
  res.json(livros.map(l => ({ ...l, disponivel: !!l.disponivel })));
});

app.get('/api/livros/:id', autenticar, (req, res) => {
  const livro = db.prepare('SELECT * FROM livros WHERE id = ?').get(req.params.id);
  if (!livro) return res.status(404).json({ erro: 'Livro não encontrado' });
  const resenhas = db.prepare('SELECT * FROM resenhas WHERE idLivro = ? ORDER BY data DESC').all(livro.id);
  const resenhasComCurtidas = resenhas.map(r => {
    const curtidas = db.prepare('SELECT COUNT(*) as total FROM curtidas_resenhas WHERE idResenha = ?').get(r.id);
    const jaCurtiu = db.prepare('SELECT 1 FROM curtidas_resenhas WHERE idResenha = ? AND matricula = ?').get(r.id, req.usuario.matricula);
    return { ...r, curtidas: curtidas.total, jaCurtiu: !!jaCurtiu };
  });
  res.json({ ...livro, disponivel: !!livro.disponivel, resenhas: resenhasComCurtidas });
});

app.post('/api/livros', autenticar, adminOnly, (req, res) => {
  const { titulo, autor, categoria, formato, paginas, ano, sinopse, previa } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  const id = Date.now();
  db.prepare(`INSERT INTO livros (id, titulo, autor, categoria, formato, paginas, ano, sinopse, previa, disponivel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(id, titulo, autor || '', categoria || 'Geral', formato || 'Fisico', paginas || 0, ano || '', sinopse || '', previa || '');
  res.json({ id, ok: true });
});

app.delete('/api/livros/:id', autenticar, adminOnly, (req, res) => {
  db.prepare('DELETE FROM livros WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==================== EMPRESTIMOS LIVROS ====================

app.get('/api/emprestimos/ativos', autenticar, (req, res) => {
  const emprestimos = db.prepare(`
    SELECT e.*, l.titulo, l.formato, l.capa
    FROM emprestimos_livros e
    JOIN livros l ON e.idLivro = l.id
    WHERE e.matricula = ? AND e.status = 'ativo'
    ORDER BY e.dataEmprestimo DESC
  `).all(req.usuario.matricula);
  res.json(emprestimos);
});

app.post('/api/emprestimos', autenticar, (req, res) => {
  const { idLivro } = req.body;
  const livro = db.prepare('SELECT * FROM livros WHERE id = ?').get(idLivro);
  if (!livro) return res.status(404).json({ erro: 'Livro não encontrado' });
  if (!livro.disponivel) return res.status(400).json({ erro: 'Livro não disponível' });

  const emprestimoAtivo = db.prepare('SELECT 1 FROM emprestimos_livros WHERE idLivro = ? AND matricula = ? AND status = ?').get(idLivro, req.usuario.matricula, 'ativo');
  if (emprestimoAtivo) return res.status(400).json({ erro: 'Você já possui este livro emprestado' });

  const dataEmprestimo = new Date();
  const dataDevolucao = new Date(dataEmprestimo);
  dataDevolucao.setDate(dataDevolucao.getDate() + 7);

  db.prepare('INSERT INTO emprestimos_livros (idLivro, matricula, dataEmprestimo, dataDevolucao) VALUES (?, ?, ?, ?)').run(
    idLivro, req.usuario.matricula, dataEmprestimo.toISOString(), dataDevolucao.toISOString()
  );
  db.prepare('UPDATE livros SET disponivel = 0 WHERE id = ?').run(idLivro);

  res.json({ ok: true, dataDevolucao: dataDevolucao.toISOString() });
});

app.post('/api/emprestimos/:id/prorrogar', autenticar, (req, res) => {
  const emp = db.prepare('SELECT * FROM emprestimos_livros WHERE id = ? AND matricula = ? AND status = ?').get(req.params.id, req.usuario.matricula, 'ativo');
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado' });
  if (emp.prorrogas >= 2) return res.status(400).json({ erro: 'Limite de 2 renovações atingido' });

  const novaData = new Date(emp.dataDevolucao);
  novaData.setDate(novaData.getDate() + 7);

  db.prepare('UPDATE emprestimos_livros SET dataDevolucao = ?, prorrogas = prorrogas + 1 WHERE id = ?').run(novaData.toISOString(), emp.id);
  res.json({ ok: true, novaData: novaData.toISOString(), prorrogas: emp.prorrogas + 1 });
});

app.post('/api/emprestimos/:id/devolver', autenticar, (req, res) => {
  const emp = db.prepare('SELECT * FROM emprestimos_livros WHERE id = ? AND status = ?').get(req.params.id, 'ativo');
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado' });

  db.prepare('UPDATE emprestimos_livros SET status = ? WHERE id = ?').run('devolvido', emp.id);
  db.prepare('UPDATE livros SET disponivel = 1 WHERE id = ?').run(emp.idLivro);
  res.json({ ok: true });
});

// ==================== RESERVAS PCs ====================

app.get('/api/reservas/pcs', autenticar, (req, res) => {
  const reservas = db.prepare('SELECT * FROM reservas_pcs ORDER BY data DESC, horaInicio DESC').all();
  res.json(reservas);
});

app.get('/api/reservas/pcs/minhas', autenticar, (req, res) => {
  const reservas = db.prepare('SELECT * FROM reservas_pcs WHERE matricula = ? ORDER BY data DESC, horaInicio DESC').all(req.usuario.matricula);
  res.json(reservas);
});

app.post('/api/reservas/pcs', autenticar, (req, res) => {
  const { idPc, nomePc, local, data, horaInicio, horaFim } = req.body;
  if (!idPc || !data || !horaInicio || !horaFim) return res.status(400).json({ erro: 'Dados incompletos' });

  const conflito = db.prepare(`
    SELECT 1 FROM reservas_pcs WHERE idPc = ? AND data = ?
    AND ((horaInicio < ? AND horaFim > ?) OR (horaInicio < ? AND horaFim > ?) OR (horaInicio >= ? AND horaFim <= ?))
  `).get(idPc, data, horaFim, horaFim, horaInicio, horaInicio, horaInicio, horaFim);
  if (conflito) return res.status(400).json({ erro: 'Horário já reservado para este PC' });

  const hoje = new Date().toISOString().split('T')[0];
  if (data < hoje) return res.status(400).json({ erro: 'Não é possível reservar para datas passadas' });

  db.prepare('INSERT INTO reservas_pcs (idPc, nomePc, local, matricula, data, horaInicio, horaFim) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    idPc, nomePc || `PC-${String(idPc).padStart(2, '0')}`, local || 'Biblioteca', req.usuario.matricula, data, horaInicio, horaFim
  );
  res.json({ ok: true });
});

app.delete('/api/reservas/pcs/:id', autenticar, (req, res) => {
  const reserva = db.prepare('SELECT * FROM reservas_pcs WHERE id = ?').get(req.params.id);
  if (!reserva) return res.status(404).json({ erro: 'Reserva não encontrada' });
  if (reserva.matricula !== req.usuario.matricula && !req.usuario.isAdmin) return res.status(403).json({ erro: 'Acesso negado' });
  db.prepare('DELETE FROM reservas_pcs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==================== ITENS BIBLIOTECA ====================

app.get('/api/itens', (req, res) => {
  const itens = db.prepare('SELECT * FROM itens_biblioteca').all();
  res.json(itens);
});

app.get('/api/itens/emprestimos', autenticar, (req, res) => {
  const emprestimos = db.prepare('SELECT * FROM emprestimos_itens WHERE matricula = ? AND status = ?').all(req.usuario.matricula, 'ativo');
  res.json(emprestimos);
});

app.get('/api/itens/emprestimos/todos', autenticar, adminOnly, (req, res) => {
  const emprestimos = db.prepare('SELECT * FROM emprestimos_itens WHERE status = ? ORDER BY dataEmprestimo DESC').all('ativo');
  res.json(emprestimos);
});

app.post('/api/itens/emprestar', autenticar, (req, res) => {
  const { idItem } = req.body;
  const item = db.prepare('SELECT * FROM itens_biblioteca WHERE id = ?').get(idItem);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  if (item.qtdDisponivel <= 0) return res.status(400).json({ erro: 'Item indisponível' });

  const emprestimoAtivo = db.prepare('SELECT 1 FROM emprestimos_itens WHERE idItem = ? AND matricula = ? AND status = ?').get(idItem, req.usuario.matricula, 'ativo');
  if (emprestimoAtivo) return res.status(400).json({ erro: 'Você já possui este item emprestado' });

  const countItens = db.prepare('SELECT COUNT(*) as total FROM emprestimos_itens WHERE matricula = ? AND status = ?').get(req.usuario.matricula, 'ativo');
  if (countItens.total >= 2) return res.status(400).json({ erro: 'Limite de 2 itens atingido' });

  const agora = new Date();
  const devolucao = new Date(agora.getTime() + 4 * 60 * 60 * 1000);
  const user = db.prepare('SELECT nome FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);

  db.prepare('INSERT INTO emprestimos_itens (idItem, nomeItem, categoria, icone, matricula, nomeAluno, dataEmprestimo, dataDevolucao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    item.id, item.nome, item.categoria, item.icone, req.usuario.matricula, user?.nome || '', agora.toISOString(), devolucao.toISOString()
  );
  db.prepare('UPDATE itens_biblioteca SET qtdDisponivel = qtdDisponivel - 1 WHERE id = ?').run(item.id);
  res.json({ ok: true });
});

app.post('/api/itens/devolver/:id', autenticar, adminOnly, (req, res) => {
  const emp = db.prepare('SELECT * FROM emprestimos_itens WHERE id = ? AND status = ?').get(req.params.id, 'ativo');
  if (!emp) return res.status(404).json({ erro: 'Empréstimo não encontrado' });

  db.prepare('UPDATE emprestimos_itens SET status = ? WHERE id = ?').run('devolvido', emp.id);
  db.prepare('UPDATE itens_biblioteca SET qtdDisponivel = qtdDisponivel + 1 WHERE id = ?').run(emp.idItem);
  res.json({ ok: true });
});

// ==================== RESENHAS ====================

app.post('/api/resenhas', autenticar, (req, res) => {
  const { idLivro, texto } = req.body;
  if (!texto || texto.length < 10) return res.status(400).json({ erro: 'Texto deve ter pelo menos 10 caracteres' });
  if (texto.length > 3000) return res.status(400).json({ erro: 'Texto deve ter no máximo 3000 caracteres' });

  const livro = db.prepare('SELECT * FROM livros WHERE id = ?').get(idLivro);
  const user = db.prepare('SELECT nome FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);

  db.prepare('INSERT INTO resenhas (idLivro, tituloLivro, autorLivro, matricula, nomeAluno, texto) VALUES (?, ?, ?, ?, ?, ?)').run(
    idLivro, livro?.titulo || 'Livro', livro?.autor || '', req.usuario.matricula, user?.nome || '', texto
  );
  res.json({ ok: true, xp: 300 });
});

app.post('/api/resenhas/:id/curtir', autenticar, (req, res) => {
  const existente = db.prepare('SELECT 1 FROM curtidas_resenhas WHERE idResenha = ? AND matricula = ?').get(req.params.id, req.usuario.matricula);
  if (existente) {
    db.prepare('DELETE FROM curtidas_resenhas WHERE idResenha = ? AND matricula = ?').run(req.params.id, req.usuario.matricula);
    res.json({ ok: true, curtido: false });
  } else {
    db.prepare('INSERT INTO curtidas_resenhas (idResenha, matricula) VALUES (?, ?)').run(req.params.id, req.usuario.matricula);
    res.json({ ok: true, curtido: true, xp: 10 });
  }
});

// ==================== ACHADOS E PERDIDOS ====================

app.get('/api/achados', (req, res) => {
  const itens = db.prepare('SELECT * FROM achados_perdidos ORDER BY data DESC').all();
  res.json(itens);
});

app.post('/api/achados', autenticar, adminOnly, (req, res) => {
  const { nome, local, data, categoria, descricao } = req.body;
  if (!nome || !local || !data) return res.status(400).json({ erro: 'Nome, local e data obrigatórios' });

  db.prepare('INSERT INTO achados_perdidos (nome, local, data, categoria, descricao) VALUES (?, ?, ?, ?, ?)').run(
    nome, local, data, categoria || 'Outro', descricao || ''
  );
  res.json({ ok: true });
});

app.put('/api/achados/:id/devolver', autenticar, adminOnly, (req, res) => {
  db.prepare('UPDATE achados_perdidos SET status = ? WHERE id = ?').run('devolvido', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/achados/:id', autenticar, adminOnly, (req, res) => {
  db.prepare('DELETE FROM achados_perdidos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ==================== DESAFIOS ====================

app.get('/api/desafios', autenticar, (req, res) => {
  const desafios = db.prepare('SELECT * FROM desafios').all();
  const quizzesRespondidos = db.prepare('SELECT idDesafio, acertou FROM quizzes_respondidos WHERE matricula = ?').all(req.usuario.matricula);
  const respondidos = {};
  quizzesRespondidos.forEach(q => { respondidos[q.idDesafio] = q.acertou === 1; });
  res.json({ desafios, quizzesRespondidos: respondidos });
});

app.post('/api/desafios', autenticar, adminOnly, (req, res) => {
  const { titulo, xp, prazo, tipo, frase, opcoes, respostaCorreta } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
  const id = Date.now();
  db.prepare('INSERT INTO desafios (id, titulo, tipo, frase, opcoes, respostaCorreta, xp, prazo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, titulo, tipo || 'atividade', frase || '', JSON.stringify(opcoes || []), respostaCorreta || 0, xp || 100, prazo || 'Semanal'
  );
  res.json({ ok: true });
});

app.post('/api/desafios/:id/responder', autenticar, (req, res) => {
  const { respostaIndex } = req.body;
  const desafio = db.prepare('SELECT * FROM desafios WHERE id = ?').get(req.params.id);
  if (!desafio) return res.status(404).json({ erro: 'Desafio não encontrado' });

  const existente = db.prepare('SELECT 1 FROM quizzes_respondidos WHERE matricula = ? AND idDesafio = ?').get(req.usuario.matricula, desafio.id);
  if (existente) return res.status(400).json({ erro: 'Você já respondeu este desafio' });

  const acertou = respostaIndex === desafio.respostaCorreta ? 1 : 0;
  db.prepare('INSERT INTO quizzes_respondidos (matricula, idDesafio, acertou) VALUES (?, ?, ?)').run(req.usuario.matricula, desafio.id, acertou);

  if (acertou) {
    const user = db.prepare('SELECT xp FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
    const novoXp = (user?.xp || 0) + desafio.xp;
    db.prepare('UPDATE usuarios SET xp = ? WHERE matricula = ?').run(novoXp, req.usuario.matricula);
  }

  res.json({ ok: true, acertou: !!acertou, xpGanho: acertou ? desafio.xp : 0 });
});

// ==================== MEDALHAS ====================

app.get('/api/medalhas/progresso', autenticar, (req, res) => {
  const progresso = {};
  const rows = db.prepare('SELECT chave, valor FROM progresso_aluno WHERE matricula = ?').all(req.usuario.matricula);
  rows.forEach(r => { progresso[r.chave] = r.valor; });
  const medalhas = db.prepare('SELECT idMedalha FROM medalhas_desbloqueadas WHERE matricula = ?').all(req.usuario.matricula);
  const desbloqueadas = medalhas.map(m => m.idMedalha);
  res.json({ progresso, desbloqueadas });
});

app.post('/api/medalhas/incrementar', autenticar, (req, res) => {
  const { chave, valor } = req.body;
  const v = valor || 1;
  const existente = db.prepare('SELECT valor FROM progresso_aluno WHERE matricula = ? AND chave = ?').get(req.usuario.matricula, chave);
  if (existente) {
    db.prepare('UPDATE progresso_aluno SET valor = valor + ? WHERE matricula = ? AND chave = ?').run(v, req.usuario.matricula, chave);
  } else {
    db.prepare('INSERT INTO progresso_aluno (matricula, chave, valor) VALUES (?, ?, ?)').run(req.usuario.matricula, chave, v);
  }
  res.json({ ok: true });
});

app.post('/api/medalhas/desbloquear', autenticar, (req, res) => {
  const { idMedalha, xp } = req.body;
  const existente = db.prepare('SELECT 1 FROM medalhas_desbloqueadas WHERE matricula = ? AND idMedalha = ?').get(req.usuario.matricula, idMedalha);
  if (!existente) {
    db.prepare('INSERT INTO medalhas_desbloqueadas (matricula, idMedalha) VALUES (?, ?)').run(req.usuario.matricula, idMedalha);
    if (xp) {
      const user = db.prepare('SELECT xp FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
      db.prepare('UPDATE usuarios SET xp = ? WHERE matricula = ?').run((user?.xp || 0) + xp, req.usuario.matricula);
    }
  }
  res.json({ ok: true });
});

// ==================== LEITURA DIGITAL ====================

app.post('/api/leituras', autenticar, (req, res) => {
  const { idLivro } = req.body;
  const user = db.prepare('SELECT nome FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
  db.prepare('INSERT INTO leituras_digital (idLivro, matricula, concluida) VALUES (?, ?, 0)').run(idLivro, req.usuario.matricula);
  res.json({ ok: true });
});

app.post('/api/leituras/concluir', autenticar, (req, res) => {
  const { idLivro } = req.body;
  db.prepare('UPDATE leituras_digital SET concluida = 1 WHERE idLivro = ? AND matricula = ? AND concluida = 0').run(idLivro, req.usuario.matricula);
  const user = db.prepare('SELECT xp FROM usuarios WHERE matricula = ?').get(req.usuario.matricula);
  const novoXp = (user?.xp || 0) + 50;
  db.prepare('UPDATE usuarios SET xp = ? WHERE matricula = ?').run(novoXp, req.usuario.matricula);
  res.json({ ok: true, xp: 50 });
});

// ==================== ADMIN ====================

app.get('/api/admin/stats', autenticar, adminOnly, (req, res) => {
  const totalAlunos = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;
  const totalLivros = db.prepare('SELECT COUNT(*) as total FROM livros').get().total;
  const emprestimosAtivos = db.prepare('SELECT COUNT(*) as total FROM emprestimos_livros WHERE status = ?').get('ativo').total;
  const reservasAtivas = db.prepare('SELECT COUNT(*) as total FROM reservas_pcs').get().total;
  const achadosPendentes = db.prepare("SELECT COUNT(*) as total FROM achados_perdidos WHERE status = 'pendente'").get().total;
  const itensEmprestados = db.prepare("SELECT COUNT(*) as total FROM emprestimos_itens WHERE status = 'ativo'").get().total;
  res.json({ totalAlunos, totalLivros, emprestimosAtivos, reservasAtivas, achadosPendentes, itensEmprestados });
});

app.get('/api/admin/alunos', autenticar, adminOnly, (req, res) => {
  const alunos = db.prepare('SELECT matricula, nome, avatar, xp FROM usuarios ORDER BY nome').all();
  res.json(alunos);
});

app.post('/api/admin/alunos', autenticar, adminOnly, (req, res) => {
  const { nome, matricula, isAdmin } = req.body;
  if (!nome || !matricula) return res.status(400).json({ erro: 'Nome e matrícula obrigatórios' });

  const existente = db.prepare('SELECT 1 FROM usuarios WHERE matricula = ?').get(matricula);
  if (existente) return res.status(400).json({ erro: 'Matrícula já cadastrada' });

  const senha_hash = bcrypt.hashSync(matricula.substring(0, 6), 10);
  db.prepare('INSERT INTO usuarios (matricula, nome, senha_hash, avatar, isAdmin) VALUES (?, ?, ?, ?, ?)').run(
    matricula, nome, senha_hash, nome.charAt(0).toUpperCase(), isAdmin ? 1 : 0
  );
  if (isAdmin) {
    db.prepare('INSERT OR IGNORE INTO admins_matriculas (matricula) VALUES (?)').run(matricula);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/alunos/:matricula', autenticar, adminOnly, (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE matricula = ?').run(req.params.matricula);
  res.json({ ok: true });
});

app.put('/api/admin/alunos/:matricula/toggle-admin', autenticar, adminOnly, (req, res) => {
  const user = db.prepare('SELECT isAdmin FROM usuarios WHERE matricula = ?').get(req.params.matricula);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const novoAdmin = user.isAdmin ? 0 : 1;
  db.prepare('UPDATE usuarios SET isAdmin = ? WHERE matricula = ?').run(novoAdmin, req.params.matricula);
  if (novoAdmin) {
    db.prepare('INSERT OR IGNORE INTO admins_matriculas (matricula) VALUES (?)').run(req.params.matricula);
  } else {
    db.prepare('DELETE FROM admins_matriculas WHERE matricula = ?').run(req.params.matricula);
  }
  res.json({ ok: true, isAdmin: !!novoAdmin });
});

app.get('/api/admin/ranking', autenticar, adminOnly, (req, res) => {
  const ranking = db.prepare('SELECT nome, matricula, xp FROM usuarios ORDER BY xp DESC LIMIT 50').all();
  res.json(ranking);
});

// ==================== EXPORT ====================

app.get('/api/admin/export/csv', autenticar, adminOnly, (req, res) => {
  const alunos = db.prepare('SELECT matricula, nome, xp FROM usuarios ORDER BY nome').all();
  let csv = 'Matrícula;Nome;XP\n';
  alunos.forEach(a => { csv += `${a.matricula};${a.nome};${a.xp || 0}\n`; });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=cedupconecta_alunos.csv');
  res.send('\uFEFF' + csv);
});

// ==================== START ====================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;