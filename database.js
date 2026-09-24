require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

function convertParams(sql, params) {
  let paramIndex = 1;
  const converted = sql.replace(/\?/g, () => `$${paramIndex++}`);
  return { text: converted, values: params };
}

function toCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return result;
}

function prepare(sql) {
  const { text, values: paramNames } = convertParams(sql, []);
  
  return {
    get: async (...params) => {
      const { text: t } = convertParams(sql, params);
      const res = await pool.query(t, params);
      return toCamel(res.rows[0]);
    },
    all: async (...params) => {
      const { text: t } = convertParams(sql, params);
      const res = await pool.query(t, params);
      return res.rows.map(toCamel);
    },
    run: async (...params) => {
      const { text: t } = convertParams(sql, params);
      const res = await pool.query(t, params);
      return { 
        changes: res.rowCount, 
        lastInsertRowid: res.rows[0]?.id 
      };
    },
  };
}

let sessionsReady;
function initSessions() {
  if (!sessionsReady) {
    sessionsReady = pool.query(`
      CREATE TABLE IF NOT EXISTS sessoes (
        token_hash TEXT PRIMARY KEY,
        matricula TEXT NOT NULL REFERENCES usuarios(matricula) ON DELETE CASCADE,
        credencial_hash TEXT NOT NULL,
        expira_em TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessoes_expira_em_idx ON sessoes(expira_em);
      ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE sessoes FROM PUBLIC;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE ALL ON TABLE sessoes FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE ALL ON TABLE sessoes FROM authenticated;
        END IF;
      END $$;
    `).catch(error => { sessionsReady = null; throw error; });
  }
  return sessionsReady;
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      matricula TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      curso TEXT DEFAULT '',
      is_admin INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins_matriculas (
      matricula TEXT PRIMARY KEY
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS emprestimos_livros (
      id SERIAL PRIMARY KEY,
      id_livro INTEGER NOT NULL,
      matricula TEXT NOT NULL,
      data_emprestimo TIMESTAMP NOT NULL,
      data_devolucao TIMESTAMP NOT NULL,
      prorrogas INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ativo',
      FOREIGN KEY (id_livro) REFERENCES livros(id),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas_pcs (
      id SERIAL PRIMARY KEY,
      id_pc INTEGER NOT NULL,
      nome_pc TEXT NOT NULL,
      local TEXT NOT NULL,
      matricula TEXT NOT NULL,
      data DATE NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fim TIME NOT NULL,
      criado_em TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS itens_biblioteca (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      icone TEXT DEFAULT '',
      qtd_total INTEGER DEFAULT 0,
      qtd_disponivel INTEGER DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS emprestimos_itens (
      id SERIAL PRIMARY KEY,
      id_item INTEGER NOT NULL,
      nome_item TEXT NOT NULL,
      categoria TEXT NOT NULL,
      icone TEXT DEFAULT '',
      matricula TEXT NOT NULL,
      nome_aluno TEXT NOT NULL,
      data_emprestimo TIMESTAMP NOT NULL,
      data_devolucao TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'ativo',
      FOREIGN KEY (id_item) REFERENCES itens_biblioteca(id),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resenhas (
      id SERIAL PRIMARY KEY,
      id_livro INTEGER NOT NULL,
      titulo_livro TEXT NOT NULL,
      autor_livro TEXT DEFAULT '',
      matricula TEXT NOT NULL,
      nome_aluno TEXT NOT NULL,
      texto TEXT NOT NULL,
      data TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (id_livro) REFERENCES livros(id),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS curtidas_resenhas (
      id SERIAL PRIMARY KEY,
      id_resenha INTEGER NOT NULL,
      matricula TEXT NOT NULL,
      UNIQUE(id_resenha, matricula),
      FOREIGN KEY (id_resenha) REFERENCES resenhas(id),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS achados_perdidos (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      local TEXT NOT NULL,
      data DATE NOT NULL,
      categoria TEXT NOT NULL,
      descricao TEXT DEFAULT '',
      status TEXT DEFAULT 'pendente',
      data_cadastro TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS desafios (
      id INTEGER PRIMARY KEY,
      titulo TEXT NOT NULL,
      tipo TEXT DEFAULT 'atividade',
      frase TEXT DEFAULT '',
      opcoes TEXT DEFAULT '[]',
      resposta_correta INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 100,
      prazo TEXT DEFAULT 'Semanal'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes_respondidos (
      matricula TEXT NOT NULL,
      id_desafio INTEGER NOT NULL,
      acertou INTEGER DEFAULT 0,
      data TIMESTAMP DEFAULT NOW(),
      UNIQUE(matricula, id_desafio),
      FOREIGN KEY (id_desafio) REFERENCES desafios(id),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medalhas_desbloqueadas (
      id SERIAL PRIMARY KEY,
      matricula TEXT NOT NULL,
      id_medalha INTEGER NOT NULL,
      data TIMESTAMP DEFAULT NOW(),
      UNIQUE(matricula, id_medalha),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progresso_aluno (
      matricula TEXT NOT NULL,
      chave TEXT NOT NULL,
      valor INTEGER DEFAULT 0,
      UNIQUE(matricula, chave),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leituras_digital (
      id SERIAL PRIMARY KEY,
      id_livro INTEGER NOT NULL,
      matricula TEXT NOT NULL,
      concluida INTEGER DEFAULT 0,
      data TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (id_livro) REFERENCES livros(id),
      FOREIGN KEY (matricula) REFERENCES usuarios(matricula)
    );
  `);

  await initSessions();
  console.log('✅ Tabelas criadas/verificadas no PostgreSQL');
}

module.exports = { prepare, pool, init, initSessions };
