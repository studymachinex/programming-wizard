> **Em uma frase:** rede de container é software — nomes, rotas e portas são configuração — enquanto o volume é a única peça que precisa sobreviver ao `docker rm`.

## O problema

A `pedidos-api` sobe em um container e o Postgres em outro. No notebook, a API conecta em `localhost:5432` e tudo funciona. Ao levar para o compose, a conexão falha com `Connection refused`; alguém troca para o IP do container, funciona por um dia e quebra no próximo `up` porque o IP mudou.

Há ainda a segunda armadilha: o banco foi criado sem volume. Um `docker compose down` remove o container e leva junto todos os pedidos de teste. O time descobre que "persistência" não é consequência de rodar Postgres em container; é uma decisão explícita de montar um volume e testar o restore.

## Como funciona

Cada container recebe um network namespace próprio, com interfaces, rotas e tabela de portas isoladas. O runtime conecta esse namespace ao host por um par `veth` e uma bridge. Quando você publica `-p 8080:8080`, o Docker instala regras de NAT encaminhando a porta do host para o IP do container. Sem publicação, o serviço só é alcançável de dentro da rede.

A bridge padrão (`docker0`) não tem DNS embutido. Redes definidas pelo usuário têm um servidor DNS interno em `127.0.0.11`, que resolve o nome do container e os aliases da rede. É por isso que `jdbc:postgresql://postgres:5432/pedidos` funciona em uma rede criada por você e não na default. O nome é estável; o IP não é.

| Driver | Alcance | Uso típico |
|---|---|---|
| `bridge` | Um host | Desenvolvimento e containers no mesmo host |
| `host` | Rede do host, sem NAT | Baixa latência, mas sem isolamento de portas |
| `overlay` | Vários hosts | Swarm e ambientes multi-host |
| `macvlan` | IP na rede física | Dispositivos legados que exigem L2 |

Para dados, existem três montagens com semânticas diferentes. **Volume nomeado** é gerenciado pelo Docker, fica em `/var/lib/docker/volumes` e sobrevive ao container. **Bind mount** mapeia um diretório do host; é ótimo para código em desenvolvimento e perigoso para dados porque permissões e backup passam a ser responsabilidade sua. **tmpfs** fica na memória e desaparece com o container; serve para cache e arquivos temporários, nunca para o banco.

O Quarkus configura o datasource por propriedades; não é preciso escrever um bean de `DataSource`. O pool é do Agroal e os timeouts são explícitos:

```properties
quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=jdbc:postgresql://postgres:5432/pedidos
quarkus.datasource.username=${DB_USER}
quarkus.datasource.password=${DB_PASSWORD}
quarkus.datasource.jdbc.max-size=10
quarkus.datasource.jdbc.acquisition-timeout=3s
```

O pool merece atenção porque o banco em container tem menos margem. Se o Postgres aceita 100 conexões e você sobe 10 réplicas com pool 20, o limite é atingido e as conexões começam a falhar com `too many clients`. Dimensione o pool por réplica: `(conexões disponíveis - reserva) / réplicas`. O timeout curto é intencional; é melhor falhar rápido e acionar retry do que prender threads por 30 segundos.

```java
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Entity
class Pedido {
    @Id long id;
    long clienteId;
    BigDecimal total;
    Instant criadoEm;
}

@ApplicationScoped
class PedidoRepository implements PanacheRepository<Pedido> {

    List<Pedido> ultimos(int limite) {
        return find("order by criadoEm desc")
                .page(0, limite)
                .list();
    }
}
```

## Na prática

Crie a rede e o volume antes de subir os serviços:

```bash
docker network create pedidos-net
docker volume create pedidos-pgdata

docker run -d --name postgres \
  --network pedidos-net \
  -e POSTGRES_DB=pedidos \
  -e POSTGRES_USER=pedidos \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/db_password \
  -v pedidos-pgdata:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16
```

Publicar em `127.0.0.1` evita expor o banco na rede local. Se você usar `-p 5432:5432`, qualquer máquina que alcance seu host pode tentar conectar; em uma rede de café ou escritório, isso é um incidente esperando acontecer.

Teste a resolução de nomes de dentro da rede, sem depender da sua máquina:

```bash
docker run --rm --network pedidos-net postgres:16 \
  psql -h postgres -U pedidos -d pedidos -c 'select version();'
```

O backup precisa ser testado, não apenas escrito:

```bash
docker exec -T postgres pg_dump -U pedidos -d pedidos -Fc > pedidos-$(date +%F).dump
docker exec -i postgres pg_restore -U pedidos -d pedidos_teste --clean --if-exists < pedidos-2026-11-16.dump
```

Para um banco de produção, isso é o mínimo: dump criptografado, retenção definida, restore ensaiado. Um volume não é backup — ele compartilha o disco do host e desaparece se o host morrer. `docker volume prune` também remove volumes não usados, e é fácil rodá-lo em um script de limpeza.

## Armadilhas comuns

- **Apontar para `localhost` dentro do container.** `localhost` é o próprio container. Use o nome do serviço na rede (ou `host.docker.internal` quando realmente precisar do host).
- **Trocar nome por IP.** IPs de container mudam a cada recriação; DNS de rede definida resolve o nome e acompanha o ciclo de vida.
- **Guardar dados no filesystem gravável.** `docker rm` apaga; uma nova imagem não recupera. Monte volume nomeado e documente o ponto de montagem.
- **Bind mount em caminho Windows para Postgres.** Permissões e performance podem degradar; para dados, prefira volume nomeado.
- **Achar que `depends_on` espera o banco ficar pronto.** Sem `condition: service_healthy`, ele só ordena o start; a API pode tentar conectar antes do Postgres aceitar conexões.
- **Rodar `docker compose down -v` em ambiente com dados.** O `-v` remove volumes nomeados do projeto. Trate esse comando como destrutivo.

## Checklist de domínio

- [ ] Você explica por que o nome do serviço resolve e o IP não é confiável
- [ ] Você escolhe volume, bind mount ou tmpfs conforme o dado
- [ ] Você faz backup e restore de um Postgres em container e valida o restore
- [ ] Você dimensiona pool de conexões considerando réplicas e limite do banco

## Para ir além

- [Docker Docs — Networking overview](https://docs.docker.com/engine/network/)
- [Docker Docs — Volumes](https://docs.docker.com/engine/storage/volumes/)
- [PostgreSQL — Docker Official Image](https://hub.docker.com/_/postgres)
