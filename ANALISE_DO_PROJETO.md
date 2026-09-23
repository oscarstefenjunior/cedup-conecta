# Análise do CedupConecta

**Data:** 23/09/2026. **Base:** arquivos presentes na pasta de trabalho, incluindo alterações locais anteriores à revisão.

## Parecer

O projeto reúne os principais módulos de um protótipo escolar funcional: autenticação, biblioteca, reservas, materiais, achados e gamificação. A API usa consultas parametrizadas, hashes bcrypt e proteção de rotas administrativas. A interface já consome o backend e existe configuração para Vercel.

Entretanto, há falhas de autorização, credenciais previsíveis, regras controladas pelo cliente e inconsistências de persistência. **É necessário corrigir os itens P0/P1 antes de considerar o sistema pronto para uso com dados reais.** A indicação “LGPD Compliant” em comentários e metadados não constitui comprovação; esta análise é técnica e não certifica conformidade legal.

Prioridades: **P0** = bloqueio de segurança; **P1** = falha importante de funcionamento/integridade; **P2** = manutenção, qualidade ou operação. “Confirmado em teste” significa teste HTTP com banco simulado; demais achados são de inspeção estática, salvo indicação contrária.

## P0 — Segurança e controle de acesso

### 1. Cadastro versionado com senhas e dados pessoais

**Evidência:** `alunos.js` é rastreado pelo Git e contém 1.030 registros, todos com campo `senha`. `MatriculasNome.xlsx` também é rastreada. `seed.js:15` usa a senha do cadastro ou os primeiros seis caracteres da matrícula; `server.js:481` mantém essa regra para novos alunos. Não há fluxo de troca ou recuperação de senha.

**Impacto:** quem obtiver o cadastro pode conhecer credenciais usadas na importação; a senha padrão é derivável da matrícula. Não foi verificado se o repositório é público ou se essas senhas continuam válidas no banco.

**Ajuste:** retirar dados reais da distribuição do código, adotar importação administrativa protegida, fornecer dados fictícios para desenvolvimento e implementar ativação/troca de senha. Verificar a exposição anterior e substituir credenciais afetadas. Adicionar ao `.gitignore` não remove o histórico já existente; a limpeza do histórico exige planejamento separado.

**Aceite:** clone de desenvolvimento sem dados reais; nenhuma senha derivada de matrícula; usuário consegue definir e trocar sua senha.

### 2. Segredo JWT de fallback e permissões desatualizadas

**Evidência:** `server.js:11` aceita um segredo fixo quando `JWT_SECRET` não existe. `adminOnly` confia no `isAdmin` do token, emitido por 12 horas, sem consultar o estado atual do usuário.

**Impacto:** uma implantação sem segredo próprio aceita tokens assinados com o valor conhecido do código. A remoção de privilégios ou exclusão do usuário não invalida imediatamente um token já emitido.

**Ajuste:** falhar na inicialização sem segredo válido, verificar permissões atuais e implementar uma estratégia de invalidação de sessão. Acrescentar limitação de tentativas de login e resposta genérica para credenciais inválidas.

**Aceite:** processo não inicia sem segredo; token anterior deixa de autorizar administração após revogação.

### 3. Devolução de livro de outro estudante

**Evidência:** `server.js:189` busca empréstimo por ID e status, sem conferir proprietário nem exigir administrador. **Confirmado em teste:** token de aluno devolveu empréstimo simulado pertencente a outra matrícula; resposta 200.

**Ajuste:** exigir proprietário ou administrador, conforme a regra institucional para a baixa física, e atualizar empréstimo/livro em uma transação.

**Aceite:** aluno A recebe 403 ao tentar devolver empréstimo de B, sem nenhuma alteração no banco.

### 4. XP, progresso e medalhas decididos pelo navegador

**Evidência:** `server.js:90` aceita XP absoluto ou incremento enviado pelo usuário. Rotas de medalhas aceitam chave/valor e ID sem comprovar a atividade. `index.html:2407` soma XP localmente e ignora falha de persistência. **Confirmado em teste:** aluno enviou XP arbitrário e recebeu 200.

**Ajuste:** calcular recompensas no servidor após validar cada ação e registrar concessões únicas, com transação. Restringir ajustes manuais a administradores e auditar essas mudanças.

**Aceite:** cliente não escolhe XP; repetir a mesma conclusão ou chamada não concede recompensa novamente; pontuação exibida corresponde à persistida.

## P1 — Funcionamento e integridade

| Achado e evidência | Impacto | Ajuste e validação esperada |
| --- | --- | --- |
| **IDs incompatíveis:** `server.js:124` e `371` usam `Date.now()`; `database.js:72` e `187` definem `INTEGER`. O timestamp em milissegundos excede 2.147.483.647. | Cadastro de livro/desafio falha no schema definido. O banco implantado não foi inspecionado. | Usar IDs gerados pelo banco, com migração e ajuste da sequência após o seed. Validar criação dos dois recursos em PostgreSQL real. |
| **Operações sem transação:** empréstimo e disponibilidade/estoque são gravados separadamente; reservas fazem consulta de conflito seguida de INSERT. | Falha intermediária deixa registros inconsistentes; solicitações concorrentes podem emprestar o mesmo livro, baixar estoque indevidamente ou sobrepor reservas. Devoluções concorrentes também podem incrementar estoque duas vezes. | Transações na mesma conexão, atualização condicional/bloqueios e restrições no banco. Testar concorrência, rollback e repetição de devolução. |
| **Erro tratado antes das rotas:** middleware em `server.js:43`. **Confirmado:** erro de banco simulado em `/api/livros` retornou HTML 500. | `apiFetch` tenta interpretar JSON e perde a mensagem útil. | Colocar tratamento após as rotas, retornar JSON consistente e manter detalhes internos apenas nos logs. |
| **Reserva aceita horários inválidos:** `server.js:225` não valida intervalo crescente, duração, ID de PC existente nem horário escolar. **Confirmado:** 15:00–14:00 retornou 200. | Reservas inválidas chegam ao banco. | Validar tipos, calendário e intervalo no servidor; adicionar `CHECK (hora_fim > hora_inicio)`. Testar limite de horários e virada de data no fuso escolar; hoje é calculado em UTC. |
| **HTML com valores não escapados:** `index.html:2743`, `3130` e `4639` interpolam dados de livros em `innerHTML`, apesar de haver helper `esc`. | Conteúdo cadastrado pode ser interpretado como marcação e, em contextos vulneráveis, executar script na sessão de outro usuário. Não foi executado um ataque no navegador. | Preferir `textContent`/criação de elementos, validar URLs e eliminar interpolação em handlers. Testar títulos com aspas e marcação inofensiva. |
| **Gabarito exposto:** `GET /api/desafios`, `server.js:360`, retorna `SELECT *`, incluindo `respostaCorreta`. | Aluno consulta resposta antes de enviar o quiz. | Omitir gabarito antes da resposta e devolvê-lo apenas conforme a regra; adaptar feedback da interface. |
| **Leitura digital não persistida:** `index.html:3009` atualiza memória/XP sem chamar `/api/leituras` ou `/api/leituras/concluir`. | Recarregar/login perde conclusão e permite nova recompensa. O botão anuncia PDF, mas abre prévia textual. | Integrar início/conclusão e consulta de histórico, impedir duplicatas no banco e alinhar a descrição da função. |
| **ID local de empréstimo de item:** `index.html:3642` cria `Date.now()` após POST que só retorna `{ok:true}`. | Administrador que empresta e tenta dar baixa na mesma sessão usa ID diferente do banco e recebe 404. | Retornar ID e prazos efetivos do INSERT, ou recarregar a lista antes de operar. |
| **Devolução falha silenciosamente:** `index.html:2496` ignora erro da API; chamadas em `3164` e `3190` liberam livro e removem locação na interface. | Tela informa devolução mesmo quando o banco não a realizou. | Propagar falha e atualizar estado somente após confirmação; testar com resposta 500. |
| **Exclusão sem política para vínculos:** DELETE de alunos, livros e desafios, com FKs sem exclusão em cascata no schema. | Registros com histórico não podem ser excluídos e geram erro genérico. `admins_matriculas` não tem FK e pode manter permissão residual após exclusão de usuário sem vínculos. | Preferir desativação com histórico; definir tratamento explícito de dependências e remoção de privilégios, retornando 409 quando aplicável. |
| **Inicialização em produção fora da Vercel:** `server.js:540` não chama `listen()` quando `NODE_ENV=production`. | `node server.js` em um servidor convencional com esse ambiente não abre porta. | Separar exportação serverless e entrada do servidor, validando os dois modos. |

## P2 — Qualidade, manutenção e operação

1. **Perfil incompleto:** `server.js:84` não seleciona `is_admin`, mas a resposta consulta `user.isAdmin`. Se apenas a coluna de usuário indicar administração, perfil e login divergem. Unificar a fonte de permissão.
2. **Rotas desconhecidas:** `server.js:536` retorna a página para qualquer GET não encontrado. Confirmado: `/api/nao-existe` retorna HTML 200. Criar 404 JSON em `/api` antes do fallback da interface.
3. **Configuração TLS:** `database.js:6` desativa validação de certificado em produção. Parametrizar SSL com verificação adequada ao provedor e verificar o comportamento de `DATABASE_URL` sem expor seu conteúdo.
4. **Carga inicial acoplada ao start:** `npm start` reexecuta seed, incluindo hashes para todo o cadastro e atribuição dos administradores fixos. Separar bootstrap de execução e substituir IDs fixos por provisionamento explícito.
5. **Schema sem versionamento:** `CREATE TABLE IF NOT EXISTS` não aplica alterações. Introduzir migrações, índices orientados às consultas e procedimentos verificados de backup/restauração.
6. **Validação de entrada parcial:** rotas aceitam tipos inesperados, números negativos e strings sem limites em vários campos. Validar no servidor e uniformizar respostas 400/404/409. A interface não substitui essa validação.
7. **CSV:** `server.js:528` concatena campos sem escapar ponto e vírgula, aspas, quebras de linha ou fórmulas de planilha. Escapar e neutralizar conteúdo interpretável; alinhar o texto de `index.html:2302` às colunas realmente exportadas.
8. **Respostas com dados além do necessário:** `/api/reservas/pcs` entrega nomes e matrículas de todas as reservas a qualquer usuário autenticado. Definir o que estudantes precisam ver e limitar a resposta. O acesso público ao catálogo, materiais e achados deve ser uma decisão explícita de produto.
9. **Carregamento frágil:** `carregarDadosApi()` usa `Promise.all` e apenas registra erro. Uma falha impede todas as atualizações; logout não limpa todas as coleções/caches. Limpar dados entre sessões e mostrar erros com opção de tentar novamente.
10. **Indicadores incompletos:** painel usa quantidade de empréstimos do usuário logado, apesar de a API fornecer total global; somente o total de alunos é aplicado em `adminAtualizarKPIs`. Estatística de reservas conta também as antigas. Alinhar métricas e rótulos.
11. **Organização:** `index.html` tem cerca de 4,7 mil linhas, misturando estilo, templates e regras. Separar CSS, cliente da API e módulos por área depois dos consertos, preservando os fluxos existentes.
12. **Resíduos no repositório:** arquivos SQLite WAL/SHM estão rastreados, apesar do backend PostgreSQL. `temp_script.js` tem erro de sintaxe na linha 1143, mas não é carregado pela aplicação. Confirmar necessidade e remover/arquivar duplicatas, logs e dados legados com cuidado; não apagar banco antes de verificar preservação dos dados.
13. **Operação:** faltam checagem de saúde, tratamento de encerramento do pool, observabilidade estruturada, limite de requisições e política de CORS. O código atual usa `cors()` sem restringir origens; isso não substitui a proteção por token.
14. **Acessibilidade e dispositivos móveis:** há `lang`, viewport e alguns rótulos, mas modais e controles dinâmicos precisam de verificação de teclado, foco, Escape, nomes acessíveis e leitor de tela. Responsividade e contraste não foram validados visualmente nesta revisão.
15. **Desempenho:** detalhes de livro fazem duas consultas extras por resenha; listas administrativas não têm paginação. Consolidar consultas e paginar conforme o volume.
16. **Padronização:** faltam `engines`, lint, testes automatizados, CI, licença e instruções de contribuição. Priorizar testes de autorização, integridade, concorrência e fluxos críticos antes de refatorar.

## Verificações executadas

Foi usado o Express real com `database.js` substituído em memória por um adaptador simulado, segredo JWT exclusivo do teste e servidor HTTP em porta local efêmera. Nenhuma conexão ao banco real foi aberta por esses testes. O servidor de teste foi encerrado ao final.

| Verificação | Resultado |
| --- | --- |
| `node --check` em servidor, banco, seed, script de schema, cadastro e `temp.js` | Sintaxe válida |
| `node --check temp_script.js` | Falha na linha 1143, em arquivo não referenciado pela aplicação |
| Compilação do script inline de `index.html` com `vm.Script` | Sintaxe válida |
| IDs declarados no HTML estático | Nenhuma duplicata encontrada; não cobre DOM gerado dinamicamente |
| `npm ls --depth=0` | Seis dependências diretas instaladas, sem erro reportado |
| `GET /` | 200 HTML |
| Perfil sem token | 401 JSON |
| Administração com token de aluno | 403 JSON |
| `GET /alunos.js` | Retorna página HTML, não o cadastro; não caracteriza exposição pela rota HTTP testada |
| `GET /api/nao-existe` | 200 HTML indevido |
| Aluno define XP arbitrário | 200; falha confirmada na autorização da operação |
| Aluno devolve empréstimo de outra matrícula | 200; falha confirmada |
| Reserva com hora final anterior à inicial | 200; validação ausente confirmada |
| Erro de banco simulado | 500 HTML, incompatível com o cliente JSON |

**Limites:** não foram executados seed, migrações, deploy, testes contra PostgreSQL real, auditoria atualizada de vulnerabilidades das dependências ou navegação visual ponta a ponta. A planilha foi inventariada, sem inspeção de células; imagens foram inventariadas por referência, sem avaliação visual. Não foram divulgados valores de `.env`, senhas ou registros pessoais. A análise cobre o código e a configuração local; não comprova o estado do ambiente publicado. Os testes foram diagnósticos temporários e não constituem uma suíte persistente no repositório.

## Sequência sugerida de implementação

1. **Segurança:** dados/credenciais, segredo obrigatório, autorização da devolução, revogação de privilégios e recompensas no servidor.
2. **Integridade:** migração de IDs, transações, restrições de estoque/agenda e validação de entradas.
3. **Fluxos:** tratamento JSON, persistência de leitura, IDs de empréstimo, devolução sem falso sucesso e política de exclusão.
4. **Entrega:** testes com PostgreSQL separado e dados fictícios, validação visual desktop/celular, implantação de homologação, backup/restauração e só depois uso real.

Critérios mínimos para homologação: testar estudante e administrador; criar livro/desafio; emprestar/renovar/devolver; tentar acessar registros de outra pessoa; repetir requisições; disputar o mesmo exemplar/horário; simular indisponibilidade do banco; sair e entrar com outra conta; confirmar que estado, permissões e XP permanecem consistentes.

## Alterações desta revisão

Foram criados apenas `README.md` e este relatório. Código de execução, dados, segredos e alterações locais já existentes foram preservados. As correções listadas permanecem pendentes.
