require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(process.env.DB_PATH || './database.sqlite');

db.exec(`PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;`);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    senha_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    curso TEXT DEFAULT '',
    isAdmin INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admins_matriculas (
    matricula TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS livros (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    autor TEXT DEFAULT '',
    editora TEXT DEFAULT '',
    categoria TEXT DEFAULT 'Geral',
    edicao TEXT DEFAULT '',
    ano TEXT DEFAULT '',
    isbn TEXT DEFAULT '',
    paginas INTEGER DEFAULT 0,
    formato TEXT DEFAULT 'Fisico',
    disponivel INTEGER DEFAULT 1,
    capa TEXT DEFAULT '',
    sinopse TEXT DEFAULT '',
    previa TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS emprestimos_livros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idLivro INTEGER NOT NULL,
    matricula TEXT NOT NULL,
    dataEmprestimo TEXT NOT NULL,
    dataDevolucao TEXT NOT NULL,
    prorrogas INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ativo',
    FOREIGN KEY (idLivro) REFERENCES livros(id),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS reservas_pcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idPc INTEGER NOT NULL,
    nomePc TEXT NOT NULL,
    local TEXT NOT NULL,
    matricula TEXT NOT NULL,
    data TEXT NOT NULL,
    horaInicio TEXT NOT NULL,
    horaFim TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS itens_biblioteca (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL,
    icone TEXT DEFAULT '',
    qtdTotal INTEGER DEFAULT 0,
    qtdDisponivel INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS emprestimos_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idItem INTEGER NOT NULL,
    nomeItem TEXT NOT NULL,
    categoria TEXT NOT NULL,
    icone TEXT DEFAULT '',
    matricula TEXT NOT NULL,
    nomeAluno TEXT NOT NULL,
    dataEmprestimo TEXT NOT NULL,
    dataDevolucao TEXT NOT NULL,
    status TEXT DEFAULT 'ativo',
    FOREIGN KEY (idItem) REFERENCES itens_biblioteca(id),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS resenhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idLivro INTEGER NOT NULL,
    tituloLivro TEXT NOT NULL,
    autorLivro TEXT DEFAULT '',
    matricula TEXT NOT NULL,
    nomeAluno TEXT NOT NULL,
    texto TEXT NOT NULL,
    data TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (idLivro) REFERENCES livros(id),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS curtidas_resenhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idResenha INTEGER NOT NULL,
    matricula TEXT NOT NULL,
    UNIQUE(idResenha, matricula),
    FOREIGN KEY (idResenha) REFERENCES resenhas(id),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS achados_perdidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    local TEXT NOT NULL,
    data TEXT NOT NULL,
    categoria TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente',
    dataCadastro TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS desafios (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    tipo TEXT DEFAULT 'atividade',
    frase TEXT DEFAULT '',
    opcoes TEXT DEFAULT '[]',
    respostaCorreta INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 100,
    prazo TEXT DEFAULT 'Semanal'
  );

  CREATE TABLE IF NOT EXISTS quizzes_respondidos (
    matricula TEXT NOT NULL,
    idDesafio INTEGER NOT NULL,
    acertou INTEGER DEFAULT 0,
    data TEXT DEFAULT (datetime('now')),
    UNIQUE(matricula, idDesafio),
    FOREIGN KEY (idDesafio) REFERENCES desafios(id),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS medalhas_desbloqueadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula TEXT NOT NULL,
    idMedalha INTEGER NOT NULL,
    data TEXT DEFAULT (datetime('now')),
    UNIQUE(matricula, idMedalha),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS progresso_aluno (
    matricula TEXT NOT NULL,
    chave TEXT NOT NULL,
    valor INTEGER DEFAULT 0,
    UNIQUE(matricula, chave),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );

  CREATE TABLE IF NOT EXISTS leituras_digital (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idLivro INTEGER NOT NULL,
    matricula TEXT NOT NULL,
    concluida INTEGER DEFAULT 0,
    data TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (idLivro) REFERENCES livros(id),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
  );
`);

module.exports = db;