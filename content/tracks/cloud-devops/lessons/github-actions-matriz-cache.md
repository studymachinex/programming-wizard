> **Em uma frase:** GitHub Actions é um executor de containers com um YAML de gatilhos, permissões e jobs — e a maior parte dos incidentes de CI vem de permissão larga, cache envenenado ou segredo exposto em evento errado.

## O problema

O workflow da `pedidos-api` tem 600 linhas, roda 14 jobs e leva 38 minutos. Metade dos jobs repete `mvn install`; a matriz testa Java 17, 21 e 22 em três sistemas operacionais, mas o serviço só suporta Java 21. O cache Maven tem a mesma chave para todas as branches. Em um PR de fork, o job de deploy falha porque não tem secret — e alguém sugere `pull_request_target` para "resolver".

GitHub Actions é poderoso justamente porque é fácil de escrever demais. Um workflow bom tem gatilhos claros, permissões mínimas, jobs com responsabilidade única, cache com chave correta e credenciais temporárias. O resto é custo e risco.

## Como funciona

O workflow é acionado por eventos (`push`, `pull_request`, `workflow_dispatch`, `schedule`). Cada job roda em um runner novo, com filesystem limpo, e os jobs são paralelos por padrão. `needs` cria dependência; `if` controla execução; `strategy.matrix` replica um job com combinações de variáveis.

Permissões são declaradas no topo ou por job. O `GITHUB_TOKEN` nasce com um escopo padrão que varia por repositório e organização; declarar `permissions: contents: read` reduz o dano de uma action comprometida. Para OIDC na AWS, o job precisa de `id-token: write`; para publicar no GHCR, `packages: write`.

Cache é um par chave/valor imutável. A primeira execução que cria a chave vence; as seguintes restauram. Se a chave não inclui o hash do `pom.xml`, um build antigo pode restaurar dependências desatualizadas. `actions/setup-java` com `cache: maven` faz isso corretamente usando o hash dos arquivos de build.

```yaml
name: pedidos-ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: pedidos-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        postgres: ["15", "16"]
    services:
      postgres:
        image: postgres:${{ matrix.postgres }}
        env:
          POSTGRES_DB: pedidos
          POSTGRES_USER: pedidos
          POSTGRES_PASSWORD: pedidos
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U pedidos -d pedidos"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: maven
      - name: Testes
        env:
          DB_URL: jdbc:postgresql://localhost:5432/pedidos
          DB_USER: pedidos
          DB_PASSWORD: pedidos
        run: ./mvnw -B -ntp verify
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: testes-postgres-${{ matrix.postgres }}
          path: target/surefire-reports/
          retention-days: 7
```

A matriz de Postgres é útil quando você suporta duas versões ou está migrando. Ela dobra o tempo de teste; não crie matriz de Java se o runtime é fixo em 21. `fail-fast: false` garante que a falha em uma versão não esconda o resultado da outra.

O job de imagem publica uma vez, com tag do SHA, e os jobs de deploy reutilizam esse digest:

```yaml
  image:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/acme/pedidos-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          sbom: true
          provenance: mode=max
```

O cache `type=gha` é separado do cache Maven e acelera camadas Docker. `mode=max` guarda cache de estágios intermediários; custa espaço e tempo de upload, mas ajuda muito em builds multi-stage.

Para deploy na AWS sem access key:

```yaml
  deploy-staging:
    needs: image
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-pedidos-staging
          aws-region: sa-east-1
      - run: |
          aws eks update-kubeconfig --name pedidos-staging --region sa-east-1
          kubectl -n pedidos set image deployment/pedidos-api \
            api=ghcr.io/acme/pedidos-api:${{ github.sha }}
          kubectl -n pedidos rollout status deployment/pedidos-api --timeout=300s
```

A role confia no provedor OIDC do GitHub e restringe `sub` ao repositório, branch e environment. Credenciais duram minutos, não meses. `environment: staging` permite regras de proteção, como revisores obrigatórios e restrição de branches.

## Na prática

```bash
# Validar sintaxe localmente
npx actionlint .github/workflows/*.yml

# Ver o que seria executado, sem rodar
act pull_request -n

# Rodar um job específico
act -j test --container-architecture linux/amd64
```

`act` não substitui o runner real, mas pega erros de YAML e expressões. Para depurar expressões, use `ACTIONS_STEP_DEBUG=true` como secret e habilite `set -x` no shell.

Um teste que depende do banco real:

```java
import static org.assertj.core.api.Assertions.assertThat;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

@QuarkusTest
class PedidoRepositoryIT {

    @Inject
    PedidoRepository repository;

    @Test
    void persisteEPesquisa() {
        var salvo = repository.salvar(new Pedido(null, "cliente-1"));
        assertThat(repository.buscar(salvo.id())).isPresent();
    }
}
```

Esse teste só roda no CI se o service container estiver saudável. O Quarkus lê a conexão de `QUARKUS_DATASOURCE_JDBC_URL`, `QUARKUS_DATASOURCE_USERNAME` e `QUARKUS_DATASOURCE_PASSWORD`, variáveis definidas no job. O healthcheck do serviço não é opcional: sem ele, o Maven inicia antes do Postgres aceitar conexões e o job falha de forma intermitente.

## Armadilhas comuns

- **`pull_request_target` com checkout do PR.** O workflow roda com secrets do repositório base; executar código de terceiros ali é execução remota de código com credenciais. Use `pull_request` para testes e `workflow_run` com cuidado para o resto.
- **Permissões padrão largas.** `write-all` em um workflow que só testa é dano potencial gratuito. Declare o mínimo por job.
- **Cache envenenado.** Cache criado por uma branch não confiável pode ser restaurado por outra. Não cacheie artefatos executáveis de PRs de fork; limite a dependências.
- **Matriz sem necessidade.** Cada combinação custa minutos e aumenta o tempo até o feedback. Teste o que você suporta de verdade.
- **Secrets em logs.** `echo ${{ secrets.X }}` e comandos com `set -x` vazam. Use `::add-mask::` e evite imprimir ambiente.
- **Actions sem pin.** Tags como `@v4` são móveis; um comprometimento da action executa código no seu runner. Em produção, pine por SHA.
- **Deploy em `pull_request`.** Só faça deploy em `push`/`workflow_dispatch` com environment protegido. PR de fork não deve ter credenciais.

## Checklist de domínio

- [ ] Você escreve um workflow com gatilhos, permissões, concorrência e cache corretos
- [ ] Você usa matriz e service containers sem multiplicar custo à toa
- [ ] Você configura OIDC e environments em vez de access keys
- [ ] Você reconhece os vetores de ataque de `pull_request_target` e cache

## Para ir além

- [GitHub Docs — Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- [GitHub Docs — Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [GitHub Docs — Workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
