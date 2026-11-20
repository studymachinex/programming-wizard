Ler arquivos inteiros é um jeito caro de entender código. Editores resolvem isso com o
**Language Server Protocol (LSP)**: um processo separado que analisa o projeto e responde
perguntas como "onde está definido?" e "quem chama?". O seu agente vai usar o mesmo
protocolo.

## A configuração

O comando do servidor fica em `.agent/lsp.json`:

```json
{ "command": "node", "args": ["/caminho/lsp-server.mjs", "--log", "/tmp/lsp.jsonl"] }
```

## O protocolo

LSP é **JSON-RPC 2.0** sobre stdin/stdout. Cada mensagem tem um cabeçalho e um corpo:

```text
Content-Length: 81\r\n
\r\n
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"rootUri":"file:///..."}}
```

- *requests* têm `id` e esperam uma resposta com o mesmo `id`;
- *notificações* não têm `id` e não têm resposta.

O início da sessão:

1. request `initialize` com `rootUri` (o projeto) e `capabilities: {}`;
2. espere a resposta;
3. notificação `initialized`.

Antes de perguntar sobre um arquivo, abra-o com a notificação `textDocument/didOpen`
(`uri`, `languageId: "javascript"`, `version`, `text`). O servidor responde abrindo
espontaneamente uma notificação `textDocument/publishDiagnostics` com os erros do arquivo.

## O que fazer

1. Se `.agent/lsp.json` existir, anuncie a ferramenta `lsp` com:
   - `operation` (obrigatório): `definition`, `references` ou `diagnostics` (use `enum`);
   - `path` (obrigatório);
   - `line` e `character` (opcionais, começando em 1).
2. Na primeira chamada, inicie o processo e faça o handshake.
3. Implemente `diagnostics`: abra o arquivo, espere o `publishDiagnostics` dele e devolva os
   erros no formato `linha:coluna: mensagem` (ou `diagnostics: none`).

## Como o tester valida

- o servidor é um language server de brinquedo para arquivos `.js` (funções e chamadas);
- o modelo pede `lsp diagnostics` de `main.js`, que não tem erros;
- pelo log do servidor, confere `initialize` → `initialized` e o `didOpen` de `main.js`.

## Dicas

- Leia o stdout do servidor em uma **thread separada**: respostas e notificações chegam a
  qualquer momento. Um `Map<id, CompletableFuture>` casa respostas com requests.
- `Content-Length` conta **bytes**, não caracteres.
- URIs: `path.toAbsolutePath().toUri().toString()` → `file:///C:/...` ou `file:///home/...`.

## Critério de conclusão

O agente conversa com o language server e expõe a ferramenta `lsp`.
