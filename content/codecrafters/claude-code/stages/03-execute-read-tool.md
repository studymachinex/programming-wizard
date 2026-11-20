Agora o modelo vai **pedir** a ferramenta. Em vez de texto, a resposta traz
`tool_calls`, e o seu programa executa o que foi pedido.

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": { "name": "read", "arguments": "{\"path\": \"notes.txt\"}" }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

## O que você vai aprender

- que o modelo **não executa nada**: ele só pede, e o seu código decide e executa;
- que `arguments` chega como **string** com JSON dentro;
- a devolver o resultado para o modelo como mensagem `role: "tool"`.

## O que fazer

1. Se a resposta tiver `tool_calls`, para cada chamada:
   - leia `function.name` e faça o parse de `function.arguments`;
   - para `read`, leia o arquivo `path` (relativo ao diretório atual).
2. Envie um novo request com o histórico estendido:
   - a mensagem do assistente, **com os `tool_calls`**;
   - uma mensagem por resultado:
     `{ "role": "tool", "tool_call_id": "call_abc123", "content": "<conteúdo do arquivo>" }`.
3. Imprima a resposta de texto que vier.

## Como o tester valida

- o modelo pede `read` de `notes.txt`;
- quando recebe o resultado, responde repetindo o conteúdo do arquivo;
- a saída do programa precisa conter o conteúdo de `notes.txt`.

## Dicas

- `tool_call_id` liga o resultado ao pedido: copie o `id` exato.
- O próximo stage generaliza isso em um loop — se você já escrever como loop, ótimo.

## Critério de conclusão

O agente executa o `read` pedido pelo modelo e devolve o conteúdo.
