A palavra pode ter um caminho: `docs/no` completa dentro de `docs/`.

## O que você vai aprender

- a separar diretório e prefixo de uma palavra.

## O que fazer

Divida a palavra no último `/`: a parte da esquerda é o diretório a listar (relativo ao
diretório atual); a da direita é o prefixo. O candidato é `diretório/ + nome`.

## Como o tester valida

- `cat docs/no` + Tab → `$ cat docs/notes_<id>.md `;
- `cat docs/sub/dir/fu` + Tab → arquivo dois níveis abaixo.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab completa arquivos em subdiretórios.
