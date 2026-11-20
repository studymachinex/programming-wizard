> **Em uma frase:** Deployment não "roda containers"; ele mantém um número de pods saudáveis enquanto troca versões — e probe mal escolhida transforma uma atualização tranquila em queda total.

## O problema

A `pedidos-api` tem três réplicas e um Deployment com `livenessProbe` apontando para `/q/health`. O banco sofre um pico de latência, a health agregada falha, o Kubernetes conclui que os três processos estão mortos e reinicia todos ao mesmo tempo. O incidente do banco vira um incidente de disponibilidade.

Em outro deploy, a nova versão sobe em 45 segundos por causa do aquecimento da JVM, mas a `readinessProbe` começa a checar em 10 segundos. O pod é marcado como não pronto, o rollout trava e o time aumenta o `initialDelaySeconds` até "funcionar". Sem entender startup, readiness e liveness, cada correção vira um número mágico.

## Como funciona

Um **Pod** é a unidade de agendamento: um ou mais containers que compartilham rede e volumes. Ele é efêmero por design. Um **ReplicaSet** garante que existam N pods com determinado template. Um **Deployment** gerencia ReplicaSets e troca de versão por `RollingUpdate`, mantendo disponibilidade durante a substituição.

No `RollingUpdate`, o Deployment cria um ReplicaSet novo e aumenta suas réplicas enquanto reduz o antigo, respeitando `maxSurge` (quantos pods extras podem existir) e `maxUnavailable` (quantos podem ficar indisponíveis). Com 10 réplicas, `maxSurge: 25%` e `maxUnavailable: 0`, ele cria até 3 extras e só remove antigos quando os novos estão prontos. Com `maxUnavailable: 1`, aceita perder uma réplica por vez.

As probes têm papéis distintos:

| Probe | Pergunta | Falha faz o quê |
|---|---|---|
| `startupProbe` | O processo terminou de iniciar? | mantém liveness/readiness desligadas; após o limite, reinicia |
| `readinessProbe` | Pode receber tráfego agora? | remove o pod dos endpoints do Service |
| `livenessProbe` | O processo está travado? | reinicia o container |

A `startupProbe` existe para aplicações lentas. Ela dá até `failureThreshold × periodSeconds` para o boot; só depois a liveness assume. É melhor que um `initialDelaySeconds` gigante na liveness, porque não atrasa a detecção de travas depois que a aplicação já subiu.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pedidos-api
  namespace: pedidos
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app.kubernetes.io/name: pedidos-api
  template:
    metadata:
      labels:
        app.kubernetes.io/name: pedidos-api
    spec:
      terminationGracePeriodSeconds: 40
      containers:
        - name: api
          image: ghcr.io/acme/pedidos-api:1.4.2
          ports:
            - name: http
              containerPort: 8080
          envFrom:
            - configMapRef:
                name: pedidos-api-config
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              memory: 768Mi
          startupProbe:
            httpGet:
              path: /q/health/live
              port: http
            periodSeconds: 5
            failureThreshold: 30
          readinessProbe:
            httpGet:
              path: /q/health/ready
              port: http
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /q/health/live
              port: http
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 5"]
```

O `preStop` com `sleep 5` não é superstição. Quando um pod é removido, o endpoint é retirado do Service e o kubelet envia SIGTERM quase ao mesmo tempo. O sleep dá tempo para o kube-proxy/ingress pararem de mandar tráfego antes de a aplicação começar a encerrar. O `terminationGracePeriodSeconds` precisa cobrir preStop + shutdown da aplicação.

No Quarkus, os endpoints de liveness e readiness já existem quando a extensão `quarkus-smallrye-health` está no classpath. Você só precisa ajustar o timeout de shutdown:

```properties
quarkus.shutdown.timeout=25s
```

O caminho padrão é `/q/health/live` e `/q/health/ready`; o `/q/health` agregado soma os dois e não deve ser usado como liveness. Um health check customizado entra em `/q/health/ready` com `@Readiness` e em `/q/health/live` com `@Liveness`.

A liveness do Quarkus verifica o estado interno da aplicação, não o banco. A readiness pode incluir dependências essenciais, mas cuidado: se o banco cair, todos os pods saem dos endpoints e o serviço fica 100% indisponível, mesmo que pudesse responder de cache ou com erro controlado. Decida o que é "pronto para receber tráfego" com o negócio, não por padrão.

```java
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;
import java.util.Map;

@Path("/pedidos")
class PedidoResource {
    private final PedidoService service;

    PedidoResource(PedidoService service) {
        this.service = service;
    }

    @GET
    @Path("/{id}")
    Response buscar(@PathParam("id") long id) {
        return service.buscar(id)
            .map(p -> Response.ok(Map.of("id", p.id(), "status", p.status())).build())
            .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }
}
```

Durante o shutdown, o Quarkus para de aceitar novas requisições, drena as em andamento até `quarkus.shutdown.timeout` e só então encerra. Se o pod receber SIGKILL antes disso, o cliente vê conexão resetada. Por isso o prazo de graça deve ser maior que o pior caso de request — e o ingress deve ter timeouts coerentes.

## Na prática

Acompanhe um rollout em vez de aplicar e sair:

```bash
kubectl -n pedidos apply -f deployment.yaml
kubectl -n pedidos rollout status deployment/pedidos-api --timeout=180s
kubectl -n pedidos get pods -w
kubectl -n pedidos describe deployment pedidos-api
```

Se a nova versão estiver errada:

```bash
kubectl -n pedidos rollout undo deployment/pedidos-api
kubectl -n pedidos rollout history deployment/pedidos-api
kubectl -n pedidos rollout status deployment/pedidos-api
```

O `undo` volta ao ReplicaSet anterior, mas não desfaz migração de banco. Uma imagem antiga com schema novo pode falhar; por isso migrações precisam ser compatíveis nas duas direções.

Para investigar por que um pod reiniciou:

```bash
kubectl -n pedidos get pod pedidos-api-7c9f8d6b5-abcde \
  -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'
kubectl -n pedidos logs pedidos-api-7c9f8d6b5-abcde --previous
```

Exit code 137 indica SIGKILL — frequentemente OOMKilled ou prazo de graça estourado. Exit 143 é SIGTERM. Um `CrashLoopBackOff` com exit 1 é erro de aplicação; com 137, olhe memória e shutdown.

## Armadilhas comuns

- **Liveness apontando para dependência externa.** Banco lento derruba todos os pods em loop. Liveness deve medir o processo; readiness pode medir dependências.
- **Mesmo endpoint para as três probes.** Você perde a capacidade de distinguir boot lento, falta de prontidão e travamento.
- **`initialDelaySeconds` enorme em vez de startupProbe.** A liveness fica cega por minutos e um travamento real demora a ser detectado.
- **`maxUnavailable: 25%` com poucas réplicas.** Com 2 pods, 25% arredonda para 1 e você perde metade da capacidade durante o rollout. Use `maxUnavailable: 0` e `maxSurge` compatível.
- **Grace period menor que o shutdown.** O kubelet mata a JVM no meio de requests. Ajuste `terminationGracePeriodSeconds`, `preStop` e `quarkus.shutdown.timeout` juntos.
- **Ignorar OOMKilled.** Aumentar réplicas não resolve falta de memória por pod. Ajuste heap/limits ou encontre o leak.

## Checklist de domínio

- [ ] Você explica o que cada probe faz e qual endpoint usar
- [ ] Você configura RollingUpdate sem derrubar tráfego
- [ ] Você faz shutdown gracioso com preStop e Quarkus
- [ ] Você lê exit codes 137/143 e distingue OOM de erro de aplicação

## Para ir além

- [Kubernetes — Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes — Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Quarkus — SmallRye Health](https://quarkus.io/guides/smallrye-health)
