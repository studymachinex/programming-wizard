> **Em uma frase:** as quatro perguntas comportamentais que mais caem (projeto a fundo, trade-off, falha que você assumiu e desacordo) medem nível de senioridade, e cada uma tem um sinal específico que o entrevistador está procurando.

## O problema

Você passou nas rodadas técnicas e reprova na comportamental com respostas como "eu trabalhei num projeto de microsserviços com Kafka, foi bem desafiador, a gente aprendeu muito". O entrevistador de Uber, Airbnb ou DoorDash não reprova por falta de carisma. Reprova por **falta de sinal**: não ficou claro o que **você** decidiu, qual foi o resultado em números e o que mudou no seu jeito de trabalhar.

A boa notícia é que as perguntas se repetem. Com quatro a seis histórias bem preparadas, você cobre quase todo o loop.

## Como funciona

### A regra que vale para as quatro: resultado primeiro

O STAR clássico (Situação, Tarefa, Ação, Resultado) deixa o resultado para o fim, e muita gente nunca chega nele. Inverta: **uma frase de resultado, depois o contexto mínimo, depois as suas ações em detalhe, e fecha com o aprendizado**. Se o entrevistador interromper aos 40 segundos, ele já tem o que precisa.

```text
Resultado (1 frase, com número) -> Contexto (2-3 frases) -> Minhas decisões (60% do tempo)
-> Resultado detalhado -> O que eu faria diferente
```

Use "eu" para as suas decisões e "o time" só para o que foi do time. Dois a três minutos por resposta, e deixe espaço para as perguntas de aprofundamento: elas são a parte que realmente avalia.

### 1. "Me fale de um projeto em profundidade"

**Sinal procurado:** escopo e profundidade técnica. Você entende o sistema inteiro ou só a sua tarefa? Sabe por que as decisões foram tomadas?

**Estrutura:** comece pelo impacto ("reduzimos o p99 do checkout de 1,8 s para 320 ms e o abandono caiu 4 pontos"), desenhe a arquitetura em 30 segundos, escolha **as duas decisões mais difíceis** e explique as alternativas descartadas. Termine com o que ainda está ruim no sistema: isso mostra maturidade.

**Prepare-se para:** "por que não usaram X?", "o que acontece se o serviço Y cair?", "como vocês mediram isso?". Se a resposta for "não sei", diga como você descobriria.

### 2. "Um trade-off que fez você mudar um design"

**Sinal procurado:** julgamento. Você muda de ideia diante de dados ou defende a primeira solução por orgulho?

**Exemplo de esqueleto:** "Troquei consistência forte por eventual na contagem de estoque do marketplace, e a latência de escrita caiu 70% com um custo controlado de overselling de 0,02%. O design original travava a linha do produto a cada venda. Na Black Friday, os produtos populares viraram hotspot. Medi a taxa real de conflito, propus reserva em memória com reconciliação a cada minuto e combinei com o time de produto um limite aceitável de overselling, com compensação automática ao cliente."

O ponto central é mostrar **o critério**: que número mudou a decisão e quem mais precisava concordar.

### 3. "Uma falha de sistema que você assumiu"

**Sinal procurado:** ownership e aprendizado sem culpar ninguém. É a pergunta em que mais gente se sabota, escolhendo uma falha pequena demais ("esqueci um log") ou culpando outro time.

**Estrutura:** o que quebrou e o impacto para o usuário (em minutos e em pessoas afetadas), como você detectou, o que você fez **nos primeiros 15 minutos** (mitigar antes de investigar), a causa raiz e a mudança sistêmica que impediu a repetição: um teste, um alerta, um guard-rail no deploy. Feche com o que você mudou no **seu** processo.

**Detalhe que pesa:** fale do postmortem sem culpados (blameless) e de como você comunicou durante o incidente. Liderar a comunicação de um incidente é sinal de sênior, mesmo sem ter escrito a correção.

### 4. "Uma vez em que você discordou do time, e como terminou"

**Sinal procurado:** colaboração sob conflito. Você sabe discordar com dados, escalar com respeito e se comprometer com a decisão final mesmo quando perdeu ("disagree and commit")?

**Estrutura:** a posição de cada lado (apresente a do outro lado de forma justa, como se você a defendesse), como você levou a discussão para critérios objetivos (protótipo, benchmark, custo), como terminou e o que aconteceu depois. **A melhor versão nem sempre é aquela em que você ganhou.** "Eu perdi, me comprometi, ajudei a fazer dar certo e seis meses depois revisitamos com dados novos" é uma resposta excelente.

### O banco de histórias

Prepare de quatro a seis histórias e mapeie quais perguntas cada uma responde. Uma boa história cobre duas ou três perguntas com ênfases diferentes.

| História | Projeto a fundo | Trade-off | Falha | Desacordo |
|---|---|---|---|---|
| Migração do checkout para eventos | Sim | Sim | | Sim |
| Incidente de fila travada na Black Friday | | | Sim | |
| Escolha entre Postgres e DynamoDB | | Sim | | Sim |
| Rate limiter interno | Sim | | Sim | |

## Na prática

- **Escreva as histórias.** Em tópicos, com os números. Na hora, a memória falha justamente nos números, e são eles que dão credibilidade.
- **Treine em voz alta, com cronômetro.** Dois a três minutos. Grave e ouça: você vai notar quanto tempo gasta em contexto.
- **Prepare em inglês também.** Uber, Airbnb e DoorDash costumam conduzir o loop em inglês, inclusive para vagas no Brasil. O vocabulário de incidente e de trade-off precisa estar na ponta da língua.
- **Adapte ao nível.** Para sênior, as histórias precisam ter impacto além do seu time: outro time adotou, a decisão virou padrão, você mentorou alguém.
- **Conheça os valores da empresa.** A Airbnb tem uma entrevista dedicada aos valores ("core values"), e a Amazon cobra os Leadership Principles em todas as rodadas. Ligue as histórias ao vocabulário da empresa sem decorar frases prontas.

## Armadilhas comuns

- **"Nós" o tempo todo.** O entrevistador não consegue avaliar o que você fez. Use "eu decidi", "eu propus", "eu medi".
- **Falha que não é falha.** "Meu defeito é ser perfeccionista" ou um bug sem impacto não geram sinal. Escolha algo que doeu de verdade e que você consertou de verdade.
- **Culpar o outro lado no desacordo.** Se a história faz o colega parecer incompetente, quem perde ponto é você.
- **Sem número.** "Melhorou bastante" não é resultado. Latência, custo, incidentes, tempo de deploy, conversão: escolha um e meça.
- **História inventada.** As perguntas de aprofundamento desmontam histórias fabricadas em dois minutos. Use experiências reais, inclusive de projetos pessoais ou de estudo, se for o caso.

## Checklist de domínio

- [ ] Você tem de quatro a seis histórias escritas, com números, mapeadas para as quatro perguntas
- [ ] Você conta cada história em resultado-primeiro em até 3 minutos
- [ ] Você responde a três perguntas de aprofundamento sobre cada história sem se contradizer
- [ ] Você tem as quatro respostas treinadas em inglês

## Para ir além

- [Tech Interview Handbook: Behavioral interviews](https://www.techinterviewhandbook.org/behavioral-interview/): perguntas frequentes e como estruturar respostas.
- [Google SRE Book: Postmortem Culture](https://sre.google/sre-book/postmortem-culture/): o vocabulário de postmortem sem culpados para a pergunta de falha.
- [Amazon Leadership Principles](https://www.amazon.jobs/content/en/our-workplace/leadership-principles): o exemplo mais explícito de valores cobrados em entrevista.
