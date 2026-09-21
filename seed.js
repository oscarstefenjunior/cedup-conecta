require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

console.log('Iniciando seed do banco de dados...');

// ==================== ALUNOS ====================
const ALUNOS_DATA = require('./alunos.js');

const insertUser = db.prepare('INSERT OR IGNORE INTO usuarios (matricula, nome, senha_hash, avatar, curso, xp) VALUES (?, ?, ?, ?, ?, 0)');
const insertMany = (usuarios) => {
  for (const [mat, dados] of Object.entries(usuarios)) {
    const senha_hash = bcrypt.hashSync(dados.senha || mat.substring(0, 6), 10);
    try { insertUser.run(mat, dados.nome, senha_hash, dados.avatar || dados.nome.charAt(0).toUpperCase()); } catch (e) { /* duplicate */ }
  }
};

insertMany(ALUNOS_DATA);
const totalUsers = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;
console.log(`✅ ${totalUsers} usuários importados`);

// ==================== ADMINS ====================
const admins = ['986300', '9999999999'];
const insertAdmin = db.prepare('INSERT OR IGNORE INTO admins_matriculas (matricula) VALUES (?)');
admins.forEach(m => insertAdmin.run(m));
db.prepare('UPDATE usuarios SET isAdmin = 1, curso = ? WHERE matricula IN (?, ?)').run('Professor & Administrador CEDUP', ...admins);
console.log('✅ Administradores configurados');

// ==================== LIVROS ====================
const livros = [
  {
    id: 1, titulo: 'Organização, Sistemas e Métodos', autor: 'Dorival Carreira; Augusto Cesar Ponce de Leon',
    editora: 'Atlas', categoria: 'Administracao', edicao: '7ª Edição', ano: '2012', isbn: '978-85-444-0094-3',
    paginas: 416, formato: 'Fisico', disponivel: 1, capa: 'capas/livro1.jpg',
    sinopse: 'Obra clássica que aborda os fundamentos de organização, sistemas e métodos para empresas.',
    previa: 'A eficiência organizacional depende da capacidade de integrar pessoas, processos e tecnologia...'
  },
  {
    id: 2, titulo: 'Fundamentos de Linguagem de Programação', autor: 'Nelson Pereira Rosa',
    editora: 'Santa Maria', categoria: 'Informatica', edicao: '1ª Edição', ano: '2006', isbn: '85-89112-01-4',
    paginas: 248, formato: 'Fisico', disponivel: 1, capa: 'capas/livro2.jpg',
    sinopse: 'Guia completo sobre os conceitos fundamentais de programação de computadores.',
    previa: 'A linguagem de programação é a ferramenta fundamental para a criação de software...'
  },
  {
    id: 3, titulo: 'Manual Prático do Mecânico', autor: 'Richerto de Cillo',
    editora: 'Érica', categoria: 'Geral', edicao: '1ª Edição', ano: '2009', isbn: '978-85-365-0250-4',
    paginas: 186, formato: 'Fisico', disponivel: 1, capa: 'capas/livro3.jpg',
    sinopse: 'Manual abrangendo os principais conceitos e práticas da mecânica automotiva.',
    previa: 'O mecânico automotivo precisa dominar os fundamentos dos sistemas mecânicos...'
  }
];

const insertLivro = db.prepare('INSERT OR IGNORE INTO livros (id, titulo, autor, editora, categoria, edicao, ano, isbn, paginas, formato, disponivel, capa, sinopse, previa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
livros.forEach(l => insertLivro.run(l.id, l.titulo, l.autor, l.editora, l.categoria, l.edicao, l.ano, l.isbn, l.paginas, l.formato, l.disponivel, l.capa, l.sinopse, l.previa));
console.log('✅ 3 livros cadastrados');

// ==================== ITENS BIBLIOTECA ====================
const itens = [
  { id: 1, nome: 'Carregador Portátil (Powerbank)', categoria: 'Eletronicos', icone: '🔋', qtdTotal: 2, qtdDisponivel: 2 },
  { id: 2, nome: 'Fone de Ouvido', categoria: 'Eletronicos', icone: '🎧', qtdTotal: 5, qtdDisponivel: 5 },
  { id: 3, nome: 'Mouse sem Fio', categoria: 'Eletronicos', icone: '🖱️', qtdTotal: 3, qtdDisponivel: 3 },
  { id: 4, nome: 'Estojo Escolar', categoria: 'Estudo', icone: '✏️', qtdTotal: 10, qtdDisponivel: 10 },
  { id: 5, nome: 'Calculadora Científica', categoria: 'Estudo', icone: '🔢', qtdTotal: 4, qtdDisponivel: 4 },
  { id: 6, nome: 'Lápis de Cor (Caixa 12 cores)', categoria: 'Livros & Materiais', icone: '🎨', qtdTotal: 6, qtdDisponivel: 6 },
  { id: 7, nome: 'Régua 30cm', categoria: 'Estudo', icone: '📏', qtdTotal: 8, qtdDisponivel: 8 },
  { id: 8, nome: 'Borracha', categoria: 'Estudo', icone: '🧹', qtdTotal: 10, qtdDisponivel: 10 },
  { id: 9, nome: 'Pilha AA (pack 4 unidades)', categoria: 'Eletronicos', icone: '🔋', qtdTotal: 5, qtdDisponivel: 5 },
  { id: 10, nome: 'Caneta Esferográfica Azul', categoria: 'Livros & Materiais', icone: '🖊️', qtdTotal: 20, qtdDisponivel: 20 },
  { id: 11, nome: 'Lápis Grafite HB', categoria: 'Livros & Materiais', icone: '✏️', qtdTotal: 15, qtdDisponivel: 15 }
];

const insertItem = db.prepare('INSERT OR IGNORE INTO itens_biblioteca (id, nome, categoria, icone, qtdTotal, qtdDisponivel) VALUES (?, ?, ?, ?, ?, ?)');
itens.forEach(i => insertItem.run(i.id, i.nome, i.categoria, i.icone, i.qtdTotal, i.qtdDisponivel));
console.log('✅ 11 itens de biblioteca cadastrados');

// ==================== DESAFIOS ====================
const desafios = [
  {
    id: 1, titulo: 'Quiz da Semana — Quem disse?', tipo: 'quiz',
    frase: 'A melhor forma de prever o futuro é criá-la.',
    opcoes: JSON.stringify(['Peter Drucker', 'Albert Einstein', 'Steve Jobs', 'Abraham Lincoln', 'Mark Twain']),
    respostaCorreta: 0, xp: 200, prazo: 'Semanal'
  }
];

const insertDesafio = db.prepare('INSERT OR IGNORE INTO desafios (id, titulo, tipo, frase, opcoes, respostaCorreta, xp, prazo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
desafios.forEach(d => insertDesafio.run(d.id, d.titulo, d.tipo, d.frase, d.opcoes, d.respostaCorreta, d.xp, d.prazo));
console.log('✅ Desafios cadastrados');

console.log('\n🎉 Seed concluído com sucesso!');