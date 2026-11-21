Se o nome não é builtin, `type` procura um **executável** nos diretórios da variável de
ambiente `PATH`, na ordem, e mostra o caminho completo do primeiro encontrado.

```
$ type cat
cat is /tmp/pw-shell-x/helpers/cat
$ type tool_1a2b
tool_1a2b is /tmp/pw-shell-x/stage-07/work/ferramentas/tool_1a2b
```

## O que você vai aprender

- como o `PATH` funciona;
- o que torna um arquivo executável em cada sistema operacional.

## O que fazer

1. Leia `System.getenv("PATH")` e divida por `File.pathSeparator` (`:` no Unix, `;` no Windows).
2. Para cada diretório, veja se existe um executável com aquele nome.
3. Encontrou: `<nome> is <caminho completo>`. Não encontrou: `<nome>: not found`.

O que conta como executável:

- **Linux/macOS:** um arquivo comum com permissão de execução (`Files.isExecutable`).
- **Windows:** não existe bit de execução; o nome mais uma extensão do `PATHEXT` (`.COM;.EXE;.BAT;.CMD`).
  `type cat` encontra `cat.cmd`. Um arquivo `cat` sem extensão **não** é executável.

## Como o tester valida

- `type cat` → caminho do `cat` do tester;
- um diretório do `PATH` tem um arquivo **não** executável com o nome procurado, e um diretório seguinte tem o executável de verdade — a resposta deve ser o segundo;
- `type <nome inexistente>`.

## Dicas

- No Windows, `Files.isExecutable` devolve `true` para quase tudo — use a regra do `PATHEXT`.
- Monte o caminho com `dir.resolve(nome)`: o tester compara com o caminho nativo (barras invertidas no Windows).

## Critério de conclusão

`type` mostra o caminho do primeiro executável no `PATH`.
