O pipe `|` conecta o stdout de um comando ao stdin do próximo. Os dois rodam **ao mesmo
tempo**: o segundo consome enquanto o primeiro produz.

## O que você vai aprender

- pipes e processos concorrentes;
- o que acontece quando o leitor termina antes do escritor.

## O que fazer

1. Reconheça `|` (fora de aspas) e separe a linha em comandos.
2. Inicie os processos com `Redirect.PIPE` entre eles e copie `p1.getInputStream()` →
   `p2.getOutputStream()` numa thread (ou use `ProcessBuilder.startPipeline`).
3. Espere todos terminarem.

## Como o tester valida

- `cat dados.txt | wc`;
- `ticker | head -n 3`: o `ticker` imprime uma linha a cada 100 ms para sempre; o comando precisa terminar quando o `head` sair.

## Dicas

- Se copiar numa thread, dê `flush` a cada bloco: o stream de entrada do processo é bufferizado e o `head` nunca veria os dados.
- Quando o `head` sai, escrever no pipe dele falha: feche o stream do `ticker` — ele recebe erro de "pipe quebrado" e termina.

## Critério de conclusão

Pipelines de dois comandos funcionam.
