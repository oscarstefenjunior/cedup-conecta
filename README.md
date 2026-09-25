# CedupConecta — Projeto Liga Jovem

## Oscar: concluir o cadastro dos professores

A atualização de primeiro acesso dos professores já foi publicada na Vercel. Falta importar a lista no banco de produção usando o acesso de quem administra o banco.

**[Abrir o passo a passo completo de importação dos professores](scripts/IMPORTACAO-PROFESSORES.md)** — inclui atualização do projeto, configuração do banco, conferência sem gravar, importação e validação final.

O código de importação está em [`scripts/importar-professores.js`](scripts/importar-professores.js). A lista com 125 professores deve ser recebida no pacote privado `cedup-professores-para-oscar-25092026.zip` e colocada em `auditoria-local/professores.json`. Ela não acompanha o clone: este repositório é público, e os seis primeiros dígitos das matrículas são também as senhas iniciais. O arquivo `.env` com o acesso ao banco também deve permanecer privado.

Plataforma escolar do CEDUP Hermann Hering para consulta ao acervo, empréstimos de livros e materiais, reserva de computadores, achados e perdidos e atividades de incentivo à leitura.

O projeto contém uma interface em HTML/CSS/JavaScript, uma API Node.js/Express e persistência em PostgreSQL. O código foi analisado em **23/09/2026**. Há pendências de segurança e funcionamento antes do uso com dados reais; consulte [ANALISE_DO_PROJETO.md](ANALISE_DO_PROJETO.md).

## Funcionalidades presentes

- Login por matrícula e senha, com perfis de estudante e administrador.
- Acervo com busca, filtros, detalhes, prévias e resenhas.
- Empréstimos de livros por 7 dias, com até 2 renovações de 7 dias.
- Empréstimos de materiais por 4 horas, com limite de 2 itens ativos por estudante e baixa por administrador.
- Reservas de computadores por data e intervalo de horário.
- Cadastro e consulta de achados e perdidos.
- Desafios, quizzes, XP e medalhas.
- Administração de estudantes, livros, desafios e permissões; estatísticas e exportação CSV.

Essas funcionalidades existem no código, mas não estão todas validadas de ponta a ponta. A leitura digital exibe uma prévia textual; não há leitor de PDF implementado. A persistência da conclusão de leitura ainda não está conectada à interface.

## Tecnologias e arquitetura

| Camada | Implementação |
| --- | --- |
| Interface | `index.html`, com CSS e JavaScript incorporados, sem compilação |
| API | Node.js, Express 4 e CORS |
| Autenticação | JWT com duração de 12 horas; hashes de senha com bcryptjs |
| Banco | PostgreSQL via `pg` |
| Configuração | `dotenv`, lendo `.env` por padrão |
| Publicação configurada | Vercel, encaminhando requisições para `server.js` |

O navegador chama `/api/...` no mesmo domínio da interface (`API_BASE = ''`). O token fica em memória e precisa ser obtido novamente após recarregar a página. `database.js` converte os parâmetros `?` em parâmetros PostgreSQL e nomes de colunas `snake_case` em propriedades `camelCase`.

## Estrutura

```text
index.html                Interface e lógica do navegador
server.js                 Rotas, autenticação e arquivos públicos
database.js               Conexão, adaptador SQL e criação das tabelas
seed.js                   Importação de usuários e dados iniciais
alunos.js                 Cadastro usado pelo seed; contém dados pessoais e senhas
scripts/push-schema.js    Criação/verificação do schema
capas/                    Imagens das capas
images.png                Logo usado pela interface
package.json              Dependências e comandos
package-lock.json         Versões resolvidas das dependências
vercel.json               Configuração de publicação
ANALISE_DO_PROJETO.md      Diagnóstico, prioridades e validações
```

Também existem uma planilha de matrículas, imagens de referência, arquivos SQLite, logs e cópias temporárias de JavaScript. O backend atual **não usa SQLite**. `temp.js` e `temp_script.js` não são referenciados pela aplicação atual.

## Executar localmente

### Pré-requisitos

- Node.js e npm. As verificações desta revisão foram executadas com Node.js **24.18.0** e npm **11.16.0**. O projeto ainda não declara `engines`.
- Um banco PostgreSQL acessível, preferencialmente separado para desenvolvimento.
- Credenciais com permissão para criar tabelas na preparação inicial.

### 1. Instalar dependências

Na pasta do projeto:

```powershell
npm ci
```

### 2. Configurar o ambiente

Crie ou edite `.env` na raiz, preservando configurações que já existam. **O README não contém credenciais reais.** Os nomes das variáveis são públicos; os valores reais de `DATABASE_URL` e `JWT_SECRET` são privados e devem ficar somente no `.env` local ou nas variáveis de ambiente da Vercel.

Modelo sem credenciais (preencha os dois campos vazios antes de iniciar):

```dotenv
PORT=3000
NODE_ENV=development
DATABASE_URL=
JWT_SECRET=
```

Para gerar um segredo local:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`PORT` e `NODE_ENV` são configurações comuns, não segredos. Nunca use exemplos da documentação como senha. Não publique o conteúdo do `.env`, tokens, senhas de usuários ou a URL real do banco. `.env.local` não é carregado automaticamente pelos comandos Node atuais. Variáveis já fornecidas ao processo também podem configurar a aplicação.

**Conexão remota:** atualmente o código desativa SSL fora de `production` e habilita SSL com `rejectUnauthorized: false` em `production`. Essa configuração precisa ser revista para o provedor escolhido, incluindo verificação do certificado. Não use `NODE_ENV=production` para tentar iniciar o servidor local: nessa condição o código atual não chama `listen()`.

### 3. Preparar o banco

Para criar as tabelas sem importar o cadastro:

```powershell
npm run db:push
```

Para criar as tabelas e importar os dados iniciais:

```powershell
npm run seed
```

O seed importa os registros de `alunos.js`, configura administradores definidos no próprio script e insere 3 livros, 11 tipos de materiais e 1 quiz. **Revise a origem dos dados e os administradores antes de executar.** Em desenvolvimento, use um cadastro fictício controlado. Não há cadastro público nem criação automática de um usuário de teste seguro.

O seed usa `ON CONFLICT DO NOTHING` nas inserções, mas reaplica a configuração dos administradores. Ele não é uma migração e não atualiza automaticamente registros já existentes. `db:push` também não modifica colunas de tabelas existentes, pois usa `CREATE TABLE IF NOT EXISTS`.

### 4. Iniciar

```powershell
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Não abra `index.html` diretamente pelo sistema de arquivos: as funcionalidades dependem da API.

| Comando | Comportamento atual |
| --- | --- |
| `npm run dev` | Executa `node server.js`, sem recarga automática e sem preparar o banco |
| `npm run db:push` | Cria/verifica as tabelas no banco configurado |
| `npm run seed` | Cria/verifica tabelas e executa a carga inicial |
| `npm start` | Executa o seed e, se ele terminar com sucesso, inicia `server.js` |

## Banco de dados

As 15 tabelas estão definidas em `database.js`:

| Área | Tabelas |
| --- | --- |
| Usuários e permissões | `usuarios`, `admins_matriculas` |
| Biblioteca | `livros`, `emprestimos_livros`, `resenhas`, `curtidas_resenhas` |
| Computadores | `reservas_pcs` |
| Materiais | `itens_biblioteca`, `emprestimos_itens` |
| Achados | `achados_perdidos` |
| Gamificação | `desafios`, `quizzes_respondidos`, `medalhas_desbloqueadas`, `progresso_aluno` |
| Leitura | `leituras_digital` |

Não existe migração automática dos arquivos SQLite antigos para PostgreSQL, nem uma rotina de backup/restauração no repositório.

## API

As rotas protegidas recebem `Authorization: Bearer <token>`. Requisições com corpo usam JSON. Os caminhos abaixo indicam grupos; consulte `server.js` para os métodos e sufixos disponíveis.

| Grupo | Acesso atual |
| --- | --- |
| `POST /api/login` | Público |
| `GET /api/livros`, `GET /api/itens`, `GET /api/achados` | Público |
| `/api/usuario/perfil`, `/api/usuario/xp` | Autenticado |
| `/api/emprestimos` e renovação/devolução | Autenticado; a devolução requer correção de autorização |
| `/api/reservas/pcs` | Autenticado; cancelamento pelo proprietário ou administrador |
| `/api/itens/emprestar`, `/api/itens/emprestimos` | Autenticado |
| `/api/itens/devolver/:id`, `/api/itens/emprestimos/todos` | Administrador |
| `/api/resenhas` e curtidas | Autenticado |
| `/api/desafios` | Leitura/resposta autenticada; criação/exclusão por administrador |
| `/api/medalhas/*`, `/api/leituras*` | Autenticado |
| `/api/admin/*` | Administrador |

Criação, exclusão e alteração de disponibilidade de livros, assim como gestão de achados, exigem administrador. A exportação `/api/admin/export/csv` retorna matrícula, nome e XP; o texto da interface ainda descreve colunas diferentes.

## Vercel e operação

`vercel.json` direciona as requisições à aplicação exportada por `server.js`. Configure `DATABASE_URL` e `JWT_SECRET` no ambiente de destino e prepare o banco separadamente. O código não chama `db.init()` ao receber requisições, e a configuração de deploy não declara a execução do seed.

Antes de publicar, corrija as pendências críticas do relatório, valide SSL e conexão ao banco no ambiente de destino e confira a inclusão de `index.html`, `images.png` e `capas/` no artefato. A publicação e a conexão com um banco real não foram testadas nesta revisão.

## Validação e próximos passos

Ainda não há `npm test`, lint, CI ou suíte de integração configurados. A revisão incluiu checagem de sintaxe, inventário de dependências e testes HTTP locais com banco simulado, sem alterar o banco configurado.

Prioridade: proteger credenciais e permissões, corrigir IDs e transações, centralizar a concessão de XP no servidor e depois validar os fluxos completos. Evidências, critérios de aceite e limitações estão em [ANALISE_DO_PROJETO.md](ANALISE_DO_PROJETO.md).

O repositório não contém um arquivo de licença. Defina as condições de uso e distribuição antes de compartilhá-lo publicamente.
