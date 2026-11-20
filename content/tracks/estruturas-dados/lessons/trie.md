> **Em uma frase:** uma trie troca memória por previsibilidade: cada caractere desce um nível, então buscar uma palavra de tamanho L custa O(L), independentemente de haver 10 ou 10 milhões de palavras.

## O problema

Um campo de busca precisa sugerir palavras enquanto o usuário digita "car". Um `HashSet` responde "carro existe?" em O(1), mas não lista tudo que começa com "car" sem varrer todas as chaves. Um array ordenado permite busca binária do prefixo em O(L log n), mas inserir custa O(n). A trie resolve os dois lados: busca, inserção e prefixo em O(L), com percurso ordenado das palavras que compartilham o prefixo.

## Como funciona

Cada nó representa um prefixo e tem até 26 filhos, um por letra. A raiz representa a string vazia; descer por `c`, `a`, `r` chega ao nó do prefixo "car". Um booleano `fim` marca onde termina uma palavra — sem ele, "car" seria indistinguível de um prefixo de "carta". Os nós não guardam a string inteira; a palavra é o caminho da raiz até um nó com `fim = true`.

| Operação | Custo | Por quê |
|---|---|---|
| `inserir` | O(L) | um nó por caractere |
| `contem` | O(L) | desce L níveis e checa `fim` |
| `comecaCom` | O(L) | desce L níveis, sem exigir `fim` |
| `autocomplete` | O(L + saída) | DFS a partir do nó do prefixo |

O custo não depende do número de palavras armazenadas, apenas do tamanho da chave e da saída. O preço aparece na memória: com array fixo de 26 referências, cada nó ocupa ~128 bytes, mesmo com um único filho. Uma base com 100 mil palavras de 10 letras pode chegar perto de 1 milhão de nós e ~128 MB — viável em servidor, caro em dispositivo embarcado.

```java
import java.util.ArrayList;
import java.util.List;

public class Trie {

    private static final class No {
        final No[] filhos = new No[26];
        boolean fim;
    }

    private final No raiz = new No();

    public void inserir(String palavra) {
        No atual = raiz;
        for (int i = 0; i < palavra.length(); i++) {
            int indice = indice(palavra.charAt(i));
            if (atual.filhos[indice] == null) {
                atual.filhos[indice] = new No();
            }
            atual = atual.filhos[indice];
        }
        atual.fim = true;
    }

    public boolean contem(String palavra) {
        No no = buscarNo(palavra);
        return no != null && no.fim;
    }

    public boolean comecaCom(String prefixo) {
        return buscarNo(prefixo) != null;
    }

    public List<String> autocomplete(String prefixo, int limite) {
        List<String> saida = new ArrayList<>();
        No no = buscarNo(prefixo);
        if (no == null || limite <= 0) {
            return saida;
        }
        coletar(no, new StringBuilder(prefixo), saida, limite);
        return saida;
    }

    private void coletar(No no, StringBuilder atual, List<String> saida, int limite) {
        if (saida.size() >= limite) {
            return;
        }
        if (no.fim) {
            saida.add(atual.toString());
        }
        for (int i = 0; i < 26; i++) {
            if (no.filhos[i] != null) {
                atual.append((char) ('a' + i));
                coletar(no.filhos[i], atual, saida, limite);
                atual.deleteCharAt(atual.length() - 1);
            }
        }
    }

    public boolean remover(String palavra) {
        return remover(raiz, palavra, 0);
    }

    private boolean remover(No no, String palavra, int profundidade) {
        if (profundidade == palavra.length()) {
            if (!no.fim) {
                return false;
            }
            no.fim = false;
            return semFilhos(no);
        }
        int indice = indice(palavra.charAt(profundidade));
        No filho = no.filhos[indice];
        if (filho == null) {
            return false;
        }
        boolean podar = remover(filho, palavra, profundidade + 1);
        if (podar) {
            no.filhos[indice] = null;
        }
        return !no.fim && semFilhos(no);
    }

    private boolean semFilhos(No no) {
        for (No filho : no.filhos) {
            if (filho != null) {
                return false;
            }
        }
        return true;
    }

    private No buscarNo(String texto) {
        No atual = raiz;
        for (int i = 0; i < texto.length(); i++) {
            int indice = indice(texto.charAt(i));
            if (atual.filhos[indice] == null) {
                return null;
            }
            atual = atual.filhos[indice];
        }
        return atual;
    }

    private static int indice(char c) {
        if (c < 'a' || c > 'z') {
            throw new IllegalArgumentException("apenas a-z: " + c);
        }
        return c - 'a';
    }
}
```

A remoção é a parte que mais gente esquece. Desmarcar `fim` remove a palavra, mas o nó continua ocupando espaço; a versão recursiva devolve `true` quando o nó ficou sem filhos e sem palavra, e o pai corta a referência. Sem essa poda, um dicionário com milhões de inserções e remoções cresce para sempre.

```java
import java.util.List;

public class DemoTrie {

    public static void main(String[] args) {
        Trie trie = new Trie();
        for (String palavra : List.of("casa", "carro", "carta", "cama", "dado")) {
            trie.inserir(palavra);
        }

        System.out.println(trie.contem("casa"));     // true
        System.out.println(trie.contem("cas"));      // false: prefixo, não palavra
        System.out.println(trie.comecaCom("car"));   // true
        System.out.println(trie.autocomplete("ca", 3)); // [cama, carro, carta]

        System.out.println(trie.remover("carta"));   // true
        System.out.println(trie.autocomplete("car", 10)); // [carro]
        System.out.println(trie.contem("carta"));    // false
    }
}
```

## Na prática

Use trie quando a pergunta envolve prefixos: autocomplete, corretor ortográfico, roteamento por prefixo de IP (versão binária), indexação de termos e busca por curinga. Para um conjunto estático e pequeno, um array ordenado com busca binária é mais simples e mais cache-friendly. Para dados em disco, um B-tree ou índice invertido costuma vencer.

A memória é o fator decisivo. Se o alfabeto é grande ou os nós são esparsos, um array de 26 não serve; use um mapa de filhos ou lista de arestas. Para reduzir nós, uma **radix tree** comprime cadeias de um único filho em arestas com strings; uma **DAWG** compartilha sufixos. O Lucene usa um FST para armazenar termos com muito menos memória que uma trie explícita.

## Armadilhas comuns

- **Esquecer o `fim`.** A palavra vira prefixo e `contem` aceita strings que nunca foram inseridas.
- **Indexar sem validar o caractere.** `c - 'a'` com maiúscula ou acento gera índice inválido; normalize antes ou use um mapa.
- **Fazer autocomplete sem limite.** Um prefixo vazio em um dicionário grande materializa milhões de strings; pagine ou limite.
- **Ignorar a memória.** 1 milhão de nós com array de 26 pode passar de 100 MB; meça antes de embarcar em um serviço com muitos dicionários.

## Checklist de domínio

- [ ] Você implementa `inserir`, `contem` e `comecaCom` do zero
- [ ] Você explica por que `fim` é necessário
- [ ] Você coleta autocomplete com DFS e `StringBuilder`
- [ ] Você remove podando nós sem filhos
- [ ] Você estima memória e escolhe entre array, mapa e radix tree

## Para ir além

- [LeetCode — Implement Trie (Prefix Tree)](https://leetcode.com/problems/implement-trie-prefix-tree/): o exercício canônico.
- [LeetCode — Design Add and Search Words Data Structure](https://leetcode.com/problems/design-add-and-search-words-data-structure/): trie com curinga.
- [LeetCode — Word Search II](https://leetcode.com/problems/word-search-ii/): trie aplicada a busca em grade.
