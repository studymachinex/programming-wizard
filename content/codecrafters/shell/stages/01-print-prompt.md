Neste desafio você vai construir um **shell**: o programa que lê comandos, interpreta
quoting, executa programas, conecta pipes, redireciona saídas, gerencia jobs em background e
ainda completa nomes com Tab. Tudo em Java, sem bibliotecas.

O primeiro passo é o **prompt**: o texto que o shell mostra quando está pronto para receber um
comando. O nosso é `$ ` — um cifrão seguido de um espaço, **sem** quebra de linha.

## O que você vai aprender

- o ciclo de vida de um shell: mostrar o prompt, ler, executar, repetir;
- por que é preciso dar *flush* no stdout quando a saída não termina em `\n`.

## O que fazer

1. Imprima `$ ` (sem `println`).
2. Chame `System.out.flush()` — sem isso o texto pode ficar parado no buffer.

O starter já traz esse código comentado.

## Como o tester valida

- inicia o shell e espera o texto `$ ` aparecer;
- o shell não precisa fazer mais nada neste stage.

## Dicas

- **Como o tester conversa com o shell:** não há terminal no meio. O tester escreve no seu stdin exatamente os bytes que seriam digitados e lê o stdout e o stderr num único pipe, na ordem em que foram escritos. A saída passa por um emulador de terminal mínimo (entende `\r`, `\b`, `ESC[K`), e as verificações olham para as linhas da tela.
- Nos stages de linha inteira, se o seu shell não ecoar o que foi digitado, o tester desenha a linha sozinho — exatamente como um terminal faria. Só a partir do stage 23 (autocompletar) o eco passa a ser responsabilidade do shell.
- Os programas externos dos testes (`cat`, `ls`, `head`, `wc`, `sleep`, ...) são scripts criados pelo tester; o `PATH` do shell contém só diretórios dele. No Windows esses programas são arquivos `.cmd`.

## Critério de conclusão

O shell mostra `$ ` e fica esperando.
