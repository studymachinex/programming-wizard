Neste desafio você vai construir um interpretador para **Lox**, a linguagem pequena e completa
criada por Robert Nystrom no livro *Crafting Interpreters* (craftinginterpreters.com): tem números,
strings, variáveis, controle de fluxo, funções de primeira classe, closures e classes com herança.

O caminho segue as fases de um interpretador de verdade:

1. **scanning** (`tokenize`): texto → tokens;
2. **parsing** (`parse`): tokens → árvore sintática;
3. **evaluating** (`evaluate`): calcular o valor de uma expressão;
4. **run**: executar programas inteiros.

O primeiro passo é o scanner. Cada token é impresso numa linha no formato `TIPO lexema literal`, e
a lista sempre termina com o token de fim de arquivo, `EOF  null` (lexema vazio, por isso dois
espaços).

```
$ ./your_program.sh tokenize vazio.lox
EOF  null
```

## O que você vai aprender

- a arquitetura de um interpretador (scanner → parser → interpretador);
- o formato de saída do comando `tokenize`.

## O que fazer

Leia o arquivo passado em `args[1]` e, para o comando `tokenize`, imprima `EOF  null`.

O starter já traz esse código comentado.

## Como o tester valida

- cria um arquivo vazio e roda `./your_program.sh tokenize arquivo.lox`;
- espera exatamente `EOF  null` e código de saída 0.

## Dicas

- Guarde os tokens numa lista de objetos (tipo, lexema, literal, linha) — o parser vai consumi-los.
- O livro *Crafting Interpreters* é gratuito na web e é a melhor companhia para este desafio.

## Critério de conclusão

`tokenize` de um arquivo vazio imprime `EOF  null`.
