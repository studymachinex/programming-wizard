Os demais tokens de um caractere:

| caractere | token |
|---|---|
| `,` | `COMMA` |
| `.` | `DOT` |
| `-` | `MINUS` |
| `+` | `PLUS` |
| `;` | `SEMICOLON` |
| `*` | `STAR` |

## O que você vai aprender

- a mapear caracteres para tipos de token.

## O que fazer

Adicione os seis casos. (A barra `/` fica para o stage 9, por causa dos comentários.)

## Como o tester valida

- sequências aleatórias com todos esses caracteres.

## Dicas

- Use um `enum TokenType` — o nome do enum é exatamente o que aparece na saída.

## Critério de conclusão

Todos os tokens de um caractere são reconhecidos.
