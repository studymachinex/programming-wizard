> **Em uma frase:** numa rede criada com `docker network create`, o daemon responde consultas DNS em `127.0.0.11` e resolve o **nome** (e os aliases) de cada container da rede; na bridge padrão isso não existe, e a única opção é o IP, que muda.

## O problema

A `loja-api` usa `jdbc:postgresql://db:5432/loja`. No notebook, com Docker Compose, tudo funciona. Em um servidor, o time sobe os dois containers com `docker run` e a API falha com `UnknownHostException: db`, apesar de o banco estar saudável a um passo de distância. A "correção" mais comum é trocar `db` pelo IP `172.17.0.3`, e uma semana depois o banco é recriado, o IP muda e a API volta a falhar.

Nomes são a forma estável de endereçar um serviço, e o Docker só resolve nomes de containers numa **rede definida pelo usuário**. É o primeiro passo para qualquer arquitetura com mais de um container, e é o mesmo mecanismo que o Compose usa por baixo (aula 21).

## Como funciona

A bridge padrão (`bridge`, com a `docker0`) é, por razões históricas, uma rede sem DNS: os containers dela se enxergam por IP. Quando você cria uma rede com `docker network create loja`, o Docker cria uma **nova bridge** (com a sua própria interface `br-<id>` no host), escolhe a próxima faixa livre (`172.18.0.0/16` numa instalação nova) e liga os containers que entram nela com `--network loja`. Três coisas mudam em relação à bridge padrão:

**1. DNS embutido.** O `/etc/resolv.conf` do container aponta para `nameserver 127.0.0.11`. Esse endereço é um **servidor DNS do próprio daemon**, que responde:

- o **nome do container** (`db`) e os **aliases de rede** (`--network-alias banco`) dos containers que estão nas mesmas redes que quem pergunta;
- qualquer outro nome é **encaminhado ao resolvedor do host** (o `/etc/resolv.conf` que o daemon herdou, ou o `--dns` configurado).

É o protocolo DNS da aula 17 da trilha de Redes, com um servidor que conhece só os containers. O IP vem de uma consulta a cada resolução, e por isso uma recriação do banco com outro IP é invisível para quem usa o nome (com a ressalva do cache da JVM, abaixo).

**2. Isolamento entre redes.** Containers de redes diferentes não se alcançam e **não se resolvem** por nome. Cada aplicação ganha a sua rede, e o banco de um projeto fica fora do alcance dos containers de outro. Para um container participar de duas redes, use `docker network connect <rede> <container>`: ele ganha uma segunda interface e passa a resolver os nomes das duas. É assim que um proxy reverso fica ao mesmo tempo na rede pública e na rede privada da aplicação.

**3. Recursos extras.** Redes definidas pelo usuário aceitam IP fixo (`--ip`, com `--subnet` na rede), alias de rede e a opção `--internal`, que **remove a saída para a internet**. Vários containers com o mesmo alias fazem o DNS devolver **mais de um endereço** (um balanceamento por DNS, sem saúde nem peso). O antigo `--link` também resolvia nomes, mas é um recurso **legado** que não deve ser usado em projetos novos.

Um detalhe que pega quem trabalha com Java: a JVM guarda em cache o resultado de DNS. A propriedade `networkaddress.cache.ttl` (em `java.security`) define por quanto tempo um endereço é lembrado, e quando ela não é definida o padrão é **30 segundos** (sem *security manager*). O cache **negativo** é de **10 segundos**: se o nome falha uma vez, a falha também é lembrada. Num ambiente de containers, que recria e reescala, um TTL curto evita falar com um IP que já não existe.

## Na prática

```bash
docker network create loja
docker run -d --name db  --network loja -e POSTGRES_PASSWORD=segredo postgres:16
docker run -d --name api --network loja loja/api:1.0

docker exec api getent hosts db
docker exec api cat /etc/resolv.conf
docker network inspect loja --format '{{(index .IPAM.Config 0).Subnet}}'
docker network connect loja outro-container
```

O `getent hosts db` devolve uma linha como `172.18.0.3  db  db` (o endereço atual do `db`). O `resolv.conf` mostra `nameserver 127.0.0.11` e `options ndots:0`. O mesmo teste na bridge padrão, com `docker run --rm alpine ping -c 1 db`, falha com `ping: bad address 'db'`. O programa Java abaixo reproduz o que a aplicação faz: resolve um nome e mostra as configurações de cache da JVM:

```java
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.security.Security;

public class ResolveDb {
    public static void main(String[] args) throws Exception {
        String host = args.length > 0 ? args[0] : "db";
        System.out.println("networkaddress.cache.ttl = " + Security.getProperty("networkaddress.cache.ttl"));
        System.out.println("networkaddress.cache.negative.ttl = " + Security.getProperty("networkaddress.cache.negative.ttl"));
        try {
            for (InetAddress endereco : InetAddress.getAllByName(host)) {
                System.out.println(host + " -> " + endereco.getHostAddress());
            }
        } catch (UnknownHostException e) {
            System.out.println("UnknownHostException: " + e.getMessage());
        }
    }
}
```

Rode-o em dois cenários com `docker run --rm [--network loja] -v "$PWD:/app" eclipse-temurin:21-jdk java /app/ResolveDb.java`. Na bridge padrão, o resultado é `UnknownHostException: db: Name or service not known`. Na rede `loja`, com o container `db` rodando, ele imprime algo como `db -> 172.18.0.3`, e com `--network-alias banco` no container `db`, o nome `banco` também resolve. A propriedade `networkaddress.cache.ttl` aparece como `null` quando ninguém a definiu.

## Armadilhas comuns

- **Esperar DNS na bridge padrão.** Só redes definidas pelo usuário resolvem nomes de containers. Crie uma rede por aplicação.
- **Colocar o banco e todos os projetos na mesma rede.** Perde-se o isolamento: qualquer container alcança o banco de qualquer outro. Use redes separadas e `network connect` só onde necessário.
- **Fixar IPs de containers na configuração.** Os IPs mudam na recriação. Use o nome ou o alias.
- **Ignorar o cache de DNS da JVM.** Um TTL longo (ou infinito, com *security manager*) mantém o IP antigo depois de o container ser recriado. Defina `networkaddress.cache.ttl` com um valor baixo em ambientes dinâmicos.
- **Nomes com a rede errada.** O nome `db` só resolve para quem está **na mesma rede**. Um `docker run` sem `--network` volta para a bridge padrão e a falha reaparece.
- **Esperar que o nome do container exista na rede do host.** O DNS embutido atende apenas containers; o host não consulta o `127.0.0.11` do container.

## Checklist de domínio

- [ ] Você explica por que a bridge padrão não resolve nomes e a rede criada resolve
- [ ] Você identifica o `127.0.0.11` no `resolv.conf` e diz quem responde ali
- [ ] Você conecta um container a duas redes com `docker network connect`
- [ ] Você usa alias de rede e sabe o que acontece com vários containers com o mesmo alias
- [ ] Você ajusta o cache de DNS da JVM para um ambiente que recria containers

## Para ir além

- [Docker: redes definidas pelo usuário (driver bridge)](https://docs.docker.com/engine/network/drivers/bridge/)
- [Docker: redes de containers e DNS](https://docs.docker.com/engine/network/)
- [docker network create](https://docs.docker.com/reference/cli/docker/network/create/)
- [docker network connect](https://docs.docker.com/reference/cli/docker/network/connect/)
- [man7.org: resolv.conf(5)](https://man7.org/linux/man-pages/man5/resolv.conf.5.html)
