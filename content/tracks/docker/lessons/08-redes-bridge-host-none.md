> **Em uma frase:** na rede `bridge` padrão, cada container tem um namespace de rede ligado por um par `veth` a um switch virtual do host (`docker0`) e sai para a internet com NAT; as redes `host` e `none` são os extremos, sem nenhum isolamento de rede e sem rede alguma.

## O problema

A equipe sobe a `loja-api` e o banco no mesmo host e faz a `api` falar com o banco pelo IP `172.17.0.3`. Funciona. Depois de uma recriação, o banco ganha o IP `172.17.0.4` e a `api` fica apontando para o vazio. Em paralelo, uma chamada a uma API externa de pagamentos falha só dentro do container, e o time não sabe se o problema é a rede do Docker, o NAT do host ou o DNS.

Para depurar qualquer uma dessas situações é preciso ver a rede do Docker como ela é: **interfaces, uma bridge e regras de NAT do kernel** que você já conhece da trilha de Redes. Aqui, cada peça aparece com o nome que tem no Linux.

## Como funciona

Cada container tem o seu **namespace de rede** (aula 2): interfaces, rotas e portas próprias. Sem ligar nada, só existiria um `lo`. O driver **bridge**, o padrão, faz a ligação com três peças.

**1. A bridge `docker0`.** Quando o daemon sobe, cria uma bridge Linux chamada `docker0`, com o IP `172.17.0.1` e a sub-rede `172.17.0.0/16`. Uma bridge faz o papel de um **switch** (aula 3 da trilha de Redes): aprende os MACs por porta e encaminha quadros entre elas. O IP `172.17.0.1` é o **gateway** dos containers. Se essa faixa colide com a rede da empresa ou da VPN, mude-a com `"bip": "10.200.0.1/24"` no `daemon.json`.

**2. Um par `veth` por container.** Um *virtual ethernet pair* é um cabo virtual de duas pontas: o que entra por uma sai pela outra. Uma ponta vira a **`eth0` dentro do container**, com o IP `172.17.0.2`. A outra, com um nome como `veth3a1b2c`, fica no host, **plugada na `docker0`**. É por isso que `ip link` no host mostra uma `veth...@ifN` por container em execução.

**3. NAT na saída.** O IP `172.17.0.2` é privado. Para chegar à internet, a regra `MASQUERADE` da tabela `nat` reescreve a origem para o IP do host, e a resposta volta pela tabela de conexões (*conntrack*): é o NAT da aula 8 de Redes. Com `ip_forward` ligado, o kernel faz o resto, e o container enxerga a internet sem que a internet enxergue o container.

Dentro da mesma bridge, dois containers estão na **mesma sub-rede**: o tráfego entre eles é L2. Um ARP descobre o MAC e a `docker0` encaminha o quadro, sem passar pelo roteamento do host. Na bridge **padrão**, porém, o Docker não resolve nomes de containers: só funciona por IP, e o IP muda. (A próxima aula resolve isso com redes definidas pelo usuário.)

Os dois extremos:

- **`--network host`**: o container **não ganha namespace de rede**. Usa as interfaces e as portas do host. Sem veth e sem NAT, e sem o custo de ambos. O preço é o isolamento: duas aplicações não podem usar a mesma porta, e o container enxerga a rede inteira do host. Só tem o efeito pleno em Linux; no Docker Desktop, o "host" é a VM Linux.
- **`--network none`**: o namespace existe, mas só com o loopback `lo`. Nada entra nem sai. Serve para processamento que não toca a rede.

## Na prática

Comandos para enxergar cada peça (no host Linux):

```bash
docker network ls
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}} {{(index .IPAM.Config 0).Gateway}}'
ip -br addr show docker0
ip -br link show type veth
bridge link show
sudo iptables -t nat -S POSTROUTING
```

O `docker network ls` lista as três redes embutidas: `bridge`, `host` e `none`. O `iptables -t nat -S POSTROUTING` traz a linha `-A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE`: tudo que sai da faixa dos containers por outra interface que não a `docker0` tem a origem reescrita. O programa Java abaixo lista as interfaces ativas que o processo enxerga, com o IP e o prefixo de cada uma:

```java
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Collections;

public class Interfaces {
    public static void main(String[] args) throws Exception {
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!ni.isUp()) continue;
            StringBuilder enderecos = new StringBuilder();
            for (InterfaceAddress a : ni.getInterfaceAddresses()) {
                if (a.getAddress() instanceof java.net.Inet4Address) {
                    enderecos.append(a.getAddress().getHostAddress()).append('/').append(a.getNetworkPrefixLength()).append(' ');
                }
            }
            System.out.printf("%-8s %s%n", ni.getName(), enderecos.toString().trim());
        }
    }
}
```

Rode-o em três redes diferentes, com `docker run --rm [--network ...] -v "$PWD:/app" eclipse-temurin:21-jdk java /app/Interfaces.java`. Na bridge padrão, a saída é `eth0 172.17.0.2/16` e `lo 127.0.0.1/8`; o endereço pode ser outro, mas sempre da faixa da `docker0`. Com `--network none`, só o `lo`. Com `--network host`, **todas as interfaces do host**, incluindo as `veth` dos outros containers. Para provar o isolamento, `docker run --rm --network none alpine cat /proc/net/dev` mostra só o `lo`.

## Armadilhas comuns

- **Apontar a aplicação para o IP de um container.** O IP muda em cada recriação. Use nomes numa rede definida pelo usuário (próxima aula).
- **Conflito de sub-redes.** Se a `172.17.0.0/16` (ou outra faixa que o Docker escolhe sozinho) coincide com a VPN ou a rede da empresa, o tráfego para essa faixa passa a ir ao container errado. Reserve as faixas com `bip` e `default-address-pools`.
- **Usar `--network host` para "resolver" um problema de porta.** Ele elimina o isolamento, impede duas instâncias na mesma porta e não funciona do mesmo jeito em Mac e Windows.
- **Esquecer de ligar o encaminhamento.** Se `net.ipv4.ip_forward` estiver em `0`, ou um firewall do host bloquear o tráfego encaminhado, o container fica sem saída para a internet.
- **Achar que `none` é "só sem internet".** É sem **qualquer** rede além do loopback, nem sequer outros containers.

## Checklist de domínio

- [ ] Você descreve a `docker0` como um switch virtual e o par `veth` como um cabo
- [ ] Você explica o MASQUERADE e relaciona com o NAT da trilha de Redes
- [ ] Você sabe por que a comunicação por IP na bridge padrão é frágil
- [ ] Você diferencia `bridge`, `host` e `none` e quando usar cada um
- [ ] Você comprova no host o `veth`, a `docker0` e a regra de NAT

## Para ir além

- [Docker: visão geral de redes](https://docs.docker.com/engine/network/)
- [Docker: driver bridge](https://docs.docker.com/engine/network/drivers/bridge/)
- [Docker: driver host](https://docs.docker.com/engine/network/drivers/host/)
- [Docker: driver none](https://docs.docker.com/engine/network/drivers/none/)
- [man7.org: veth(4)](https://man7.org/linux/man-pages/man4/veth.4.html)
