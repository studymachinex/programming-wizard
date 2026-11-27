> **Em uma frase:** abrir uma conexão custa um handshake TCP, um handshake TLS e uma cwnd que recomeça pequena, tudo antes do primeiro byte útil; manter conexões abertas (keep-alive) e reaproveitá-las num pool troca esse custo por uma conexão aquecida, desde que o pool tenha o tamanho certo e renove as conexões antes de o firewall ou o banco as matarem.

## O problema

Um serviço de pedidos chama a API de pagamentos a cada requisição, e o código cria uma conexão nova para cada chamada: abre, envia, lê e fecha. O RTT até a API é de 20 ms. Em teste local, com a API na mesma máquina, tudo corre bem. Em produção, cada chamada leva **cerca de 60 ms de rede** antes de a API sequer começar a trabalhar, a CPU do servidor gasta uma parte relevante do tempo em criptografia de handshake, e sob carga o serviço começa a falhar por falta de portas (aula 24).

O custo estava em **cada nova conexão**, não nos dados. A solução é conhecida e quase sempre a mesma: **reaproveitar conexões**.

## Como funciona

### O que uma conexão nova custa

Contando em RTTs, para HTTPS sobre TCP com TLS 1.3 (aulas 11 e 18):

| Etapa | RTTs | Com RTT = 20 ms |
|---|---|---|
| Handshake TCP (SYN, SYN-ACK, ACK) | 1 | 20 ms |
| Handshake TLS 1.3 | 1 | 20 ms |
| Requisição e resposta | 1 | 20 ms |
| **Total** | **3** | **60 ms** |

Com TLS 1.2 são 4 RTTs. A conexão reaproveitada pula as duas primeiras linhas e paga **1 RTT**: 20 ms. Além da latência, o handshake TLS gasta CPU (troca de chaves e verificação de certificado), e o fechamento deixa a conexão em TIME_WAIT (aula 12).

### A cwnd recomeça do zero

Há um custo menos visível. Toda conexão nova começa o *slow start* (aula 14) com cwnd de 10 segmentos, cerca de 14 KB no primeiro voo. Uma resposta de 100 KB precisa de cerca de **3 RTTs** para sair, porque a janela dobra a cada voo (10, 20, 40 segmentos). Uma conexão aquecida, que já cresceu a cwnd com tráfego anterior, pode mandar tudo em 1 RTT, limitada só pela janela do receptor. É uma conta de ordem de grandeza: o ganho real depende de perdas, do algoritmo de congestionamento e do que acontece quando a conexão fica ociosa.

### Keep-alive e pool

No HTTP/1.1, a conexão é persistente por padrão: depois da resposta, ela fica aberta e pode servir a próxima requisição. Em HTTP/2 e HTTP/3 uma conexão serve muitos streams. Um **pool** organiza isso: mantém um conjunto de conexões abertas, **empresta** uma a quem pede, recebe de volta e a reutiliza. Para HTTP, a biblioteca cliente já tem o pool. Para bancos de dados, o pool é um componente à parte (HikariCP, por exemplo), porque a conexão de banco tem estado (transação, sessão) e é cara: no Postgres, cada conexão é um processo no servidor.

### Os botões do pool

O HikariCP, o pool padrão no ecossistema Spring, expõe os parâmetros que importam:

- **`maximumPoolSize`**: o teto de conexões abertas. Quando todas estão emprestadas, quem pede espera.
- **`connectionTimeout`**: quanto tempo quem pede espera por uma conexão antes de receber uma exceção (padrão de 30 s). Ele transforma saturação em erro visível.
- **`maxLifetime`**: idade máxima de uma conexão (padrão de 30 min). Deve ser **menor** que qualquer limite de vida imposto pelo banco ou pelo firewall, para que o pool renove a conexão antes de a infraestrutura matá-la.
- **`keepaliveTime`**: o intervalo em que o pool testa conexões ociosas para mantê-las vivas (desligado por padrão). Veja a aula 30 sobre conexões mortas por firewall.
- **`idleTimeout`**: fecha conexões ociosas acima do mínimo, para devolver recursos ao banco.

## Na prática

Em Java, o `HttpClient` do JDK já mantém um pool interno. O erro mais comum é criar **um cliente por requisição**, que joga o pool fora. O programa abaixo, completo, sobe um servidor local e conta quantas conexões (portas de origem distintas) ele enxerga em cada estratégia:

```java
import com.sun.net.httpserver.HttpServer;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;
import java.util.concurrent.ConcurrentSkipListSet;

public class PoolPortas {
    public static void main(String[] args) throws Exception {
        Set<Integer> portasVistas = new ConcurrentSkipListSet<>();
        HttpServer srv = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        srv.createContext("/", ex -> {
            portasVistas.add(ex.getRemoteAddress().getPort());   // porta de origem desta conexão
            byte[] corpo = "ok".getBytes();
            ex.sendResponseHeaders(200, corpo.length);
            ex.getResponseBody().write(corpo);
            ex.close();
        });
        srv.start();
        URI uri = URI.create("http://127.0.0.1:" + srv.getAddress().getPort() + "/");
        HttpRequest req = HttpRequest.newBuilder(uri).build();

        for (int i = 0; i < 20; i++) {   // 1) um HttpClient novo por requisição
            HttpClient c = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
            c.send(req, HttpResponse.BodyHandlers.discarding());
        }
        System.out.println("cliente novo por requisição: 20 requisições, " + portasVistas.size() + " conexões");

        portasVistas.clear();   // 2) um HttpClient compartilhado
        HttpClient unico = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
        for (int i = 0; i < 20; i++) unico.send(req, HttpResponse.BodyHandlers.discarding());
        System.out.println("cliente compartilhado:       20 requisições, " + portasVistas.size() + " conexão(ões)");
        srv.stop(0);
    }
}
```

A saída é `20 conexões` para o primeiro caso e `1 conexão` para o segundo. O tempo ocioso de uma conexão persistente no `HttpClient` é controlado pela propriedade de sistema `jdk.httpclient.keepalive.timeout` (30 s por padrão). Num servidor próprio com `ServerSocket`, o keep-alive é uma decisão do **protocolo**: você mantém o laço de leitura no mesmo `Socket`, e `setKeepAlive(true)` liga o sondador do TCP (aula 30), que é outra coisa.

Para o tamanho do pool de banco, o guia do HikariCP dá a fórmula `connections = (núcleos × 2) + discos efetivos` como **ponto de partida**, e não como regra: mede-se sob carga real. O resultado costuma surpreender, pois pools pequenos (dezenas de conexões) vencem pools grandes, porque o banco só consegue executar em paralelo o que os seus núcleos e discos permitem.

## Armadilhas comuns

- **Criar um cliente HTTP (ou uma conexão) por requisição.** Perde pool, repete TCP e TLS e gasta portas.
- **Pool grande demais.** 500 conexões a um Postgres com 8 núcleos só criam contenção e consomem memória no banco.
- **`maxLifetime` maior que o timeout do firewall ou do banco.** O pool entrega conexões já mortas.
- **Não devolver a conexão ao pool.** Um `close()` esquecido (use `try-with-resources`) esgota o pool e todas as threads esperam o `connectionTimeout`.
- **Segurar a conexão durante chamadas lentas.** Não chame outra API com a transação aberta.
- **Um pool por requisição ou por thread.** O pool existe para ser compartilhado.

## Checklist de domínio

- [ ] Você soma os RTTs de uma conexão nova (TCP, TLS, requisição) e compara com a reaproveitada
- [ ] Você explica por que a cwnd aquecida é uma vantagem além da latência de handshake
- [ ] Você descreve o empréstimo, a devolução e a espera do pool, e o papel de cada parâmetro do HikariCP
- [ ] Você sabe que `maxLifetime` deve ficar abaixo dos limites de vida impostos pela infraestrutura
- [ ] Você reutiliza um único `HttpClient` e sabe quando usar um pool de banco
- [ ] Você dimensiona o pool por medição, tomando a fórmula do Hikari como ponto de partida

## Para ir além

- [HikariCP: configuração e parâmetros](https://github.com/brettwooldridge/HikariCP#gear-configuration-knobs-baby)
- [HikariCP: About Pool Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)
- [Javadoc: java.net.http.HttpClient](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html)
- [RFC 9112: HTTP/1.1, conexões persistentes](https://www.rfc-editor.org/rfc/rfc9112#name-persistence)
