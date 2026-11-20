> **Em uma frase:** ConfigMap e Secret separam configuração do binário, mas o HPA só funciona se você declarar requests — e memória raramente é a métrica certa para escalar uma JVM.

## O problema

O time precisa mudar o limite de crédito sem rebuildar a imagem. Alguém coloca o valor em uma variável de ambiente no Deployment e, na próxima troca, percebe que o pod antigo continua com o valor antigo: ConfigMap montado como env não atualiza sozinho.

Em outro episódio, o HPA foi configurado com `targetCPUUtilizationPercentage: 70`, mas o `kubectl get hpa` mostra `<unknown>/70%`. O serviço está com 300m de CPU e 90% de uso; ninguém entende por que não escala. Faltam requests. Sem denominador, o HPA não calcula porcentagem. E quando finalmente escala, o novo pod demora 40 segundos para ficar pronto, porque a startup probe está configurada como liveness.

## Como funciona

Um **ConfigMap** guarda pares chave-valor não sensíveis. Pode ser consumido como variáveis (`envFrom`, `valueFrom`) ou como arquivos montados em um volume. A diferença é crucial: variáveis são copiadas na criação do container e não mudam; um volume montado é atualizado pelo kubelet em alguns segundos/minutos, mas a aplicação precisa reler o arquivo. `immutable: true` impede alterações e melhora a performance do kubelet em clusters grandes, ao custo de exigir um novo ConfigMap e um rollout para mudar.

Um **Secret** é semelhante, mas o valor é armazenado em base64 — que é codificação, não criptografia. Qualquer pessoa com `get secret` decodifica. O que protege de verdade é RBAC restrito, encryption at rest no etcd e, idealmente, um cofre externo (AWS Secrets Manager, Vault) sincronizado por External Secrets Operator ou CSI driver. Secret em variável de ambiente aparece em `kubectl describe`, em `/proc/<pid>/environ` e em dumps; monte como arquivo quando possível.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pedidos-api-config
  namespace: pedidos
data:
  DB_URL: jdbc:postgresql://postgres.pedidos.svc.cluster.local:5432/pedidos
  DB_POOL_SIZE: "10"
  LOG_LEVEL: INFO
---
apiVersion: v1
kind: Secret
metadata:
  name: pedidos-api-secret
  namespace: pedidos
type: Opaque
stringData:
  DB_PASSWORD: "troque-isto-em-producao"
```

`stringData` aceita texto puro e o API server converte para base64; é conveniente, mas o manifesto não deve ir para o Git com a senha. Em produção, o Secret deve ser criado pelo pipeline a partir do cofre, com nome derivado do ambiente, e o Deployment referencia o nome — não o valor.

**Requests** são o que o scheduler reserva e o denominador do HPA. **Limits** são o teto do cgroup. Memória acima do limit mata o container (OOMKilled); CPU acima do limit é throttled. As classes de QoS:

| Classe | Condição | Consequência |
|---|---|---|
| Guaranteed | requests = limits para CPU e memória | mais previsível, menor densidade |
| Burstable | requests < limits ou só requests | flexível, sujeito a throttling/competição |
| BestEffort | sem requests e limits | primeiro candidato à evicção |

O HPA consulta o metrics-server (ou métricas customizadas) e calcula `desiredReplicas = ceil(currentReplicas × currentMetric / targetMetric)`. Com 3 réplicas a 90% e target 70%, o cálculo dá `ceil(3 × 90/70) = 4`. O `behavior` controla a velocidade: `stabilizationWindowSeconds` evita flapping; `scaleUp` e `scaleDown` têm políticas separadas.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pedidos-api
  namespace: pedidos
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: pedidos-api
  template:
    metadata:
      labels:
        app.kubernetes.io/name: pedidos-api
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/pedidos-api:1.4.2
          envFrom:
            - configMapRef:
                name: pedidos-api-config
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: pedidos-api-secret
                  key: DB_PASSWORD
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              memory: 768Mi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: pedidos-api
  namespace: pedidos
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pedidos-api
  minReplicas: 3
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
```

O limit de CPU foi omitido de propósito. Com request 250m e sem limit, o pod pode usar burst quando há CPU ociosa, mas o scheduler só garante 250m. Para latência previsível, iguale `limits.cpu` ao request; para elasticidade, deixe sem limit e monitore throttling.

```java
import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.time.Duration;

@ConfigMapping(prefix = "pedidos")
public interface PedidosConfig {

    @Min(1)
    int pageSize();

    @NotBlank
    String logLevel();

    @Min(1)
    int poolSize();

    @WithDefault("3s")
    Duration timeout();
}
```

Com `@ConfigMapping`, o Quarkus valida e converte o ambiente na inicialização. Se `PEDIDOS_POOL_SIZE` vier como string vazia, o boot falha em vez de criar um pool com zero conexões. O mapeamento kebab-case também aceita a forma canônica em variável de ambiente (`PEDIDOS_POOL_SIZE`). Prefira falhar cedo a degradar silenciosamente.

## Na prática

```bash
kubectl -n pedidos get configmap pedidos-api-config -o yaml
kubectl -n pedidos get secret pedidos-api-secret -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
kubectl -n pedidos get hpa pedidos-api
kubectl -n pedidos describe hpa pedidos-api
kubectl top pods -n pedidos
```

`kubectl top` exige metrics-server. Se o HPA mostra `<unknown>`, confira nesta ordem: metrics-server está rodando? os pods têm requests? a métrica está disponível para todos os containers? Sidecar sem request também quebra o cálculo.

Para testar o HPA sem esperar tráfego real, gere carga em um pod separado:

```bash
kubectl -n pedidos run load --rm -it --image=busybox:1.36 --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://pedidos-api/q/health/ready >/dev/null; done'
```

O HPA reage em janelas de dezenas de segundos; um pico de 10 segundos pode não gerar escala a tempo. Para tráfego variável, combine capacidade mínima com métricas de fila ou RPS.

## Armadilhas comuns

- **Secret em env e commitado.** `stringData` no Git é vazamento. Use cofre e RBAC; base64 não protege nada.
- **HPA sem requests.** A porcentagem fica `unknown` e o HPA não escala. Declare requests em todos os containers, inclusive sidecars.
- **HPA de memória para JVM.** O heap não devolve memória de forma suave; a escala oscila ou nunca acontece. Prefira CPU, RPS ou profundidade de fila.
- **Request = limit de CPU em tudo.** Melhora previsibilidade, mas reduz densidade e pode deixar CPU ociosa. Meça throttling antes de generalizar.
- **ConfigMap como env esperando hot reload.** Variáveis não mudam sem recriar o pod. Se precisa de reload, monte arquivo e implemente leitura/refresh.
- **`maxReplicas` baixo demais.** O HPA bate no teto e o serviço satura; o alerta precisa cobrir `maxReplicas` atingido, não só CPU.
- **HPA e VPA no mesmo recurso.** Os dois tentam controlar réplicas/recursos e brigam. Escolha um por dimensão.

## Checklist de domínio

- [ ] Você separa configuração e segredo e sabe o que cada um realmente protege
- [ ] Você explica QoS e o efeito de requests/limits no agendamento e no OOM
- [ ] Você calcula a réplica desejada do HPA e configura behavior
- [ ] Você diagnostica `<unknown>` e saturação no teto de réplicas

## Para ir além

- [Kubernetes — ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes — Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Kubernetes — Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
