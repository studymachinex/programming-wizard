> **Em uma frase:** Service é um nome estável e um conjunto de endpoints mutáveis; Ingress é uma regra HTTP que só existe quando um controller a transforma em proxy.

## O problema

A `pedidos-api` recebe tráfego do frontend por `http://pedidos-api:8080`. Um dia o Service existe, os pods estão `Running`, mas as requisições retornam `503`. O time olha os logs da API e não vê nada — porque a requisição nunca chegou lá. O `kubectl get endpoints` mostra `<none>`.

Em outro incidente, o Ingress foi criado com `path: /api` e `pathType: Prefix`, mas o controller removeu o prefixo e a API recebeu `/pedidos` em vez de `/api/pedidos`. O 404 parecia bug de aplicação. Service, EndpointSlice, Ingress e DNS são camadas separadas; cada uma tem seu próprio modo de falhar.

## Como funciona

Um **Service** seleciona pods por labels e mantém uma lista de endpoints prontos. O `ClusterIP` é um IP virtual: não existe em nenhuma interface; o kube-proxy (ou CNI eBPF) programa regras que redirecionam o tráfego para um pod. O Service só inclui pods que passam na readiness — é por isso que readiness importa tanto.

Os tipos principais:

| Tipo | Alcance | Quando usar |
|---|---|---|
| `ClusterIP` | Dentro do cluster | Comunicação entre serviços |
| `NodePort` | IP do nó + porta alta | Debug e clusters sem load balancer |
| `LoadBalancer` | IP externo | Expor um serviço na nuvem |
| `ExternalName` | CNAME | Apontar para um nome externo |

`port` é a porta do Service; `targetPort` é a porta do container. Se o container escuta em 8080, `port: 80` e `targetPort: 8080` funcionam. Se você esquecer o `targetPort`, ele assume o mesmo valor de `port` e o tráfego vai para a porta errada. Use portas nomeadas para evitar divergência entre Deployment e Service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pedidos-api
  namespace: pedidos
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: pedidos-api
  ports:
    - name: http
      port: 80
      targetPort: http
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pedidos-api
  namespace: pedidos
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - pedidos.example.com
      secretName: pedidos-tls
  rules:
    - host: pedidos.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: pedidos-api
                port:
                  number: 80
```

O **Ingress** é apenas um objeto declarativo. Quem implementa é o **ingress controller**: ingress-nginx, AWS Load Balancer Controller, Traefik, Istio. Sem controller, o recurso não faz nada. O `ingressClassName` seleciona qual controller deve processá-lo; em clusters com mais de um, omitir a classe pode fazer o objeto ser ignorado ou processado pelo controller errado.

`pathType: Prefix` casa por segmento de caminho, não por prefixo de string: `/api` casa `/api` e `/api/pedidos`, mas não `/apix`. `ImplementationSpecific` deixa a semântica a cargo do controller. Antes de copiar um exemplo, verifique se o controller remove ou preserva o prefixo; a annotation `rewrite-target` muda o contrato e é uma fonte comum de 404.

## Na prática

Diagnostique de baixo para cima:

```bash
kubectl -n pedidos get svc pedidos-api -o wide
kubectl -n pedidos get endpointslices
kubectl -n pedidos describe svc pedidos-api
kubectl -n pedidos get ingress pedidos-api -o wide
kubectl -n pedidos describe ingress pedidos-api
```

Se o Service tem endpoints, o problema está no Ingress ou na aplicação. Se não tem, verifique selector, namespace e readiness:

```bash
kubectl -n pedidos get pods --show-labels
kubectl -n pedidos get pod pedidos-api-xxxx -o jsonpath='{.status.conditions}'
kubectl -n pedidos port-forward svc/pedidos-api 8080:80
```

O `port-forward` ignora o Ingress e testa Service → pod. Se funciona no port-forward e falha no domínio, o problema está na camada HTTP (host, path, TLS, controller). Se falha nos dois, é Service ou aplicação.

Teste DNS e conectividade de dentro do cluster:

```bash
kubectl -n pedidos run curl --rm -it --restart=Never \
  --image=curlimages/curl:8.10.1 -- \
  curl -v http://pedidos-api.pedidos.svc.cluster.local/q/health/ready
```

O nome curto `pedidos-api` funciona dentro do mesmo namespace por causa da busca DNS. O FQDN inclui serviço, namespace, `svc` e o domínio do cluster (`cluster.local` por padrão). O `resolv.conf` dos pods usa `ndots:5`; nomes com menos de cinco pontos são tentados com cada sufixo de busca antes da resolução absoluta. Isso pode gerar latência em nomes externos e é uma das razões para usar FQDN com ponto final em configurações críticas.

Um **headless Service** (`clusterIP: None`) não tem IP virtual: o DNS retorna os IPs dos pods. É usado por StatefulSets e clientes que precisam de descoberta própria. Para uma API stateless atrás de Ingress, quase sempre você quer ClusterIP normal.

```java
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

@RegisterRestClient(configKey = "estoque")
interface EstoqueClient {

    @GET
    @Path("/estoque/{sku}")
    Estoque buscar(@PathParam("sku") String sku);
}

record Estoque(String sku, int quantidade) {}
```

```properties
quarkus.rest-client.estoque.url=http://estoque.estoque.svc.cluster.local:80
quarkus.rest-client.estoque.connect-timeout=1000
quarkus.rest-client.estoque.read-timeout=2000
```

O cliente é injetado com `@RestClient EstoqueClient`; o Quarkus gera a implementação em build time. Esse cliente usa o FQDN do Service de outro namespace. Em produção, prefira configurar a URL por ambiente e manter timeout explícito; o padrão de muitos clientes HTTP é esperar indefinidamente, o que transforma uma dependência lenta em esgotamento de threads.

## Armadilhas comuns

- **Selector que não casa.** O Service fica sem endpoints e retorna 503. Compare labels do pod com `spec.selector`; um `app: pedidos` contra `app.kubernetes.io/name: pedidos-api` não casa.
- **`targetPort` errado.** O Service existe, os endpoints existem, mas a conexão é recusada. Use porta nomeada para manter Deployment e Service sincronizados.
- **Criar Ingress sem controller.** O objeto é aceito, mas nada acontece. Verifique `kubectl get ingressclass` e os pods do controller.
- **Path rewrite inesperado.** O controller pode remover `/api` antes de encaminhar. Defina o contrato com o time e teste com `curl -v`.
- **Achar que ClusterIP é acessível de fora.** ClusterIP só existe dentro do cluster. Para acesso local, use `port-forward`; para externo, Ingress ou LoadBalancer.
- **Ignorar readiness no Service.** Pod `Running` mas não Ready não entra nos endpoints. É o comportamento correto; se todos ficam fora, o serviço fica indisponível.
- **Não configurar NetworkPolicy.** Por padrão, todo pod fala com todo pod. Em ambientes multi-tenant, isso é um risco; restrinja ingress/egress por namespace e labels.

## Checklist de domínio

- [ ] Você explica a diferença entre `port`, `targetPort` e `containerPort`
- [ ] Você diagnostica endpoints vazios e 503 sem olhar só os logs da aplicação
- [ ] Você configura Ingress com host, pathType e TLS e sabe testar o controller
- [ ] Você usa FQDN, headless Service e NetworkPolicy com critério

## Para ir além

- [Kubernetes — Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Kubernetes — Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Kubernetes — DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
