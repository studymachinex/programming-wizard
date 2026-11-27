> **Em uma frase:** um balanceador L4 distribui conexões TCP sem enxergar o HTTP (rápido, simples, mas cego para o que há dentro delas), e um L7 termina o TLS, lê cada requisição e decide por host, caminho ou cabeçalho (mais caro, mas distribui requisições e consegue fazer health check e retry de verdade); a escolha também define se HTTP/2 e gRPC ficam equilibrados.

## O problema

Uma API de pedidos roda em duas réplicas atrás de um balanceador. Os clientes são serviços internos que falam gRPC, e cada um abre **uma conexão HTTP/2** e a mantém por horas. Na hora do pico, uma réplica fica com 90% da CPU e a outra quase ociosa, embora o balanceador esteja "distribuindo igualmente". Escalar para três réplicas não ajuda: as novas conexões já abertas continuam onde estavam.

O balanceador não está quebrado: ele é de **camada 4**, e distribuiu **conexões** com perfeição. O problema é que uma conexão HTTP/2 carrega milhares de requisições (aula 20), e ele não enxerga nenhuma.

## Como funciona

### L4: repassa conexões

O balanceador de camada 4 decide com a informação de transporte: IP e porta de origem e de destino. Para cada **nova conexão TCP**, escolhe um backend e passa a encaminhar os pacotes daquela conexão. Duas técnicas comuns: **NAT** (o balanceador reescreve os endereços e fica no caminho de ida e volta) e **DSR** (*direct server return*: a resposta volta direto do backend ao cliente, sem passar pelo balanceador).

Consequências:

- **Não vê HTTP.** Não roteia por caminho nem por cabeçalho, e não consegue repetir uma requisição.
- **TLS passthrough:** os bytes cifrados passam direto, e o backend termina o TLS.
- **Muito rápido e barato**, por fazer pouco trabalho por pacote.
- **Consistente por conexão:** todas as requisições de uma conexão vão ao mesmo backend. Em HTTP/1.1 curto isso se equilibra; em HTTP/2 e gRPC de conexão longa, não.
- O IP do cliente pode ser preservado (no NLB da AWS, por exemplo) ou perdido, conforme o modo, e há o PROXY protocol para entregá-lo ao backend (aula 25).

### L7: lê cada requisição

O balanceador de camada 7 **termina a conexão** do cliente (e o TLS, com o certificado do serviço), lê a requisição HTTP e abre ou reaproveita outra conexão, própria, para o backend. Por isso consegue:

- **Rotear por host, caminho e cabeçalho:** `/api` para um grupo, `/static` para outro, `Host: loja.exemplo.com` para outro serviço.
- **Distribuir requisições**, e não conexões: as 1000 requisições de uma conexão HTTP/2 se espalham pelas réplicas.
- **Health check de aplicação:** `GET /healthz` esperando `200`, e não só "a porta aceita conexão".
- **Retry, timeout por requisição, limite de taxa, WAF, compressão e métricas por rota.**

O custo é CPU (TLS e parsing de cada requisição) e um salto de latência a mais. Os balanceadores de nuvem seguem a divisão: o **NLB** da AWS é L4 e o **ALB** é L7 (Envoy, Nginx e HAProxy operam nos dois modos).

### Algoritmos

- **Round robin:** um por vez, em rodízio. Simples, bom para requisições uniformes.
- **Ponderado:** backends maiores recebem mais (peso).
- **Least connections:** o backend com menos conexões ativas. Melhor quando a duração varia.
- **Least outstanding requests:** o com menos requisições em andamento: requer L7.
- **Hash consistente:** a mesma chave (IP, cookie, cabeçalho) vai ao mesmo backend, para **afinidade** e caches locais. Ao entrar ou sair um backend, só uma fração das chaves muda.

## Na prática

O hash consistente cabe num programa pequeno: um anel de hashes com **nós virtuais**, para a distribuição não depender de poucos pontos. O programa abaixo, completo, escolhe backends para 10.000 clientes e depois remove um nó:

```java
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public class AnelHash {
    private final TreeMap<Long, String> anel = new TreeMap<>();

    void adicionar(String no, int virtuais) throws Exception {
        for (int i = 0; i < virtuais; i++) anel.put(hash(no + "#" + i), no);
    }

    void remover(String no, int virtuais) throws Exception {
        for (int i = 0; i < virtuais; i++) anel.remove(hash(no + "#" + i));
    }

    String escolher(String chave) throws Exception {
        Map.Entry<Long, String> e = anel.ceilingEntry(hash(chave));
        return (e != null ? e : anel.firstEntry()).getValue();   // dá a volta no anel
    }

    static long hash(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("MD5").digest(s.getBytes(StandardCharsets.UTF_8));
        long h = 0;
        for (int i = 0; i < 8; i++) h = (h << 8) | (d[i] & 0xff);
        return h;
    }

    public static void main(String[] args) throws Exception {
        AnelHash anel = new AnelHash();
        for (String n : List.of("api-a", "api-b", "api-c")) anel.adicionar(n, 100);

        int clientes = 10_000;
        Map<String, String> antes = new HashMap<>();
        Map<String, Integer> contagem = new TreeMap<>();
        for (int i = 0; i < clientes; i++) {
            String chave = "cliente-" + i;
            String no = anel.escolher(chave);
            antes.put(chave, no);
            contagem.merge(no, 1, Integer::sum);
        }
        System.out.println("distribuição com 3 nós: " + contagem);

        anel.remover("api-c", 100);                       // um nó sai da rotação
        int moveram = 0;
        for (var e : antes.entrySet()) if (!anel.escolher(e.getKey()).equals(e.getValue())) moveram++;
        System.out.println("chaves que mudaram de nó ao remover api-c: " + moveram
                + " (as que estavam em api-c: " + contagem.get("api-c") + ")");
    }
}
```

Rodando, a distribuição não é perfeitamente igual (com 100 nós virtuais por backend a diferença entre eles foi visível; mais nós virtuais a aproximam), e o ponto importante aparece na segunda linha: **só as chaves que estavam no nó removido mudaram de lugar**, as demais ficaram onde estavam. Com `hash(chave) % N` quase todas mudariam.

Para o caso do gRPC, a saída é L7 (o balanceador reparte os streams), balanceamento no cliente ou rotação de conexões com `MAX_CONNECTION_AGE`, que obriga o cliente a reconectar e redistribui a carga.

## Armadilhas comuns

- **Balancear gRPC ou HTTP/2 com L4 e esperar equilíbrio.** Uma conexão, um backend.
- **Health check só de TCP.** A porta aceita conexões com a aplicação travada; use um endpoint que verifique o que importa.
- **Retry sem idempotência.** Reenviar um `POST` em outro backend pode duplicar um pedido.
- **Afinidade por IP atrás de NAT.** Milhares de clientes com o mesmo IP caem no mesmo backend.
- **Achar que L7 é sempre melhor.** Para tráfego TCP genérico (bancos, filas) ou vazão altíssima, L4 é mais simples e suficiente.
- **Esquecer a capacidade do próprio balanceador.** Ele também tem limites de conexões e de CPU para TLS.

## Checklist de domínio

- [ ] Você diferencia L4 (conexões, sem ver HTTP) de L7 (requisições, TLS, rotas)
- [ ] Você explica por que HTTP/2 e gRPC ficam desequilibrados atrás de L4 e três saídas para isso
- [ ] Você lista o que o L7 permite: roteamento, health check HTTP, retry e métricas por rota
- [ ] Você escolhe entre round robin, ponderado, least connections, least outstanding requests e hash consistente
- [ ] Você sabe que NLB é L4 e ALB é L7 na AWS
- [ ] Você explica por que o hash consistente move só uma fração das chaves

## Para ir além

- [AWS: Network Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html)
- [AWS: Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html)
- [gRPC: balanceamento de carga](https://grpc.io/blog/grpc-load-balancing/)
- [Envoy: algoritmos de balanceamento](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)
