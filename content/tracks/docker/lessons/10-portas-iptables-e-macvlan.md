> **Em uma frase:** `-p 8080:80` não abre uma porta no container, é uma regra de **DNAT** que o Docker grava no iptables do host (mais um `docker-proxy` para o tráfego local), e por isso ela passa por cima do UFW; já o **macvlan** dispensa tudo isso e dá ao container um IP e um MAC próprios na rede física.

## O problema

A `loja-api` sobe com `docker run -d -p 8080:80 ...`, e o cliente de fora a acessa em `http://203.0.113.10:8080`. Para "proteger", o administrador roda `ufw deny 8080`, o `ufw status` mostra a regra ativa e, ainda assim, um teste de outra máquina continua devolvendo `200 OK`. O banco de dados, publicado com `-p 5432:5432` "só para um teste", ficou exposto à internet por meses.

Em outro projeto, um sistema legado exige que cada instância tenha **um IP próprio na LAN**, e a equipe descobre que o container macvlan responde a todos, **menos ao host** que o criou. As duas histórias ensinam o mesmo: publicar portas é mecanismo de firewall e de NAT, e precisa ser tratado como tal.

## Como funciona

**`-p` é DNAT.** Cada container da bridge tem um IP privado (`172.17.0.2`) que só existe dentro do host. Para o mundo alcançá-lo, `-p 8080:80` faz o Docker acrescentar, na tabela `nat`, chain `DOCKER`, uma regra de **DNAT** (*destination NAT*): pacotes destinados à porta `8080` do host têm o destino reescrito para `172.17.0.2:80`. O gancho é a chain `PREROUTING` (`-A PREROUTING -m addrtype --dst-type LOCAL -j DOCKER`), antes de o kernel decidir para onde o pacote vai. É o **port forwarding** da aula 8 da trilha de Redes: NAT de destino, ao contrário do MASQUERADE de saída (aula 8 desta trilha). A resposta volta pela tabela *conntrack*, que desfaz a tradução: o cliente nunca vê o IP do container.

**O `docker-proxy`.** Pacotes gerados **no próprio host** (um `curl localhost:8080`) não passam pelo `PREROUTING`. Para esses, o Docker mantém um processo, o **`docker-proxy`** (*userland proxy*), escutando na porta publicada e repassando ao container. Há um por porta publicada, e ele pode ser desligado com `"userland-proxy": false` no `daemon.json` quando o iptables basta.

**Por que o UFW não protege.** O Docker grava as suas regras diretamente no iptables, nas chains `nat` e `FORWARD`. O tráfego publicado é **encaminhado** (vai para o container), e o UFW controla principalmente o `INPUT`, o tráfego destinado ao próprio host. A regra de bloqueio do UFW nunca é consultada para essas conexões. É um problema conhecido e documentado. As saídas:

- **Publicar só onde precisa.** `-p 127.0.0.1:8080:80` limita o DNAT ao loopback; um proxy reverso no mesmo host faz a ponte com o mundo.
- **Usar a chain `DOCKER-USER`.** O Docker a consulta **antes** das próprias regras de `FORWARD` e nunca a reescreve, então as regras do administrador ficam ali, por exemplo `iptables -I DOCKER-USER -i eth0 ! -s 198.51.100.0/24 -p tcp --dport 80 -j DROP`. A porta que a regra casa é a do **container** (`80`), porque o DNAT já foi aplicado.
- **Não publicar o que não precisa.** Containers na mesma rede de usuário se alcançam pelo nome, sem `-p` (aula 9). `EXPOSE` no Dockerfile só documenta e não publica nada; `-P` publica todas as portas expostas em portas altas aleatórias.

**macvlan.** É um driver que dispensa bridge, NAT e `-p`. Cada container recebe **um MAC e um IP da rede física** (aqui `192.0.2.50/24`), pendurado numa interface do host (`-o parent=eth0`). Do ponto de vista da LAN, ele é um equipamento como o notebook e o roteador. Serve para software legado que exige IP próprio e para ferramentas de monitoração que precisam enxergar a LAN. Três limites:

- o switch passa a ver **vários MACs** numa porta, e redes que limitam isso (nuvem pública, Wi-Fi, *port security*) não funcionam; em VMs, a placa precisa de modo promíscuo;
- o host **não alcança** os containers macvlan pela interface pai, por desenho do kernel: é preciso uma interface macvlan auxiliar no host (`mac0`) com uma rota para o container;
- o container não aparece no DNS embutido do Docker como numa rede bridge de usuário.

O **ipvlan** é a alternativa que compartilha o MAC do host, para ambientes em que o macvlan não é aceito.

## Na prática

```bash
docker run -d --name web -p 8080:80 nginx:1.27
docker port web
sudo iptables -t nat -S DOCKER
ps -ef | grep docker-proxy
sudo iptables -S DOCKER-USER

docker run -d --name web2 -p 127.0.0.1:8081:80 nginx:1.27

docker network create -d macvlan --subnet 192.0.2.0/24 --gateway 192.0.2.1 -o parent=eth0 lan
docker run -d --name legado --network lan --ip 192.0.2.50 nginx:1.27

sudo ip link add mac0 link eth0 type macvlan mode bridge
sudo ip addr add 192.0.2.60/32 dev mac0 && sudo ip link set mac0 up
sudo ip route add 192.0.2.50/32 dev mac0
```

O `iptables -t nat -S DOCKER` traz a linha `-A DOCKER ! -i docker0 -p tcp -m tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80`, a tradução propriamente dita. O `docker port web` mostra `80/tcp -> 0.0.0.0:8080` (e a versão IPv6). Do lado da aplicação Java, há um erro clássico: o servidor que escuta só em `127.0.0.1` **dentro** do container, e portanto não é alcançado pelo DNAT. O programa abaixo escolhe o endereço de bind por variável de ambiente:

```java
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class Servidor {
    public static void main(String[] args) throws Exception {
        String bind = System.getenv().getOrDefault("BIND", "0.0.0.0");
        int porta = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));

        HttpServer servidor = HttpServer.create(new InetSocketAddress(bind, porta), 0);
        servidor.createContext("/", troca -> {
            byte[] corpo = ("olá, atendido em " + troca.getLocalAddress() + "\n").getBytes(StandardCharsets.UTF_8);
            troca.sendResponseHeaders(200, corpo.length);
            try (var saida = troca.getResponseBody()) {
                saida.write(corpo);
            }
        });
        servidor.start();
        System.out.println("escutando em " + servidor.getAddress());
    }
}
```

Rode-o duas vezes: `docker run -d -p 18081:8080 -v "$PWD:/app" eclipse-temurin:21-jdk java /app/Servidor.java` e a mesma coisa com `-e BIND=127.0.0.1 -p 18082:8080`. O primeiro responde `olá, atendido em /172.17.0.2:8080` ao `curl http://localhost:18081/`. No segundo, o `curl` termina com o código 52 (*empty reply*): o DNAT entregou a conexão ao `eth0` do container, mas o servidor só aceita conexões vindas do `lo` do container.

## Armadilhas comuns

- **Confiar no UFW (ou no firewalld) para proteger portas publicadas.** Elas são encaminhadas e não passam pelas regras de `INPUT`. Publique em `127.0.0.1` ou use a chain `DOCKER-USER`.
- **Publicar bancos e caches "só para testar".** `-p 5432:5432` abre o Postgres para toda interface do host. Use a rede de usuário e só publique na máquina de desenvolvimento, em `127.0.0.1`.
- **Servidor que escuta em `127.0.0.1` dentro do container.** O tráfego publicado chega pela `eth0` do container e nunca pelo `lo`. Faça o bind em `0.0.0.0`.
- **Conflito de porta no host.** Dois containers não publicam a mesma porta; o segundo falha com `port is already allocated`. Use portas diferentes, ou deixe o Docker escolher com `-p 80`.
- **Esperar que o host fale com um container macvlan pela `eth0`.** Crie uma interface macvlan auxiliar no host, ou use outro host para o teste.
- **Esquecer o custo do conntrack.** Cada conexão publicada ocupa uma entrada de NAT. O esgotamento da tabela derruba conexões novas (aula 8 de Redes).

## Checklist de domínio

- [ ] Você mostra a regra DNAT que o `-p` cria e a chain onde ela vive
- [ ] Você explica para que serve o `docker-proxy` e quando desligá-lo
- [ ] Você sabe por que o UFW não bloqueia a porta publicada e como contornar com `DOCKER-USER` e `127.0.0.1`
- [ ] Você cria uma rede macvlan e diz por que o host não alcança o container sem a `mac0`
- [ ] Você ajusta o bind do servidor Java para `0.0.0.0` dentro do container

## Para ir além

- [Docker: publicação de portas e mapeamento](https://docs.docker.com/engine/network/port-publishing/)
- [Docker: filtragem de pacotes e firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- [Docker: driver macvlan](https://docs.docker.com/engine/network/drivers/macvlan/)
- [Docker: driver ipvlan](https://docs.docker.com/engine/network/drivers/ipvlan/)
- [Docker: reforço de segurança com o daemon (userland-proxy e opções)](https://docs.docker.com/reference/cli/dockerd/)
