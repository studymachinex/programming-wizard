Ler não basta para um agente de código: ele precisa **escrever**. Adicione a ferramenta
`write`.

## O que você vai aprender

- a dar ao modelo uma capacidade com efeito colateral real;
- a devolver um resultado que confirme o que aconteceu.

## O que fazer

1. Anuncie `write` com dois parâmetros obrigatórios, `path` e `content`.
2. Ao executar:
   - crie os diretórios que faltarem (`Files.createDirectories`);
   - grave `content` em `path` (relativo ao projeto), sobrescrevendo se existir;
   - devolva uma confirmação curta, por exemplo `wrote 42 bytes to docs/notas.md`.

## Como o tester valida

- confere o anúncio de `write` com `path` e `content` obrigatórios;
- o modelo pede para gravar um arquivo em um subdiretório que ainda não existe;
- confere o conteúdo do arquivo no disco, byte a byte.

## Dicas

- Grave em UTF-8 explicitamente.
- Em um agente real, este é o lugar para pedir confirmação ao usuário antes de gravar; aqui
  o tester espera execução direta.

## Critério de conclusão

O modelo consegue criar arquivos no projeto.
