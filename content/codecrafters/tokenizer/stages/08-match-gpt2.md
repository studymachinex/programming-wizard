O último stage junta tudo: com o vocabulário **original** do GPT-2, produza os mesmos
token IDs que o modelo usa. Implemente `gpt2 <vocab.bpe>`.

```bash
$ printf 'Hello world' | ./your_program.sh gpt2 vocab.bpe
15496 995
```

O tester passa o caminho de `challenges/tokenizer/data/gpt2/vocab.bpe`.

## O que você vai aprender

- como um tokenizer de produção é só a combinação de BPE + pré-tokenização + um
  vocabulário treinado;
- o truque `bytes_to_unicode` do GPT-2 para guardar bytes em um arquivo de texto;
- a reaproveitar o seu `encode` do stage 5 com um vocabulário de 50.257 tokens.

## O arquivo `vocab.bpe`

```text
#version: 0.2
Ġ t
Ġ a
h e
...
```

A primeira linha é um cabeçalho. Cada linha seguinte é um merge, em ordem de
prioridade. Os tokens aparecem como texto, não como números: o GPT-2 troca cada byte
por um caractere "visível" — por exemplo, o espaço (byte 32) vira `Ġ` (U+0120).

### O mapeamento `bytes_to_unicode`

1. Liste os bytes "imprimíveis", nesta ordem: `33`–`126`, `161`–`172`, `174`–`255`.
   Cada um é representado pelo caractere de mesmo código.
2. Os bytes que sobraram (`0`–`32`, `127`–`160`, `173`), em ordem crescente, recebem os
   caracteres `256`, `257`, `258`...
3. A **posição** de cada byte nessa lista (primeiro os imprimíveis, depois os que
   sobraram) é o **token ID** dele: o byte `33` (`!`) tem ID 0; o espaço tem ID 220.

### IDs dos merges

O merge da linha *r* (contando a partir de 0, sem o cabeçalho) gera o token de ID
`256 + r`. Ex.: `Ġ t` é o merge 0 → token `Ġt` com ID 256.

## O que fazer

1. Monte o mapeamento byte → caractere e byte → ID.
2. Leia o `vocab.bpe` e converta cada linha `x y` em um merge de **ids**:
   `id(x) id(y) -> 256 + r`, guardando também `id(x + y) = 256 + r` para as próximas
   linhas.
3. Para o texto do stdin:
   - corte com a regex do stage 7;
   - para cada pedaço, converta os bytes UTF-8 em IDs (pela posição na lista);
   - aplique o `encode` do stage 5 com os merges convertidos.
4. Imprima todos os IDs em sequência.

## Como o tester valida

- confere que `Hello world` → `15496 995`;
- roda frases em inglês, português, com emojis, números e espaços múltiplos;
- compara com a referência, que segue o tokenizer original do GPT-2.

## Dicas

- O ID de um byte **não** é o valor do byte: o espaço (32) é o ID 220.
- Os merges nunca atravessam pedaços: codifique cada pedaço separadamente.
- Use `strip()` em cada linha do arquivo — se ele tiver `\r\n`, o `\r` estraga os tokens.
- Com 50.000 merges, use um mapa com chave numérica; o encode do stage 5 continua igual.

## Critério de conclusão

O seu tokenizer produz exatamente os token IDs do GPT-2.
