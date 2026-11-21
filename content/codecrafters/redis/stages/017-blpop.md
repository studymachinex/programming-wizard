`BLPOP chave 0` remove o primeiro elemento — e, se a lista estiver vazia, **espera** até alguém
inserir (timeout 0 = para sempre). A resposta é um array `[chave, elemento]`. Se vários clientes
estiverem esperando, o que bloqueou **primeiro** é atendido primeiro.

## O que você vai aprender

- operações bloqueantes e filas de espera;
- esperar sem segurar o lock (`wait`/`notifyAll`).

## O que fazer

Mantenha, por chave, uma fila de clientes bloqueados. Ao inserir na lista, acorde os que esperam;
só o primeiro da fila pode retirar o elemento.

## Como o tester valida

- dois clientes bloqueiam na mesma lista; um `RPUSH` (que responde `:1`) atende o primeiro; o segundo continua esperando até o próximo `RPUSH`.

## Dicas

- Com um lock global, use `lock.wait(...)`, que libera o lock enquanto espera — senão ninguém consegue fazer o `RPUSH`.

## Critério de conclusão

`BLPOP` bloqueia e atende em ordem de chegada.
