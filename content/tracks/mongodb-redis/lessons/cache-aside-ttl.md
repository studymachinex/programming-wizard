> **Em uma frase:** cache-aside é fácil de escrever e difícil de acertar: a ordem da escrita, o TTL e a invalidação decidem se o cache ajuda ou mente.

O padrão é simples: leia do cache; se não houver, leia do banco, grave no cache e retorne. Em produção, surgem corridas, chaves quentes e expirações simultâneas. Cada um tem uma mitigação específica.

## O problema

Um produto tem 10 mil req/s. O banco responde em 20 ms; o cache em 1 ms. Sem cache, o banco satura. Com cache mal invalidado, o usuário vê preço antigo depois de atualizar. Com TTL uniforme, milhares de chaves expiram juntas e o banco recebe uma avalanche.

## Como funciona

```java
public Produto buscar(long id) {
    var chave = "produto:" + id;
    var cached = redis.get(chave);
    if (cached != null) return json.readValue(cached, Produto.class);

    var produto = repo.findById(id).orElseThrow();
    redis.setex(chave, 300 + ThreadLocalRandom.current().nextInt(60),
        json.writeValueAsString(produto));
    return produto;
}

@Transactional
public void atualizar(Produto p) {
    repo.save(p);
    afterCommit(() -> redis.del("produto:" + p.id()));
}
```

Invalide **depois** do commit. Invalidar antes abre janela para um leitor repopular com dado antigo. Para concorrência, use `SET NX` como lock curto e não confie em invalidação síncrona entre processos.

Problemas clássicos:

- **Penetration:** chaves inexistentes sempre vão ao banco. Cacheie `null` com TTL curto ou use Bloom filter.
- **Stampede:** muitas requisições recomputam a mesma chave. Use single-flight/lock.
- **Avalanche:** muitas chaves expiram juntas. Adicione jitter ao TTL.

## Na prática

Escolha TTL pelo dado: preço, 1 min; catálogo, 10 min; configuração, 1 h. Sempre tenha um limite máximo e uma métrica de hit ratio.

Para escritas, compare: write-through (cache e banco na mesma operação), write-behind (assíncrono, risco de perda) e invalidação. A maioria dos sistemas usa cache-aside + invalidate.

Em Java, use Lettuce, Redisson ou o Redis Client do Quarkus com serialização explícita. Evite serialização Java nativa; prefira JSON ou Protobuf.

## Armadilhas comuns

- Cachear dentro da transação antes do commit.
- TTL infinito e invalidação esquecida.
- Cachear erro/500.
- Chave sem namespace e colisão entre serviços.
- Não monitorar hit ratio e latência do Redis.

## Checklist de domínio

- [ ] Implemento cache-aside com TTL e jitter.
- [ ] Invalido após commit.
- [ ] Mitigo penetration, stampede e avalanche.
- [ ] Sei comparar write-through e write-behind.
- [ ] Meço hit ratio.

## Para ir além

Leia o padrão cache-aside e o guia de eviction do Redis. Depois simule 1.000 requisições concorrentes na mesma chave e prove que só uma vai ao banco.
