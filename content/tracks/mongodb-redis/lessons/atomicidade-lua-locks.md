> **Em uma frase:** Lua no Redis executa comandos como uma unidade atômica — mas atomicidade não é isolamento mágico, e um lock sem fencing pode proteger o processo errado.

Scripts Lua resolvem check-and-set, rate limiting e liberação segura de locks sem race entre comandos. `MULTI/EXEC` também agrupa, mas não permite ler o resultado de um comando para decidir o próximo. Lua permite.

## O problema

Um lock com `SET NX PX` e `DEL` ingênuo pode apagar o lock de outro dono se o TTL expirar e outro cliente adquirir. Um rate limiter com `INCR` e `EXPIRE` separados pode deixar chave sem TTL se o processo cair entre os dois. A operação precisa ser atômica.

## Como funciona

Rate limiter por janela fixa:

```java
private static final String SCRIPT = """
    local atual = redis.call('INCR', KEYS[1])
    if atual == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    if atual > tonumber(ARGV[2]) then
      return 0
    end
    return 1
    """;

boolean permitir(String usuario) {
    var chave = "rl:" + usuario + ":" + (System.currentTimeMillis() / 60000);
    var result = redis.eval(SCRIPT, List.of(chave),
        List.of("60000", "100"));
    return Long.valueOf(1).equals(result);
}
```

Lock com token e liberação segura:

```java
String token = UUID.randomUUID().toString();
boolean adquiriu = redis.set("lock:pedido:42", token,
    SetArgs.Builder.nx().px(30_000));
if (!adquiriu) return false;

String script = """
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
    """;
redis.eval(script, List.of("lock:pedido:42"), List.of(token));
```

## Na prática

Mantenha scripts pequenos e com poucas chaves. Em Redis Cluster, todas as chaves precisam estar no mesmo slot; use hash tags `{pedido:42}:lock` e `{pedido:42}:estado`.

Locks distribuídos não eliminam a necessidade de idempotência. Sob partição, o cliente pode acreditar que ainda detém o lock. Use fencing token (um número monotônico) no recurso protegido ou projete operações idempotentes.

Rate limiting: janela fixa permite rajada na virada; sliding window log é preciso e caro; token bucket com Lua é o equilíbrio comum.

## Armadilhas comuns

- `DEL` sem comparar token.
- Script com `KEYS` dinâmicas criadas dentro do Lua (má prática e quebra cluster).
- Lock sem TTL: deadlock eterno.
- TTL menor que o tempo de processamento: dois donos.
- Confiar no lock para consistência forte.

## Checklist de domínio

- [ ] Escrevo scripts Lua atômicos e idempotentes.
- [ ] Libero lock comparando token.
- [ ] Sei usar hash tags no Cluster.
- [ ] Entendo as limitações de Redlock.
- [ ] Implemento rate limiter com janela correta.

## Para ir além

Leia a documentação de scripting do Redis e a crítica de Martin Kleppmann ao Redlock. Depois implemente um lock com fencing e teste com expiração.
