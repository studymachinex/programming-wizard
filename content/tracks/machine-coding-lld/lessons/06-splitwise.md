> **Em uma frase:** o Splitwise é um exercício de modelagem com dinheiro: o domínio é simples, e o que reprova é perder centavos, misturar tipos de divisão e não saber simplificar as dívidas.

## O problema

"Implemente um app de divisão de despesas: usuários, grupos, saldos." Em 70 minutos, você precisa registrar despesas divididas de três jeitos (igual, valores exatos, percentual), mostrar quem deve quanto e, no fim, sugerir o menor conjunto razoável de pagamentos para todo mundo ficar quite.

A pergunta-armadilha vem logo: R$ 10,00 dividido por 3 dá R$ 3,33 para cada, e a soma é R$ 9,99. **Para onde vai o centavo?** Se a resposta for "o `double` resolve", a entrevista acabou.

## Como funciona

### Dinheiro é `long` em centavos

`0.1 + 0.2` em `double` dá `0.30000000000000004`. Somado em milhares de despesas, o saldo de um grupo deixa de fechar em zero. Use `long` em centavos (ou `BigDecimal` com escala fixa, se houver várias moedas) e defina uma regra explícita para o resto da divisão.

### Saldo líquido, não matriz de dívidas

A tentação é guardar `deve[a][b]` para cada par. Isso é O(n²) de espaço e complica a simplificação. Basta **um saldo líquido por pessoa no grupo**: positivo é quem tem a receber, negativo é quem deve. Toda despesa credita o pagador pelo total e debita cada participante pela própria parte. Por construção, a soma dos saldos é sempre zero, e esse invariante vira o melhor teste do exercício.

```java
import java.util.*;

class Grupo {
    private final TreeMap<String, Long> saldos = new TreeMap<>();

    Grupo(List<String> membros) { membros.forEach(m -> saldos.put(m, 0L)); }

    // Divide total igualmente; os centavos que sobram vão aos primeiros da lista.
    void despesaIgual(String pagador, long total, List<String> participantes) {
        int n = participantes.size();
        long base = total / n, resto = total % n;
        saldos.merge(pagador, total, Long::sum);
        for (int i = 0; i < n; i++) {
            long parte = base + (i < resto ? 1 : 0);
            saldos.merge(participantes.get(i), -parte, Long::sum);
        }
    }

    long somaDosSaldos() { // sempre 0: invariante para testar
        return saldos.values().stream().mapToLong(Long::longValue).sum();
    }
}
```

### Três divisões, um núcleo

Divisão igual, exata e percentual diferem só em **como as partes são calculadas**. Calcule um `Map<String, Long>` de partes e mande tudo para um único `aplicar(pagador, total, partes)`. Se o entrevistador pedir "divisão por cotas" (2 cotas para quem levou acompanhante), é um cálculo novo de partes, e o núcleo não muda. Isso é uma Strategy implícita. Se surgirem mais variações, extraia `interface Divisao { Map<String, Long> partes(long total); }`.

Valide **tudo antes de mutar**: se o terceiro participante não for membro, nenhum saldo pode ter mudado.

### Simplificar dívidas

Ana pagou o jantar, Bia pagou o Uber e Caio pagou o hotel. As dívidas cruzadas viram um emaranhado. Com os saldos líquidos, o algoritmo guloso resolve: **o maior devedor paga ao maior credor o mínimo entre os dois valores**. Pelo menos um deles zera a cada passo, então há no máximo n − 1 transferências.

```java
record Transferencia(String de, String para, long centavos) {}
record Posicao(String id, long valor) {}

static List<Transferencia> simplificar(Map<String, Long> saldos) {
    Comparator<Posicao> maiorPrimeiro =
            Comparator.comparingLong(Posicao::valor).reversed().thenComparing(Posicao::id);
    var credores = new PriorityQueue<>(maiorPrimeiro);
    var devedores = new PriorityQueue<>(maiorPrimeiro);
    saldos.forEach((id, v) -> {
        if (v > 0) credores.add(new Posicao(id, v));
        else if (v < 0) devedores.add(new Posicao(id, -v));
    });
    var out = new ArrayList<Transferencia>();
    while (!credores.isEmpty() && !devedores.isEmpty()) {
        Posicao c = credores.poll(), d = devedores.poll();
        long x = Math.min(c.valor(), d.valor());
        out.add(new Transferencia(d.id(), c.id(), x));
        if (c.valor() > x) credores.add(new Posicao(c.id(), c.valor() - x));
        if (d.valor() > x) devedores.add(new Posicao(d.id(), d.valor() - x));
    }
    return out;
}
```

## Na prática

- **O guloso não é ótimo, e você deve dizer isso.** Encontrar o **mínimo** de transferências é NP-difícil: equivale a particionar o grupo no maior número de subconjuntos de soma zero. Para grupos de até ~20 pessoas, existe solução exata por bitmask DP (é o LeetCode 465). Na prática, o Splitwise usa uma heurística e o usuário nem percebe.
- **Desempates determinísticos.** Sem desempate por id, dois credores com o mesmo saldo trocam de ordem entre execuções, e o teste fica instável. A ordem de saída precisa fazer parte do contrato.
- **Histórico de despesas.** Saldo líquido responde "quem deve quanto", mas não "por quê". Guarde as despesas como eventos imutáveis e recalcule os saldos a partir deles se precisar editar ou apagar uma despesa. É event sourcing em miniatura.
- **Moedas diferentes.** Saldo vira `Map<Moeda, Long>` por pessoa, e simplificar exige uma taxa de câmbio num instante definido. É um bom follow-up para mostrar que você vê o problema, sem precisar implementar.

## Armadilhas comuns

- **`double` para dinheiro.** Reprovação direta em fintech. Centavos em `long`.
- **Ignorar o resto da divisão.** Sem uma regra explícita, o centavo some ou aparece duas vezes, e a soma dos saldos deixa de dar zero.
- **Mutar e depois validar.** Uma exceção no meio deixa a despesa aplicada pela metade.
- **Percentual com `Math.round` por pessoa.** Três pessoas com 33,33% arredondam para cima e a soma passa do total. Arredonde para baixo e distribua o resto por uma regra fixa.

## Checklist de domínio

- [ ] Você explica para onde vai o centavo que sobra em cada tipo de divisão
- [ ] Você modela o grupo com saldo líquido e testa o invariante da soma zero
- [ ] Você implementa a simplificação gulosa com dois heaps
- [ ] Você explica por que o guloso não garante o mínimo de transferências

## Para ir além

- [Martin Fowler: Money](https://martinfowler.com/eaaCatalog/money.html): o padrão Money e o problema da alocação de centavos.
- [LeetCode 465: Optimal Account Balancing](https://leetcode.com/problems/optimal-account-balancing/): a versão exata, com backtracking ou bitmask.
- [Awesome LLD: Splitwise](https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/splitwise.md): requisitos e uma solução de referência.
