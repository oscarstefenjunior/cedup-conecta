# Cadastro dos professores

O login e a senha inicial usam os seis primeiros dígitos da matrícula. Novos professores precisam criar uma senha pessoal no primeiro acesso, com pelo menos oito caracteres. A API bloqueia operações autenticadas até a troca; consultas públicas permanecem públicas.

A lista de 25/09/2026 foi preparada localmente em `auditoria-local/professores.json` (125 registros). Essa pasta está ignorada pelo Git e não deve ser publicada. A importação não faz parte do seed automático.

Com `DATABASE_URL` configurada no ambiente e a versão atual do sistema implantada:

```sh
node scripts/importar-professores.js auditoria-local/professores.json
node scripts/importar-professores.js auditoria-local/professores.json --aplicar
```

O primeiro comando apenas confere. O segundo cria os novos professores em uma transação. Contas já existentes são preservadas, inclusive suas senhas. Diferença de nome ou uma conta existente sem perfil de professor cancela a importação inteira para permitir análise manual. Não executa promoção automática de contas existentes.

Após trocar a senha, a senha inicial deixa de funcionar e as sessões anteriores são revogadas. Reexecutar a importação não restaura a senha inicial.

Validação local, sem banco real (requer `@electric-sql/pglite` disponível):

```sh
node scripts/test-primeiro-acesso.js
node scripts/test-cadastro-livros.js
```
