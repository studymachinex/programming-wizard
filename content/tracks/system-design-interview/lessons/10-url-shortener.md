> **Em uma frase:** um encurtador é um banco de chave-valor com um gerador de IDs único e um caminho de leitura tão curto que o analytics não pode encostar nele.

## O problema

Você precisa transformar uma URL longa em um código curto, guardar a associação para sempre e redirecionar em menos de 50 ms. Parece simples até colocar números: 100 milhões de URLs novas por dia, dez leituras para cada escrita, links que não podem colidir, clientes que personalizam o alias e um painel que mostra cliques por país. Se o analytics entrar no caminho do redirect, cada clique vira uma escrita e o p99 explode.

O entrevistador vai testar três coisas: como você gera códigos sem colisão, como garante leitura rápida e como separa o caminho crítico do resto. Quem responde "uso um hash da URL" precisa explicar colisões, tamanho e o que fazer quando duas URLs diferentes geram o mesmo código. Quem responde "uso auto-incremento" precisa explicar enumeração e escala.

## Como funciona

### Requisitos e capacidade

Funcionais: criar link curto (com alias opcional), redirecionar, expirar, ver estatísticas básicas. Não-funcionais: redirect p99 de 30 ms, criação p99 de 150 ms, 99,99% de disponibilidade na leitura, durabilidade do mapeamento. Fora de escopo: interface, cobrança, detecção de malware em tempo real (pode ser assíncrona).

Com 100M escritas/dia: 1.160/s na média, 5.000/s no pico de 4x. Leituras 10x: 11.600/s na média, 50.000/s no pico. Cada registro tem 500 bytes; 50 GB/dia, 18 TB/ano. Com replication factor 3 e índice, aproxime 50 TB/ano. O cache dos links quentes (20% do tráfego) cabe em dezenas de GB.

### API

| Método | Rota | Entrada | Saída |
|---|---|---|---|
| POST | `/v1/urls` | `longUrl`, `customAlias?`, `expiresAt?` | `code`, `shortUrl`, `expiresAt` |
| GET | `/{code}` | código | `302 Location` |
| DELETE | `/v1/urls/{code}` | código + auth | `204` |
| GET | `/v1/urls/{code}/stats` | código + período | contagens agregadas |

### Geração de código

| Estratégia | Como funciona | Custo |
|---|---|---|
| Hash da URL | MD5/SHA truncado em base62 | Colisão exige retry e lookup |
| Aleatório | 7 caracteres gerados | Colisão rara, mas precisa checar |
| Contador + base62 | ID sequencial convertido | Previsível/enumerável |
| Snowflake + base62 | ID temporal distribuído | Mais bits, código maior |
| Key generation service | Serviço pré-gera e entrega ranges | Complexidade operacional |

Com 62 caracteres e 7 posições, há 62⁷ ≈ 3,5 trilhões de códigos. A 100M/dia, isso é quase 100 anos sem esgotar, mas é finito. Um código de 8 posições dá 218 trilhões e custa um caractere a mais. Se você usar contador, embaralhe ou use um offset secreto para evitar que alguém incremente a URL e descubra links de outros usuários.

A abordagem robusta é alocar **ranges** de IDs por instância. Um serviço central entrega o bloco `[1.000.000, 1.001.000)` para o pod A, `[1.001.000, 1.002.000)` para o B. Cada pod gera localmente, sem chamada por requisição. Se um pod morre, o range é desperdiçado, não duplicado. O código é `base62(id)`, com um offset ou permutação para não ser sequencial óbvio.

```java
public class Base62 {

    private static final String ALPHABET =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    public static String encode(long value) {
        if (value < 0) throw new IllegalArgumentException("valor negativo");
        if (value == 0) return "0";
        StringBuilder out = new StringBuilder();
        while (value > 0) {
            int digit = (int) (value % 62);
            out.append(ALPHABET.charAt(digit));
            value /= 62;
        }
        return out.reverse().toString();
    }

    public static long decode(String code) {
        long value = 0;
        for (int i = 0; i < code.length(); i++) {
            int digit = ALPHABET.indexOf(code.charAt(i));
            if (digit < 0) throw new IllegalArgumentException("caractere inválido: " + code.charAt(i));
            value = value * 62 + digit;
        }
        return value;
    }

    public static void main(String[] args) {
        long id = 123_456_789L;
        String code = encode(id);
        System.out.printf("id=%d code=%s volta=%d%n", id, code, decode(code));
        System.out.println("combinações em 7 chars: " + (long) Math.pow(62, 7));
    }
}
```

```java
import java.util.concurrent.atomic.AtomicLong;

public class RangeAllocator {

    public interface CentralCounter {
        long reserve(int size);
    }

    private final CentralCounter central;
    private final int rangeSize;
    private final AtomicLong next = new AtomicLong(-1);
    private long limit = -1;

    public RangeAllocator(CentralCounter central, int rangeSize) {
        this.central = central;
        this.rangeSize = rangeSize;
    }

    public synchronized long nextId() {
        if (next.get() < 0 || next.get() >= limit) {
            long start = central.reserve(rangeSize);
            next.set(start);
            limit = start + rangeSize;
        }
        return next.getAndIncrement();
    }

    public static void main(String[] args) {
        AtomicLong dbCounter = new AtomicLong(1_000_000);
        var allocator = new RangeAllocator(size -> dbCounter.getAndAdd(size), 1_000);
        for (int i = 0; i < 3; i++) {
            System.out.println(allocator.nextId());
        }
    }
}
```

### Leitura e armazenamento

O redirect precisa de uma leitura por chave. Um KV distribuído (DynamoDB, Cassandra) ou Postgres com `code` como PK resolvem. O KV tende a escalar melhor para 50 mil leituras/s; o SQL facilita relatórios e transações. Com 50 TB/ano, um único Postgres não é confortável, mas 12 shards por hash de `code` cabem. A escolha depende do custo e da operação que você já tem.

Cache: os links mais acessados ficam em Redis com TTL. Um link viral pode receber 10 mil req/s; sem cache, o shard derrete. Cache negativo para códigos inexistentes evita que scanners aleatórios consultem o banco. Se o link expira, remova do cache e responda `410 Gone`.

Redirect: `302 Found` por padrão, porque permite contabilizar cliques e mudar o destino. `301 Moved Permanently` reduz carga, mas browsers e CDNs cacheiam e você perde cliques futuros. Para links pagos, 302 é obrigatório. Para links permanentes sem analytics, 301 é aceitável.

## Na prática

Fluxo de criação: valida URL e alias, reserva ID, gera código, tenta inserir com `code` como chave única. Se o alias já existe, retorna `409`. Grava `long_url`, dono, expiração e status. A resposta sai em 100 ms. Um evento `url.created` vai para a fila de moderação, que marca links maliciosos de forma assíncrona.

Fluxo de leitura: `GET /{code}` consulta Redis. No hit, responde 302 imediatamente. No miss, lê o KV/SQL, grava no cache com TTL e responde. O clique é publicado em Kafka de forma assíncrona (ou amostrado) e o agregador atualiza estatísticas a cada minuto. O redirect nunca espera o analytics.

Expiração: um job varre links vencidos e marca `status = EXPIRED`; o cache usa TTL alinhado. Não delete fisicamente na hora; mantenha por alguns dias para responder `410` em vez de `404` e evitar que o código seja reutilizado por engano.

Abuso: qualquer pessoa pode criar links para phishing. Use reputação de domínio, scanning assíncrono e bloqueio por denúncia. Não faça fetch da URL no caminho da criação — SSRF é um risco real, e um link para `169.254.169.254` pode virar acesso a metadata da cloud.

## Armadilhas comuns

- **Hash sem tratar colisão.** Duas URLs diferentes podem gerar o mesmo código; você precisa de retry e de um teste de unicidade real no banco.
- **Código sequencial exposto.** Permite enumerar links e vazar dados. Use offset secreto, permutação ou aleatoriedade.
- **301 com analytics.** O browser pode nunca mais consultar seu servidor; os cliques somem.
- **Analytics no caminho crítico.** Uma escrita por clique derruba o p99 e cria um banco de eventos gigante. Faça assíncrono.
- **Cachear 404 para sempre.** Um link criado depois pode ficar inacessível. Use TTL curto no cache negativo.
- **Esquecer expiração e exclusão.** Links antigos continuam servindo conteúdo que deveria ter saído, e o storage cresce sem limite.
- **Open redirect.** Validar esquema e domínio evita que seu domínio confiável seja usado em phishing.

## Checklist de domínio

- [ ] Você dimensiona escritas, leituras, storage e cache com números
- [ ] Você compara hash, aleatório e contador com seus riscos
- [ ] Você implementa base62 e alocação de ranges sem colisão
- [ ] Você separa redirect de analytics e explica 301 versus 302
- [ ] Você trata expiração, abuso e cache negativo

## Para ir além

- [System Design Primer — Pastebin](https://github.com/donnemartin/system-design-primer/blob/master/solutions/system_design/pastebin/README.md) — design irmão, com foco em storage e expiração.
- [HTTP Redirections — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections) — semântica de 301, 302, 307 e 308.
- [Base62](https://en.wikipedia.org/wiki/Base62) — alfabeto e conversão usados em short URLs.
- [ByteByteGo Blog](https://blog.bytebytego.com/) — variações comentadas desse design e de outros clássicos.
