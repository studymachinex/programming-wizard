> **Em uma frase:** um proxy é um intermediário que fala com o servidor em nome do cliente (forward proxy, configurado pelo cliente) ou com os clientes em nome do servidor (reverse proxy, configurado por quem opera o serviço); o intermediário esconde o IP de uma das pontas, e por isso o backend precisa de cabeçalhos como `X-Forwarded-For` para saber quem chamou, sabendo que eles só valem se vierem do proxy de confiança.

## O problema

Dois incidentes aparentemente sem relação. No primeiro, o time de segurança de uma empresa descobre que funcionários acessam a internet sem nenhum registro, e quer um ponto único onde ver, filtrar e registrar o tráfego de saída. No segundo, uma API atrás de um balanceador passa a registrar **todos os acessos com o mesmo IP** (o do balanceador), e o limitador de taxa por IP, que deveria bloquear um cliente abusivo, bloqueia todos os clientes de uma vez.

As duas situações têm uma peça em comum, o **proxy**, e a mesma pergunta: *quem enxerga o quê?*

## Como funciona

### Forward proxy: o cliente configura

Num **forward proxy**, o cliente é configurado (no navegador, no sistema ou na variável `HTTPS_PROXY`) para mandar o tráfego de saída ao proxy, que o repassa à internet. O servidor de destino enxerga o **IP do proxy**, e não o do cliente. É o desenho típico de redes corporativas: filtro de conteúdo, auditoria, cache e saída controlada por um único IP.

Para HTTP simples, o cliente manda a requisição inteira ao proxy (`GET http://exemplo.com/ ...`) e o proxy a repete. Para **HTTPS**, o proxy não pode ler o conteúdo cifrado: o cliente pede um túnel com o método **`CONNECT`**:

```text
CONNECT api.exemplo.com:443 HTTP/1.1
Host: api.exemplo.com:443
```

O proxy abre uma conexão TCP até o destino, responde `200` e passa a copiar bytes nos dois sentidos. O TLS vai **de ponta a ponta**, e o proxy só vê o destino e o volume. Proxies de inspeção interceptam o TLS com um certificado próprio instalado nas máquinas, o que é uma decisão de política, e não um recurso do protocolo.

### Reverse proxy: o servidor configura

Num **reverse proxy**, o cliente nem sabe que ele existe: acha que fala com o servidor. O proxy fica na frente de uma ou mais aplicações e faz o que o servidor não deveria fazer sozinho: **terminar TLS**, rotear por host e caminho, comprimir, guardar cache, aplicar limites de taxa, esconder os backends (que ficam em rede privada) e repassar ao servidor certo. Nginx, HAProxy, Envoy, Traefik e os balanceadores de nuvem são reverse proxies.

A diferença é a **quem serve**: o forward proxy protege e controla os clientes; o reverse proxy protege e organiza os servidores.

### O IP do cliente se perde

Atrás de um reverse proxy, a conexão que chega ao backend vem **do proxy**. O IP real do cliente precisa viajar em cabeçalhos HTTP:

- **`X-Forwarded-For`** (de fato, não padronizado): lista de IPs, onde cada proxy acrescenta o endereço de quem lhe chamou. `203.0.113.50, 192.0.2.10` significa cliente e primeiro proxy.
- **`Forwarded`** (RFC 7239): a versão padronizada, com `for=`, `proto=` e `host=`.
- **`X-Forwarded-Proto`** e **`X-Forwarded-Host`**: protocolo e host originais, para a aplicação montar redirecionamentos corretos.

Para proxies de **camada 4**, que não leem HTTP, existe o **PROXY protocol** (do HAProxy): o proxy escreve uma linha de cabeçalho no começo da conexão TCP com o IP e a porta originais, e o backend precisa estar configurado para lê-la.

## Na prática

O programa abaixo, completo, sobe um backend e um reverse proxy mínimos com o JDK. O proxy acrescenta `X-Forwarded-For` e `X-Forwarded-Proto` e devolve `502` se o backend falhar. O cliente envia um `X-Forwarded-For` forjado de propósito:

```java
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

public class MiniProxy {
    public static void main(String[] args) throws Exception {
        InetAddress lo = InetAddress.getLoopbackAddress();

        // Backend: só enxerga quem o chama (o proxy) e os cabeçalhos que o proxy acrescentou.
        HttpServer backend = HttpServer.create(new InetSocketAddress(lo, 0), 0);
        backend.createContext("/", ex -> {
            String corpo = "peer=" + ex.getRemoteAddress().getAddress().getHostAddress()
                    + " X-Forwarded-For=" + ex.getRequestHeaders().getFirst("X-Forwarded-For")
                    + " X-Forwarded-Proto=" + ex.getRequestHeaders().getFirst("X-Forwarded-Proto");
            byte[] b = corpo.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, b.length);
            try (OutputStream o = ex.getResponseBody()) { o.write(b); }
        });
        backend.start();

        // Reverse proxy: recebe o pedido, acrescenta X-Forwarded-* e repassa ao backend.
        HttpClient cliente = HttpClient.newHttpClient();
        URI destino = URI.create("http://127.0.0.1:" + backend.getAddress().getPort());
        HttpServer proxy = HttpServer.create(new InetSocketAddress(lo, 0), 0);
        proxy.createContext("/", ex -> {
            try {
                String ip = ex.getRemoteAddress().getAddress().getHostAddress();
                String antes = ex.getRequestHeaders().getFirst("X-Forwarded-For");
                HttpRequest req = HttpRequest.newBuilder(destino.resolve(ex.getRequestURI()))
                        .header("X-Forwarded-For", antes == null ? ip : antes + ", " + ip)
                        .header("X-Forwarded-Proto", "https")
                        .build();
                HttpResponse<byte[]> r = cliente.send(req, HttpResponse.BodyHandlers.ofByteArray());
                ex.sendResponseHeaders(r.statusCode(), r.body().length);
                try (OutputStream o = ex.getResponseBody()) { o.write(r.body()); }
            } catch (Exception e) {
                ex.sendResponseHeaders(502, -1);   // Bad Gateway: o backend falhou
            }
        });
        proxy.start();

        // O cliente só conhece o proxy. Aqui ele finge ter vindo de 203.0.113.50 (cabeçalho forjável!).
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + proxy.getAddress().getPort() + "/pedidos"))
                .header("X-Forwarded-For", "203.0.113.50").build();
        System.out.println(cliente.send(req, HttpResponse.BodyHandlers.ofString()).body());
        proxy.stop(0);
        backend.stop(0);
    }
}
```

A saída é `peer=127.0.0.1 X-Forwarded-For=203.0.113.50, 127.0.0.1 X-Forwarded-Proto=https`. Repare em duas coisas: o `peer` é o proxy, e o `X-Forwarded-For` tem **o valor forjado do cliente primeiro** e o IP real só no fim. Por isso a regra de segurança é: **só confie na parte da lista que os seus próprios proxies acrescentaram**. Conte a partir da direita, pulando o número de proxies conhecidos, e nunca use o primeiro item de uma lista que veio de fora. Servidores como o Tomcat, o Spring (`server.forward-headers-strategy`) e o Nginx (`real_ip_header`) têm configuração para isso.

Para testar o forward proxy do lado do cliente, `curl -x http://proxy.corp:3128 https://api.exemplo.com/` mostra o `CONNECT` com `-v`; em Java, `HttpClient.newBuilder().proxy(ProxySelector.of(new InetSocketAddress("proxy.corp", 3128)))` faz o mesmo.

## Armadilhas comuns

- **Confiar no primeiro IP do `X-Forwarded-For`.** Qualquer cliente pode escrevê-lo; o limite de taxa e a lista de bloqueio passam a valer para um IP inventado.
- **Backend que vê só o IP do proxy.** Logs, geolocalização e rate limit por IP ficam inúteis até a aplicação ler o cabeçalho (ou o PROXY protocol).
- **Timeouts desencontrados.** Se o backend fecha conexões ociosas antes de o proxy parar de reutilizá-las, o proxy envia numa conexão já fechada e aparecem `502` esporádicos. O keep-alive do backend deve ser **maior** que o tempo ocioso do proxy, e você precisa conhecer os dois valores.
- **Esquecer `X-Forwarded-Proto`.** A aplicação atrás do TLS termination acha que está em HTTP e gera redirecionamentos para `http://`.
- **Tratar o proxy como ponto único.** Um reverse proxy sem redundância é um ponto único de falha, e todo salto acrescenta latência.
- **Confundir `CONNECT` com inspeção.** O túnel não permite ler o HTTPS; a inspeção exige interceptação deliberada de TLS.

## Checklist de domínio

- [ ] Você distingue forward proxy (cliente configura) de reverse proxy (servidor configura) e diz quem enxerga o quê
- [ ] Você explica o método `CONNECT` e por que o proxy não lê o conteúdo HTTPS
- [ ] Você lista o que um reverse proxy faz: TLS, roteamento, cache, limites e proteção dos backends
- [ ] Você usa `X-Forwarded-For`, `Forwarded` e o PROXY protocol para recuperar o IP do cliente
- [ ] Você sabe por que só se confia no que os seus proxies acrescentaram
- [ ] Você reconhece `502` e `504` como sintomas de proxy e backend desalinhados

## Para ir além

- [RFC 7239: Forwarded HTTP Extension](https://www.rfc-editor.org/rfc/rfc7239)
- [RFC 9110: HTTP Semantics, método CONNECT](https://www.rfc-editor.org/rfc/rfc9110#name-connect)
- [Especificação do PROXY protocol (HAProxy)](https://www.haproxy.org/download/2.8/doc/proxy-protocol.txt)
- [MDN: cabeçalho X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For)
