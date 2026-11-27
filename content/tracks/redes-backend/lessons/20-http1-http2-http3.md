> **Em uma frase:** o HTTP/1.1 usa uma resposta por vez por conexão e compensa abrindo até 6 conexões; o HTTP/2 multiplexa streams numa só conexão TCP, mas uma perda de pacote trava todos eles (head-of-line blocking do TCP); o HTTP/3 roda sobre QUIC, em UDP, onde cada stream é recuperado de forma independente.

## O problema

Uma tela do app móvel faz 30 chamadas à API ao abrir. Em Wi-Fi bom, tudo certo. Num 4G instável, a tela leva segundos a mais, e o monitor de rede mostra poucas conexões com **muitas requisições paradas**. Em paralelo, o time de plataforma migra os serviços internos para gRPC (HTTP/2) e vê que, depois da migração, um dos dois servidores do balanceador recebe **todo o tráfego** e o outro fica ocioso.

Os dois fenômenos vêm da mesma raiz: a forma como cada versão do HTTP usa as conexões. Conhecer as três versões (e onde cada uma falha) é o que permite diagnosticar lentidão que não aparece em nenhum log da aplicação.

## Como funciona

### HTTP/1.1: uma conversa por conexão

No HTTP/1.1, uma conexão transporta **uma requisição por vez**: o cliente só envia a próxima depois de receber a resposta anterior. O *pipelining* existe na especificação, mas é desligado na prática (intermediários o tratavam mal, e a resposta continua em ordem).

Duas consequências:

- **Fila:** com N recursos numa conexão, o tempo é N RTTs no mínimo. Os navegadores contornam abrindo **até 6 conexões por host**, o que paraleliza, mas cada conexão paga o **seu** handshake TCP e TLS e recomeça o **slow start** (aula 14). Para o servidor, mil usuários viram seis mil conexões.
- **Head-of-line blocking na aplicação:** uma resposta grande atrasa todas as seguintes **naquela** conexão. O ícone de 1 KB espera o vídeo de 2 MB.

### HTTP/2: streams numa conexão

O HTTP/2 (RFC 9113) transforma a conexão em um **canal de frames binários** com vários **streams** independentes, numerados (1, 3, 5... para os iniciados pelo cliente). Requisições e respostas viram quadros `HEADERS` e `DATA` que se **intercalam**: o ícone passa na frente do vídeo.

Vantagens: **uma conexão**, um handshake, uma cwnd; **HPACK** comprime cabeçalhos repetidos (`Host`, `User-Agent`, cookies); controle de fluxo **por stream**, além do da conexão. A negociação vai **dentro do TLS**, pela extensão **ALPN**: o cliente oferece `h2, http/1.1` e o servidor escolhe. O *server push* foi abandonado pelos navegadores.

O limite está **embaixo**: o TCP entrega bytes **em ordem** e não sabe de streams. Se um segmento com dados do stream 3 se perde, todos os bytes seguintes, **inclusive os dos streams 1 e 5**, ficam retidos no kernel até a retransmissão. É o **head-of-line blocking do TCP**. Em redes com perda (celular, Wi-Fi saturado), HTTP/2 em uma conexão pode ser **pior** que HTTP/1.1 em seis.

### HTTP/3: streams sobre QUIC

O HTTP/3 (RFC 9114) usa o **QUIC** (RFC 9000), um transporte sobre **UDP** que conhece os streams: cada um tem a sua ordem e a sua retransmissão. A perda de um pacote do stream 4 **atrasa só o stream 4**.

Outras propriedades do QUIC:

- **Handshake de 1 RTT**, que junta transporte e TLS 1.3. Para servidores já visitados, **0-RTT** (com o risco de replay da aula 18).
- **Sempre criptografado**: até os números de pacote e boa parte do cabeçalho.
- **Migração de conexão**: um identificador de conexão permite trocar de Wi-Fi para 4G **sem** recomeçar.
- Roda em **espaço de usuário**: confiabilidade e controle de congestionamento são código da biblioteca, o que acelera a evolução, mas custa mais CPU que o TCP do kernel.

### Como o cliente chega ao HTTP/3

O cliente não sabe de antemão. Na primeira visita usa TCP + TLS (ALPN `h2`), e a resposta anuncia `alt-svc: h3=":443"; ma=86400` (ou há um registro DNS `HTTPS`). Nas próximas conexões, tenta **QUIC** e, se o UDP estiver bloqueado, **volta ao TCP** sem erro. Por isso o HTTP/2 precisa continuar funcionando mesmo depois de ligar o HTTP/3.

## Na prática

O `HttpClient` do Java (11+) fala HTTP/2 por padrão, com fallback para HTTP/1.1, e **reaproveita a conexão**. O programa abaixo mostra a versão usada e seis requisições concorrentes compartilhando uma conexão:

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

public class Http2 {
    public static void main(String[] args) throws Exception {
        HttpClient cliente = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)               // pede h2; cai para HTTP/1.1 se o servidor não suportar
                .connectTimeout(Duration.ofSeconds(3))            // timeout de conexão explícito
                .build();
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://example.com/")).timeout(Duration.ofSeconds(5)).build();

        HttpResponse<Void> r = cliente.send(req, HttpResponse.BodyHandlers.discarding());
        System.out.println("status " + r.statusCode() + " via " + r.version());
        System.out.println("alt-svc: " + r.headers().firstValue("alt-svc").orElse("(ausente)"));

        // várias requisições em paralelo: com HTTP/2, compartilham UMA conexão TCP
        List<CompletableFuture<HttpResponse<Void>>> fs = new ArrayList<>();
        for (int i = 0; i < 6; i++) fs.add(cliente.sendAsync(req, HttpResponse.BodyHandlers.discarding()));
        for (var f : fs) System.out.print(f.join().version() + " ");
        System.out.println();
    }
}
```

A execução contra `example.com` imprimiu `status 200 via HTTP_2`, `alt-svc: h3=":443"; ma=86400` (o servidor anuncia HTTP/3) e `HTTP_2 HTTP_2 HTTP_2 HTTP_2 HTTP_2 HTTP_2`. Crie **um** `HttpClient` e reuse-o: cada instância tem o seu pool, e criar um por requisição joga fora a conexão e o handshake.

Para inspecionar do terminal: `curl -v --http2 https://host/` mostra `ALPN: server accepted h2` e `HTTP/2 200`; `curl -sI https://host/ | grep -i alt-svc` revela o anúncio de HTTP/3; `curl --http3 -I https://host/` testa QUIC (precisa de um curl compilado com suporte); `ss -tn dst IP` mostra **uma** conexão TCP mesmo com muitas requisições em HTTP/2.

### O efeito no balanceamento

Conexões HTTP/2 e gRPC são **longas**, e levam muitos streams. Um balanceador **L4** distribui **conexões**, e não requisições: uma conexão com 100 streams cai inteira num servidor, e o outro fica ocioso. Soluções: balanceador **L7** (que entende HTTP/2 e reparte os streams, aula 26), balanceamento *client-side* (o cliente mantém conexões para várias réplicas) ou limitar a vida da conexão (`MAX_CONNECTION_AGE` no gRPC) para forçar redistribuição.

## Armadilhas comuns

- **Criar um `HttpClient` por requisição.** Descarta o pool, repete TCP e TLS e anula as vantagens do HTTP/2.
- **Balancear gRPC com um LB L4 e esperar distribuição uniforme.** Uma conexão, um servidor. Use L7, client-side ou rotação de conexões.
- **Presumir que HTTP/2 é sempre mais rápido.** Com perda de pacotes, o HOL do TCP pode torná-lo pior que várias conexões HTTP/1.1.
- **Ligar HTTP/3 e esquecer o HTTP/2.** Redes que bloqueiam UDP 443 (comuns em ambientes corporativos) dependem do fallback.
- **Otimizações de HTTP/1.1 aplicadas ao HTTP/2.** Domain sharding (vários hosts para driblar o limite de 6) e concatenar tudo num bundle gigante deixam de ajudar e podem atrapalhar.
- **Ignorar o limite de streams concorrentes.** O servidor anuncia `SETTINGS_MAX_CONCURRENT_STREAMS` (comumente 100); acima disso as requisições esperam na fila do cliente.
- **Esquecer timeouts.** `connectTimeout` e o timeout por requisição são separados no `HttpClient`; nenhum deles vem ligado por padrão.

## Checklist de domínio

- [ ] Você explica por que o HTTP/1.1 abre várias conexões e o custo de cada uma
- [ ] Você descreve streams, frames e HPACK no HTTP/2 e como o ALPN o negocia
- [ ] Você explica o head-of-line blocking do TCP e por que ele afeta todos os streams do HTTP/2
- [ ] Você explica como o QUIC dá streams independentes e um handshake de 1 RTT
- [ ] Você sabe como o cliente descobre o HTTP/3 (Alt-Svc) e por que o fallback para TCP importa
- [ ] Você reconhece o desbalanceamento de conexões HTTP/2 atrás de um balanceador L4 e sabe as saídas

## Para ir além

- [RFC 9113: HTTP/2](https://www.rfc-editor.org/rfc/rfc9113)
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114)
- [RFC 9000: QUIC, a UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000)
- [RFC 7541: HPACK, Header Compression for HTTP/2](https://www.rfc-editor.org/rfc/rfc7541)
- [Javadoc: java.net.http.HttpClient](https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.html)
