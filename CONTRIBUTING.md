# Contribuindo

Obrigado por considerar contribuir com o Programming Wizard. Este projeto é uma
plataforma local de estudos; contribuições de conteúdo, código, documentação e testes
são bem-vindas.

## Antes de começar

- Abra uma issue para discutir mudanças grandes (novos desafios, mudanças de arquitetura,
  reformulações de conteúdo).
- Para correções pequenas, um pull request direto é suficiente.
- Não inclua dados pessoais, credenciais, arquivos `.env` ou conteúdo de terceiros sem
  permissão.

## Ambiente de desenvolvimento

```bash
git clone https://github.com/studymachinex/programming-wizard.git
cd programming-wizard
npm install
cp .env.example .env
npm run setup
npm run dev
```

Requisitos completos e configuração de portas estão no [README](README.md).

## Fluxo de pull request

1. Faça um fork do repositório.
2. Crie uma branch descritiva:

   ```bash
   git checkout -b feat/nome-curto
   ```

3. Faça a mudança com commits pequenos e claros.
4. Rode as verificações:

   ```bash
   npm run typecheck
   npm run validate:content
   npm run build
   ```

5. Abra o pull request explicando:
   - o problema que a mudança resolve;
   - o que foi alterado;
   - como testar;
   - screenshots, se houver mudança visual.

## Conteúdo

O conteúdo fica em `content/`. O formato, tom e critérios de qualidade estão em
[`content/AUTHORING.md`](content/AUTHORING.md). O seed é idempotente:

```bash
npm run seed
```

Sempre rode `npm run validate:content` antes de enviar mudanças de conteúdo.

## Código

- TypeScript estrito; evite `any` sem necessidade.
- Siga o estilo e os componentes já existentes.
- Mantenha as páginas e ações acessíveis por teclado.
- Não introduza serviços externos obrigatórios para o fluxo local.
- Se alterar o schema Prisma, rode `npm run db:push` localmente e explique a mudança no PR.

## Desafios CodeCrafters

O contrato para adicionar um desafio está em
[`challenges/README.md`](challenges/README.md). Em resumo, um desafio precisa de:

1. `content/codecrafters/<slug>/course.json`;
2. instruções em `content/codecrafters/<slug>/stages/*.md`;
3. starter em `challenges/<slug>/starter/<linguagem>`;
4. `challenges/<slug>/tests/stages.mjs` exportando `runStages()`;
5. `runtime.runner` apontando para esse módulo no `course.json`.

## Licença

Ao contribuir, você concorda que sua contribuição será distribuída sob a licença MIT
deste repositório.
