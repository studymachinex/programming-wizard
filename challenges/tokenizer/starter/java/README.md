# Build your own Tokenizer — Java

Este é o repositório inicial do desafio **Tokenizer** do Programming Wizard.

Você vai implementar um tokenizer **BPE** (*byte pair encoding*), o algoritmo que
transforma texto em tokens nos modelos de linguagem, até reproduzir exatamente os token
IDs do GPT-2.

O programa fica em `src/main/java/Main.java`. Toda entrada chega pelo **stdin** e o
primeiro argumento escolhe o comando:

| Comando | Entrada (stdin) | Saída |
|---|---|---|
| `bytes` | texto | bytes UTF-8 |
| `pair` | ids | par mais frequente |
| `merge <a> <b> <id>` | ids | ids com o par substituído |
| `train <vocab_size>` | texto | merges aprendidos |
| `encode <arquivo_merges>` | texto | ids |
| `decode <arquivo_merges>` | ids | texto |
| `split` | texto | chunks da pré-tokenização do GPT-2 |
| `gpt2 <vocab.bpe>` | texto | token IDs do GPT-2 |

## Comandos

Na raiz do Programming Wizard:

```bash
npm run cc -- task          # instruções do stage atual
npm run cc -- test          # roda os testes sem commitar
npm run cc -- submit        # commit + push; o hook do remote roda os testes
npm run cc -- status        # progresso
```

Para experimentar à mão:

```bash
printf 'hello' | ./your_program.sh bytes
```

## Estrutura

- `your_program.sh` / `your_program.cmd` — compila e executa o tokenizer.
- `src/main/java/Main.java` — seu código.

Só a biblioteca padrão do Java é necessária. O vocabulário do GPT-2 usado no stage 8
fica em `challenges/tokenizer/data/gpt2/vocab.bpe` no Programming Wizard.
