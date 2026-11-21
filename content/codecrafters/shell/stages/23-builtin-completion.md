Começa a parte interativa. Ao apertar **Tab**, o shell completa o comando: `ech` + Tab vira
`echo ` (com espaço no final).

Para isso o shell precisa ver cada tecla **na hora**, e não a linha inteira depois do Enter. Num
terminal de verdade isso exige colocá-lo em *modo raw*; aqui o tester já escreve os bytes direto
no stdin, um por vez. O que muda no seu shell:

- leia `System.in` **byte a byte** (`System.in.read()`), não por linhas;
- **ecoe** cada caractere imprimível que chegar — não há terminal desenhando o que foi digitado;
- Enter (`\n` ou `\r`) termina a linha: ecoe a quebra de linha e devolva o texto.

```
$ ech<TAB>
$ echo 
```

## O que você vai aprender

- como funciona um editor de linha (o que o *readline* faz por você em outros shells);
- a reagir a teclas especiais.

## O que fazer

1. Escreva um editor de linha: um laço que lê bytes e mantém um `StringBuilder` com a linha.
2. Tab (`\t`): procure builtins que começam com o texto digitado. Se houver **um**, escreva o
   restante do nome mais um espaço — na tela e no buffer.

## Como o tester valida

- digita `ech` + Tab e espera a linha `$ echo ` na tela;
- digita o resto e Enter: o comando roda normalmente;
- `exi` + Tab vira `exit ` e Enter encerra o shell.

## Dicas

- Este editor vai crescer: Backspace (byte 127 ou 8: apague com `\b \b`), setas (stage 61), listas de candidatos.
- Ecoe `\n` no Enter. O tester ainda tolera shells que não ecoam linhas inteiras, mas os testes de Tab olham a tela *antes* do Enter.
- Rodando à mão num terminal, você verá o texto duas vezes (o terminal também ecoa). É esperado: o tester é que é o "terminal" aqui.

## Critério de conclusão

Tab completa builtins.
