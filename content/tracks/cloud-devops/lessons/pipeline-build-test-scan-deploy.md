> **Em uma frase:** pipeline é o contrato entre o commit e a produção — se o artefato testado não é o artefato implantado, o verde do CI não significa nada.

## O problema

O pipeline passou. Cinco minutos depois, produção está com 500. O log mostra uma versão diferente da testada: o job de deploy rodou `mvn package` de novo, baixou uma dependência recém-publicada e construiu outra imagem. O teste de integração usava H2, produção usa Postgres. O scan de segurança era `continue-on-error` e ninguém olhava.

Pipeline não é uma esteira de comandos; é um conjunto de evidências. Cada etapa precisa responder a uma pergunta e bloquear quando a resposta é não. E o artefato precisa ser imutável: o que passou em staging é exatamente o que vai para produção, com a mesma imagem, o mesmo digest e a mesma configuração versionada.

## Como funciona

Um pipeline saudável tem seis fases:

1. **Build reprodutível** — compila com versão fixa de JDK/Maven e gera um artefato identificável pelo SHA do commit.
2. **Testes rápidos** — unitários e de contrato, com fail fast em minutos.
3. **Testes de integração** — banco real, mensageria real, migrações aplicadas.
4. **Análise e scan** — SAST, dependências, segredo, imagem e licença.
5. **Publicação** — registry imutável, SBOM, assinatura e procedência.
6. **Deploy e verificação** — promove o mesmo digest, aplica migração compatível e roda smoke test.

O *fail fast* é econômico. Um teste unitário que falha em 40 segundos evita 12 minutos de build de imagem. Coloque primeiro o que é rápido e barulhento. Testes de integração e scan vêm depois, mas antes de qualquer publicação.

```yaml
name: pedidos-ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: maven
      - run: ./mvnw -B -ntp verify
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: surefire
          path: target/surefire-reports/

  scan:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t pedidos-api:${{ github.sha }} .
      - uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: pedidos-api:${{ github.sha }}
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: "1"
```

O scan acima constrói a imagem localmente; em um pipeline real, o job de build publica no registry com tag do SHA e o scan puxa esse digest. O importante é que o scan e o deploy usem o mesmo artefato, não duas construções parecidas.

**Quality gates** precisam de política. "Falhar em qualquer CVE" parece rigoroso, mas a base image quase sempre tem algo; o pipeline fica vermelho para sempre e o time aprende a ignorar. Uma política defensável: bloqueia crítica com correção disponível, alta com correção e exploração conhecida; aceita o resto com prazo e dono. Cobertura de teste é outro gate perigoso: 80% de linhas com testes sem asserção não mede qualidade.

```java
import static org.junit.jupiter.api.Assertions.assertEquals;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class FreteServiceTest {

    private final FreteService service = new FreteService();

    @Test
    void freteGratisAcimaDoLimite() {
        BigDecimal frete = service.calcular(new BigDecimal("249.90"), "SP");
        assertEquals(BigDecimal.ZERO, frete);
    }

    @Test
    void freteCobraAbaixoDoLimite() {
        BigDecimal frete = service.calcular(new BigDecimal("149.90"), "SP");
        assertEquals(new BigDecimal("19.90"), frete);
    }
}
```

Um teste assim protege a regra de negócio sem depender de banco. O teste de integração cobre o repositório e a migração; o unitário cobre o cálculo. Se todos os testes sobem o contexto Quarkus e um Postgres, o pipeline fica lento e frágil.

**Assinatura e SBOM** fecham a cadeia. `cosign sign` com OIDC assina o digest sem chave estática; o Kubernetes pode verificar a assinatura com uma policy (Sigstore Policy Controller, Kyverno). O SBOM responde "quais bibliotecas estão nesta imagem?" meses depois, quando sai um CVE.

```bash
docker buildx build --push \
  --sbom=true --provenance=mode=max \
  -t ghcr.io/acme/pedidos-api:${GIT_SHA} .

cosign sign --yes ghcr.io/acme/pedidos-api@${DIGEST}
syft ghcr.io/acme/pedidos-api:${GIT_SHA} -o spdx-json > pedidos.spdx.json
```

## Na prática

Um fluxo de promoção sem rebuild:

```bash
# 1. build e push único
IMAGE=ghcr.io/acme/pedidos-api:${GIT_SHA}
docker buildx build --push -t "$IMAGE" .

# 2. staging usa o digest imutável
kubectl -n pedidos-staging set image deployment/pedidos-api api="$IMAGE"
kubectl -n pedidos-staging rollout status deployment/pedidos-api --timeout=180s

# 3. smoke test
curl -fsS https://staging.pedidos.example.com/q/health/ready

# 4. produção usa o mesmo digest
kubectl -n pedidos-prod set image deployment/pedidos-api api="$IMAGE"
kubectl -n pedidos-prod rollout status deployment/pedidos-api --timeout=300s
```

`set image` com tag SHA ainda depende de o registry resolver a tag corretamente. Para garantia máxima, use `@sha256:...`. O digest é o único identificador que não muda.

Migrações merecem uma etapa própria. Aplique antes do deploy com compatibilidade para frente e para trás: adicionar coluna nullable é seguro; renomear ou remover coluna quebra a versão antiga durante o rollout. O padrão *expand/contract* separa a mudança em duas entregas.

Métricas de pipeline útil são as quatro do DORA: frequência de deploy, lead time do commit à produção, change failure rate e tempo de restauração. Se o pipeline leva 50 minutos e o deploy é semanal, o gargalo pode ser processo, não tecnologia.

## Armadilhas comuns

- **Rebuildar por ambiente.** Staging e produção deixam de ser o mesmo binário. Build uma vez, promova o digest.
- **Tag `latest` ou `stable`.** Não há rastreabilidade e o rollback fica ambíguo. Use SHA/digest.
- **Testar com banco diferente do de produção.** H2 esconde dialeto, constraints e transações. Use Postgres real via service container ou Testcontainers.
- **Scan não bloqueante.** `continue-on-error` em segurança é uma forma educada de não ter segurança.
- **Migrations e app no mesmo passo sem compatibilidade.** O rollout mistura versões e o schema novo quebra a antiga.
- **Pipeline que só roda em main.** O PR passa sem os mesmos testes e o problema aparece depois do merge.
- **Cache sem chave correta.** Cache de dependências compartilhado entre branches pode servir artefato errado; use chave por `pom.xml`/lockfile.

## Checklist de domínio

- [ ] Você desenha um pipeline com estágios, gates e artefato imutável
- [ ] Você explica por que o mesmo digest deve ir de staging a produção
- [ ] Você define uma política de scan que bloqueia o que importa
- [ ] Você separa migração de schema do deploy da aplicação

## Para ir além

- [Google Cloud — DevOps Tech: Continuous Delivery](https://cloud.google.com/architecture/devops/devops-tech-continuous-delivery)
- [Docker Docs — Build attestations](https://docs.docker.com/build/attestations/)
- [Sigstore — cosign](https://docs.sigstore.dev/cosign/overview/)
