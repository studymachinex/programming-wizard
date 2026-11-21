Instâncias guardam **campos**, criados na primeira atribuição. Erros:

- ler campo inexistente: `Undefined property 'x'.`
- `.x` em algo que não é instância: `Only instances have properties.`
- atribuir campo em não-instância: `Only instances have fields.`

## O que você vai aprender

- acesso a propriedades e o caso especial da atribuição (`Set`).

## O que fazer

1. `call → primary ( "(" arguments? ")" | "." IDENTIFIER )*` cria `Get`.
2. Na atribuição, se o alvo for um `Get`, troque por `Set`.
3. `LoxInstance` com um `Map` de campos.

## Como o tester valida

- leitura e escrita, atribuição encadeada, e os três erros.

## Dicas

- Erros de execução: imprima a mensagem no stderr e, na linha seguinte, `[line N]`; termine com código **70**.

## Critério de conclusão

Campos funcionam.
