Shells avisam que um job terminou sem você precisar rodar `jobs`: depois de executar
qualquer comando, antes de mostrar o próximo prompt, imprimem a linha `Done` dos jobs que
terminaram e os removem.

## O que você vai aprender

- onde encaixar tarefas periódicas num REPL.

## O que fazer

Depois de cada comando (e antes do prompt), verifique os jobs e imprima/remova os terminados.

## Como o tester valida

- `sleep 0.2 &`, espera, `echo <palavra>` → a palavra e depois `[1]+  Done                    sleep 0.2`;
- o próximo comando não repete o aviso, e `jobs` fica vazio.

## Dicas

- Formato de uma linha de `jobs`: `[N]M  ESTADO COMANDO`, onde `M` é `+` (job mais recente), `-` (o anterior) ou espaço, e `ESTADO` é `Running` ou `Done` alinhado à esquerda em 24 colunas. Em Java: `String.format("[%d]%c  %-24s%s", n, m, estado, comando)`.

## Critério de conclusão

Jobs concluídos são anunciados antes do prompt.
