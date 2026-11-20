Implemente a operação `definition`: dado um ponto no código (por exemplo, uma chamada de
função), descubra onde aquilo foi **declarado**.

```text
lsp { operation: "definition", path: "main.js", line: 1, character: 15 }
→ lib/math.js:1:10
```

## O que você vai aprender

- o request `textDocument/definition`;
- a diferença de convenção: o LSP conta linhas e colunas **a partir de 0**, pessoas (e o
  modelo) a partir de 1.

## O que fazer

1. Garanta que o arquivo está aberto no servidor (`didOpen`, stage 14).
2. Envie:

```json
{
  "jsonrpc": "2.0", "id": 7, "method": "textDocument/definition",
  "params": {
    "textDocument": { "uri": "file:///.../main.js" },
    "position": { "line": 0, "character": 14 }
  }
}
```

3. A resposta é uma lista de `Location` (`uri` + `range.start`). Converta cada uma para
   `caminho/relativo:linha:coluna`, com linha e coluna a partir de 1, uma por linha.

## Como o tester valida

- o modelo pede a definição de uma função chamada em `main.js` e declarada em `lib/math.js`;
- confere que o resultado contém `lib/math.js:<linha>:<coluna>` da declaração.

## Dicas

- `Path.of(URI.create(uri))` converte a URI de volta para caminho; `cwd.relativize(...)`
  deixa relativo. No Windows, troque `\` por `/`.
- A resposta pode ser um objeto único em vez de lista; trate os dois casos.

## Critério de conclusão

O agente encontra a declaração de uma função a partir de qualquer uso dela.
