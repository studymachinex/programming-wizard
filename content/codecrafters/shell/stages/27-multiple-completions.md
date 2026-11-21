Com vários candidatos possíveis, o comportamento clássico é:

1. primeiro Tab: toca o sinal (BEL) e não muda nada;
2. segundo Tab **seguido**: mostra todos os candidatos em ordem alfabética, separados por **dois
   espaços**, numa linha nova — e redesenha o prompt com o que já estava digitado.

```
$ xyz_<TAB><TAB>
xyz_bar  xyz_baz  xyz_quz
$ xyz_
```

## O que você vai aprender

- a guardar estado entre teclas ("a anterior foi um Tab?").

## O que fazer

Mantenha um indicador `ultimaFoiTab`. No segundo Tab consecutivo escreva:
`\n` + candidatos + `\n` + `$ ` + linha atual.

## Como o tester valida

- cria `xyz<id>_bar`, `xyz<id>_baz`, `xyz<id>_quz`;
- `xyz<id>_` + Tab → BEL, linha inalterada;
- Tab de novo → a lista numa linha e `$ xyz<id>_` na seguinte.

## Dicas

- **Modo de teclas:** a partir daqui o tester manda as teclas uma a uma (Tab é o byte `\t`) e olha a tela *antes* do Enter. Leia o stdin byte a byte e ecoe cada caractere imprimível (e o Enter) — quem desenha a linha é o seu shell. Veja o stage 23.

## Critério de conclusão

Tab duplo lista os candidatos.
