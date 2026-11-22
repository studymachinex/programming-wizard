> **Em uma frase:** ordenação topológica é a resposta para "em que ordem posso fazer isso sem violar dependências?" — e detecta ciclos de graça.

Builds, migrations, cursos, tarefas de workflow e resolução de dependências compartilham o mesmo problema: um grafo dirigido acíclico (DAG) cujos nós só podem ser processados depois dos predecessores. Kahn e DFS resolvem, com trade-offs diferentes.

## O problema

Um pipeline tem etapas que dependem de outras. Se você executa na ordem de chegada, uma etapa roda antes do pré-requisito. Se existe um ciclo, o pipeline nunca termina. A ordenação topológica produz uma sequência válida ou prova que ela não existe.

## Como funciona

**Kahn (BFS):** calcule o grau de entrada. Enfileire nós com grau zero. Remova-os, decrementando os vizinhos; quando um vizinho chega a zero, enfileire. Se a saída tiver menos nós que o grafo, há ciclo.

```java
static List<Integer> topoKahn(int n, List<List<Integer>> adj) {
    int[] grau = new int[n];
    for (var vizinhos : adj) for (int v : vizinhos) grau[v]++;

    var fila = new ArrayDeque<Integer>();
    for (int i = 0; i < n; i++) if (grau[i] == 0) fila.add(i);

    var ordem = new ArrayList<Integer>(n);
    while (!fila.isEmpty()) {
        int u = fila.poll();
        ordem.add(u);
        for (int v : adj.get(u)) {
            if (--grau[v] == 0) fila.add(v);
        }
    }
    return ordem.size() == n ? ordem : List.of(); // vazio = ciclo
}
```

**DFS com três cores:** 0 = não visitado, 1 = em pilha, 2 = concluído. Se encontrar um nó cinza, há ciclo. Adicione ao resultado no pós-ordem e inverta.

```java
static boolean dfs(int u, List<List<Integer>> adj, int[] cor, Deque<Integer> ordem) {
    cor[u] = 1;
    for (int v : adj.get(u)) {
        if (cor[v] == 1) return false;
        if (cor[v] == 0 && !dfs(v, adj, cor, ordem)) return false;
    }
    cor[u] = 2;
    ordem.push(u);
    return true;
}
```

## Na prática

Kahn é mais fácil de paralelizar por níveis: todos os nós com grau zero em um nível podem rodar juntos. DFS é conveniente quando você já precisa de pós-ordem para outro fim.

Em builds, a ordem não é única; use desempate estável (nome, prioridade) para reprodutibilidade. Em migrations, versione o grafo e detecte ciclos antes de aplicar. Em cursos, o mesmo algoritmo gera um plano de estudos.

## Armadilhas comuns

- Esquecer de verificar se todos os nós foram processados (ciclo silencioso).
- Grafo com nós isolados: precisam entrar na ordem.
- Recursão DFS profunda estourando a pilha em grafos grandes.
- Ordem não determinística quebrando cache de build.
- Confundir grau de entrada com grau de saída.

## Para ir além

Leia o capítulo de topological sort em cp-algorithms.com. Depois modele as dependências do seu projeto e gere a ordem de build.
