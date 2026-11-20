Um LLM só produz texto. Para ele agir, você **anuncia ferramentas**: descreve cada uma e
o formato dos parâmetros, e o modelo passa a poder pedir para usá-las. A primeira é
`read`, que lê um arquivo do projeto.

## O que você vai aprender

- *tool calling*: o modelo escolhe ferramentas a partir de uma descrição;
- a descrever parâmetros com **JSON Schema**;
- que a descrição é parte do prompt — escrevê-la bem muda o comportamento do modelo.

## O formato

Adicione o campo `tools` ao request:

```json
{
  "model": "...",
  "messages": [ ... ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read",
        "description": "Lê um arquivo do projeto e devolve o conteúdo.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string", "description": "caminho relativo ao projeto" }
          },
          "required": ["path"]
        }
      }
    }
  ]
}
```

## O que fazer

1. Monte a definição da ferramenta `read` com o parâmetro obrigatório `path`.
2. Envie-a em `tools` em todo request.

```java
Map<String, Object> read = Json.obj("type", "function", "function", Json.obj(
    "name", "read",
    "description", "Lê um arquivo do projeto e devolve o conteúdo.",
    "parameters", Json.obj(
        "type", "object",
        "properties", Json.obj("path", Json.obj("type", "string")),
        "required", List.of("path"))));
```

## Como o tester valida

- confere que o request anuncia `read` com `"type": "function"`;
- confere que `path` está em `parameters.properties` e em `required`;
- responde com texto e espera vê-lo na saída.

## Dicas

- Monte uma função `tool(name, description, properties, required)`: você vai anunciar mais
  quatro ferramentas.
- Neste stage o modelo ainda não chama a ferramenta — isso é o próximo passo.

## Critério de conclusão

Todo request anuncia a ferramenta `read`.
