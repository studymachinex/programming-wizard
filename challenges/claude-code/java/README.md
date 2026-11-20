# Build your own Claude Code — Java

Esta é a implementação de referência (18/18) do desafio **Claude Code** do Programming Wizard.

Você vai construir um **agente de código** de linha de comando: ele conversa com um LLM,
deixa o modelo chamar ferramentas (ler, escrever, rodar comandos), executa essas
ferramentas em loop, carrega *skills* e consulta um *language server*.

```bash
./your_program.sh -p "Leia notes.txt e resuma"
```

## LLM

O agente fala com qualquer API compatível com **Chat Completions**, configurada por
variáveis de ambiente:

| Variável | Exemplo |
|---|---|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` (Ollama) |
| `OPENAI_API_KEY` | a sua chave |
| `MODEL` | `gpt-4o-mini`, um modelo do OpenRouter, `llama3.1`... |

**Os testes não usam nenhuma API paga:** o tester sobe um LLM falso, que responde com
roteiros determinísticos e confere cada request.

## Configuração do projeto

O agente roda dentro de um projeto (o diretório atual) e lê:

- `.agent/skills/<nome>/SKILL.md` — skills (stages 7–13);
- `.agent/lsp.json` — comando do language server (stages 14–18).

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o agente.
- `src/main/java/Main.java` — seu código.
- `src/main/java/Json.java` — parse/stringify de JSON (pronto, só com a biblioteca padrão).
