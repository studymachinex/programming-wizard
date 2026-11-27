> **Em uma frase:** o DNS traduz nomes em registros (A, AAAA, CNAME, NS, MX); o resolver recursivo segue a cadeia de CNAMEs por conta própria e guarda cada registro com o seu TTL, que desce com o tempo, e também guarda a ausência de um nome (NXDOMAIN) pelo TTL negativo do SOA; a JVM ainda tem um cache próprio por cima disso tudo.

## O problema

O time sobe `api.loja.com.br`, atualiza o DNS e dispara o deploy. Dez minutos depois, metade dos pods ainda recebe `UnknownHostException`, e quem testa da máquina local vê o nome resolvendo normalmente. Na semana seguinte, uma migração de IP "com TTL de 60 s" continua mandando tráfego ao servidor antigo por quase uma hora.

Os dois incidentes vêm de **caches em camadas**: o do resolver, o do sistema operacional e o da JVM, cada um com sua regra. Entender o TTL, o cache negativo e a cadeia de CNAME evita as duas surpresas.

## Como funciona

### Registros

Cada nome tem um conjunto de **registros**; cada tipo responde a uma pergunta:

| Tipo | Significado | Exemplo |
|---|---|---|
| **A** | Endereço IPv4 | `loja.com.br. 300 IN A 203.0.113.10` |
| **AAAA** | Endereço IPv6 | `loja.com.br. 300 IN AAAA 2001:db8::10` |
| **CNAME** | Este nome é um apelido de outro | `www.loja.com.br. 600 IN CNAME loja.cdn-exemplo.net.` |
| **NS** | Servidores autoritativos da zona | `loja.com.br. 3600 IN NS ns1.loja.com.br.` |
| **MX** | Quem recebe o e-mail, com prioridade | `loja.com.br. 3600 IN MX 10 mx.loja.com.br.` |

Um nome com **CNAME não pode ter outros registros**. Por isso o **domínio raiz** (o *apex*, `loja.com.br`), que precisa de NS e MX, não pode ser CNAME. Provedores oferecem ALIAS/ANAME, que resolvem o alvo no servidor e entregam um A.

### Cadeia de CNAME

O resolver recursivo faz o trabalho: pergunta `www.loja.com.br`, recebe um CNAME para `loja.cdn-exemplo.net`, pergunta por ele (possivelmente a outro servidor autoritativo), recebe outro CNAME para `edge.cdn-exemplo.net` e só então o **A**. São três consultas de rede, uma por elo, e o cliente recebe a cadeia inteira. Resolvers limitam o número de saltos e **detectam laços** (a CNAME b, b CNAME a).

### TTL por registro, e decrescente

Cada registro vem com um **TTL** em segundos. O resolver guarda cada um **com o seu prazo**. Quando o cliente pergunta de novo, recebe o TTL **restante**, e não o original: 580 s, depois 500 s, e assim por diante. Quando um registro vence, só **ele** é perguntado de novo: se o `A` (60 s) expirou mas os CNAMEs (600 e 300 s) ainda valem, a consulta é uma, e não três.

O TTL efetivo de uma resposta é o **menor da cadeia**. Um CNAME de 10 minutos apontando para um A de 60 s dá, na prática, 60 s.

### Cache negativo

Quando o nome não existe, o autoritativo responde **NXDOMAIN** e inclui o registro **SOA** da zona. O último campo do SOA (*minimum*), limitado pelo TTL do próprio SOA, é o **TTL negativo** (RFC 2308). O resolver guarda a **ausência** por esse tempo. Isso protege os servidores de uma enxurrada de consultas a nomes inexistentes, mas tem um efeito colateral: **criar um registro logo depois de alguém consultar o nome** não adianta, porque o resolver continua dizendo NXDOMAIN até o TTL negativo acabar.

### UDP, TCP e o tamanho das respostas

O DNS usa **UDP na porta 53** (aula 9): uma consulta, uma resposta, sem handshake. Se a resposta não cabe (o resolvedor sinaliza com o bit TC, *truncated*), o cliente **repete a consulta por TCP**. Com EDNS0, os resolvers anunciam um tamanho de UDP de cerca de 1.232 bytes, para caber sem fragmentar. Também por isso as respostas grandes (muitos registros, DNSSEC) são o motivo para o DNS por TCP ser comum.

### Nomes relativos e search domains

No `resolv.conf`, a linha `search` e a opção `ndots` fazem o cliente tentar vários sufixos antes do nome absoluto. Em Kubernetes, o padrão `ndots:5` faz `api.externa.com` ser tentado como `api.externa.com.default.svc.cluster.local` e outros antes: várias consultas NXDOMAIN por chamada. Um ponto final (`api.externa.com.`) pula essa busca.

## Na prática

O programa abaixo consulta os tipos de registro direto no DNS (via JNDI, que fala com o resolver do sistema) e mostra o **cache da JVM** em ação: a primeira chamada de `InetAddress.getByName` paga a rede, a segunda vem da memória.

```java
import java.net.InetAddress;
import java.util.Hashtable;
import javax.naming.NamingEnumeration;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;

public class ConsultaDns {
    public static void main(String[] args) throws Exception {
        String nome = args.length > 0 ? args[0] : "example.com";

        // 1. Os tipos de registro, direto no DNS (JNDI): A, AAAA, MX e NS
        Hashtable<String, String> env = new Hashtable<>();
        env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
        DirContext ctx = new InitialDirContext(env);
        Attributes attrs = ctx.getAttributes("dns:/" + nome, new String[] {"A", "AAAA", "MX", "NS"});
        NamingEnumeration<? extends Attribute> todos = attrs.getAll();
        while (todos.hasMore()) {
            Attribute a = todos.next();
            System.out.println(a.getID() + ": " + a.size() + " registro(s), por exemplo " + a.get(0));
        }

        // 2. O cache da JVM: a primeira chamada paga a rede; a segunda vem do cache
        long t0 = System.nanoTime();
        InetAddress.getByName(nome);
        long t1 = System.nanoTime();
        InetAddress.getByName(nome);
        long t2 = System.nanoTime();
        System.out.printf("1a chamada: %.1f ms, 2a chamada: %.3f ms%n", (t1 - t0) / 1e6, (t2 - t1) / 1e6);
        System.out.println("networkaddress.cache.ttl = " + java.security.Security.getProperty("networkaddress.cache.ttl"));
        System.out.println("networkaddress.cache.negative.ttl = " + java.security.Security.getProperty("networkaddress.cache.negative.ttl"));
    }
}
```

Para `example.com`, uma execução imprimiu `A: 2 registro(s)...`, `AAAA: 2 registro(s)...` e `1a chamada: 85,0 ms, 2a chamada: 0,064 ms` (os valores variam), com `networkaddress.cache.ttl = null` e `networkaddress.cache.negative.ttl = 10`.

Os dois últimos valores são o ponto de atenção para quem usa DNS como failover:

- `networkaddress.cache.ttl` **não lê o TTL do DNS**. Quando não definido (`null`), a JVM usa **30 s**; `-1` guarda **para sempre**. Defina em `$JAVA_HOME/conf/security/java.security` ou com `Security.setProperty` **antes da primeira resolução**.
- `networkaddress.cache.negative.ttl` (padrão **10 s**) guarda as falhas dentro do processo, e se soma ao cache negativo do resolver.

Para investigar sem a JVM, `dig +noall +answer www.loja.com.br` mostra a cadeia com os TTLs restantes (repita para vê-los descer), `dig +trace` percorre a hierarquia, `dig api.loja.com.br` mostra o `SOA` na seção `AUTHORITY` em caso de NXDOMAIN, e `getent hosts nome` usa o mesmo caminho da aplicação (com `nsswitch.conf` e cache local). O exercício do módulo implementa o resolvedor desta aula: cache por registro, cadeia de CNAME, cache negativo e detecção de laço.

## Armadilhas comuns

- **Criar o registro depois de consultá-lo.** O cache negativo esconde o novo registro até o TTL do SOA. Crie o registro antes de qualquer consulta, ou espere.
- **Baixar o TTL só na hora da migração.** Os caches ainda guardam o TTL antigo. Reduza o TTL com antecedência igual ao valor antigo.
- **Esquecer o cache da JVM.** Um TTL de 30 s na zona não ajuda se a JVM guarda por mais tempo (ou para sempre). Em ambientes com failover por DNS, ajuste `networkaddress.cache.ttl`.
- **CNAME no apex.** Quebra NS, MX e SOA. Use ALIAS/ANAME do provedor ou um A.
- **Achar que DNS verifica saúde.** Ele devolve o que está na zona. O cliente precisa tentar o próximo A em caso de falha, ou um balanceador faz a checagem.
- **Cadeias longas de CNAME.** Cada elo é uma consulta e um ponto de falha, e resolvers cortam cadeias muito grandes.
- **Ignorar `ndots` em contêineres.** Nomes externos sem ponto final geram várias consultas NXDOMAIN extras por chamada.

## Checklist de domínio

- [ ] Você distingue A, AAAA, CNAME, NS e MX e sabe por que o apex não pode ser CNAME
- [ ] Você descreve como o resolver segue uma cadeia de CNAME e quantas consultas ela custa
- [ ] Você explica o TTL decrescente e que o TTL efetivo da cadeia é o menor
- [ ] Você explica o cache negativo (NXDOMAIN e SOA) e o problema de criar um registro depois de consultá-lo
- [ ] Você conhece os dois caches da JVM (`networkaddress.cache.ttl` e `.negative.ttl`) e seus padrões
- [ ] Você lê um `dig` e planeja uma migração reduzindo o TTL com antecedência

## Para ir além

- [RFC 1034: Domain Names, Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035: Domain Names, Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2308: Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 8305: Happy Eyeballs Version 2](https://www.rfc-editor.org/rfc/rfc8305)
- [Javadoc: java.net.InetAddress (cache de nomes)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/InetAddress.html)
