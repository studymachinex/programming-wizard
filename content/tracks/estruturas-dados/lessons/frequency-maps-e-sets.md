> **Em uma frase:** frequência é o padrão mais rentável do hashing: troque buscas lineares repetidas por um mapa de contagens e o problema cai de O(n²) para O(n) esperado.

## O problema

Você recebe 2 milhões de linhas de log e precisa saber quais IDs mais aparecem e quais aparecem uma única vez. A solução ingênua tem um loop externo e, para cada item, outro loop para contar — O(n²). Com 2 milhões de linhas, isso é cerca de 4×10¹² comparações; mesmo a 1 ns cada, mais de uma hora. Com um mapa de frequências, o trabalho cai para 2 milhões de lookups esperados O(1), na casa de dezenas de milissegundos.

O padrão aparece disfarçado: "detecte duplicatas", "agrupe anagramas", "os k mais frequentes". Todos pedem a mesma coisa — transformar igualdade em consulta indexada. A decisão real é qual estrutura usar e como gerar a chave que representa igualdade.

## Como funciona

O núcleo é um `Map<Chave, Integer>`: uma consulta e um incremento por elemento, O(n) no total. A tabela compara as alternativas para um alfabeto fixo de 26 letras e para chaves arbitrárias.

| Estrutura | Uso ideal | Custo por operação | Memória |
|---|---|---|---|
| `int[26]` | alfabeto pequeno e conhecido | O(1) sem hashing | 104 bytes fixos |
| `HashMap<K,Integer>` | chaves arbitrárias | O(1) esperado | ~48 bytes por entrada |
| `TreeMap<K,Integer>` | precisa de ordem | O(log n) | ~40 bytes por entrada |

Para letras minúsculas, `int[26]` vence: sem boxing, sem `hashCode`, e o array cabe em duas linhas de cache. Para IDs e palavras, use `HashMap`. `TreeMap` só entra quando você precisa iterar em ordem.

`merge(k, 1, Integer::sum)` faz leitura e escrita em uma chamada. `computeIfAbsent(k, x -> new ArrayList<>())` cria a lista só quando a chave não existe. `getOrDefault(k, 0) + 1` é legível, mas não atualiza o mapa — você precisa fazer o `put` de volta.

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

public class Frequencias {

    public static Map<String, Integer> contar(List<String> eventos) {
        Map<String, Integer> frequencia = new HashMap<>();
        for (String evento : eventos) {
            // merge faz uma única busca e trata a ausência da chave
            frequencia.merge(evento, 1, Integer::sum);
        }
        return frequencia;
    }

    public static List<String> topK(Map<String, Integer> frequencia, int k) {
        if (k <= 0) {
            return List.of();
        }
        Comparator<Map.Entry<String, Integer>> criterio =
                Comparator.comparingInt((Map.Entry<String, Integer> e) -> e.getValue())
                        .thenComparing(Map.Entry::getKey);

        // min-heap de tamanho k: a raiz é o candidato mais fraco
        PriorityQueue<Map.Entry<String, Integer>> heap = new PriorityQueue<>(criterio);
        for (Map.Entry<String, Integer> entrada : frequencia.entrySet()) {
            heap.offer(entrada);
            if (heap.size() > k) {
                heap.poll();
            }
        }

        List<String> resultado = new ArrayList<>(heap.size());
        while (!heap.isEmpty()) {
            resultado.add(heap.poll().getKey());
        }
        Collections.reverse(resultado);
        return resultado;
    }

    public static boolean contemDuplicata(List<String> valores) {
        Set<String> vistos = new HashSet<>();
        for (String valor : valores) {
            if (!vistos.add(valor)) { // add retorna false se já existia
                return true;
            }
        }
        return false;
    }
}
```

O `topK` com min-heap custa O(n log k) e usa O(k) de memória, contra O(n log n) e O(n) ao ordenar tudo. Para n = 2 milhões e k = 10, são ~13 milhões de comparações contra ~42 milhões. Se k for próximo de n, ordenar volta a ser competitivo.

Para agrupar anagramas, a chave precisa ser canônica. Ordenar as letras custa O(L log L) por palavra; contar as 26 letras custa O(L) e gera uma chave mais barata. O código usa a contagem e `computeIfAbsent` para criar os grupos.

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class AgrupadorAnagramas {

    public static List<List<String>> agrupar(List<String> palavras) {
        Map<String, List<String>> grupos = new HashMap<>();
        for (String palavra : palavras) {
            grupos.computeIfAbsent(assinatura(palavra), ignorado -> new ArrayList<>())
                    .add(palavra);
        }
        return new ArrayList<>(grupos.values());
    }

    private static String assinatura(String palavra) {
        int[] contagem = new int[26];
        for (int i = 0; i < palavra.length(); i++) {
            char c = palavra.charAt(i);
            if (c < 'a' || c > 'z') {
                throw new IllegalArgumentException("use apenas a-z: " + palavra);
            }
            contagem[c - 'a']++;
        }
        StringBuilder chave = new StringBuilder(52);
        for (int n : contagem) {
            chave.append(n).append('#'); // separador evita colisão entre contagens
        }
        return chave.toString();
    }
}
```

Sem o separador, contagens `[1, 12]` e `[11, 2]` gerariam a mesma string. O custo total é O(n·L), com uma `String` de ~52 caracteres por palavra; para volumes enormes, uma chave binária economiza alocação.

## Na prática

Use `int[]` quando o domínio for pequeno e fechado: letras, dígitos, notas de 0 a 10, status de um enum. Use `HashMap` quando as chaves vierem de fora e o domínio for desconhecido.Cuidado com o tipo do contador: `Integer` estoura em 2,1 bilhões, então use `Long` em escala. `ConcurrentHashMap.merge` é atômico por chave; `get` seguido de `put` em um `HashMap` comum perde atualizações. E não confie na ordem de iteração: se a saída precisa ser determinística, ordene no final.

## Armadilhas comuns

- **Usar `getOrDefault` e esquecer o `put`.** A contagem nunca sai de zero; prefira `merge` ou `compute`.
- **Usar objeto mutável como chave.** Se um campo do `hashCode` mudar após a inserção, a entrada fica no bucket errado e "desaparece".
- **Comparar `Integer` com `==`.** Acima de 127, a comparação vira identidade; use `equals` ou `intValue()`.

## Para ir além

- [Oracle — Map (Java 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html): contrato de `merge`, `compute` e `computeIfAbsent`.
- [LeetCode — Group Anagrams](https://leetcode.com/problems/group-anagrams/): pratique a chave canônica com restrições reais.
- [LeetCode — Top K Frequent Elements](https://leetcode.com/problems/top-k-frequent-elements/): compare heap, ordenação e quickselect.
