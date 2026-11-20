Antes de mudar a assinatura de uma função, o agente precisa saber **quem a chama**.
Implemente a operação `references`.

```text
lsp { operation: "references", path: "main.js", line: 2, character: 13 }
→ main.js:2:13
  main.js:3:15
  report.js:2:22
```

## O que você vai aprender

- o request `textDocument/references`;
- por que o servidor conhece arquivos que você nunca abriu: ele indexa o projeto no
  `initialize`.

## O que fazer

1. Envie `textDocument/references` com `textDocument`, `position` e
   `context: { "includeDeclaration": false }`.
2. Formate a lista de `Location` como no stage 15, um resultado por linha.

## Como o tester valida

- uma função é chamada duas vezes em `main.js` e uma em `report.js`;
- o modelo pede as referências a partir de uma das chamadas;
- confere que todas as chamadas aparecem como `caminho:linha:coluna`.

## Dicas

- A formatação de `Location` é a mesma do stage 15: extraia uma função.
- Se a lista vier vazia, devolva algo explícito (`no results`) para o modelo.

## Critério de conclusão

O agente lista todos os pontos do projeto que chamam uma função.
