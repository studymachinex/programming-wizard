> **Em uma frase:** refatorar um serviço gordo não é reescrever tudo — é criar testes, mover uma responsabilidade por vez e manter o sistema funcionando durante o caminho.

O `PedidoService` tem 1.200 linhas, dez dependências injetadas, SQL, regra de desconto, envio de e-mail e tratamento de erro. Todo mundo tem medo de mexer. A saída não é um rewrite big-bang; é uma sequência disciplinada de extrações.

## O problema

Sintomas clássicos: métodos com 200 linhas, nomes como `processar`, testes que precisam de banco para validar desconto, e mudanças que quebram efeitos colaterais distantes. A causa raramente é incompetência; é acúmulo de decisões locais sem fronteiras.

## Como funciona

O roteiro:

1. **Caracterize o comportamento.** Escreva testes de caracterização nos fluxos que serão tocados. Não busque design ideal; congele o que existe.
2. **Liste responsabilidades.** Marque no código: cálculo, persistência, notificação, integração, orquestração.
3. **Extraia funções puras.** Desconto e frete não precisam de banco. Mova para classes coesas e teste sem mocks.
4. **Extraia colaboradores.** Notificação vira porta; persistência vira repositório; integração vira cliente.
5. **Reduza o serviço a orquestração.** Ele coordena, não implementa tudo.
6. **Remova duplicação e nomes vagos.** Só depois de os testes verdes.

```java
// antes: tudo no service
BigDecimal total = itens.stream()
    .map(i -> i.preco().multiply(BigDecimal.valueOf(i.qtd())))
    .reduce(ZERO, BigDecimal::add);
if (cliente.vip()) total = total.multiply(new BigDecimal("0.9"));

// depois: política testável
class PoliticaDesconto {
    BigDecimal aplicar(BigDecimal total, Cliente cliente) {
        return cliente.vip() ? total.multiply(new BigDecimal("0.90")) : total;
    }
}
```

## Na prática

Faça extrações pequenas e commitáveis. Rode os testes a cada passo. Use o IDE para *extract method/class*, mas revise o resultado: ferramenta não decide fronteira.

Meça o acoplamento: quantas dependências o serviço tem? Quantos motivos para mudar? Se a resposta cresce, continue. Não persiga pureza hexagonal em um CRUD; o objetivo é reduzir o custo de mudança.

Quando o serviço mistura transações e chamadas externas, separe o efeito externo com outbox ou evento. Um `@Transactional` que envolve HTTP é uma armadilha: o commit pode falhar depois do e-mail enviado.

## Armadilhas comuns

- Refatorar sem testes de caracterização: você não sabe o que quebrou.
- Big-bang rewrite que congela features por meses.
- Extrair classes anêmicas que só repassam chamadas.
- Mover código sem mudar dependências: o acoplamento segue.
- Otimizar prematuramente o design e perder o prazo.

## Checklist de domínio

- [ ] Consigo listar as responsabilidades do serviço.
- [ ] Tenho testes que congelam o comportamento atual.
- [ ] Extraio funções puras primeiro.
- [ ] Sei medir acoplamento e coesão na prática.
- [ ] Faço mudanças pequenas e reversíveis.

## Para ir além

Leia "Refactoring" de Martin Fowler, capítulos de Extract Function e Extract Class. Depois escolha um serviço seu e extraia uma responsabilidade por dia durante uma semana, mantendo a suíte verde.
