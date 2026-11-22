# Guia de autoria — Programming Wizard

Cada trilha é uma pasta em `content/tracks/<slug>/`:

```
content/tracks/java-fundamentos/
  track.json
  lessons/
    01-como-java-executa.md
  exercises/
    hello-java.json
  activities/
    01-como-java-executa.json   # opcional, mesmo nome da aula
content/problems/java-fundamentos.json
content/projects.json
```

## 1. `track.json`

```json
{
  "slug": "java-fundamentos",
  "title": "Java do Zero ao Sólido",
  "subtitle": "Frase curta de posicionamento (10–120 chars)",
  "description": "Parágrafo de 2–4 frases explicando a trilha e para quem ela é.",
  "level": "fundamento",            // fundamento | intermediario | avancado | especialista
  "icon": "coffee",                 // coffee | braces | boxes | network | database | leaf | radio | server | layers | cloud | compass | target
  "accent": "arcane",               // arcane | mana | rune | ember | rose
  "estimatedHours": 40,
  "isCore": true,
  "outcomes": [
    "Resultado concreto e verificável 1",
    "Resultado concreto e verificável 2",
    "Resultado concreto e verificável 3"
  ],
  "modules": [
    {
      "slug": "jvm-e-ambiente",
      "title": "A JVM e o ambiente Java",
      "description": "O que o módulo cobre e por que importa (>= 20 chars).",
      "estimatedHours": 6,
      "lessons": [
        {
          "slug": "como-java-executa",
          "title": "Como o Java executa: JDK, JVM, JRE e bytecode",
          "summary": "Resumo de 1–2 frases com o que a pessoa sai sabendo (>= 20 chars).",
          "minutes": 25,
          "file": "lessons/como-java-executa.md",
          "takeaways": [
            "Diferença prática entre JDK, JRE e JVM",
            "O caminho .java -> .class -> JIT -> execução"
          ],
          "quiz": [
            {
              "question": "Pergunta objetiva?",
              "options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
              "answer": 1,
              "explanation": "Por que a alternativa correta está correta."
            }
          ]
        }
      ],
      "exercises": ["exercises/hello-java.json"]
    }
  ]
}
```

Regras rígidas:
- Todo slug é kebab-case, sem acentos.
- `file` é relativo à pasta da trilha.
- `exercise.slug` é **globalmente único** entre todas as trilhas. Prefixe com a trilha (`dsa-two-sum`, `kafka-outbox`).
- Cada aula tem 2–4 perguntas de quiz. `answer` é o índice 0-based da resposta correta.
- 4–6 `outcomes` por trilha, específicos (não "aprender Java").
- Um módulo tem 2–8 aulas. Uma trilha tem 4–8 módulos.
- Mínimo de 1 exercício prático por módulo (2+ nos módulos de DSA/Java).

## 2. Aula (`.md`)

Aula é **markdown puro**, em **português do Brasil**, sem H1 (o título vem do manifesto). 700–1.200 palavras. Estrutura obrigatória:

```md
> **Em uma frase:** a ideia central em uma frase.

## O problema

Contexto real, dor ou pergunta que motiva o conceito. Sem enrolação.

## Como funciona

Explicação profunda, progressiva, com analogias curtas e precisas. Use tabelas quando ajudar.

```java
// Código Java completo e compilável (Java 21). Comentários em português.
```

## Na prática

Exemplo aplicado, trade-offs, quando usar e quando NÃO usar.

## Armadilhas comuns

- Erro comum 1 e como evitar.
- Erro comum 2 e como evitar.

## Checklist de domínio

(Nas trilhas de algoritmos, esta seção não existe: use as atividades da aula, seção 3.1.)

- [ ] Você consegue explicar X sem consultar
- [ ] Você consegue implementar Y do zero
- [ ] Você reconhece Z em um problema novo

## Para ir além

2–4 links externos de altíssima qualidade (documentação oficial, artigo, talk). URLs reais e estáveis.
```

Requisitos de qualidade:
- Pelo menos **2 blocos de código Java** por aula, corretos e compiláveis (Java 17/21).
- Nada de "lorem ipsum", nada de conteúdo genérico de IA. Ensine de verdade, com números, exemplos e trade-offs.
- Cada aula deve ter pelo menos um detalhe que só quem já colocou em produção sabe (armadilha, custo escondido, decisão de design).
- Use `##` apenas para seções; `###` para subtópicos.
- Tabelas markdown com no máximo 4 colunas.
- Links externos: prefira docs oficiais, Baeldung, Martin Fowler, Jepsen, LeetCode. Nunca invente URLs.
- Não use HTML.

## 3. Exercício local (`.json`)

```json
{
  "slug": "java-fizzbuzz-custom",
  "title": "FizzBuzz com regras customizadas",
  "difficulty": "facil",
  "tags": ["loops", "condicionais", "strings"],
  "estimatedMinutes": 20,
  "statement": "Markdown com enunciado completo: contexto, contrato, exemplos de entrada/saída, restrições e critérios de avaliação.",
  "starterCode": "public class Solution {\n    public static ... \n}",
  "solutionCode": "public class Solution {\n    // solução completa, idiomática, com complexidade comentada\n}",
  "tests": "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass SolutionTest { ... }",
  "hints": ["Dica 1 sem entregar a resposta", "Dica 2 mais direta"],
  "externalUrl": null
}
```

Regras:
- Java 21, classe pública `Solution`, métodos `static` para permitir testes diretos.
- `tests` usa JUnit 5 (`org.junit.jupiter.api`), cobre casos normais, limites e erro.
- Enunciado tem seção **Exemplos**, **Restrições** e **Critérios de aceite**.
- Solução tem comentário de complexidade de tempo/espaço.
- Exercícios de DSA: implementar estrutura/algoritmo, não apenas usar `Collections`.
- Exercícios de backend/Kafka/SQL podem ser desafios de modelagem/design com solução em Java/SQL, mas sempre com entregável verificável.

## 3.1 Atividades da aula (`activities/<aula>.json`)

Aparecem no fim da aula, na seção **Atividades**. Nas trilhas de algoritmos, substituem o checklist de domínio.
São um array com dois tipos de item:

```json
[
  {
    "slug": "atv-ed-remove-duplicatas",
    "kind": "code",
    "title": "Remover duplicatas in-place",
    "statement": "Markdown com ## Contrato, ## Exemplos e ## Restrições",
    "starterCode": "public class Solution { ... throw new UnsupportedOperationException(\"TODO\"); }",
    "solutionCode": "public class Solution { ... }",
    "tests": "import org.junit.jupiter.api.Test; ... class SolutionTest { ... }",
    "hints": ["Dica 1", "Dica 2"]
  },
  { "slug": "atv-ed-tp-r1", "kind": "reflection", "title": "Explique o invariante do two sum ordenado." }
]
```

Regras:
- `code`: o aluno resolve no editor da plataforma e os testes rodam no runner (`/api/run`). Passar em todos
  os testes conclui a atividade. Valem as mesmas regras do exercício local (classe `Solution`, JUnit 5).
- `reflection`: itens de explicar, comparar ou reconhecer, sem validador. O aluno marca sozinho.
- Os slugs são únicos em todo o conteúdo. Inclua um teste grande quando a complexidade importa.
- `npx tsx scripts/check-exercises.ts <filtro>` verifica que a solução passa e que o starter compila e falha.

## 4. Problemas externos (`content/problems/<track>.json`)

Array de 12–30 problemas, progressão real de dificuldade:

```json
[
  {
    "slug": "lc-two-sum",
    "title": "Two Sum",
    "platform": "LeetCode",
    "url": "https://leetcode.com/problems/two-sum/",
    "difficulty": "facil",
    "level": 1,
    "topic": "Arrays & Hashing",
    "moduleSlug": "hash-maps-e-sets",
    "description": "Por que este problema agora e o que observar."
  }
]
```

- `level`: 1 = aquecimento, 2 = base, 3 = intermediário, 4 = difícil, 5 = entrevista FAANG.
- Use URLs que existem: LeetCode `/problems/<slug>/`, HackerRank `https://www.hackerrank.com/challenges/<slug>/problem`, Beecrowd `https://judge.beecrowd.com/pt/problems/view/<id>`.
- Misture plataformas; pelo menos 50% LeetCode.
- Não repita o mesmo problema entre trilhas (slug global único).
- Foque nos padrões que caem em entrevista, não em problemas aleatórios.

## 5. Projetos (`content/projects.json`)

Array global. 10–14 capstones. `requirements` com 6–10 itens verificáveis; `stretchGoals` com 2–5 itens. Cada projeto deve ser portfólio-real: README, testes, CI, deploy, observabilidade.

## 6. Tom e idioma

- Português do Brasil, direto, técnico, sem infantilizar.
- Trate o leitor como adulto inteligente que quer virar sênior/especialista.
- Use "você". Nada de "nós vamos aprender".
- Explique o **porquê** antes do **como**. Sempre traga trade-offs.
- Contexto de mercado: Netflix, Uber, Google, Nubank, iFood quando fizer sentido.
- Preços/anos: use "hoje" em vez de datas que envelhecem.
