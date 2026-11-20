O language server lê o disco **uma vez**, no `initialize`. Depois disso ele só conhece o
que o cliente contar. Se o agente edita um arquivo com `write` e não avisa, o servidor
continua respondendo sobre o código antigo.

## O que você vai aprender

- a sincronização de documentos do LSP: `didOpen` e `didChange`;
- por que editores mandam o texto do buffer em vez de o servidor reler o disco.

## O que fazer

Depois de cada `write` de um arquivo `.js` (com o LSP configurado):

- se o arquivo ainda não foi aberto no servidor, envie `textDocument/didOpen` com o
  conteúdo novo;
- se já foi, envie `textDocument/didChange` com a **versão incrementada** e o texto completo:

```json
{
  "jsonrpc": "2.0", "method": "textDocument/didChange",
  "params": {
    "textDocument": { "uri": "file:///.../report.js", "version": 2 },
    "contentChanges": [{ "text": "<conteúdo completo do arquivo>" }]
  }
}
```

O servidor anuncia `textDocumentSync: 1` (sincronização completa): cada mudança manda o
arquivo inteiro.

## Como o tester valida

1. o modelo pede `references` de uma função (o servidor sobe e indexa o projeto);
2. o modelo usa `write` para acrescentar uma chamada nova em `report.js`;
3. o modelo pede `references` de novo — a chamada nova precisa aparecer.

## Dicas

- Guarde, por URI, a versão e o último texto enviado; só mande `didChange` se o texto mudou.
- Se o LSP ainda não estiver rodando no momento do `write`, inicie-o — o próximo stage
  precisa disso.

## Critério de conclusão

As respostas do language server refletem as edições feitas pelo agente.
