Implemente `commit-tree <tree_sha> -p <commit_sha> -m <mensagem>`: crie um objeto
**commit** e imprima o SHA dele.

```bash
$ /caminho/para/your_program.sh commit-tree a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 \
    -p 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432 -m "Segundo commit"
d7f3a1e2b4c5...
```

## O que você vai aprender

- que um commit é só um objeto de texto apontando para uma tree e para os commits pais;
- como o histórico é uma cadeia de ponteiros `parent`;
- o formato de identidade `Nome <email> timestamp fuso`.

## O formato

```text
tree a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
parent 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432
author Programming Wizard <wizard@programming.local> 1732112345 +0000
committer Programming Wizard <wizard@programming.local> 1732112345 +0000

Segundo commit
```

- `tree` — a tree raiz desse snapshot;
- `parent` — zero (primeiro commit), um ou vários (merge) commits pais;
- `author` / `committer` — nome, e-mail entre `< >`, segundos desde 1970 e fuso;
- uma linha em branco;
- a mensagem, terminando em `\n`.

Esse texto é gravado como objeto do tipo `commit` (`commit <tamanho>\0...`).

## O que fazer

1. Leia o SHA da tree em `args[1]` e os valores de `-p` e `-m`.
2. Monte o texto do commit no formato acima.
3. Grave com `writeObject("commit", ...)` e imprima o SHA.

## Como o tester valida

- cria uma tree e um commit pai com o git real;
- roda `commit-tree <tree> -p <parent> -m <mensagem>`;
- confere com `git cat-file` que o objeto é um commit com a tree, o parent, author,
  committer e mensagem corretos;
- roda `git log` a partir do seu commit e espera ver as duas mensagens.

## Dicas

- `System.currentTimeMillis() / 1000` dá o timestamp em segundos.
- Nome e e-mail podem ser fixos; o tester só confere o formato.
- Trate `-p` como opcional: sem ele, você cria um commit raiz.

## Critério de conclusão

O git real lê o seu commit e percorre o histórico até o commit pai.
