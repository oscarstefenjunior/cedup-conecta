
        // --- Sistema de Autenticação via API (LGPD Compliant) ---
        const API_BASE = '';
        let tokenSessao = null;
        let usuarioLogado = null;
        let xpAtual = 0;

        async function apiFetch(url, options = {}) {
            const headers = { 'Content-Type': 'application/json', ...options.headers };
            if (tokenSessao) headers['Authorization'] = `Bearer ${tokenSessao}`;
            const res = await fetch(API_BASE + url, { ...options, headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.erro || 'Erro na requisição');
            return data;
        }

        function adicionarXP(qtd) {
            xpAtual += qtd;
            const elScore = document.getElementById('perfil-score');
            if (elScore) elScore.textContent = xpAtual.toLocaleString('pt-BR') + ' XP';
            if (tokenSessao) apiFetch('/api/usuario/xp', { method: 'PUT', body: JSON.stringify({ xp: xpAtual }) }).catch(() => {});
        }

        // --- Sistema de Login via API ---
        async function validarLogin() {
            const matriculaInput = document.getElementById('matricula').value.trim().replace('#', '');
            const passIn = document.getElementById('senha').value.trim();
            const erroMsg = document.getElementById('erro-mensagem');

            try {
                const data = await apiFetch('/api/login', {
                    method: 'POST',
                    body: JSON.stringify({ matricula: matriculaInput, senha: passIn })
                });

                tokenSessao = data.token;
                xpAtual = data.usuario.xp || 0;

                usuarioLogado = {
                    nome: data.usuario.nome,
                    curso: data.usuario.curso,
                    matriculaFormatada: '#' + data.usuario.matricula,
                    score: data.usuario.xp?.toLocaleString('pt-BR') + ' XP' || '0 XP',
                    ranking: data.usuario.isAdmin ? 'Painel do Professor / Admin' : 'Estudante Cadastrado',
                    avatar: data.usuario.avatar,
                    isAdmin: data.usuario.isAdmin
                };

                document.getElementById('tela-login').style.display = 'none';
                document.getElementById('sistema-interno').style.display = 'flex';
                erroMsg.style.display = 'none';

                const itemNavAdmin = document.getElementById('item-nav-admin');
                if (itemNavAdmin) itemNavAdmin.style.display = data.usuario.isAdmin ? 'block' : 'none';

                atualizarPerfilUsuario(usuarioLogado);
                await carregarDadosApi();
                incrementarProgresso('login', 1);
                iniciarBanner();
                navegar('inicio');
            } catch (e) {
                erroMsg.textContent = e.message || 'Matrícula ou senha inválidos';
                erroMsg.style.display = 'block';
            }
        }

        function atualizarPerfilUsuario(usuario) {
            if (!usuario) return;
            const elTitulo = document.getElementById('perfil-titulo');
            const elAvatar = document.getElementById('perfil-avatar');
            const elNome = document.getElementById('perfil-nome');
            const elCurso = document.getElementById('perfil-curso');
            const elMatricula = document.getElementById('perfil-matricula');
            const elScore = document.getElementById('perfil-score');
            const elPosicao = document.getElementById('perfil-posicao');

            if (elTitulo) elTitulo.textContent = usuario.isAdmin ? "Perfil do Professor / Admin" : "Perfil do Estudante";
            if (elAvatar) elAvatar.textContent = usuario.avatar;
            if (elNome) elNome.textContent = usuario.nome;
            if (elCurso) elCurso.textContent = usuario.curso;
            if (elMatricula) elMatricula.textContent = usuario.matriculaFormatada;
            if (elScore) elScore.textContent = usuario.score;
            if (elPosicao) elPosicao.textContent = usuario.ranking;

            if (!usuario.isAdmin) {
                xpAtual = parseInt(usuario.score) || 0;
            }
        }

        function fazerLogout() {
            usuarioLogado = null;
            tokenSessao = null;
            xpAtual = 0;
            const itemNavAdmin = document.getElementById('item-nav-admin');
            if (itemNavAdmin) {
                itemNavAdmin.style.display = 'none';
            }
            document.getElementById('sistema-interno').style.display = 'none';
            document.getElementById('tela-login').style.display = 'flex';
            document.getElementById('matricula').value = '';
            document.getElementById('senha').value = '';
            const erroMsg = document.getElementById('erro-mensagem');
            if (erroMsg) erroMsg.style.display = 'none';
        }

        // --- Devolver livro no backend ---
        async function devolverLivroNoBackend(idLivro) {
            const loc = locacoesUsuario.find(l => l.idLivro === idLivro && l.tipo === 'fisico');
            if (loc && loc.idEmprestimo && tokenSessao) {
                try { await apiFetch(`/api/emprestimos/${loc.idEmprestimo}/devolver`, { method: 'POST' }); } catch(e) {}
            }
        }

        // --- Carregar dados da API após login ---
        async function carregarDadosApi() {
            try {
                const [livros, emprestimos, itens, itensEmprestados, achados, desafiosData, progressoData] = await Promise.all([
                    apiFetch('/api/livros'),
                    apiFetch('/api/emprestimos/ativos'),
                    apiFetch('/api/itens'),
                    apiFetch('/api/itens/emprestimos'),
                    apiFetch('/api/achados'),
                    apiFetch('/api/desafios'),
                    apiFetch('/api/medalhas/progresso')
                ]);

                ACERVO_LIVROS.length = 0;
                livros.forEach(l => ACERVO_LIVROS.push(l));

                locacoesUsuario.length = 0;
                emprestimos.forEach(e => {
                    const devolucao = new Date(e.dataDevolucao);
                    const dataFmt = devolucao.toLocaleDateString('pt-BR');
                    locacoesUsuario.push({
                        idLivro: e.idLivro,
                        titulo: e.titulo,
                        formato: e.formato,
                        capa: e.capa,
                        prazo: `Devolução até ${dataFmt}`,
                        tipo: 'fisico',
                        dataDevolucao: devolucao.getTime(),
                        prorrogas: e.prorrogas,
                        idEmprestimo: e.id
                    });
                });

                ITENS_BIBLIOTECA.length = 0;
                itens.forEach(i => ITENS_BIBLIOTECA.push(i));

                emprestimosItensUsuario.length = 0;
                itensEmprestados.forEach(e => {
                    emprestimosItensUsuario.push({
                        id: e.id,
                        idItem: e.idItem,
                        nomeItem: e.nomeItem,
                        categoria: e.categoria,
                        icone: e.icone,
                        matricula: e.matricula,
                        nomeAluno: e.nomeAluno,
                        dataEmprestimo: e.dataEmprestimo,
                        dataDevolucao: e.dataDevolucao
                    });
                });

                achadosPerdidos.length = 0;
                achados.forEach(a => achadosPerdidos.push(a));

                DESAFIOS_SISTEMA.length = 0;
                desafiosData.desafios.forEach(d => {
                    DESAFIOS_SISTEMA.push({
                        ...d,
                        opcoes: typeof d.opcoes === 'string' ? JSON.parse(d.opcoes) : d.opcoes
                    });
                });
                quizzesRespondidos = desafiosData.quizzesRespondidos || {};

                progressoAluno = { login: 0, perfil: 0, leituras: 0, renovacoes: 0, locacoes_simultaneas: 0, reservas_pc: 0, emprestimos_itens: 0, devolucoes_no_prazo: 0, quizzes_acertos: 0, acesso_mec: 0, xp_semanal: 0, ranking: 0 };
                Object.entries(progressoData.progresso || {}).forEach(([k, v]) => { progressoAluno[k] = v; });
                medalhasDesbloqueadas = new Set(progressoData.desbloqueadas || []);

                renderizarAcervo();
                renderizarLocacoes();
                popularSelectPCs();
                renderizarComputadores();
                renderizarReservasUsuario();
                renderizarItens();
                renderizarEmprestimosUsuario();
                renderizarAchadosPublico();
                renderizarMedalhas();
                renderizarMedalhasHome();
                renderizarDicaLeituraSemana();
            } catch (e) {
                console.error('Erro ao carregar dados:', e);
            }
        }

        // --- Navegação entre Abas ---
        function navegar(idSecao) {
            // Bloqueia acesso à área administrativa se não for admin
            if (idSecao === 'admin' && (!usuarioLogado || !usuarioLogado.isAdmin)) {
                return;
            }

            const secoes = document.querySelectorAll('.secao-conteudo');
            secoes.forEach(secao => secao.classList.remove('ativa'));

            const linksNav = document.querySelectorAll('nav ul li a');
            linksNav.forEach(link => link.classList.remove('ativo'));

            document.getElementById(idSecao).classList.add('ativa');
            const linkAtivo = document.getElementById('nav-' + idSecao);
            if (linkAtivo) linkAtivo.classList.add('ativo');
        }

        // --- Mecanismo do Banner Interativo ---
        let slideAtual = 0;
        let intervaloBanner;

        function mostrarSlide(index) {
            const slides = document.querySelectorAll('.slide');
            if (index >= slides.length) index = 0;
            if (index < 0) index = slides.length - 1;
            slideAtual = index;
            
            slides.forEach(slide => slide.classList.remove('ativo'));
            slides[slideAtual].classList.add('ativo');
        }

        function mudarSlide(direcao) {
            slideAtual += direcao;
            mostrarSlide(slideAtual);
            clearInterval(intervaloBanner);
            iniciarBanner();
        }

        function iniciarBanner() {
            intervaloBanner = setInterval(() => {
                slideAtual++;
                mostrarSlide(slideAtual);
            }, 5000);
        }

        // ==========================================
        // --- MÓDULO DO ACERVO & BUSCA DE LIVROS ---
        // ==========================================
        const ACERVO_LIVROS = [
            {
                id: 1,
                titulo: "Organização, Sistemas e Métodos",
                autor: "Dorival Carreira",
                editora: "Editora Saraiva",
                categoria: "Administração",
                edicao: "2ª Edição",
                anoLancamento: "2012",
                isbn: "978-85-02-08920-4",
                paginas: 384,
                formato: "Físico",
                disponivel: true,
                capa: "capas/livro1.jpg",
                sinopse: "Apresenta, de forma didática, as ferramentas essenciais para elaboração de projetos de mudança organizacional (PMO) e metodologias que permitem realizar intervenções nas estruturas organizacionais e operacionais de maneira segura e científica. O conteúdo é estruturado com base na vasta experiência do autor como consultor, executivo e professor, incluindo exemplos práticos e exercícios que facilitam a aplicação do conhecimento. Indicado para empresários, consultores, estudantes e profissionais que buscam otimizar processos e entender o funcionamento organizacional."
            },
            {
                id: 2,
                titulo: "Fundamentos de Linguagem de Programação",
                autor: "Daniel P. Friedman; Mitchell Wand; Christopher T. Haynes",
                editora: "Berkeley",
                categoria: "Informática",
                edicao: "2ª Edição",
                anoLancamento: "2001",
                isbn: "—",
                paginas: 410,
                formato: "Físico",
                disponivel: true,
                capa: "capas/livro2.jpg",
                sinopse: "Obra de referência clássica sobre fundamentos teóricos e práticos de linguagens de programação. A abordagem é analítica e baseada no uso de interpretadores para explicar a semântica de diversos elementos essenciais das linguagens de forma clara e executável. O texto começa com um interpretador para uma linguagem funcional simples e sistematicamente adiciona novos construtos, demonstrando como cada adição aumenta o poder expressivo da linguagem. A segunda parte dedica-se à tradução desses interpretadores para máquinas de registro. Muito utilizado em cursos universitários de Ciência da Computação."
            },
            {
                id: 3,
                titulo: "Manual Prático do Mecânico",
                autor: "Lauro Salles Cunha; Eng° Marcelo Padovani Cravenco (SENAI)",
                editora: "Hemus",
                categoria: "Geral",
                edicao: "Edição 2006 — Revista e Ampliada",
                anoLancamento: "2006",
                isbn: "978-85-289-0506-9",
                paginas: 592,
                formato: "Físico",
                disponivel: true,
                capa: "capas/livro3.jpg",
                sinopse: "Concebido como um \u2018vade mecum\u2019 — guia de consulta rápida — preciso e abrangente para estudantes e profissionais da área mecânica. Abrange processos de fabricação (torneamento, fresagem, estampagem), tecnologia de materiais (tratamento térmico, aços, ligas metálicas), ferramentas, metrologia, tolerâncias e ajustes, cálculo de avanço e velocidades de corte, matemática aplicada e normas técnicas SAE, DIN, ABNT e AISI. Recomendado para professores, torneiros, ajustadores, fresadores, ferramenteiros e engenheiros mecânicos."
            }
        ];

        let locacoesUsuario = [];

        let categoriaFiltroAtual = "Todos";
        let livroEmLeituraAtual = null;

        function renderizarAcervo(livrosParaExibir) {
            const grid = document.getElementById('grid-livros-acervo');
            const contador = document.getElementById('contador-livros');
            if (!grid) return;

            const lista = livrosParaExibir || ACERVO_LIVROS;
            contador.textContent = `${lista.length} livro${lista.length === 1 ? '' : 's'} no acervo`;

            if (ACERVO_LIVROS.length === 0) {
                const termo = (document.getElementById('input-busca-livro')?.value || '').trim();
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 45px 20px; background: white; border-radius: 10px; border: 1px dashed #d0d5dd;">
                        <div style="font-size: 2.8rem; margin-bottom: 12px;">📚</div>
                        <h4 style="color: var(--azul-escuro); font-size: 1.25rem; margin-bottom: 8px;">Nenhum livro local catalogado no momento</h4>
                        <p style="color: #666; font-size: 0.95rem; max-width: 520px; margin: 0 auto 15px; line-height: 1.5;">
                            O acervo físico e técnico está sendo preparado pela equipe pedagógica do CEDUP Hermann Hering.
                        </p>
                        <div style="background: #edf5ff; border: 1px solid #c7dcfb; border-radius: 8px; padding: 16px 20px; max-width: 550px; margin: 0 auto; text-align: left; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
                            <div>
                                <strong style="color: #0c326f; display: block; font-size: 0.95rem;">🔎 Deseja pesquisar no MEC Livros?</strong>
                                <small style="color: #555;">Acesse gratuitamente o acervo de milhares de obras do Ministério da Educação.</small>
                            </div>
                            <a href="https://meclivros.mec.gov.br/" target="_blank" rel="noopener noreferrer" class="btn-acao" style="background:#1351b4; text-decoration: none; padding: 8px 14px;" onclick="registrarAcessoMEC()">
                                Abrir MEC Livros ↗
                            </a>
                        </div>
                    </div>
                `;
                return;
            }

            if (lista.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: white; border-radius: 8px; border: 1px dashed #ccc;">
                        <p style="font-size: 1.1rem; color: #666; margin-bottom: 8px;">Nenhum livro encontrado com esses termos.</p>
                        <small style="color: #999;">Tente pesquisar por outro título, autor ou limpe os filtros de categoria.</small>
                    </div>
                `;
                return;
            }

            grid.innerHTML = lista.map(livro => {
                const ehDigital = livro.formato.includes("Digital");
                const estaLocado = locacoesUsuario.some(l => l.idLivro === livro.id);
                
                let btnAcao = '';
                if (ehDigital) {
                    btnAcao = `<button class="btn-ler" onclick="abrirLeitura(${livro.id})">📖 Ler Agora (PDF)</button>`;
                } else if (estaLocado) {
                    btnAcao = `<button class="btn-acao" style="background:#28a745; flex:1;" disabled>✓ Já Emprestado</button>`;
                } else if (livro.disponivel) {
                    btnAcao = `<button class="btn-reservar" onclick="reservarLivro(${livro.id})">🏷️ Reservar Exemplar</button>`;
                } else {
                    btnAcao = `<button class="btn-acao" style="background:#999; flex:1; cursor:not-allowed;" disabled>Emprestado</button>`;
                }

                return `
                    <div class="card-livro" onclick="abrirDetalhesLivro(${livro.id})">
                        <div>
                            ${livro.capa ? `<img src="${livro.capa}" alt="Capa: ${livro.titulo}" style="width:100%; height:190px; object-fit:cover; border-radius:8px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">` : ''}
                            <div class="card-livro-topo">
                                <span class="tag-categoria">${livro.categoria}</span>
                                <span class="${livro.disponivel ? 'tag-status-disp' : 'tag-status-emp'}">
                                    ${livro.disponivel ? '&#9679; Disponível' : '&#9679; Emprestado'}
                                </span>
                            </div>
                            <h4 class="livro-titulo">${livro.titulo}</h4>
                            <p class="livro-autor">&#128100; <b>${livro.autor.split(';')[0].trim()}</b>${livro.autor.includes(';') ? ' <span style="color:#aaa">et al.</span>' : ''}</p>
                            <p style="font-size: 0.82rem; color: #666; margin-bottom: 10px; line-height: 1.5;">${livro.sinopse.substring(0, 120)}...</p>
                            <div class="livro-detalhes">
                                <span>&#128197; ${livro.anoLancamento || livro.ano}</span>
                                <span>&#128214; ${livro.paginas} págs</span>
                                <span>${ehDigital ? '&#128241; Digital' : '&#128218; Físico'}</span>
                                ${livro.editora ? `<span>&#127970; ${livro.editora}</span>` : ''}
                            </div>
                            ${livro.isbn && livro.isbn !== '—' ? `<p style="font-size:0.75rem; color:#aaa; margin-top:-4px; margin-bottom:10px;">ISBN: ${livro.isbn}</p>` : ''}
                        </div>
                        <div class="livro-acoes" onclick="event.stopPropagation()">
                            ${btnAcao}
                            <button class="btn-detalhes" onclick="abrirDetalhesLivro(${livro.id})">&#128270; Ver Ficha Completa</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderizarLocacoes() {
            const container = document.getElementById('lista-locacoes-usuario');
            if (!container) return;

            if (locacoesUsuario.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 25px 10px; color: #777;">
                        <p style="font-size: 0.9rem; margin-bottom: 5px;">Nenhum livro emprestado no momento.</p>
                        <small style="color: #999;">Seus empréstimos e leituras aparecerão aqui.</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = locacoesUsuario.map(loc => {
                const podeProrrogar = loc.tipo === 'fisico' && (loc.prorrogas || 0) < 2;
                const prorrogasFeitas = loc.prorrogas || 0;
                const prorrogasRestantes = 2 - prorrogasFeitas;

                return `
                    <div class="locacao-item">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <strong style="font-size: 0.95rem; color: var(--azul-escuro);">${loc.titulo}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem;">
                            <span style="color: ${loc.tipo === 'fisico' ? 'var(--vermelho)' : '#2b238f'}; font-weight: 600;">
                                ${loc.tipo === 'fisico' ? '⚠️ ' : '📱 '} ${loc.prazo}
                            </span>
                        </div>
                        ${loc.tipo === 'fisico' ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; margin-top: 4px;">
                            <span style="color: #888;">Renovações: ${prorrogasFeitas}/2 (7 dias cada)</span>
                            <div style="display: flex; gap: 4px;">
                                ${podeProrrogar ? `<button onclick="prorrogarLivro(${loc.idLivro})" style="background: #2b238f; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer; font-weight: 600;">Renovar +7 dias</button>` : ''}
                                <button onclick="devolverLivro(${loc.idLivro})" style="background: none; border: 1px solid #ddd; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer; color: #555;">Devolver</button>
                            </div>
                        </div>
                        ` : `
                        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                            <button onclick="devolverLivro(${loc.idLivro})" style="background: none; border: 1px solid #ddd; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer; color: #555;">Remover</button>
                        </div>
                        `}
                    </div>
                `;
            }).join('');
        }

        function filtrarLivros() {
            const termo = (document.getElementById('input-busca-livro').value || '').toLowerCase().trim();
            const formatoFiltro = document.getElementById('filtro-formato').value;

            const resultado = ACERVO_LIVROS.filter(livro => {
                // Filtro por texto (título, autor, sinopse ou categoria)
                const bateTexto = !termo || 
                    livro.titulo.toLowerCase().includes(termo) ||
                    livro.autor.toLowerCase().includes(termo) ||
                    livro.sinopse.toLowerCase().includes(termo) ||
                    livro.categoria.toLowerCase().includes(termo);

                // Filtro por categoria clicada
                const bateCategoria = (categoriaFiltroAtual === 'Todos') || (livro.categoria === categoriaFiltroAtual);

                // Filtro por formato / status
                let bateFormato = true;
                if (formatoFiltro === 'digital') bateFormato = livro.formato.includes('Digital');
                if (formatoFiltro === 'fisico') bateFormato = !livro.formato.includes('Digital');
                if (formatoFiltro === 'disponivel') bateFormato = livro.disponivel;

                return bateTexto && bateCategoria && bateFormato;
            });

            renderizarAcervo(resultado);
        }

        function selecionarCategoriaFiltro(categoria, btnElement) {
            categoriaFiltroAtual = categoria;
            const botoes = document.querySelectorAll('.btn-filtro');
            botoes.forEach(b => b.classList.remove('ativo'));
            if (btnElement) btnElement.classList.add('ativo');
            filtrarLivros();
        }

        function abrirDetalhesLivro(idLivro) {
            const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
            if (!livro) return;

            const modal = document.getElementById('modal-detalhes-livro');
            if (!modal) return;

            const estaLocado = locacoesUsuario.some(l => l.idLivro === livro.id);
            const ehDigital = livro.formato && livro.formato.includes('Digital');

            let btnAcaoModal = '';
            if (ehDigital) {
                btnAcaoModal = `<button class="btn-acao" onclick="abrirLeitura(${livro.id}); fecharDetalhesLivro()">📖 Ler Agora (PDF)</button>`;
            } else if (estaLocado) {
                btnAcaoModal = `<button class="btn-acao" style="background:#28a745;" disabled>✓ Já Emprestado</button>`;
            } else if (livro.disponivel) {
                btnAcaoModal = `<button class="btn-acao" style="background:var(--vermelho)" onclick="reservarLivro(${livro.id}); fecharDetalhesLivro()">🏷️ Reservar Exemplar</button>`;
            } else {
                btnAcaoModal = `<button class="btn-acao" style="background:#999; cursor:not-allowed;" disabled>Emprestado</button>`;
            }

            modal.innerHTML = `
                <div class="modal-livro-box" onclick="event.stopPropagation()">
                    <div class="modal-livro-header" style="position:relative;">
                        <button class="modal-livro-fechar" onclick="fecharDetalhesLivro()" title="Fechar">&#10005;</button>
                        ${livro.capa
                            ? `<img src="${livro.capa}" alt="Capa" class="modal-livro-capa">`
                            : `<div class="modal-livro-capa-placeholder">📚</div>`}
                        <div class="modal-livro-info">
                            <div class="modal-livro-badges">
                                <span class="ml-badge">${livro.categoria}</span>
                                <span class="ml-badge ${livro.disponivel ? 'verde' : 'vermelho'}">${livro.disponivel ? '● Disponível' : '● Emprestado'}</span>
                                <span class="ml-badge">${ehDigital ? '📱 Digital' : '📖 Físico'}</span>
                            </div>
                            <h2>${livro.titulo}</h2>
                            <p class="ml-autor">✍️ ${livro.autor}</p>
                            ${btnAcaoModal}
                        </div>
                    </div>
                    <div class="modal-livro-corpo">
                        <h4>📄 Sinopse</h4>
                        <p>${livro.sinopse}</p>

                        <h4>📋 Ficha Técnica</h4>
                        <div class="ml-ficha">
                            <div class="ml-ficha-item">
                                <label>Editora</label>
                                <span>${livro.editora || '—'}</span>
                            </div>
                            <div class="ml-ficha-item">
                                <label>Ano de Lançamento</label>
                                <span>${livro.anoLancamento || livro.ano || '—'}</span>
                            </div>
                            <div class="ml-ficha-item">
                                <label>Edição</label>
                                <span>${livro.edicao || '—'}</span>
                            </div>
                            <div class="ml-ficha-item">
                                <label>Nº de Páginas</label>
                                <span>${livro.paginas} páginas</span>
                            </div>
                            <div class="ml-ficha-item">
                                <label>Formato</label>
                                <span>${livro.formato}</span>
                            </div>
                            <div class="ml-ficha-item">
                                <label>ISBN</label>
                                <span>${livro.isbn || '—'}</span>
                            </div>
                        </div>

                        <div class="modal-livro-resenhas">
                            <h4>📖 Resenhas dos Alunos (${resenhasLivros.filter(r => r.idLivro === livro.id).length})</h4>
                            ${resenhasLivros.filter(r => r.idLivro === livro.id).length === 0
                                ? `<div class="resenha-sem-resenhas">Nenhuma resenha ainda. Seja o primeiro a avaliar!</div>`
                                : resenhasLivros.filter(r => r.idLivro === livro.id).map(resenha => {
                                    const curtidas = curtidasResenhas.filter(c => c.idResenha === resenha.id).length;
                                    const jaCurtiu = curtidasResenhas.some(c => c.idResenha === resenha.id && c.matricula === (usuarioLogado?.matriculaFormatada || '').replace('#', ''));
                                    const dataFormat = new Date(resenha.data).toLocaleDateString('pt-BR');
                                    return `
                                        <div class="resenha-card">
                                            <div class="resenha-header">
                                                <span class="resenha-autor">👤 ${resenha.nomeAluno}</span>
                                                <span class="resenha-data">${dataFormat}</span>
                                            </div>
                                            <div class="resenha-texto">${resenha.texto}</div>
                                            <div class="resenha-actions">
                                                <button class="btn-like-resenha ${jaCurtiu ? 'curtiu' : ''}" onclick="event.stopPropagation(); curtirResenha('${resenha.id}', this)">
                                                    👍 ${curtidas > 0 ? curtidas : ''}
                                                </button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')
                            }
                        </div>
                    </div>
                    <div class="modal-livro-rodape">
                        <button class="btn-detalhes" onclick="fecharDetalhesLivro()">✕ Fechar</button>
                    </div>
                </div>
            `;

            modal.classList.add('aberto');
        }

        function fecharDetalhesLivro() {
            const modal = document.getElementById('modal-detalhes-livro');
            if (modal) modal.classList.remove('aberto');
        }


        function abrirLeitura(idLivro) {
            const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
            if (!livro) return;
            livroEmLeituraAtual = livro;

            document.getElementById('modal-titulo').textContent = livro.titulo;
            document.getElementById('modal-autor').textContent = `Autor(es): ${livro.autor} | Publicado em ${livro.anoLancamento || livro.ano || '—'} | ${livro.paginas} páginas`;
            document.getElementById('modal-categoria').textContent = livro.categoria;
            document.getElementById('modal-sinopse').textContent = livro.sinopse;
            document.getElementById('modal-previa').textContent = livro.previa || 'Prévia não disponível.';

            document.getElementById('modal-leitura').style.display = 'flex';
        }

        function fecharLeitura() {
            document.getElementById('modal-leitura').style.display = 'none';
            livroEmLeituraAtual = null;
        }

        function concluirLeituraDigital() {
            if (!livroEmLeituraAtual) return;
            adicionarXP(50);
            incrementarProgresso('leituras', 1);
            alert(`Parabéns! Você completou a leitura técnica de "${livroEmLeituraAtual.titulo}" e ganhou +50 XP no ranking do CEDUP!`);
            
            // Adicionar à lista de leituras ativas se ainda não estiver
            if (!locacoesUsuario.some(l => l.idLivro === livroEmLeituraAtual.id)) {
                locacoesUsuario.unshift({
                    idLivro: livroEmLeituraAtual.id,
                    titulo: livroEmLeituraAtual.titulo,
                    formato: "E-book Digital",
                    prazo: "Concluído (+50 XP)",
                    tipo: "digital"
                });
                renderizarLocacoes();
            }
            fecharLeitura();
        }

        async function reservarLivro(idLivro) {
            const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
            if (!livro) return;

            try {
                await apiFetch('/api/emprestimos', { method: 'POST', body: JSON.stringify({ idLivro }) });

                const dataDev = new Date();
                dataDev.setDate(dataDev.getDate() + 7);
                const prazoFmt = `Devolução até ${dataDev.toLocaleDateString('pt-BR')}`;

                livro.disponivel = false;
                locacoesUsuario.unshift({
                    idLivro: livro.id,
                    titulo: livro.titulo,
                    formato: livro.formato,
                    capa: livro.capa,
                    prazo: prazoFmt,
                    tipo: "fisico",
                    dataDevolucao: dataDev.getTime(),
                    prorrogas: 0
                });

                adicionarXP(30);
                await incrementarProgresso('leituras', 1);
                alert(`Exemplar "${livro.titulo}" reservado com sucesso!\nRetire no balcão da Biblioteca do CEDUP.\nPrazo de devolução: 7 dias.\nVocê pode renovar até 2 vezes (7 dias cada).\n\n⭐ +30 XP por reservar livro!`);
                renderizarAcervo();
                renderizarLocacoes();
            } catch (e) {
                alert('Erro ao reservar livro: ' + e.message);
            }
        }

        async function prorrogarLivro(idLivro) {
            const loc = locacoesUsuario.find(l => l.idLivro === idLivro);
            if (!loc) return;

            if (loc.prorrogas >= 2) {
                alert('Você já atingiu o limite máximo de 2 renovações para este livro.\nCada renovação soma 7 dias ao prazo de devolução.');
                return;
            }

            try {
                const data = await apiFetch(`/api/emprestimos/${loc.idEmprestimo}/prorrogar`, { method: 'POST' });
                const novaData = new Date(data.novaData);
                loc.dataDevolucao = novaData.getTime();
                loc.prazo = `Devolução até ${novaData.toLocaleDateString('pt-BR')}`;
                loc.prorrogas = data.prorrogas;

                const restantes = 2 - loc.prorrogas;
                await incrementarProgresso('renovacoes', 1);
                alert(`Empréstimo de "${loc.titulo}" renovado com sucesso!\nNova data de devolução: ${novaData.toLocaleDateString('pt-BR')}\nRenovações restantes: ${restantes} de 2 (7 dias cada uma)`);
                renderizarLocacoes();
            } catch (e) {
                alert('Erro ao renovar: ' + e.message);
            }
        }

        let resenhasLivros = [];
        let curtidasResenhas = [];

        async function curtirResenha(idResenha, btnElement) {
            try {
                const data = await apiFetch(`/api/resenhas/${idResenha}/curtir`, { method: 'POST' });
                if (data.curtido) {
                    btnElement.classList.add('curtiu');
                    adicionarXP(10);
                } else {
                    btnElement.classList.remove('curtiu');
                }
                const totalCurtidas = btnElement.innerHTML.match(/\d+/);
                const current = totalCurtidas ? parseInt(totalCurtidas[0]) : 0;
                const novoTotal = data.curtido ? current + 1 : Math.max(0, current - 1);
                btnElement.innerHTML = `👍 ${novoTotal > 0 ? novoTotal : ''}`;
            } catch (e) {
                console.error('Erro ao curtir:', e);
            }
        }

        function devolverLivro(idLivro) {
            const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
            const loc = locacoesUsuario.find(l => l.idLivro === idLivro);

            if (loc && loc.tipo === 'fisico') {
                abrirModalResenha(idLivro, livro ? livro.titulo : 'Livro');
            } else {
                if (livro) livro.disponivel = true;
                locacoesUsuario = locacoesUsuario.filter(l => l.idLivro !== idLivro);
                renderizarAcervo();
                renderizarLocacoes();
            }
        }

        function abrirModalResenha(idLivro, tituloLivro) {
            fecharModalResenha();

            const container = document.getElementById('sistema-interno') || document.body;

            const overlay = document.createElement('div');
            overlay.className = 'modal-resenha-overlay';
            overlay.id = 'modal-resenha-overlay';
            overlay.innerHTML = `
                <div class="modal-resenha" id="modal-resenha-box">
                    <h3>📖 Resenha do Livro</h3>
                    <p>Escreva uma resenha sobre <b>"${tituloLivro}"</b> e ganhe <b style="color: #28a745;">+300 XP</b>!</p>
                    <textarea id="resenha-texto" maxlength="3000" placeholder="Escreva sua opinião sobre o livro..." oninput="atualizarContadorResenha()"></textarea>
                    <div class="resenha-counter"><span id="resenha-contador">0</span> / 3.000 caracteres</div>
                    <div class="resenha-botoes">
                        <button class="btn-resenha-pular" onclick="confirmarDevolucaoSemResenha(${idLivro})">Pular</button>
                        <button class="btn-resenha-salvar" id="btn-salvar-resenha" onclick="salvarResenha(${idLivro})" disabled>Enviar Resenha (+300 XP)</button>
                    </div>
                </div>
            `;

            overlay.onclick = (e) => { if (e.target === overlay) confirmarDevolucaoSemResenha(idLivro); };
            container.appendChild(overlay);
            document.getElementById('resenha-texto').focus();
        }

        function atualizarContadorResenha() {
            const texto = document.getElementById('resenha-texto').value;
            const contador = document.getElementById('resenha-contador');
            const btn = document.getElementById('btn-salvar-resenha');
            if (contador) contador.textContent = texto.length;
            if (btn) btn.disabled = texto.trim().length < 10;
        }

        async function salvarResenha(idLivro) {
            const texto = document.getElementById('resenha-texto').value.trim();
            if (texto.length < 10) {
                alert('A resenha precisa ter pelo menos 10 caracteres.');
                return;
            }

            try {
                await apiFetch('/api/resenhas', { method: 'POST', body: JSON.stringify({ idLivro, texto }) });

                const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
                adicionarXP(300);
                fecharModalResenha();

                if (livro) livro.disponivel = true;
                await devolverLivroNoBackend(idLivro);
                locacoesUsuario = locacoesUsuario.filter(l => l.idLivro !== idLivro);
                renderizarAcervo();
                renderizarLocacoes();

                alert(`✅ Resenha publicada com sucesso!\n\n⭐ +300 XP adicionados ao seu perfil!\nSua opinião ajuda outros alunos a escolherem boas leituras.`);
            } catch (e) {
                alert('Erro ao publicar resenha: ' + e.message);
            }
        }

        async function confirmarDevolucaoSemResenha(idLivro) {
            const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
            fecharModalResenha();
            if (livro) livro.disponivel = true;
            await devolverLivroNoBackend(idLivro);
            locacoesUsuario = locacoesUsuario.filter(l => l.idLivro !== idLivro);
            renderizarAcervo();
            renderizarLocacoes();
        }

        function fecharModalResenha() {
            const overlay = document.getElementById('modal-resenha-overlay');
            if (overlay) overlay.remove();
        }

        let pontosAcessoMECConcedidos = false;
        function registrarAcessoMEC() {
            if (!pontosAcessoMECConcedidos) {
                pontosAcessoMECConcedidos = true;
                adicionarXP(30);
                incrementarProgresso('acesso_mec', 1);
                setTimeout(() => {
                    alert('🎉 Parabéns! Você acessou a Biblioteca Digital MEC Livros e ganhou +30 XP no CedupConecta!');
                }, 400);
            }
        }

        // ==========================================
        // --- MÓDULO DE RESERVAS DE COMPUTADORES ---
        // ==========================================
        const COMPUTADORES = [
            { id: 1, nome: "PC-01", local: "Biblioteca — 1º Andar" },
            { id: 2, nome: "PC-02", local: "Biblioteca — 1º Andar" },
            { id: 3, nome: "PC-03", local: "Biblioteca — 1º Andar" },
            { id: 4, nome: "PC-04", local: "Biblioteca — 1º Andar" },
            { id: 5, nome: "PC-05", local: "Biblioteca — 1º Andar" },
            { id: 6, nome: "PC-06", local: "Biblioteca — 2º Andar" },
            { id: 7, nome: "PC-07", local: "Biblioteca — 2º Andar" },
            { id: 8, nome: "PC-08", local: "Biblioteca — 2º Andar" },
            { id: 9, nome: "PC-09", local: "Biblioteca — 2º Andar" },
            { id: 10, nome: "PC-10", local: "Biblioteca — 2º Andar" }
        ];

        let reservasComputadores = [];

        function gerarSlotsHorarios() {
            const slots = [];
            for (let h = 7; h <= 22; h++) {
                for (let m = 0; m < 60; m += 30) {
                    const hora = h.toString().padStart(2, '0');
                    const min = m.toString().padStart(2, '0');
                    const proxH = m === 30 ? h + 1 : h;
                    const proxM = m === 30 ? 0 : 30;
                    if (proxH > 22) continue;
                    const horaFim = proxH.toString().padStart(2, '0');
                    const minFim = proxM.toString().padStart(2, '0');
                    const horaNum = h * 60 + m;
                    if (horaNum >= 7 * 60 + 30 && horaNum <= 22 * 60) {
                        slots.push({ inicio: `${hora}:${min}`, fim: `${horaFim}:${minFim}` });
                    }
                }
            }
            return slots;
        }

        const TODOS_SLOTS = gerarSlotsHorarios();

        function popularSelectPCs() {
            const select = document.getElementById('reserva-pc');
            if (!select) return;
            const opcoes = COMPUTADORES.map(pc => `<option value="${pc.id}">${pc.nome} — ${pc.local}</option>`).join('');
            select.innerHTML = '<option value="">Selecione um computador...</option>' + opcoes;
        }

        function converterParaMinutos(horaStr) {
            const [h, m] = horaStr.split(':').map(Number);
            return h * 60 + m;
        }

        function horariosConflitam(inicioA, fimA, inicioB, fimB) {
            return inicioA < fimB && fimA > inicioB;
        }

        function temConflito(idPc, data, horaInicio, horaFim, excluirId) {
            const iniNovo = converterParaMinutos(horaInicio);
            const fimNovo = converterParaMinutos(horaFim);

            return reservasComputadores.some(r => {
                if (r.idPc !== idPc || r.data !== data) return false;
                if (excluirId && r.id === excluirId) return false;
                const iniExistente = converterParaMinutos(r.horaInicio);
                const fimExistente = converterParaMinutos(r.horaFim);
                return horariosConflitam(iniNovo, fimNovo, iniExistente, fimExistente);
            });
        }

        function obterSlotsOcupados(idPc, data) {
            const ocupados = new Set();
            reservasComputadores.filter(r => r.idPc === idPc && r.data === data).forEach(r => {
                const ini = converterParaMinutos(r.horaInicio);
                const fim = converterParaMinutos(r.horaFim);
                TODOS_SLOTS.forEach(slot => {
                    const slotIni = converterParaMinutos(slot.inicio);
                    const slotFim = converterParaMinutos(slot.fim);
                    if (slotIni < fim && slotFim > ini) {
                        ocupados.add(slot.inicio);
                    }
                });
            });
            return ocupados;
        }

        function atualizarHorariosDisponiveis() {
            const selectInicio = document.getElementById('reserva-hora-inicio');
            const selectFim = document.getElementById('reserva-hora-fim');
            const idPc = document.getElementById('reserva-pc').value;
            const data = document.getElementById('reserva-data').value;

            selectInicio.innerHTML = '<option value="">Selecione o início...</option>';
            selectFim.innerHTML = '<option value="">Selecione o término...</option>';

            if (!idPc || !data) return;

            const ocupados = obterSlotsOcupados(parseInt(idPc), data);

            TODOS_SLOTS.forEach(slot => {
                if (!ocupados.has(slot.inicio)) {
                    const opt = document.createElement('option');
                    opt.value = slot.inicio;
                    opt.textContent = slot.inicio;
                    selectInicio.appendChild(opt);
                }
            });
        }

        function atualizarHorariosFim() {
            const selectInicio = document.getElementById('reserva-hora-inicio');
            const selectFim = document.getElementById('reserva-hora-fim');
            const idPc = document.getElementById('reserva-pc').value;
            const data = document.getElementById('reserva-data').value;
            const horaInicio = selectInicio.value;

            selectFim.innerHTML = '<option value="">Selecione o término...</option>';

            if (!idPc || !data || !horaInicio) return;

            const ocupados = obterSlotsOcupados(parseInt(idPc), data);
            const iniMin = converterParaMinutos(horaInicio);

            TODOS_SLOTS.forEach(slot => {
                const slotIni = converterParaMinutos(slot.inicio);
                if (slotIni > iniMin && !ocupados.has(slot.inicio)) {
                    const opt = document.createElement('option');
                    opt.value = slot.fim;
                    opt.textContent = slot.fim;
                    selectFim.appendChild(opt);
                }
            });
        }

        async function agendarReserva(e) {
            e.preventDefault();
            if (!usuarioLogado) {
                alert('Você precisa estar logado para fazer uma reserva.');
                return;
            }

            const idPc = parseInt(document.getElementById('reserva-pc').value);
            const data = document.getElementById('reserva-data').value;
            const horaInicio = document.getElementById('reserva-hora-inicio').value;
            const horaFim = document.getElementById('reserva-hora-fim').value;

            if (!idPc || !data || !horaInicio || !horaFim) {
                alert('Preencha todos os campos: computador, data, horário de início e término.');
                return;
            }

            const iniMin = converterParaMinutos(horaInicio);
            const fimMin = converterParaMinutos(horaFim);

            if (iniMin >= fimMin) {
                alert('O horário de término deve ser posterior ao horário de início.');
                return;
            }

            const pc = COMPUTADORES.find(c => c.id === idPc);

            try {
                await apiFetch('/api/reservas/pcs', {
                    method: 'POST',
                    body: JSON.stringify({
                        idPc: pc.id,
                        nomePc: pc.nome,
                        local: pc.local,
                        data: data,
                        horaInicio: horaInicio,
                        horaFim: horaFim
                    })
                });

                adicionarXP(25);
                await incrementarProgresso('reservas_pc', 1);
                const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
                alert(`Reserva agendada com sucesso!\n\n🖥️ Computador: ${pc.nome}\n📍 Local: ${pc.local}\n📅 Data: ${dataFormatada}\n🕐 Horário: ${horaInicio} às ${horaFim}\n\n⭐ +25 XP por agendar reserva!`);

                document.getElementById('reserva-pc').value = '';
                document.getElementById('reserva-data').value = '';
                document.getElementById('reserva-hora-inicio').innerHTML = '<option value="">Selecione o início...</option>';
                document.getElementById('reserva-hora-fim').innerHTML = '<option value="">Selecione o término...</option>';

                renderizarComputadores();
                renderizarReservasUsuario();
            } catch (e) {
                alert('Erro ao agendar reserva: ' + e.message);
            }
        }

        async function cancelarReserva(idReserva) {
            if (!confirm('Deseja cancelar esta reserva agendada?')) return;
            try {
                await apiFetch(`/api/reservas/pcs/${idReserva}`, { method: 'DELETE' });
                alert('Reserva cancelada com sucesso.');
                renderizarComputadores();
                renderizarReservasUsuario();
            } catch (e) {
                alert('Erro ao cancelar reserva: ' + e.message);
            }
        }

        function renderizarComputadores() {
            const grid = document.getElementById('grid-computadores');
            const contador = document.getElementById('contador-pcs');
            if (!grid) return;

            const hoje = new Date().toISOString().split('T')[0];
            const agora = new Date();
            const horaAtual = converterParaMinutos(`${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`);

            const reservasHoje = reservasComputadores.filter(r => r.data === hoje);
            const pcsReservadosAgora = new Set(
                reservasHoje.filter(r => {
                    const ini = converterParaMinutos(r.horaInicio);
                    const fim = converterParaMinutos(r.horaFim);
                    return ini <= horaAtual && fim > horaAtual;
                }).map(r => r.idPc)
            );

            const disponiveis = COMPUTADORES.filter(pc => !pcsReservadosAgora.has(pc.id));
            if (contador) contador.textContent = `${disponiveis.length} de ${COMPUTADORES.length} disponíveis agora`;

            grid.innerHTML = COMPUTADORES.map(pc => {
                const estaOcupado = pcsReservadosAgora.has(pc.id);
                const reservaAtual = reservasHoje.find(r => r.idPc === pc.id && converterParaMinutos(r.horaInicio) <= horaAtual && converterParaMinutos(r.horaFim) > horaAtual);
                const minhasReservasPC = reservasComputadores.filter(r => r.idPc === pc.id && r.matricula === (usuarioLogado?.matriculaFormatada || '').replace('#', '') && r.data >= hoje);

                return `
                    <div class="card-computador ${estaOcupado ? 'reservado' : 'disponivel'}">
                        <div class="pc-icone">🖥️</div>
                        <div class="pc-id">${pc.nome}</div>
                        <div class="pc-local">${pc.local}</div>
                        <span class="pc-status ${estaOcupado ? 'indisp' : 'disp'}">
                            ${estaOcupado ? '● Em uso' : '● Disponível'}
                        </span>
                        ${reservaAtual ? `
                            <div class="pc-reservado-por">
                                Em uso por: <b>${reservaAtual.nomeAluno}</b><br>
                                Até às ${reservaAtual.horaFim}
                            </div>
                        ` : ''}
                        ${minhasReservasPC.length > 0 ? `
                            <div style="margin-top: 6px;">
                                ${minhasReservasPC.map(r => `
                                    <div style="font-size: 0.72rem; color: #2b238f; background: #eef2ff; padding: 4px 6px; border-radius: 4px; margin-bottom: 3px;">
                                        📅 ${r.dataFormatada} ${r.horaInicio}-${r.horaFim}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }

        async function renderizarReservasUsuario() {
            const container = document.getElementById('lista-reservas-usuario');
            if (!container) return;

            if (!tokenSessao) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 25px 10px; color: #777;">
                        <p style="font-size: 0.9rem; margin-bottom: 5px;">Nenhuma reserva agendada.</p>
                        <small style="color: #999;">Use o formulário acima para agendar um computador.</small>
                    </div>
                `;
                return;
            }

            try {
                const minhasReservas = await apiFetch('/api/reservas/pcs/minhas');
                const hoje = new Date().toISOString().split('T')[0];
                const futuras = minhasReservas
                    .filter(r => r.data >= hoje)
                    .sort((a, b) => (a.data + a.horaInicio).localeCompare(b.data + b.horaInicio));

                if (futuras.length === 0) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 25px 10px; color: #777;">
                            <p style="font-size: 0.9rem; margin-bottom: 5px;">Nenhuma reserva agendada.</p>
                            <small style="color: #999;">Use o formulário acima para agendar um computador.</small>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = futuras.map(r => `
                    <div class="reserva-item">
                        <div class="reserva-item-info">
                            <strong>${r.nomePc}</strong>
                            <p>📍 ${r.local}</p>
                            <p>📅 ${r.data.split('-').reverse().join('/')}</p>
                            <p>🕐 ${r.horaInicio} às ${r.horaFim}</p>
                        </div>
                        <button onclick="cancelarReserva(${r.id})" style="background: none; border: 1px solid #e31c23; padding: 5px 10px; border-radius: 4px; font-size: 0.78rem; cursor: pointer; color: #e31c23; font-weight: 600;">Cancelar</button>
                    </div>
                `).join('');
            } catch (e) {
                container.innerHTML = '<p style="color:#999;text-align:center;">Erro ao carregar reservas.</p>';
            }
            `).join('');
        }

        // ===============================================
        // --- BIBLIOTECA DE ITENS PARA EMPRÉSTIMO ---
        // ===============================================
        let ITENS_BIBLIOTECA = [
            { id: 1, nome: 'Calculadora Científica', categoria: 'Estudo', icone: '🔢', qtdTotal: 15, qtdDisponivel: 15 },
            { id: 2, nome: 'Régua 30cm', categoria: 'Estudo', icone: '📏', qtdTotal: 30, qtdDisponivel: 30 },
            { id: 3, nome: 'Transferidor', categoria: 'Estudo', icone: '📐', qtdTotal: 20, qtdDisponivel: 20 },
            { id: 4, nome: 'Apostilha Técnica', categoria: 'Estudo', icone: '📒', qtdTotal: 10, qtdDisponivel: 10 },
            { id: 5, nome: 'Fone de Ouvido', categoria: 'Eletrônicos', icone: '🎧', qtdTotal: 10, qtdDisponivel: 10 },
            { id: 6, nome: 'Carregador USB-C', categoria: 'Eletrônicos', icone: '🔌', qtdTotal: 12, qtdDisponivel: 12 },

            { id: 8, nome: 'Mouse sem Fio', categoria: 'Eletrônicos', icone: '🖱️', qtdTotal: 10, qtdDisponivel: 10 },
            { id: 9, nome: 'Livro Técnico', categoria: 'Livros & Materiais', icone: '📘', qtdTotal: 20, qtdDisponivel: 20 },
            { id: 10, nome: 'Revista Técnica', categoria: 'Livros & Materiais', icone: '📰', qtdTotal: 15, qtdDisponivel: 15 },
            { id: 11, nome: 'Caderno Universitário', categoria: 'Livros & Materiais', icone: '📕', qtdTotal: 25, qtdDisponivel: 25 },
            { id: 12, nome: 'Kit Lápis & Canetas', categoria: 'Livros & Materiais', icone: '✏️', qtdTotal: 40, qtdDisponivel: 40 }
        ];

        let emprestimosItensUsuario = [];

        function reservasNavegarAba(idAba, btnElement) {
            document.querySelectorAll('.reservas-subsecao').forEach(s => s.classList.remove('ativa'));
            document.querySelectorAll('.btn-reserva-tab').forEach(b => b.classList.remove('ativo'));
            const target = document.getElementById(idAba);
            if (target) target.classList.add('ativa');
            if (btnElement) btnElement.classList.add('ativo');
        }

        function obterCategoriaClasse(categoria) {
            if (categoria === 'Estudo') return 'tag-categoria-estudo';
            if (categoria === 'Eletrônicos') return 'tag-categoria-eletronicos';
            return 'tag-categoria-livros';
        }

        function renderizarItens(lista) {
            const grid = document.getElementById('grid-itens');
            const contador = document.getElementById('contador-itens');
            if (!grid) return;

            const itensParaExibir = lista || ITENS_BIBLIOTECA;
            const disponiveis = itensParaExibir.filter(i => i.qtdDisponivel > 0);
            if (contador) contador.textContent = `${disponiveis.length} de ${itensParaExibir.length} disponíveis`;

            const matricula = (usuarioLogado?.matriculaFormatada || '').replace('#', '');
            const meusEmprestimos = emprestimosItensUsuario.filter(e => e.matricula === matricula);
            const idsEmprestados = new Set(meusEmprestimos.map(e => e.idItem));

            if (itensParaExibir.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 30px; background: #fafafa; border: 1px dashed #ccc; border-radius: 8px;">
                        <p style="color: #666;">Nenhum item encontrado nesta categoria.</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = itensParaExibir.map(item => {
                const semEstoque = item.qtdDisponivel === 0;
                const jaEmprestado = idsEmprestados.has(item.id);
                const podeEmprestar = !semEstoque && !jaEmprestado && meusEmprestimos.length < 2;

                return `
                    <div class="card-item">
                        <div class="item-icone">${item.icone}</div>
                        <div class="item-nome">${item.nome}</div>
                        <span class="tag-categoria-item ${obterCategoriaClasse(item.categoria)}">${item.categoria}</span>
                        <span class="tag-estoque ${semEstoque ? 'tag-estoque-indisp' : 'tag-estoque-disp'}">
                            ${semEstoque ? '● Sem estoque' : `● ${item.qtdDisponivel} de ${item.qtdTotal} disponível${item.qtdDisponivel > 1 ? 's' : ''}`}
                        </span>
                        ${jaEmprestado ? `
                            <span style="font-size: 0.78rem; color: #2b238f; font-weight: 700; margin-bottom: 8px;">✓ Você já possui este item</span>
                            <button class="btn-emprestar desabilitado" disabled>Emprestar</button>
                        ` : podeEmprestar ? `
                            <button class="btn-emprestar" onclick="emprestarItem(${item.id})">Emprestar</button>
                        ` : `
                            <button class="btn-emprestar desabilitado" disabled>${meusEmprestimos.length >= 2 ? 'Limite atingido' : 'Indisponível'}</button>
                        `}
                    </div>
                `;
            }).join('');
        }

        function filtrarItensCategoria(categoria, btnElement) {
            document.querySelectorAll('.filtros-categoria .btn-filtro').forEach(b => b.classList.remove('ativo'));
            if (btnElement) btnElement.classList.add('ativo');

            if (categoria === 'Todos') {
                renderizarItens();
            } else {
                renderizarItens(ITENS_BIBLIOTECA.filter(i => i.categoria === categoria));
            }
        }

        async function emprestarItem(idItem) {
            const item = ITENS_BIBLIOTECA.find(i => i.id === idItem);
            if (!item || item.qtdDisponivel <= 0) {
                alert('❌ Item indisponível no momento.');
                return;
            }

            try {
                await apiFetch('/api/itens/emprestar', { method: 'POST', body: JSON.stringify({ idItem }) });

                const hoje = new Date();
                const dataDevolucao = new Date(hoje);
                dataDevolucao.setHours(dataDevolucao.getHours() + 4);

                emprestimosItensUsuario.push({
                    id: Date.now(),
                    idItem: item.id,
                    nomeItem: item.nome,
                    categoria: item.categoria,
                    icone: item.icone,
                    matricula: (usuarioLogado?.matriculaFormatada || '').replace('#', ''),
                    nomeAluno: usuarioLogado?.nome || 'Aluno',
                    dataEmprestimo: hoje.toISOString(),
                    dataDevolucao: dataDevolucao.toISOString()
                });

                item.qtdDisponivel--;

                const horasFormat = `${String(dataDevolucao.getHours()).padStart(2,'0')}:${String(dataDevolucao.getMinutes()).padStart(2,'0')}`;
                adicionarXP(20);
                await incrementarProgresso('emprestimos_itens', 1);
                alert(`✅ Empréstimo realizado!\n\n📦 ${item.nome}\n⏰ Devolução até às ${horasFormat} (4 horas)\n\n⭐ +20 XP por empréstimo!\nLembre-se de devolver no prazo!`);
                renderizarItens();
                renderizarEmprestimosUsuario();
            } catch (e) {
                alert('Erro ao emprestar item: ' + e.message);
            }
        }

        async function devolverItem(idEmprestimo) {
            const emp = emprestimosItensUsuario.find(e => e.id === idEmprestimo);
            if (!emp) return;

            const ehAdmin = usuarioLogado?.isAdmin;

            if (!ehAdmin) {
                alert('⚠️ Apenas o administrador pode realizar a baixa de itens emprestados.');
                return;
            }

            const dataDev = new Date(emp.dataDevolucao);
            const hoje = new Date();
            let mensagem = `📦 Confirmar baixa do item?\n\n"${emp.nomeItem}"\n👤 Aluno: ${emp.nomeAluno} (Mat: #${emp.matricula})`;

            if (hoje > dataDev) {
                const diffMin = Math.floor((hoje - dataDev) / (1000 * 60));
                const horas = Math.floor(diffMin / 60);
                const mins = diffMin % 60;
                mensagem += `\n\n⚠️ Este item está com ${horas}h${mins > 0 ? ` e ${mins}min` : ''} de atraso!`;
            }

            if (confirm(mensagem)) {
                try {
                    await apiFetch(`/api/itens/devolver/${idEmprestimo}`, { method: 'POST' });
                    const item = ITENS_BIBLIOTECA.find(i => i.id === emp.idItem);
                    if (item) item.qtdDisponivel++;

                    emprestimosItensUsuario = emprestimosItensUsuario.filter(e => e.id !== idEmprestimo);
                    alert(`✅ Baixa realizada com sucesso!\n\n📦 ${emp.nomeItem} devolvido por ${emp.nomeAluno}.`);
                    renderizarItens();
                    renderizarEmprestimosUsuario();
                } catch (e) {
                    alert('Erro ao devolver: ' + e.message);
                }
            }
        }

        function renderizarEmprestimosUsuario() {
            const container = document.getElementById('lista-emprestimos-usuario');
            if (!container) return;

            const ehAdmin = usuarioLogado?.isAdmin;
            let emprestimosParaExibir;

            if (ehAdmin) {
                emprestimosParaExibir = [...emprestimosItensUsuario].sort((a, b) => a.dataDevolucao.localeCompare(b.dataDevolucao));
            } else {
                const matricula = (usuarioLogado?.matriculaFormatada || '').replace('#', '');
                emprestimosParaExibir = emprestimosItensUsuario
                    .filter(e => e.matricula === matricula)
                    .sort((a, b) => a.dataDevolucao.localeCompare(b.dataDevolucao));
            }

            if (emprestimosParaExibir.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 25px 10px; color: #777;">
                        <p style="font-size: 0.9rem; margin-bottom: 5px;">Nenhum item emprestado.</p>
                        <small style="color: #999;">${ehAdmin ? 'Nenhum aluno possui itens no momento.' : 'Use a aba ao lado para emprestar itens (máx. 4 horas).'}</small>
                    </div>
                `;
                return;
            }

            const hoje = new Date();
            container.innerHTML = emprestimosParaExibir.map(emp => {
                const dataDev = new Date(emp.dataDevolucao);
                const diffMs = dataDev - hoje;
                const diffMin = Math.ceil(diffMs / (1000 * 60));
                const horasRestantes = Math.floor(diffMin / 60);
                const minsRestantes = diffMin % 60;
                const estaVencido = diffMin < 0;
                const estaUrgente = diffMin <= 60 && diffMin >= 0;
                const dataEmp = new Date(emp.dataEmprestimo);
                const empHoras = `${String(dataEmp.getHours()).padStart(2,'0')}:${String(dataEmp.getMinutes()).padStart(2,'0')}`;
                const empData = dataEmp.toLocaleDateString('pt-BR');
                const devHoras = `${String(dataDev.getHours()).padStart(2,'0')}:${String(dataDev.getMinutes()).padStart(2,'0')}`;
                const devData = dataDev.toLocaleDateString('pt-BR');

                const botaoDevolucao = ehAdmin
                    ? `<button class="btn-devolver-item" style="background: #28a745; border-color: #28a745;" onclick="devolverItem(${emp.id})">✅ Baixar</button>`
                    : '';

                return `
                    <div class="emp-item ${estaVencido ? 'emp-item-vencido' : ''}">
                        <div class="emp-item-info">
                            <strong>${emp.icone} ${emp.nomeItem}</strong>
                            ${ehAdmin ? `<p>👤 <b>${emp.nomeAluno}</b> — Mat: #${emp.matricula}</p>` : ''}
                            <p>📅 Emprestado: ${empData} às ${empHoras}</p>
                            <p>📅 Devolução: ${devData} às ${devHoras}</p>
                            <p class="emp-item-dias-restantes ${estaVencido ? 'urgente' : estaUrgente ? 'urgente' : 'ok'}">
                                ${estaVencido ? `⚠️ ${Math.abs(horasRestantes)}h${Math.abs(minsRestantes) > 0 ? ` e ${Math.abs(minsRestantes)}min` : ''} de atraso` : `${horasRestantes}h${minsRestantes > 0 ? ` e ${minsRestantes}min` : ''} restante${diffMin !== 1 ? 's' : ''}`}
                            </p>
                        </div>
                        ${botaoDevolucao}
                    </div>
                `;
            }).join('');
        }

        // ===============================================
        // --- ACHADOS E PERDIDOS ---
        // ===============================================
        let achadosPerdidos = [];

        async function adminCadastrarAchado(e) {
            e.preventDefault();
            const nome = document.getElementById('admin-achado-nome').value.trim();
            const local = document.getElementById('admin-achado-local').value.trim();
            const data = document.getElementById('admin-achado-data').value;
            const categoria = document.getElementById('admin-achado-categoria').value;
            const desc = document.getElementById('admin-achado-desc').value.trim();

            if (!nome || !local || !data) {
                alert('⚠️ Preencha todos os campos obrigatórios.');
                return;
            }

            try {
                await apiFetch('/api/achados', {
                    method: 'POST',
                    body: JSON.stringify({ nome, local, data, categoria, descricao: desc })
                });

                e.target.reset();
                document.getElementById('admin-achado-data').value = new Date().toISOString().split('T')[0];
                alert(`✅ Item registrado com sucesso!\n\n📌 ${nome}\n📍 ${local}\n📅 ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}`);
                adminRenderizarAchados();
                renderizarAchadosPublico();
            } catch (e) {
                alert('Erro ao registrar item: ' + e.message);
            }
        }

        async function adminRenderizarAchados() {
            const container = document.getElementById('admin-tabela-achados-container');
            const contador = document.getElementById('admin-contador-achados');
            if (!container) return;

            let achados = [];
            try {
                achados = await apiFetch('/api/achados');
            } catch (e) {
                container.innerHTML = `<p style="padding: 20px; color: #666; text-align: center;">Erro ao carregar achados.</p>`;
                return;
            }

            const pendentes = achados.filter(a => a.status === 'pendente').length;
            if (contador) contador.textContent = `${achados.length} item${achados.length !== 1 ? 's' : ''} registrado${achados.length !== 1 ? 's' : ''} (${pendentes} pendente${pendentes !== 1 ? 's' : ''})`;

            if (achados.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 30px; background: #fafafa; border: 1px dashed #ccc; border-radius: 8px;">
                        <p style="color: #666; margin-bottom: 5px;">Nenhum item registrado ainda.</p>
                        <small style="color: #999;">Utilize o formulário acima para cadastrar itens achados ou perdidos.</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <table class="tabela-admin">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Local</th>
                            <th>Data Encontrado</th>
                            <th>Categoria</th>
                            <th>Status</th>
                            <th style="text-align: right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${achados.sort((a, b) => b.data.localeCompare(a.data)).map(item => {
                            const dataFormat = new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR');
                            return `
                                <tr>
                                    <td>
                                        <strong>${item.nome}</strong>
                                        ${item.descricao ? `<br><small style="color: #888;">${item.descricao}</small>` : ''}
                                    </td>
                                    <td>${item.local}</td>
                                    <td>${dataFormat}</td>
                                    <td><span class="tag-categoria">${item.categoria}</span></td>
                                    <td>
                                        <span class="${item.status === 'pendente' ? 'tag-status-emp' : 'tag-status-disp'}">
                                            ${item.status === 'pendente' ? '⏳ Pendente' : '✓ Devolvido'}
                                        </span>
                                    </td>
                                    <td style="text-align: right;">
                                        ${item.status === 'pendente' ? `
                                            <button class="btn-acao" style="background: #28a745; padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" onclick="adminMarcarDevolvido(${item.id})">
                                                Devolvido
                                            </button>
                                        ` : ''}
                                        <button class="btn-acao" style="background: var(--vermelho); padding: 4px 8px; font-size: 0.75rem;" onclick="adminExcluirAchado(${item.id})">
                                            Excluir
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        async function adminMarcarDevolvido(id) {
            try {
                await apiFetch(`/api/achados/${id}/devolver`, { method: 'PUT' });
                alert(`✅ Item "${id}" marcado como devolvido.`);
                adminRenderizarAchados();
                renderizarAchadosPublico();
            } catch (e) {
                alert('Erro: ' + e.message);
            }
        }

        async function adminExcluirAchado(id) {
            if (confirm('Excluir este registro permanentemente?')) {
                try {
                    await apiFetch(`/api/achados/${id}`, { method: 'DELETE' });
                    adminRenderizarAchados();
                    renderizarAchadosPublico();
                } catch (e) {
                    alert('Erro ao excluir: ' + e.message);
                }
            }
        }

        async function renderizarAchadosPublico() {
            const grid = document.getElementById('achados-grid-publico');
            const contador = document.getElementById('public-contador-achados');
            if (!grid) return;

            let achados = [];
            try {
                achados = await apiFetch('/api/achados');
            } catch (e) {
                grid.innerHTML = '<p style="color:#999;text-align:center;">Erro ao carregar.</p>';
                return;
            }

            const pendentes = achados.filter(a => a.status === 'pendente');
            if (contador) contador.textContent = `${pendentes.length} item${pendentes.length !== 1 ? 's' : ''} encontrado${pendentes.length !== 1 ? 's' : ''}`;

            if (pendentes.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: #fafafa; border: 1px dashed #ccc; border-radius: 8px;">
                        <p style="font-size: 1.1rem; color: #666; margin-bottom: 5px;">🎉 Nenhum item perdido no momento!</p>
                        <small style="color: #999;">Que bom que todos encontraram suas coisas.</small>
                    </div>
                `;
                return;
            }

            grid.innerHTML = pendentes.map(item => {
                const dataFormat = new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR');
                return `
                    <div class="card-achado">
                        <div class="achado-item">
                            <h4>${item.nome}</h4>
                            <p>📍 <strong>Local:</strong> ${item.local}</p>
                            <p>📅 <strong>Data:</strong> ${dataFormat}</p>
                            <p>📂 <strong>Categoria:</strong> <span class="tag-categoria">${item.categoria}</span></p>
                            ${item.descricao ? `<p><strong>Obs:</strong> ${item.descricao}</p>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

            grid.innerHTML = pendentes.sort((a, b) => b.data.localeCompare(a.data)).map(item => {
                const dataFormat = new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR');
                return `
                    <div class="card-achado">
                        <div class="achado-titulo">${item.nome}</div>
                        <div class="achado-info">📍 <b>Local:</b> ${item.local}</div>
                        <div class="achado-data">📅 Encontrado em: ${dataFormat}</div>
                        <span class="tag-status-achado tag-achado-pendente">⏳ Aguardando Dono</span>
                        <div class="achado-info" style="margin-top: 4px;">🏷️ <b>Categoria:</b> ${item.categoria}</div>
                        ${item.descricao ? `<div class="achado-info" style="margin-top: 4px; font-style: italic;">💬 ${item.descricao}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        // ===============================================
        // --- FUNÇÕES E MÓDULOS DO PAINEL ADMINISTRATIVO ---
        // ===============================================
        let DESAFIOS_SISTEMA = [
            {
                id: 1,
                titulo: "Quiz da Semana — Quem disse?",
                tipo: "quiz",
                frase: "A melhor forma de prever o futuro é criá-la.",
                opcoes: ["Peter Drucker", "Albert Einstein", "Steve Jobs", "Abraham Lincoln", "Mark Twain"],
                respostaCorreta: 0,
                xp: 200,
                prazo: "Semanal"
            }
        ];

        function adminNavegarAba(idAba, btnElement) {
            const subsecoes = document.querySelectorAll('.admin-subsecao');
            subsecoes.forEach(s => s.classList.remove('ativa'));

            const botoes = document.querySelectorAll('.btn-admin-tab');
            botoes.forEach(b => b.classList.remove('ativo'));

            const target = document.getElementById(idAba);
            if (target) target.classList.add('ativa');
            if (btnElement) btnElement.classList.add('ativo');

            adminAtualizarKPIs();
            if (idAba === 'admin-biblioteca') adminRenderizarTabelaLivros();
            if (idAba === 'admin-estudantes') adminRenderizarTabelaAlunos();
            if (idAba === 'admin-desafios') adminRenderizarDesafios();
            if (idAba === 'admin-achados') adminRenderizarAchados();
        }

        async function adminAtualizarKPIs() {
            const elAlunos = document.getElementById('kpi-alunos');
            const elLivros = document.getElementById('kpi-livros');
            const elLocacoes = document.getElementById('kpi-locacoes');
            const elDesafios = document.getElementById('kpi-desafios');

            if (elLivros) elLivros.textContent = ACERVO_LIVROS.length;
            if (elLocacoes) elLocacoes.textContent = locacoesUsuario.length;
            if (elDesafios) elDesafios.textContent = DESAFIOS_SISTEMA.length;

            if (tokenSessao && usuarioLogado?.isAdmin) {
                try {
                    const stats = await apiFetch('/api/admin/stats');
                    if (elAlunos) elAlunos.textContent = stats.totalAlunos.toLocaleString('pt-BR');
                } catch (e) {}
            }
        }

        // --- GESTÃO DE LIVROS NO ADMIN ---
        function adminRenderizarTabelaLivros() {
            const container = document.getElementById('admin-tabela-livros-container');
            const contador = document.getElementById('admin-contador-livros');
            if (!container) return;

            if (contador) contador.textContent = `${ACERVO_LIVROS.length} livro${ACERVO_LIVROS.length === 1 ? '' : 's'} cadastrado${ACERVO_LIVROS.length === 1 ? '' : 's'}`;

            if (ACERVO_LIVROS.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 30px; background: #fafafa; border: 1px dashed #ccc; border-radius: 8px;">
                        <p style="color: #666; margin-bottom: 5px;">Nenhum livro cadastrado no acervo do CEDUP ainda.</p>
                        <small style="color: #999;">Utilize o formulário acima para adicionar títulos físicos ou digitais.</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <table class="tabela-admin">
                    <thead>
                        <tr>
                            <th>Título</th>
                            <th>Autor</th>
                            <th>Categoria</th>
                            <th>Formato</th>
                            <th>Status</th>
                            <th style="text-align: right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ACERVO_LIVROS.map(livro => `
                            <tr>
                                <td><strong>${livro.titulo}</strong></td>
                                <td>${livro.autor}</td>
                                <td><span class="tag-categoria">${livro.categoria}</span></td>
                                <td>${livro.formato}</td>
                                <td>
                                    <span class="${livro.disponivel ? 'tag-status-disp' : 'tag-status-emp'}">
                                        ${livro.disponivel ? 'Disponível' : 'Emprestado'}
                                    </span>
                                </td>
                                <td style="text-align: right;">
                                    <button class="btn-acao" style="background: #2b238f; padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" onclick="adminAlternarStatusLivro(${livro.id})">
                                        ${livro.disponivel ? 'Marcar Emprestado' : 'Marcar Disponível'}
                                    </button>
                                    <button class="btn-acao" style="background: var(--vermelho); padding: 4px 8px; font-size: 0.75rem;" onclick="adminExcluirLivro(${livro.id})">
                                        Excluir
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        async function adminCadastrarLivro(e) {
            e.preventDefault();
            const titulo = document.getElementById('admin-livro-titulo').value.trim();
            const autor = document.getElementById('admin-livro-autor').value.trim();
            const categoria = document.getElementById('admin-livro-categoria').value;
            const formato = document.getElementById('admin-livro-formato').value;
            const paginas = parseInt(document.getElementById('admin-livro-paginas').value) || 200;
            const ano = parseInt(document.getElementById('admin-livro-ano').value) || new Date().getFullYear();
            const sinopse = document.getElementById('admin-livro-sinopse').value.trim();
            const previa = document.getElementById('admin-livro-previa').value.trim() || `Capítulo 1: Introdução aos conceitos fundamentais de ${titulo}.`;

            if (!titulo || !autor || !sinopse) {
                alert('Preencha os campos obrigatórios (Título, Autor e Sinopse).');
                return;
            }

            try {
                await apiFetch('/api/livros', {
                    method: 'POST',
                    body: JSON.stringify({ titulo, autor, categoria, formato, paginas, ano, sinopse, previa })
                });

                adminRenderizarTabelaLivros();
                renderizarAcervo();
                adminAtualizarKPIs();

                document.getElementById('admin-livro-titulo').value = '';
                document.getElementById('admin-livro-autor').value = '';
                document.getElementById('admin-livro-sinopse').value = '';
                document.getElementById('admin-livro-previa').value = '';
                document.getElementById('admin-livro-paginas').value = '';
                document.getElementById('admin-livro-ano').value = '';

                alert(`✅ Livro "${titulo}" cadastrado com sucesso!`);
            } catch (e) {
                alert('Erro ao cadastrar livro: ' + e.message);
            }
            document.getElementById('admin-livro-ano').value = '';

            alert(`✅ Livro "${titulo}" publicado com sucesso no acervo do CEDUP! Já está visível na aba Biblioteca para os alunos.`);
        }

        function adminAlternarStatusLivro(idLivro) {
            const livro = ACERVO_LIVROS.find(l => l.id === idLivro);
            if (!livro) return;
            livro.disponivel = !livro.disponivel;
            adminRenderizarTabelaLivros();
            renderizarAcervo();
        }

        function adminExcluirLivro(idLivro) {
            if (!confirm('Deseja realmente remover este livro do acervo?')) return;
            const idx = ACERVO_LIVROS.findIndex(l => l.id === idLivro);
            if (idx !== -1) {
                ACERVO_LIVROS.splice(idx, 1);
                adminRenderizarTabelaLivros();
                renderizarAcervo();
                adminAtualizarKPIs();
            }
        }

        // --- GESTÃO DE ESTUDANTES NO ADMIN ---
        let listaAlunosCache = [];

        async function adminRenderizarTabelaAlunos(listaFiltrada) {
            const container = document.getElementById('admin-tabela-alunos-container');
            if (!container) return;

            let lista;
            if (listaFiltrada) {
                lista = listaFiltrada;
            } else {
                try {
                    listaAlunosCache = await apiFetch('/api/admin/alunos');
                } catch (e) {
                    container.innerHTML = `<p style="padding: 20px; color: #666; text-align: center;">Erro ao carregar estudantes.</p>`;
                    return;
                }
                lista = listaAlunosCache.slice(0, 25);
            }

            if (lista.length === 0) {
                container.innerHTML = `<p style="padding: 20px; color: #666; text-align: center;">Nenhum estudante encontrado com esse termo.</p>`;
                return;
            }

            container.innerHTML = `
                <table class="tabela-admin">
                    <thead>
                        <tr>
                            <th>Matrícula</th>
                            <th>Estudante</th>
                            <th>Permissão</th>
                            <th style="text-align: right;">Ações de Gestão</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(u => {
                            const ehAdm = Boolean(u.isAdmin);
                            return `
                                <tr>
                                    <td><strong>#${u.matricula}</strong></td>
                                    <td>${u.nome}</td>
                                    <td>
                                        <span class="${ehAdm ? 'badge-admin' : 'badge-aluno'}">
                                            ${ehAdm ? 'Professor / Admin' : 'Estudante'}
                                        </span>
                                    </td>
                                    <td style="text-align: right;">
                                        <button class="btn-acao" style="padding: 4px 8px; font-size: 0.75rem; background: ${ehAdm ? '#777' : '#1e1968'}; margin-right: 4px;" onclick="adminAlternarAdminAluno('${u.matricula}')">
                                            ${ehAdm ? 'Remover Admin' : 'Tornar Admin'}
                                        </button>
                                        <button class="btn-acao" style="padding: 4px 8px; font-size: 0.75rem; background: #28a745;" onclick="adminConcederXP('${u.matricula}', 50)">
                                            +50 XP
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        async function adminFiltrarAlunos() {
            const termo = (document.getElementById('admin-busca-aluno')?.value || '').toLowerCase().trim();
            if (!termo) {
                adminRenderizarTabelaAlunos();
                return;
            }
            if (listaAlunosCache.length === 0) {
                try { listaAlunosCache = await apiFetch('/api/admin/alunos'); } catch (e) { return; }
            }
            const filtrados = listaAlunosCache.filter(u =>
                (u.nome && u.nome.toLowerCase().includes(termo)) ||
                (u.matricula && u.matricula.toLowerCase().includes(termo))
            ).slice(0, 30);

            adminRenderizarTabelaAlunos(filtrados);
        }

        async function adminAlternarAdminAluno(matricula) {
            try {
                const data = await apiFetch(`/api/admin/alunos/${matricula}/toggle-admin`, { method: 'PUT' });
                listaAlunosCache = [];
                if (data.isAdmin) {
                    alert(`✅ ${matricula} agora possui acesso total de Administrador!`);
                } else {
                    alert(`Permissão de administrador removida de ${matricula}.`);
                }
                adminRenderizarTabelaAlunos();
            } catch (e) {
                alert('Erro ao alterar permissão: ' + e.message);
            }
        }

        async function adminConcederXP(matricula, qtd) {
            const usuario = listaAlunosCache.find(u => u.matricula === matricula);
            try {
                const perfil = await apiFetch(`/api/usuario/perfil`);
                if (usuarioLogado && usuarioLogado.matriculaFormatada === "#" + matricula) {
                    adicionarXP(qtd);
                }
                alert(`⭐ +${qtd} XP concedidos com sucesso para o estudante ${usuario ? usuario.nome : matricula}!`);
            } catch (e) {
                alert('Erro ao conceder XP: ' + e.message);
            }
        }

        async function adminCadastrarAluno(e) {
            e.preventDefault();
            const nome = document.getElementById('admin-novo-nome').value.trim();
            const mat = document.getElementById('admin-novo-mat').value.trim().replace(/\D/g, '');
            const tipo = document.getElementById('admin-novo-tipo').value;

            if (!nome || !mat) {
                alert('Informe o Nome e a Matrícula.');
                return;
            }

            if (mat.length < 6) {
                alert('A matrícula deve ter pelo menos 6 dígitos para gerar a senha padrão.');
                return;
            }

            try {
                await apiFetch('/api/admin/alunos', {
                    method: 'POST',
                    body: JSON.stringify({ nome, matricula: mat, isAdmin: tipo === 'admin' })
                });

                document.getElementById('admin-novo-nome').value = '';
                document.getElementById('admin-novo-mat').value = '';

                alert(`✅ Usuário ${nome} cadastrado com sucesso!\nMatrícula: ${mat}\nSenha Inicial: ${mat.substring(0, 6)}`);
                adminRenderizarTabelaAlunos();
                adminAtualizarKPIs();
            } catch (e) {
                alert('Erro ao cadastrar: ' + e.message);
            }

            alert(`✅ Usuário ${nome} cadastrado com sucesso!\nMatrícula: ${mat}\nSenha Inicial: ${senhaInicial}`);
            adminRenderizarTabelaAlunos();
            adminAtualizarKPIs();
        }

        // --- GESTÃO DE DESAFIOS ---
        function adminRenderizarDesafios() {
            const containerAdmin = document.getElementById('admin-lista-desafios');
            const containerHome = document.getElementById('lista-desafios-home');

            const htmlAdmin = DESAFIOS_SISTEMA.map(desafio => `
                <div class="item-lista">
                    <div>
                        <strong>${desafio.tipo === 'quiz' ? '❓' : '⚡'} ${desafio.titulo}</strong>
                        <p style="font-size: 0.85rem; color: #666;">+${desafio.xp} XP | ${desafio.prazo}${desafio.tipo === 'quiz' ? ' | Quiz interativo' : ''}</p>
                    </div>
                    <button class="btn-acao" style="background: var(--vermelho);" onclick="adminExcluirDesafio(${desafio.id})">Excluir Desafio</button>
                </div>
            `).join('');

            const htmlHome = DESAFIOS_SISTEMA.map(desafio => {
                if (desafio.tipo === 'quiz') {
                    const letras = ['A', 'B', 'C', 'D', 'E'];
                    return `
                        <div class="quiz-card" id="quiz-${desafio.id}">
                            <span class="quiz-badge">❓ Quiz da Semana — +${desafio.xp} XP</span>
                            <p style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">Quem é o autor desta frase?</p>
                            <div class="quiz-frase">${desafio.frase}</div>
                            <div class="quiz-opcoes" id="quiz-opcoes-${desafio.id}">
                                ${desafio.opcoes.map((opcao, i) => `
                                    <button class="quiz-opcao" onclick="responderQuiz(${desafio.id}, ${i})" id="quiz-btn-${desafio.id}-${i}">
                                        <span class="opcao-letra">${letras[i]}</span>
                                        ${opcao}
                                    </button>
                                `).join('')}
                            </div>
                            <div id="quiz-resultado-${desafio.id}"></div>
                        </div>
                    `;
                }
                return `
                    <div class="item-lista">
                        <div>
                            <strong>⚡ ${desafio.titulo}</strong>
                            <p style="font-size: 0.8rem; color: #666;">+${desafio.xp} XP | ${desafio.prazo}</p>
                        </div>
                        <button class="btn-acao" onclick="alert('Desafio aceito! Ao concluir sua atividade entregue ao professor para validar seus +${desafio.xp} XP.')">Aceitar</button>
                    </div>
                `;
            }).join('');

            if (containerAdmin) containerAdmin.innerHTML = htmlAdmin || '<p style="color:#777;">Nenhum desafio ativo.</p>';
            if (containerHome) containerHome.innerHTML = htmlHome || '<p style="color:#777;">Nenhum desafio disponível no momento.</p>';
            adminAtualizarKPIs();
        }

        async function adminCriarDesafio(e) {
            e.preventDefault();
            const titulo = document.getElementById('admin-desafio-titulo').value.trim();
            const xp = parseInt(document.getElementById('admin-desafio-xp').value) || 100;
            const prazo = document.getElementById('admin-desafio-prazo').value.trim() || "Semanal";

            if (!titulo) return;

            try {
                await apiFetch('/api/desafios', {
                    method: 'POST',
                    body: JSON.stringify({ titulo, tipo: 'atividade', xp, prazo })
                });

                document.getElementById('admin-desafio-titulo').value = '';
                adminRenderizarDesafios();
                alert(`🚀 Desafio "${titulo}" lançado com sucesso para todos os alunos!`);
            } catch (e) {
                alert('Erro ao criar desafio: ' + e.message);
            }
        }

        function adminExcluirDesafio(idDesafio) {
            if (!confirm('Deseja realmente remover este desafio?')) return;
            DESAFIOS_SISTEMA = DESAFIOS_SISTEMA.filter(d => d.id !== idDesafio);
            adminRenderizarDesafios();
        }

        let quizzesRespondidos = {};

        async function responderQuiz(idDesafio, indiceResposta) {
            if (quizzesRespondidos[idDesafio]) {
                alert('⚠️ Você já respondeu este quiz!');
                return;
            }

            const desafio = DESAFIOS_SISTEMA.find(d => d.id === idDesafio);
            if (!desafio) return;

            try {
                const data = await apiFetch(`/api/desafios/${idDesafio}/responder`, {
                    method: 'POST',
                    body: JSON.stringify({ respostaIndex: indiceResposta })
                });

                quizzesRespondidos[idDesafio] = data.acertou;
                const containerOpcoes = document.getElementById(`quiz-opcoes-${idDesafio}`);
                const containerResultado = document.getElementById(`quiz-resultado-${idDesafio}`);
                const botoes = containerOpcoes.querySelectorAll('.quiz-opcao');

                botoes.forEach((btn, i) => {
                    btn.disabled = true;
                    btn.classList.add('desabilitada');
                    if (i === desafio.respostaCorreta) {
                        btn.classList.add('correta');
                        btn.classList.remove('desabilitada');
                    }
                    if (i === indiceResposta && !data.acertou) {
                        btn.classList.add('errada');
                        btn.classList.remove('desabilitada');
                    }
                    btn.onclick = null;
                });

                if (data.acertou) {
                    adicionarXP(desafio.xp);
                    await incrementarProgresso('quizzes_acertos', 1);
                    containerResultado.innerHTML = `
                        <div class="quiz-resultado acerto">
                            ✅ Parabéns! Resposta correta! Você é o autor: <b>${desafio.opcoes[desafio.respostaCorreta]}</b><br>
                            ⭐ +${desafio.xp} XP adicionados ao seu perfil!
                        </div>
                    `;
                } else {
                    containerResultado.innerHTML = `
                        <div class="quiz-resultado erro">
                            ❌ Resposta incorreta! O autor correto é: <b>${desafio.opcoes[desafio.respostaCorreta]}</b><br>
                            Tente novamente no próximo desafio!
                        </div>
                    `;
                }
            } catch (e) {
                alert('Erro ao responder quiz: ' + e.message);
            }
        }

        // ===============================================
        // --- SISTEMA DE MEDALHAS ---
        // ===============================================
        let MEDALHAS = [
            { id: 1, nome: "Bem-vindo", icone: "⭐", descricao: "Fazer login pela primeira vez", condicao: "login", meta: 1, xp: 50 },
            { id: 2, nome: "Perfil Completo", icone: "📝", descricao: "Atualizar dados do perfil", condicao: "perfil", meta: 1, xp: 100 },
            { id: 3, nome: "Primeira Leitura", icone: "📖", descricao: "Concluir 1 leitura digital", condicao: "leituras", meta: 1, xp: 100 },
            { id: 4, nome: "Leitor Ávido", icone: "📚", descricao: "Concluir 5 leituras digitais", condicao: "leituras", meta: 5, xp: 300 },
            { id: 5, nome: "Mestre do Saber", icone: "🏆", descricao: "Concluir 10 leituras digitais", condicao: "leituras", meta: 10, xp: 500 },
            { id: 6, nome: "Renovador", icone: "🔄", descricao: "Renovar 1 livro emprestado", condicao: "renovacoes", meta: 1, xp: 50 },
            { id: 7, nome: "Colecionador", icone: "📋", descricao: "Ter 3 livros emprestados ao mesmo tempo", condicao: "locacoes_simultaneas", meta: 3, xp: 150 },
            { id: 8, nome: "Primeira Reserva", icone: "🖥️", descricao: "Agendar 1 computador", condicao: "reservas_pc", meta: 1, xp: 100 },
            { id: 9, nome: "Reservista Fiel", icone: "📅", descricao: "Agendar 5 reservas de computador", condicao: "reservas_pc", meta: 5, xp: 250 },
            { id: 11, nome: "Primeiro Emprestimo", icone: "📦", descricao: "Emprestar 1 item da biblioteca", condicao: "emprestimos_itens", meta: 1, xp: 100 },
            { id: 12, nome: "Ferramenteiro", icone: "🔧", descricao: "Emprestar 5 itens no total", condicao: "emprestimos_itens", meta: 5, xp: 200 },
            { id: 13, nome: "Devolvedor", icone: "✅", descricao: "Devolver todos os itens no prazo", condicao: "devolucoes_no_prazo", meta: 3, xp: 150 },
            { id: 14, nome: "Acertador", icone: "🧠", descricao: "Acertar 1 quiz", condicao: "quizzes_acertos", meta: 1, xp: 100 },
            { id: 15, nome: "Certeiro", icone: "🎯", descricao: "Acertar 3 quizzes", condicao: "quizzes_acertos", meta: 3, xp: 300 },
            { id: 16, nome: "Gênio", icone: "🏅", descricao: "Acertar 5 quizzes no total", condicao: "quizzes_acertos", meta: 5, xp: 500 },
            { id: 17, nome: "Explorador MEC", icone: "🔗", descricao: "Acessar a Biblioteca Digital MEC", condicao: "acesso_mec", meta: 1, xp: 50 },
            { id: 18, nome: "Em Chamas", icone: "🔥", descricao: "Ganhar 500 XP em uma semana", condicao: "xp_semanal", meta: 500, xp: 200 },
            { id: 19, nome: "Ranking Top 4", icone: "👑", descricao: "Aparecer no ranking da página inicial", condicao: "ranking", meta: 1, xp: 300 }
        ];

        let progressoAluno = {
            login: 0,
            perfil: 0,
            leituras: 0,
            renovacoes: 0,
            locacoes_simultaneas: 0,
            reservas_pc: 0,
            emprestimos_itens: 0,
            devolucoes_no_prazo: 0,
            quizzes_acertos: 0,
            acesso_mec: 0,
            xp_semanal: 0,
            ranking: 0
        };

        let medalhasDesbloqueadas = new Set();

        async function verificarMedalhas() {
            for (const medalha of MEDALHAS) {
                if (medalhasDesbloqueadas.has(medalha.id)) continue;
                let atual = progressoAluno[medalha.condicao] || 0;
                if (medalha.condicao === 'xp_semanal') atual = xpAtual;
                if (atual >= medalha.meta) {
                    medalhasDesbloqueadas.add(medalha.id);
                    adicionarXP(medalha.xp);
                    mostrarPopupMedalha(medalha);
                    if (tokenSessao) {
                        try { await apiFetch('/api/medalhas/desbloquear', { method: 'POST', body: JSON.stringify({ idMedalha: medalha.id, xp: medalha.xp }) }); } catch(e) {}
                    }
                }
            }
            renderizarMedalhas();
        }

        function mostrarPopupMedalha(medalha) {
            const overlay = document.createElement('div');
            overlay.className = 'medalha-popup-overlay';
            overlay.id = 'medalha-overlay-popup';

            const popup = document.createElement('div');
            popup.className = 'medalha-popup';
            popup.id = 'medalha-popup-box';
            popup.innerHTML = `
                <div class="medalha-popup-icone">${medalha.icone}</div>
                <div class="medalha-popup-titulo">Medalha Desbloqueada!</div>
                <div class="medalha-popup-desc">${medalha.nome}</div>
                <div class="medalha-popup-xp">⭐ +${medalha.xp} XP</div>
                <button class="medalha-popup-btn" onclick="fecharPopupMedalha()">Continuar</button>
            `;

            overlay.onclick = () => fecharPopupMedalha();
            document.body.appendChild(overlay);
            document.body.appendChild(popup);
        }

        function fecharPopupMedalha() {
            const overlay = document.getElementById('medalha-overlay-popup');
            const popup = document.getElementById('medalha-popup-box');
            if (overlay) overlay.remove();
            if (popup) popup.remove();
        }

        async function incrementarProgresso(chave, valor) {
            progressoAluno[chave] = (progressoAluno[chave] || 0) + (valor || 1);
            if (chave === 'xp_semanal' && xpAtual > 0) {
                progressoAluno.xp_semanal = xpAtual;
            }
            if (tokenSessao) {
                try { await apiFetch('/api/medalhas/incrementar', { method: 'POST', body: JSON.stringify({ chave, valor: valor || 1 }) }); } catch(e) {}
            }
            verificarMedalhas();
        }

        function renderizarMedalhas() {
            const container = document.getElementById('medalhas-grid');
            const contador = document.getElementById('medalhas-contador');
            const elGamificacaoXp = document.getElementById('gamificacao-xp');
            const containerDesafiosGamificacao = document.getElementById('lista-desafios-gamificacao');
            const containerHistorico = document.getElementById('historico-conquistas');
            if (!container) return;

            if (elGamificacaoXp) elGamificacaoXp.textContent = xpAtual.toLocaleString('pt-BR') + ' XP';

            const desbloqueadas = MEDALHAS.filter(m => medalhasDesbloqueadas.has(m.id)).length;
            if (contador) contador.textContent = `${desbloqueadas} de ${MEDALHAS.length} desbloqueadas`;

            container.innerHTML = MEDALHAS.map(medalha => {
                const desbloqueada = medalhasDesbloqueadas.has(medalha.id);
                const progresso = Math.min((progressoAluno[medalha.condicao] || 0) / medalha.meta, 1);
                const pct = Math.round(progresso * 100);

                return `
                    <div class="medalha-card ${desbloqueada ? 'desbloqueada' : 'bloqueada'}">
                        <div class="medalha-icone">${medalha.icone}</div>
                        <div class="medalha-nome">${medalha.nome}</div>
                        <div class="medalha-desc">${medalha.descricao}</div>
                        <div class="medalha-xp">+${medalha.xp} XP</div>
                        <span class="medalha-status ${desbloqueada ? 'dest' : 'bloc'}">
                            ${desbloqueada ? '✓ Desbloqueada' : `${pct}%`}
                        </span>
                        ${!desbloqueada ? `
                            <div class="medalha-progresso">
                                <div class="medalha-progresso-barra" style="width: ${pct}%;"></div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            if (containerDesafiosGamificacao) {
                containerDesafiosGamificacao.innerHTML = DESAFIOS_SISTEMA.map(desafio => {
                    if (desafio.tipo === 'quiz') {
                        return `
                            <div style="padding: 12px 0; border-bottom: 1px solid #eee;">
                                <strong>❓ ${desafio.titulo}</strong>
                                <p style="font-size: 0.8rem; color: #666;">+${desafio.xp} XP | ${desafio.prazo}</p>
                                <p style="font-size: 0.8rem; color: #8e44ad; font-style: italic; margin-top: 4px;">"${desafio.frase.substring(0, 60)}..."</p>
                            </div>
                        `;
                    }
                    return `
                        <div style="padding: 12px 0; border-bottom: 1px solid #eee;">
                            <strong>⚡ ${desafio.titulo}</strong>
                            <p style="font-size: 0.8rem; color: #666;">+${desafio.xp} XP | ${desafio.prazo}</p>
                        </div>
                    `;
                }).join('') || '<p style="color: #777;">Nenhum desafio ativo.</p>';
            }

            if (containerHistorico) {
                const medalhasDesb = MEDALHAS.filter(m => medalhasDesbloqueadas.has(m.id));
                if (medalhasDesb.length === 0) {
                    containerHistorico.innerHTML = '<p style="color: #777; font-size: 0.9rem;">Complete ações no site para desbloquear medalhas!</p>';
                } else {
                    containerHistorico.innerHTML = medalhasDesb.map(m => `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee;">
                            <span style="font-size: 1.5rem;">${m.icone}</span>
                            <div>
                                <strong style="font-size: 0.9rem;">${m.nome}</strong>
                                <p style="font-size: 0.78rem; color: #888;">+${m.xp} XP</p>
                            </div>
                        </div>
                    `).join('');
                }
            }

            renderizarMedalhasHome();
        }

        function renderizarMedalhasHome() {
            const container = document.getElementById('medalhas-home-resumo');
            if (!container) return;

            const desbloqueadas = MEDALHAS.filter(m => medalhasDesbloqueadas.has(m.id));
            const proximas = MEDALHAS.filter(m => !medalhasDesbloqueadas.has(m.id)).slice(0, 3);

            let html = '';

            if (desbloqueadas.length > 0) {
                html += `<p style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">✅ ${desbloqueadas.length} de ${MEDALHAS.length} desbloqueadas</p>`;
                html += desbloqueadas.slice(0, 4).map(m => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee;">
                        <span style="font-size: 1.4rem;">${m.icone}</span>
                        <div>
                            <strong style="font-size: 0.88rem;">${m.nome}</strong>
                            <p style="font-size: 0.75rem; color: #888;">+${m.xp} XP</p>
                        </div>
                    </div>
                `).join('');
                if (desbloqueadas.length > 4) {
                    html += `<p style="font-size: 0.8rem; color: #999; margin-top: 8px;">+${desbloqueadas.length - 4} mais...</p>`;
                }
            } else {
                html += `<p style="font-size: 0.85rem; color: #888; margin-bottom: 10px;">Nenhuma medalha desbloqueada ainda.</p>`;
            }

            if (proximas.length > 0) {
                html += `<p style="font-size: 0.82rem; color: #8e44ad; font-weight: 600; margin-top: 12px; margin-bottom: 8px;">🎯 Próximas medalhas:</p>`;
                proximas.forEach(m => {
                    const progresso = Math.min((progressoAluno[m.condicao] || 0) / m.meta, 1);
                    const pct = Math.round(progresso * 100);
                    html += `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 6px 0;">
                            <span style="font-size: 1.2rem; filter: grayscale(100%); opacity: 0.5;">${m.icone}</span>
                            <div style="flex: 1;">
                                <strong style="font-size: 0.82rem; color: #666;">${m.nome}</strong>
                                <div class="medalha-progresso" style="margin-top: 4px;">
                                    <div class="medalha-progresso-barra" style="width: ${pct}%;"></div>
                                </div>
                            </div>
                            <span style="font-size: 0.75rem; color: #888;">${pct}%</span>
                        </div>
                    `;
                });
            }

            container.innerHTML = html;
        }

        // ===============================================
        // --- DICA DE LEITURA DA SEMANA ---
        // ===============================================
        function renderizarDicaLeituraSemana() {
            const container = document.getElementById('dica-leitura-semana');
            if (!container) return;

            const livrosFisicos = ACERVO_LIVROS.filter(l => l.formato && !l.formato.includes('Digital'));
            if (livrosFisicos.length === 0) {
                container.style.display = 'none';
                return;
            }

            const hoje = new Date();
            const semanaAno = Math.floor(hoje.getTime() / (7 * 24 * 60 * 60 * 1000));
            const livroIndex = semanaAno % livrosFisicos.length;
            const livro = livrosFisicos[livroIndex];

            container.innerHTML = `
                <img class="dica-leitura-capa" src="${livro.capa}" alt="Capa de ${livro.titulo}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22260%22><rect fill=%22%231a5276%22 width=%22200%22 height=%22260%22/><text fill=%22rgba(255,255,255,0.5)%22 font-size=%2240%22 x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>📖</text></svg>'">
                <div class="dica-leitura-conteudo">
                    <span class="dica-leitura-badge">📖 Dica de Leitura da Semana</span>
                    <div class="dica-leitura-titulo">${livro.titulo}</div>
                    <div class="dica-leitura-autor">por ${livro.autor}</div>
                    <div class="dica-leitura-meta">
                        <span>📚 ${livro.categoria}</span>
                        <span>📄 ${livro.paginas} páginas</span>
                        <span>📅 ${livro.anoLancamento}</span>
                        <span>📖 ${livro.edicao}</span>
                    </div>
                    <div class="dica-leitura-sinopse">${livro.sinopse}</div>
                    <button class="dica-leitura-btn" onclick="navegar('biblioteca')">Ver no Acervo →</button>
                </div>
            `;
        }

        // --- EXPORTAÇÃO EM CSV E RELATÓRIOS ---
        async function adminExportarCSV() {
            try {
                window.location.href = '/api/admin/export/csv';
            } catch (e) {
                alert('Erro ao exportar CSV: ' + e.message);
            }
        }

        async function adminAuditarSistema() {
            try {
                const stats = await apiFetch('/api/admin/stats');
                alert(`🔍 Diagnóstico Concluído com Sucesso!\n\n• Total de Alunos Ativos: ${stats.totalAlunos}\n• Livros no Acervo: ${stats.totalLivros}\n• Empréstimos Ativos: ${stats.emprestimosAtivos}\n• Reservas de PCs: ${stats.reservasAtivas}\n• Achados Pendentes: ${stats.achadosPendentes}\n• Itens Emprestados: ${stats.itensEmprestados}`);
            } catch (e) {
                alert('Erro ao auditar: ' + e.message);
            }
        }

        // Inicializar renderização inicial do acervo e elementos estáticos
        window.addEventListener('DOMContentLoaded', () => {
            renderizarAcervo();
            popularSelectPCs();
            renderizarComputadores();
            renderizarAchadosPublico();

            const inputData = document.getElementById('reserva-data');
            if (inputData) inputData.min = new Date().toISOString().split('T')[0];

            const inputDataAchado = document.getElementById('admin-achado-data');
            if (inputDataAchado) inputDataAchado.value = new Date().toISOString().split('T')[0];
        });
    