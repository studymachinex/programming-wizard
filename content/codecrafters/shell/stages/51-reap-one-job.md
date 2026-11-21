Quando um job termina, `jobs` mostra `Done` (sem o ` &`) uma última vez e o remove da
lista — o shell "colhe" (*reaps*) o processo.

## O que você vai aprender

- o ciclo de vida de um job: Running → Done → removido.

## O que fazer

`process.isAlive()` diz se ainda está rodando. Depois de listar, remova os que terminaram.

## Como o tester valida

- `sleep 20 &`, `sleep 0.2 &`, espera, `jobs` → `[1]-  Running ... sleep 20 &` e `[2]+  Done ... sleep 0.2`;
- `jobs` de novo → só o job 1, agora com `+`.

## Dicas

- Formato de uma linha de `jobs`: `[N]M  ESTADO COMANDO`, onde `M` é `+` (job mais recente), `-` (o anterior) ou espaço, e `ESTADO` é `Running` ou `Done` alinhado à esquerda em 24 colunas. Em Java: `String.format("[%d]%c  %-24s%s", n, m, estado, comando)`.

## Critério de conclusão

Jobs terminados são colhidos.
