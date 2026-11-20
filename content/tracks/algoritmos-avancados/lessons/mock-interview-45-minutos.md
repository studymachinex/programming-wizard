> **Em uma frase:** a entrevista de 45 minutos testa como você pensa em voz alta sob incerteza — não se você decorou a solução.

O formato é conhecido: 5 min de contexto, 5 de requisitos, 5 de exemplos, 15 de solução, 10 de código, 5 de testes e trade-offs. O que diferencia é a estrutura, a comunicação e a capacidade de reconhecer quando travou.

## O problema

Muitos candidatos resolvem o problema em silêncio e falham por não comunicar. Outros falam sem escrever nada e não terminam. O relógio é curto; sem um protocolo, você gasta 20 minutos em detalhes e não chega ao código.

## Como funciona

**Protocolo de 45 minutos:**

| Tempo | Etapa | O que fazer |
|---|---|---|
| 0-5 | Entender | Repita o problema, pergunte entradas e restrições |
| 5-10 | Exemplos | Caso simples, caso de borda, caso grande |
| 10-15 | Estratégia | Força bruta, complexidade, otimização |
| 15-30 | Código | Escreva legível, nomes claros, sem pseudocódigo eterno |
| 30-38 | Testes | Rode exemplos, bordas, invariantes |
| 38-45 | Trade-offs | Complexidade, memória, concorrência, produção |

**Exemplo 1 — Two Sum:** força bruta O(n²), hash O(n). Explique por que o hash funciona, trate duplicatas e índice atual.

**Exemplo 2 — LRU Cache:** HashMap + lista duplamente ligada. Descreva a invariante, implemente `get`/`put`, teste capacidade 1 e atualização de chave existente.

## Na prática

Pense em voz alta: "estou considerando ordenar, mas isso custa O(n log n); um hash me dá O(n) e gasta O(n) de memória". O entrevistador avalia o caminho, não só o destino.

Quando travar, reduza o problema: resolva para n pequeno, encontre o padrão, generalize. Peça dica sem vergonha; saber pedir é sinal de colaboração.

Teste você mesmo antes de dizer "pronto". Casos: vazio, um elemento, duplicatas, negativos, overflow, entrada inválida.

## Rubrica de avaliação

| Sinal | Forte | Fraco |
|---|---|---|
| Comunicação | Explica decisões | Silêncio ou monólogo |
| Código | Legível, testado | Pseudocódigo interminável |
| Complexidade | Analisa tempo/espaço | "Funciona" |
| Colaboração | Aceita dica e ajusta | Defensivo |
| Testes | Cobre bordas | Só o exemplo feliz |

## Armadilhas comuns

- Codar antes de entender o problema.
- Ignorar restrições e propor solução inviável.
- Não testar o próprio código.
- Discutir otimização antes da corretude.
- Mentir sobre experiência.

## Checklist de domínio

- [ ] Sigo o protocolo de 45 minutos.
- [ ] Comunico trade-offs em voz alta.
- [ ] Testo bordas sem ser solicitado.
- [ ] Sei pedir dica e incorporar.
- [ ] Pratico com gravação e feedback.

## Para ir além

Grave duas entrevistas simuladas e revise: tempo por etapa, clareza e testes. Depois refaça os dois problemas com metade do tempo.
