Quando o único candidato é um **diretório**, complete com `/` no final (e sem espaço), para o
usuário continuar navegando.

## O que você vai aprender

- a diferenciar arquivos e diretórios na completação.

## O que fazer

Candidato único que é diretório → nome + `/`.

## Como o tester valida

- `cd sr` + Tab → `$ cd src_<id>/`;
- `ma` + Tab → `$ cd src_<id>/main/`, depois `j` + Tab;
- Enter e `pwd`.

## Dicas

- Use sempre `/` — no Windows o Java aceita barras normais em caminhos.
- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Diretórios completam com `/`.
