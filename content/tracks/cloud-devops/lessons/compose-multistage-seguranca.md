> **Em uma frase:** compose é um ambiente local reproduzível, não um orquestrador de produção; usá-lo bem significa healthchecks reais, segredos fora do Git e um container que não precisa de root para funcionar.

## O problema

O onboarding do time tem sete passos manuais: instalar Postgres, criar o banco, subir Redis, exportar variáveis, rodar a API, criar um usuário e lembrar de não commitar o `.env`. Quando alguém troca a senha local, o compose quebra para os outros. Quando o build muda, metade do time esquece de rebuildar e testa uma imagem antiga.

O `compose.yaml` resolve isso quando é tratado como código de ambiente: um comando sobe o sistema inteiro, os serviços esperam dependências ficarem saudáveis e a configuração sensível vem de arquivo, não de `environment:` commitado. O mesmo arquivo também é uma excelente forma de documentar dependências e limites.

## Como funciona

O Compose lê um modelo declarativo, cria uma rede por projeto, resolve nomes pelo nome do serviço e aplica labels para rastrear os recursos. `depends_on` com `condition: service_healthy` espera o healthcheck; sem a condição, ele apenas ordena a criação. `profiles` permite subir serviços opcionais, como um Kafka local, sem obrigar todo mundo a pagar o custo de memória.

O compose não substitui Kubernetes em produção: não há scheduler multi-nó, self-healing sofisticado, rollout progressivo nem HPA. Ele é ótimo para desenvolvimento, testes de integração e pequenos deploys em uma única máquina — desde que você saiba que o `restart: unless-stopped` não é alta disponibilidade.

Segurança de imagem começa antes do compose. Um container hardened típico tem:

- usuário não-root no Dockerfile;
- root filesystem somente leitura, com `tmpfs` para `/tmp`;
- todas as capabilities removidas (`cap_drop: [ALL]`);
- `security_opt: [no-new-privileges:true]`;
- segredo montado como arquivo em `/run/secrets`;
- imagem com tag imutável e scan no CI.

```yaml
name: pedidos

services:
  api:
    build:
      context: .
      target: runtime
    image: ghcr.io/acme/pedidos-api:1.4.2
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      QUARKUS_PROFILE: docker
      DB_URL: jdbc:postgresql://postgres:5432/pedidos
      DB_USER: pedidos
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    read_only: true
    tmpfs:
      - /tmp:size=64m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8080 && printf 'GET /q/health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q '200 OK' <&3"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 768M

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: pedidos
      POSTGRES_USER: pedidos
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pedidos -d pedidos"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru"]
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

O healthcheck da API usa `/dev/tcp` do bash porque a imagem JRE não necessariamente tem `curl`. Se você usa distroless, não há shell: o healthcheck precisa ser um binário presente na imagem ou o Kubernetes precisa fazer a probe HTTP.

O segredo em arquivo exige código que o leia. Não adiante montar `/run/secrets/db_password` e continuar lendo `DB_PASSWORD` do ambiente:

```java
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

record DbCredential(String value) {}

@Singleton
class SecretConfig {

    @Produces
    @Singleton
    DbCredential dbCredential(
            @ConfigProperty(name = "DB_PASSWORD_FILE") Optional<String> arquivo,
            @ConfigProperty(name = "DB_PASSWORD") Optional<String> env) throws IOException {
        if (arquivo.isPresent()) {
            return new DbCredential(Files.readString(Path.of(arquivo.get())).trim());
        }
        // Apenas para desenvolvimento local; em produção, exija o arquivo.
        return new DbCredential(env.orElseThrow(
                () -> new IllegalStateException("DB_PASSWORD_FILE ou DB_PASSWORD obrigatório")));
    }
}
```

Esse fallback é deliberado, mas deve ser restrito ao perfil local. Em produção, a ausência do arquivo deve impedir o boot; aceitar segredo em env como plano B anula parte do ganho. Prefixe a propriedade com `%dev.` no `application.properties` se quiser que só o perfil de desenvolvimento aceite a variável.

## Na prática

O ciclo básico:

```bash
docker compose config                # valida e mostra o modelo resolvido
docker compose up --build -d
docker compose ps
docker compose logs -f api
docker compose exec postgres psql -U pedidos -d pedidos
docker compose down                  # preserva volumes nomeados
```

`docker compose config` é subestimado. Ele resolve variáveis, interpolação e mostra o YAML final; é ali que você descobre que uma variável vazia virou string vazia ou que o segredo foi parar no ambiente. Use `${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD}` para falhar cedo em vez de subir com senha vazia.

Para trocar a imagem e testar de verdade:

```bash
docker compose build --pull api
docker compose up -d --force-recreate api
docker compose ps --format json | jq '.[] | {Service, State, Health}'
```

Hardening e scan:

```bash
trivy image --severity HIGH,CRITICAL --ignore-unfixed ghcr.io/acme/pedidos-api:1.4.2
docker scout cves ghcr.io/acme/pedidos-api:1.4.2
docker buildx build --sbom=true --provenance=mode=max --push -t ghcr.io/acme/pedidos-api:1.4.2 .
```

O scan precisa de política. Uma imagem base sempre terá CVEs; se o pipeline falhar em qualquer CVE, ninguém consegue entregar. Defina o que bloqueia: crítica com correção disponível, por exemplo. Registre exceções com justificativa e data de reavaliação.

## Armadilhas comuns

- **Segredo em `environment:` commitado.** Vai para o Git, para o `docker inspect` e para logs. Use `secrets:` com arquivo fora do repositório ou um cofre.
- **`depends_on` sem healthcheck.** A API inicia antes do Postgres aceitar conexões e morre no primeiro `Connection refused`; o restart pode mascarar o problema até o pico.
- **`read_only: true` sem `tmpfs`.** A JVM e o Quarkus escrevem em `/tmp`; sem tmpfs, a aplicação falha de forma intermitente em upload e geração de arquivo.
- **Rodar como root "porque o volume precisa".** Ajuste ownership no build ou use `user: "10001:10001"`; não abra mão do usuário sem privilégio por conveniência.
- **Usar `latest` e achar que `build` atualizou.** Compose pode reutilizar imagem local. Use tag por SHA e `--pull` quando quiser a versão do registry.
- **Tratar compose como produção.** Sem réplicas em hosts diferentes, um reboot derruba tudo. Para produção, use Kubernetes/ECS e mantenha o compose para desenvolvimento e integração.

## Checklist de domínio

- [ ] Você sobe API, Postgres e Redis com um comando e healthchecks reais
- [ ] Você lê segredo de arquivo no Java sem deixá-lo no ambiente
- [ ] Você aplica non-root, read-only, cap_drop e no-new-privileges
- [ ] Você integra scan e SBOM ao build e define o que bloqueia o pipeline

## Para ir além

- [Compose Specification](https://docs.docker.com/compose/compose-file/)
- [Docker Docs — Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
- [OWASP — Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
