# Vocabulário do GPT-2

`vocab.bpe` é a lista de 50.000 merges do tokenizer BPE do GPT-2, publicada pela OpenAI
junto com o modelo `124M`:

- origem: `https://openaipublic.blob.core.windows.net/gpt-2/models/124M/vocab.bpe`
- SHA-256: `1ce1664773c50f3e0cc8842619a93edc4624525b728b188a9e0be33b7726adc5`
- licença: [Modified MIT License](https://github.com/openai/gpt-2/blob/master/LICENSE),
  Copyright (c) 2019 OpenAI

Ele é usado pelo stage 8 do desafio Tokenizer ("Match GPT-2"), para que o tester rode
sem internet. O `encoder.json` original não é necessário: o ID de um token de 1 byte é a
posição do byte na ordem de `bytes_to_unicode`, e o merge da linha *r* (contando a partir
de 0, sem o cabeçalho `#version`) gera o ID `256 + r`.
