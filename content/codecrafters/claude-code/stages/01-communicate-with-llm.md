Neste desafio você vai construir um **agente de código**: um programa que conversa com um
LLM e deixa o modelo agir no seu projeto. O primeiro passo é só conversar.

```bash
$ ./your_program.sh -p "Diga olá"
Olá! Como posso ajudar?
```

## O que você vai aprender

- o formato da API **Chat Completions**, o padrão de fato entre provedores de LLM;
- que o modelo não tem memória: cada request leva a conversa inteira em `messages`;
- a configurar o cliente por variáveis de ambiente.

## A API

```http
POST {OPENAI_BASE_URL}/chat/completions
Authorization: Bearer {OPENAI_API_KEY}
Content-Type: application/json

{
  "model": "{MODEL}",
  "messages": [
    { "role": "user", "content": "Diga olá" }
  ]
}
```

Resposta (resumida):

```json
{
  "choices": [
    { "message": { "role": "assistant", "content": "Olá! Como posso ajudar?" } }
  ]
}
```

## O que fazer

1. Leia o prompt do argumento `-p`.
2. Leia `OPENAI_BASE_URL`, `OPENAI_API_KEY` e `MODEL` do ambiente.
3. Envie o request acima com `java.net.http.HttpClient`.
4. Imprima `choices[0].message.content`.

O starter traz esse código comentado e um `Json.java` pronto para montar e ler JSON.

## Como o tester valida

O tester **não chama nenhum LLM de verdade**: ele sobe um servidor falso compatível com a
API, aponta `OPENAI_BASE_URL` para ele e confere:

- o caminho `/chat/completions`, o header `Authorization: Bearer <chave>` e o `model`;
- que a primeira mensagem `role: "user"` é exatamente o prompt;
- que a saída do programa contém a resposta do modelo.

## Dicas

- Para usar com um LLM real, aponte `OPENAI_BASE_URL` para OpenAI, OpenRouter
  (`https://openrouter.ai/api/v1`) ou Ollama (`http://localhost:11434/v1`).
- Logs de depuração vão para o `System.err`; o `stdout` é só para a resposta final.
- Uma mensagem `role: "system"` antes da do usuário é permitida (e útil) — os próximos
  stages vão usá-la.

## Critério de conclusão

O agente envia o prompt e imprime a resposta do modelo.
