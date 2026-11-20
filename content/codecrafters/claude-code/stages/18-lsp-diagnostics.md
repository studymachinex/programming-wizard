O último passo fecha o ciclo editar → verificar → corrigir: depois de cada `write`, o
agente devolve ao modelo os **erros** que o language server encontrou, e o modelo corrige
sozinho.

```text
write main.js
→ wrote 51 bytes to main.js
  diagnostics:
  1:15: undefined function 'ghostAB12'
```

## O que você vai aprender

- notificações do servidor para o cliente (`textDocument/publishDiagnostics`);
- a esperar uma resposta **assíncrona** associada a uma versão do documento;
- como agentes de código usam diagnostics para se autocorrigir.

## O que fazer

1. No `write` de um arquivo `.js`, depois de sincronizar (stage 17), espere o
   `publishDiagnostics` daquele arquivo com a versão que você acabou de enviar.
2. Acrescente os diagnostics ao resultado do `write`, um por linha
   (`linha:coluna: mensagem`, a partir de 1), ou `diagnostics: none`.
3. Use um timeout (ex.: 3 s) para não travar se o servidor não responder.

## Como o tester valida

1. o modelo grava `main.js` chamando uma função que não existe;
2. o resultado do `write` precisa conter `undefined function '<nome>'`;
3. o modelo grava a versão corrigida;
4. o resultado do segundo `write` não pode ter mais o erro.

## Dicas

- A thread leitora (stage 14) guarda os diagnostics por URI e avisa quem está esperando
  (`wait`/`notifyAll` ou um `CompletableFuture` por versão).
- O `publishDiagnostics` traz o campo `version`: compare com a versão enviada para não usar
  diagnostics velhos.

## Critério de conclusão

Cada edição volta para o modelo com os erros atuais do arquivo.
