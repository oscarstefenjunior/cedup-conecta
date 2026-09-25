# Oscar — importação dos professores no CEDUP Conecta

## O que já está pronto

- Código enviado à branch `main`, commit `4e76089`.
- Publicação na Vercel confirmada em https://cedup-conecta.vercel.app.
- Tela de troca obrigatória de senha e bloqueio das funções autenticadas implementados e testados localmente.
- `professores.json` contém os 125 professores da planilha de 25/09/2026, com nome e os seis primeiros dígitos da matrícula. Não há matrículas repetidas nessa lista.
- A importação no banco de produção AINDA NÃO foi executada. A quantidade de contas novas depende dos cadastros que já existem no banco.

## Regra combinada

Login e senha inicial: os seis primeiros dígitos da matrícula, mantendo zeros à esquerda. Cada novo professor precisa definir uma senha pessoal de pelo menos oito caracteres antes de usar as funções autenticadas. A senha é armazenada como hash bcrypt. Depois da troca, a senha inicial deixa de funcionar e as sessões anteriores são revogadas.

## Como concluir

Execute em um computador com Node.js e acesso ao banco PostgreSQL usado pela produção da Vercel.

1. No repositório `cedup-conecta`, confira que não há alterações locais pendentes e atualize a branch `main`:

   ```sh
   git switch main
   git pull --ff-only origin main
   npm ci
   ```

2. Solicite a quem está coordenando o cadastro o pacote privado `cedup-professores-para-oscar-25092026.zip`. A lista não acompanha o clone do GitHub: o repositório é público e as matrículas também determinam as senhas iniciais. Extraia o pacote e copie `professores.json` para a pasta `auditoria-local` na raiz do repositório. Crie essa pasta se necessário. Ela já está ignorada pelo Git. Não coloque a lista no repositório público.

3. Configure localmente `DATABASE_URL` com a conexão do MESMO banco de produção usado pela Vercel. Use a credencial já administrada por você. O script carrega `.env` na raiz do repositório; se o arquivo já existir, preserve as outras configurações. Configure também `NODE_ENV=production` para usar o modo SSL previsto no código atual. Não use os exemplos abaixo literalmente como credenciais:

   ```dotenv
   DATABASE_URL=<conexao-do-banco-de-producao>
   NODE_ENV=production
   ```

   Não compartilhe esse arquivo, a URL de conexão ou senhas no GitHub. Não é necessário fornecer o acesso ao banco para quem encaminhou este pacote.

4. Confira os cadastros SEM aplicar:

   ```sh
   node scripts/importar-professores.js auditoria-local/professores.json
   ```

   O resumo informa `novos`, `existentes`, `conflitos` e `aplicado: false`. A soma de novos e existentes deve ser 125. Se houver conflitos, pare e confira as contas correspondentes no banco antes de continuar. Um conflito significa nome diferente para a mesma matrícula ou conta existente sem perfil de professor.

5. Se a conferência estiver correta e sem conflitos, aplique:

   ```sh
   node scripts/importar-professores.js auditoria-local/professores.json --aplicar
   ```

   O script prepara a coluna de troca obrigatória quando necessário e cria os novos professores em uma transação. O resultado deve mostrar `aplicado: true` e `conflitos: 0`. Contas existentes são preservadas: senha, perfil e obrigação de troca não são redefinidos. Se houver conflito durante a aplicação, nenhuma nova conta dessa execução será mantida.

6. Confira novamente:

   ```sh
   node scripts/importar-professores.js auditoria-local/professores.json
   ```

   Após uma importação completa, espere `novos: 0`, `existentes: 125`, `conflitos: 0` e `aplicado: false`.

7. Confira a lista no painel administrativo. Peça a um professor recém-cadastrado que faça seu primeiro acesso e escolha pessoalmente a nova senha. Ele deve ver a tela de troca antes de acessar o sistema. Não conclua a troca em nome de um professor para testar.

## Observações de operação

- Não é necessário executar `npm start`, `npm run seed` ou importar os alunos para esta tarefa.
- Não é necessário publicar novamente se a Vercel continua executando o commit `4e76089` ou uma versão posterior que mantenha essa implementação.
- Reexecutar a importação não restaura senhas iniciais nem duplica contas.
- Os testes de primeiro acesso e de cadastro/permissões passaram em banco local de teste. A importação real depende desta etapa com seu acesso ao banco.
- Se houver erro de conexão, confira host, porta, credenciais e conectividade com o provedor. Não publique a mensagem completa se ela contiver a conexão ou credenciais.

Ao finalizar, informe apenas o resumo de novos/existentes/conflitos e se o primeiro acesso funcionou. Não envie senhas.
