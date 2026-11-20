Tarefas reais exigem vários passos: ler um arquivo, descobrir que precisa de outro, ler
o outro... O **loop do agente** repete request → ferramentas → request até o modelo
responder só com texto.

```text
messages = [system?, user]
loop:
  resposta = chat(messages, tools)
  messages += resposta (assistant)
  se não há tool_calls: imprime o texto e termina
  para cada tool_call: messages += { role: tool, tool_call_id, content: executar(call) }
```

## O que você vai aprender

- que um "agente" é, no fundo, esse loop simples;
- que o histórico cresce a cada turno e vai inteiro em todo request;
- a tratar **várias chamadas no mesmo turno** e erros de ferramenta.

## O que fazer

1. Transforme o fluxo do stage 3 em um loop.
2. Uma resposta pode ter **mais de um** `tool_call`: execute todos e envie um resultado
   para cada, antes do próximo request.
3. Se uma ferramenta falhar (arquivo inexistente, argumento inválido), **não encerre o
   programa**: devolva o erro como conteúdo do resultado (`"error: arquivo não encontrado"`)
   e deixe o modelo decidir.
4. Coloque um limite de turnos (ex.: 30) para não rodar para sempre.

## Como o tester valida

O modelo falso segue pistas:

1. pede `read` de dois arquivos **no mesmo turno**;
2. lê o arquivo indicado pelo primeiro;
3. pede um arquivo que não existe e espera uma mensagem de erro como resultado;
4. responde com o texto final.

Em cada request, confere que o histórico tem todas as mensagens anteriores e que cada
`tool_call` tem a sua resposta `role: "tool"`.

## Dicas

- Guarde a mensagem do assistente exatamente como veio (`content` e `tool_calls`).
- A ordem importa: a mensagem do assistente vem antes das mensagens `tool` que a respondem.

## Critério de conclusão

O agente encadeia quantas chamadas de ferramenta o modelo precisar.
