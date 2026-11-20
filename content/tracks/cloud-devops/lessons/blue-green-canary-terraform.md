> **Em uma frase:** liberar é reduzir o raio de impacto com exposição gradual, métricas de aborto definidas antes do deploy e um caminho de volta que inclua o banco, não só a imagem.

## O problema

Sexta-feira, 17h. A `pedidos-api` sobe com a imagem nova e a latência p95 dobra. O dashboard mostra a média estável, então alguém decide "acompanhar". Duas horas depois, a migração já gravou a coluna `canal_venda` e o rollback da imagem não resolve: a aplicação nova escreveu dados que a antiga não lê.

Deploy e release não são a mesma coisa. Deploy coloca o artefato no ambiente; release expõe tráfego. Blue/green e canary separam esses momentos de formas diferentes, e Terraform garante que o ambiente onde isso acontece seja reproduzível.

## Como funciona

### Blue/green

Duas pilhas idênticas. O roteador aponta para a azul; a verde sobe, passa em smoke tests e recebe 100% do tráfego de uma vez. O rollback é trocar o ponteiro de volta em segundos. O custo é manter o dobro de capacidade na janela e garantir que as duas versões convivam com o mesmo banco.

A virada não é atômica para requests em voo: conexões keep-alive continuam na pilha antiga até drenar. Por isso o corte precisa de `preStop`, `terminationGracePeriodSeconds` e observação antes de desligar a azul.

### Canary

A versão nova recebe 1–5% do tráfego. A cada janela, compara-se com o baseline e decide-se promover, pausar ou abortar. Sem critério numérico, "parece ok" vira decisão política.

| Sinal | Abortar se | Amostra mínima |
|---|---|---|
| Erros 5xx | > 1% absoluto ou +0,5 p.p. vs baseline | 1.000 requests |
| Latência p95 | > 1,2× o baseline por 2 janelas | 1.000 requests |
| Saturação | CPU > 80% com fila crescendo | 10 minutos |

Canary precisa de volume. Com 20 requests por minuto, 5% são 1 request/min: qualquer análise é ruído. Nesse caso, blue/green com smoke test é mais honesto.

| Critério | Blue/green | Canary |
|---|---|---|
| Exposição inicial | 0% ou 100% | 1–5% |
| Rollback | Troca de ponteiro | Peso de volta a zero |
| Custo | Dobro durante a janela | Quase igual |
| Pré-requisito | Banco compatível com 2 versões | Volume e métricas confiáveis |
| Melhor para | Releases grandes, baixa frequência | Mudanças frequentes, alto tráfego |

### Terraform

State é o mapa entre o HCL e os recursos reais. Local, ele quebra com duas pessoas; no Git, vaza segredo. O backend remoto resolve os dois: S3 versionado e lock contra applies concorrentes. Desde o Terraform 1.10, o backend S3 faz lock nativo com `use_lockfile = true`; antes, DynamoDB era o padrão.

`terraform plan -out=tfplan` seguido de `apply tfplan` garante que você aplica exatamente o que revisou. Módulos encapsulam VPC, subnets e rotas para não copiar 300 linhas entre ambientes, mas se ninguém consegue ler o plan, o módulo virou caixa-preta.

## Na prática

Canary com análise automática no Argo Rollouts:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: pedidos-api
  namespace: pedidos
spec:
  replicas: 20
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: taxa-erro
        - setWeight: 25
        - pause: { duration: 10m }
      trafficRouting:
        nginx:
          stableService: pedidos-api-stable
          canaryService: pedidos-api-canary
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: taxa-erro
  namespace: pedidos
spec:
  metrics:
    - name: erro-5xx
      interval: 1m
      count: 5
      failureLimit: 1
      successCondition: result[0] < 0.01
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_server_requests_seconds_count{
              namespace="pedidos", status=~"5.."
            }[5m]))
            /
            sum(rate(http_server_requests_seconds_count{
              namespace="pedidos"
            }[5m]))
```

Terraform com backend remoto e módulo:

```hcl
terraform {
  required_version = ">= 1.10"
  backend "s3" {
    bucket       = "acme-tfstate-prod"
    key          = "cloud-devops/network.tfstate"
    region       = "sa-east-1"
    encrypt      = true
    use_lockfile = true
  }
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

module "network" {
  source             = "../../modules/network"
  name               = "pedidos-prod"
  azs                = ["sa-east-1a", "sa-east-1b"]
  vpc_cidr           = "10.20.0.0/16"
  enable_nat_gateway = true
}
```

Fluxo de apply com revisão do diff:

```bash
terraform init -backend-config=backend-prod.hcl
terraform plan -out=tfplan -var-file=prod.tfvars
terraform show -json tfplan | jq '.resource_changes[]
  | select(.change.actions != ["no-op"])'
terraform apply tfplan
```

Rollback de aplicação e o limite dele:

```bash
kubectl -n pedidos rollout undo deployment/pedidos-api
kubectl -n pedidos rollout status deployment/pedidos-api --timeout=5m
```

Isso devolve a imagem. Se a migração removeu uma coluna ou tornou um campo obrigatório, o código antigo quebra. A regra é expand/contract: adiciona (expand), o código novo escreve nos dois formatos, todo o tráfego migra e só então remove (contract), em outro deploy.

```java
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public final class PedidoRepository {

    // O código novo tolera a coluna nula: o backfill pode ainda não ter rodado.
    public String canalVenda(Connection conn, long pedidoId) throws SQLException {
        String sql = "SELECT canal_venda FROM pedidos WHERE id = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, pedidoId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalStateException("pedido " + pedidoId + " não existe");
                }
                String canal = rs.getString("canal_venda");
                return canal == null ? "legado" : canal;
            }
        }
    }
}
```

O fallback não é elegância: é o que permite reverter a aplicação sem reverter dados.

## Armadilhas comuns

- **Canary sem volume estatístico.** 5% de 20 req/min não prova nada. Exija amostra mínima ou use blue/green.
- **Blue/green com migração destrutiva.** As duas pilhas compartilham o banco; remover coluna antes de desligar a azul inviabiliza o rollback.
- **Analisar média em vez de cauda.** A média esconde p95 e p99, exatamente onde o usuário sente a degradação.
- **State local ou sem lock.** Dois applies simultâneos corrompem o state; um state no Git expõe segredos.
- **Aplicar plano antigo.** Sem `-out` e `apply tfplan`, o apply recalcula com o state atual e pode fazer algo diferente do revisado.
- **Esquecer de drenar conexões.** O pod antigo recebe SIGKILL com requests em andamento, gerando 502 no momento da virada.

## Checklist de domínio

- [ ] Você escolhe blue/green ou canary a partir de volume, custo e compatibilidade de schema
- [ ] Você define limite de erro, latência e amostra mínima antes do deploy
- [ ] Você explica por que rollback de imagem não desfaz migração destrutiva
- [ ] Você configura backend remoto com lock e aplica um plano salvo
- [ ] Você reconhece quando um módulo Terraform esconde decisões demais

## Para ir além

- [Kubernetes — Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Terraform — State](https://developer.hashicorp.com/terraform/language/state)
- [Terraform — Modules](https://developer.hashicorp.com/terraform/language/modules)
- [Google SRE Workbook — Canarying Releases](https://sre.google/workbook/canarying-releases/)
