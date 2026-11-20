> **Em uma frase:** `Map` associa chaves únicas a valores com busca média O(1), mas `get` ausente devolve `null` e alterar o mapa durante a iteração quebra o iterador.

## O problema

Um relatório de acessos contava visitantes por dia com `map.get(dia) + 1`. No primeiro dia sem acesso, `get` devolveu `null`, o auto-unboxing lançou `NullPointerException` e o job morreu. O teste passava porque sempre havia pelo menos um acesso.

Map é a estrutura certa para contagem, índice, cache e agrupamento. Mas o contrato de `null`, a ordem de iteração e a diferença entre `HashMap`, `LinkedHashMap` e `TreeMap` decidem se o código é robusto ou apenas funciona no cenário feliz.

## Como funciona

`Map` não estende `Collection`. É um contrato de associação: cada chave aparece no máximo uma vez. `HashMap` usa a mesma ideia de buckets do `HashSet`: `hashCode` da chave, máscara para achar o índice, `equals` para comparar. Capacidade inicial 16, fator de carga 0,75 e treeificação de buckets com muitas colisões.

`HashMap` aceita uma chave `null` e valores `null`. `TreeMap` ordena pelas chaves e não aceita `null` como chave (a menos que o comparator trate). `LinkedHashMap` preserva a ordem de inserção e pode ser configurado para ordem de acesso, útil para implementar LRU.

```java
import java.util.HashMap;
import java.util.Map;

public class ContagemPalavras {
    public static void main(String[] args) {
        String texto = "java e jvm, java e streams";
        Map<String, Integer> frequencia = new HashMap<>();

        for (String palavra : texto.split("[^\\p{L}]+")) {
            frequencia.merge(palavra.toLowerCase(), 1, Integer::sum);
        }

        System.out.println(frequencia); // {java=2, e=2, jvm=1, streams=1}

        String palavraTop = null;
        int max = 0;
        for (Map.Entry<String, Integer> entrada : frequencia.entrySet()) {
            if (entrada.getValue() > max) {
                max = entrada.getValue();
                palavraTop = entrada.getKey();
            }
        }
        System.out.println(palavraTop + "=" + max); // java=2
    }
}
```

`merge(chave, 1, Integer::sum)` é a forma idiomática de contar: se a chave não existe, insere 1; se existe, aplica a função ao valor atual e ao novo. Evita o `null` check e uma ida extra ao mapa.

## Na prática

`computeIfAbsent` é ideal para agrupar. Ele só executa a função quando a chave está ausente e devolve o valor existente ou recém-criado:

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class Agrupamento {
    public static void main(String[] args) {
        List<String> emails = List.of(
            "ana@empresa.com", "bruno@empresa.com", "carla@escola.org"
        );

        Map<String, List<String>> porDominio = new TreeMap<>();
        for (String email : emails) {
            String dominio = email.substring(email.indexOf('@') + 1);
            porDominio.computeIfAbsent(dominio, d -> new ArrayList<>()).add(email);
        }
        System.out.println(porDominio);
        // {empresa.com=[ana@empresa.com, bruno@empresa.com], escola.org=[carla@escola.org]}

        Map<String, Integer> estoque = new HashMap<>(Map.of("teclado", 10));
        estoque.merge("teclado", -3, Integer::sum); // 7
        estoque.merge("mouse", 5, Integer::sum);    // insere 5
        System.out.println(estoque.getOrDefault("monitor", 0)); // 0
    }
}
```

`getOrDefault` distingue "ausente" de "presente com valor zero" apenas quando zero é o padrão. Se `null` for um valor válido, use `containsKey`. `Map.of` cria um mapa imutável de até 10 pares; para mais, `Map.ofEntries`.

A iteração pode ser sobre `entrySet`, `keySet` ou `values`. `entrySet` evita uma busca por chave quando você precisa dos dois. As coleções devolvidas são views: remover do mapa reflete nelas, e vice-versa.

Durante um for-each, remover diretamente do mapa lança `ConcurrentModificationException`, mesmo em uma thread. Use `iterator.remove()`, `map.remove(key)` fora da iteração ou `entrySet().removeIf(...)`. O fail-fast é uma proteção, não uma garantia de concorrência: `HashMap` não é thread-safe.

## Armadilhas comuns

- **`get` seguido de operação sem checar `null`.** `map.get(k) + 1` explode na primeira ausência. Use `merge`, `getOrDefault` ou `computeIfAbsent`.
- **Depender da ordem de iteração do `HashMap`.** Ela não é especificada e pode mudar com o número de elementos. Use `LinkedHashMap` ou `TreeMap` quando a ordem for requisito.
- **Usar chave mutável.** Alterar um campo do `hashCode` depois do `put` torna a entrada inalcançável.
- **Confundir `HashMap` com `ConcurrentHashMap`.** O primeiro não suporta escrita concorrente; o segundo não aceita `null` e tem operações atômicas como `compute`.

## Checklist de domínio

- [ ] Você conta e agrupa com `merge` e `computeIfAbsent`
- [ ] Você escolhe `HashMap`, `LinkedHashMap` ou `TreeMap` pela ordem que precisa
- [ ] Você remove durante a iteração sem quebrar o iterador
- [ ] Você sabe por que chaves mutáveis são perigosas

## Para ir além

- [Java SE 21 API — Map](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html): métodos default e contrato completo.
- [Baeldung — Java HashMap](https://www.baeldung.com/java-hashmap): funcionamento interno, capacidade e colisões.
- [dev.java — The Collections Framework](https://dev.java/learn/collections/): escolha entre implementações de mapa.
