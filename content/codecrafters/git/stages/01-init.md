Neste desafio o seu programa é um comando `git`. O tester executa
`./your_program.sh <subcomando> ...` dentro de uma pasta temporária, que é o
repositório. O primeiro subcomando é `init`.

```bash
$ mkdir teste && cd teste
$ /caminho/para/your_program.sh init
Initialized git directory
$ ls .git
HEAD  objects  refs
$ cat .git/HEAD
ref: refs/heads/main
```

## O que você vai aprender

- que um repositório Git é só um diretório `.git` com arquivos comuns;
- o papel de `objects/` (todo o conteúdo), `refs/` (ponteiros para commits) e `HEAD`;
- por que `HEAD` é uma **referência simbólica** e não um SHA.

## O que fazer

1. Leia `args[0]`; se for `init`, crie no diretório atual:
   - `.git/`
   - `.git/objects/`
   - `.git/refs/`
   - `.git/HEAD` com o conteúdo `ref: refs/heads/main\n`
2. Imprima `Initialized git directory`.

```java
Path git = Path.of(".git");
Files.createDirectories(git.resolve("objects"));
Files.createDirectories(git.resolve("refs"));
Files.writeString(git.resolve("HEAD"), "ref: refs/heads/main\n");
System.out.println("Initialized git directory");
```

## Como o tester valida

- roda `init` em uma pasta vazia;
- confere que `.git`, `.git/objects` e `.git/refs` são diretórios;
- confere o conteúdo de `.git/HEAD` (`ref: refs/heads/<branch>`);
- roda o git real (`git rev-parse --git-dir`) para confirmar que ele reconhece o repositório.

## Dicas

- `Path.of(".git")` é relativo ao diretório atual, que é a pasta do teste — não o seu workspace.
- O git real não precisa de mais nada além desses três itens para reconhecer um repositório.
- Para testar à mão, rode em uma pasta **fora** do workspace, senão você sobrescreve o `.git` dele.

## Critério de conclusão

`init` cria a estrutura mínima e o git real a reconhece como repositório.
