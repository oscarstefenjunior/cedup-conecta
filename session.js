const { randomBytes, createHash } = require('node:crypto');

const DURACAO_MS = 12 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');

function criarAutenticacao(db, { seguro = process.env.NODE_ENV === 'production' || !!process.env.VERCEL } = {}) {
  const nomeCookie = seguro ? '__Host-cedup_sessao' : 'cedup_sessao';
  const opcoesCookie = { httpOnly: true, secure: seguro, sameSite: 'lax', path: '/' };

  function lerCookie(req) {
    const cookies = (req.headers.cookie || '').split(';').map(part => part.trim());
    const valores = cookies.filter(part => part.startsWith(nomeCookie + '='));
    if (valores.length !== 1) return null;
    const token = valores[0].slice(nomeCookie.length + 1);
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  }

  function limparCookie(res) {
    res.clearCookie(nomeCookie, opcoesCookie);
  }

  function perfil(user) {
    const isAdmin = user.isAdmin === 1 || user.adminLista === true;
    const isProfessor = !isAdmin && user.isProfessor === 1;
    return {
      matricula: user.matricula,
      nome: user.nome,
      avatar: user.avatar || user.nome.charAt(0).toUpperCase(),
      curso: user.curso || (isAdmin ? 'Administrador CEDUP' : isProfessor ? 'Professor CEDUP' : 'Estudante CEDUP Hermann Hering'),
      isAdmin,
      isProfessor,
      xp: user.xp || 0
    };
  }

  // A API atende apenas o próprio site. O header customizado exige preflight
  // em outra origem, e nenhuma autorização CORS é concedida pelo servidor.
  function protegerRequisicao(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origem = req.get('Origin');
    let origemValida = true;
    if (origem) {
      try {
        const url = new URL(origem);
        origemValida = url.origin === `${seguro ? 'https' : req.protocol}://${req.get('Host')}`;
      } catch { origemValida = false; }
    }
    if (!origemValida || req.get('Sec-Fetch-Site') === 'cross-site' || req.get('X-Cedup-Request') !== '1') {
      return res.status(403).json({ erro: 'Origem da requisição não autorizada' });
    }
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie o corpo em JSON' });
    next();
  }

  async function iniciar(req, res, user) {
    await db.initSessions();
    const anterior = lerCookie(req);
    await db.prepare('DELETE FROM sessoes WHERE expira_em <= NOW() OR token_hash = ?').run(anterior ? hash(anterior) : '');
    const token = randomBytes(32).toString('hex');
    await db.prepare('INSERT INTO sessoes (token_hash, matricula, credencial_hash, expira_em) VALUES (?, ?, ?, ?)')
      .run(hash(token), user.matricula, hash(user.senhaHash), new Date(Date.now() + DURACAO_MS));
    res.cookie(nomeCookie, token, { ...opcoesCookie, maxAge: DURACAO_MS });
  }

  async function autenticar(req, res, next) {
    const token = lerCookie(req);
    if (!token) {
      limparCookie(res);
      return res.status(401).json({ erro: 'Sessão ausente ou inválida' });
    }
    try {
      await db.initSessions();
      const user = await db.prepare(`
        SELECT u.matricula, u.nome, u.avatar, u.curso, u.xp, u.is_admin, u.is_professor, u.senha_hash,
          s.credencial_hash AS credencial_sessao,
          EXISTS (SELECT 1 FROM admins_matriculas a WHERE a.matricula = u.matricula) AS admin_lista
        FROM sessoes s JOIN usuarios u ON u.matricula = s.matricula
        WHERE s.token_hash = ? AND s.expira_em > NOW()
      `).get(hash(token));
      if (!user || user.credencialSessao !== hash(user.senhaHash)) {
        limparCookie(res);
        return res.status(401).json({ erro: 'Sessão expirada ou revogada. Entre novamente.' });
      }
      req.usuario = perfil(user);
      next();
    } catch (error) { next(error); }
  }

  async function encerrar(req, res) {
    const token = lerCookie(req);
    if (token) {
      await db.initSessions();
      await db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hash(token));
    }
    limparCookie(res);
    res.json({ ok: true });
  }

  return { autenticar, protegerRequisicao, iniciar, encerrar, perfil };
}

module.exports = { criarAutenticacao };
