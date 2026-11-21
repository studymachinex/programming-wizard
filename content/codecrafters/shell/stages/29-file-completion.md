Depois do comando, o Tab completa **nomes de arquivos** do diretório atual.

## O que você vai aprender

- a decidir o tipo de completação pela posição do cursor (primeira palavra × argumento).

## O que fazer

Se a linha já tem um espaço, a palavra sendo completada é a última (depois do último espaço).
Os candidatos são as entradas do diretório atual do shell que começam com ela. Arquivo único →
complete e adicione um espaço.

## Como o tester valida

- cria `apple_<id>.txt` e `banana.txt`;
- `cat ap` + Tab → `$ cat apple_<id>.txt `;
- Enter mostra o conteúdo.

## Dicas

- Ignore arquivos ocultos (começando com `.`), a não ser que a palavra também comece com `.`.
- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab completa arquivos.
