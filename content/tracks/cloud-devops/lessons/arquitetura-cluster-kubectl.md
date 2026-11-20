> **Em uma frase:** Kubernetes é um banco de dados de estado desejado com controladores que convergem o mundo real para ele; `kubectl` é só a porta de entrada para esse estado.

## O problema

O pod da `pedidos-api` está em `CrashLoopBackOff`. Alguém roda `kubectl logs`, vê vazio e conclui que "o cluster está quebrado". Outra pessoa aplica um `kubectl edit` direto no Deployment de produção para trocar a imagem, e no dia seguinte o Git volta a sobrescrever a mudança. O time não sabe se o problema é imagem, permissão de registry, configuração, probe ou agendamento.

Kubernetes tem muitos componentes, mas o fluxo é previsível. Quando você entende quem observa o quê, o diagnóstico deixa de ser tentativa e erro e vira uma sequência de perguntas: o objeto foi aceito? o scheduler achou nó? o kubelet conseguiu baixar a imagem? o processo subiu? a probe passou?

## Como funciona

O **kube-apiserver** é o único ponto de entrada. Ele autentica, autoriza (RBAC), valida e grava objetos no **etcd**, um key-value distribuído que guarda o estado do cluster. O etcd precisa de quórum: com três membros, tolera a perda de um; com dois, não tolera nenhum. Por isso clusters de produção usam número ímpar de control planes.

O **kube-scheduler** observa pods sem `nodeName` e escolhe um nó com base em requests, affinity, taints, tolerations e topologia. O **kube-controller-manager** roda control loops: o Deployment cria ReplicaSets, o ReplicaSet cria pods, o node controller reage a nós indisponíveis.

Cada nó tem o **kubelet**, que recebe a especificação do pod e pede ao runtime (containerd, CRI-O) para criar os containers; o **kube-proxy** (ou um CNI com eBPF) implementa o roteamento dos Services. O kubelet também executa probes, coleta status e reporta ao API server.

| Componente | Onde roda | Responsabilidade |
|---|---|---|
| apiserver | control plane | autenticar, validar e persistir objetos |
| etcd | control plane | armazenar o estado de forma consistente |
| scheduler | control plane | escolher nó para pods pendentes |
| kubelet | nó | garantir que os containers do pod existam e estejam saudáveis |
| kube-proxy | nó | programar regras de rede para Services |

O padrão é declarativo. Você envia o estado desejado; os controladores comparam com o observado e agem. Um `kubectl edit` altera o estado desejado diretamente, mas se o Git é a fonte da verdade, o próximo `apply` reverte.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pedidos-api
  namespace: pedidos
  labels:
    app.kubernetes.io/name: pedidos-api
spec:
  containers:
    - name: api
      image: ghcr.io/acme/pedidos-api:1.4.2
      ports:
        - containerPort: 8080
          name: http
      resources:
        requests:
          cpu: 250m
          memory: 512Mi
        limits:
          memory: 768Mi
```

Esse Pod é útil para aprender, mas não para produção: sem um controlador, ninguém o recria se o nó morrer. O Deployment entra na próxima aula.

## Na prática

Antes de qualquer comando, confirme onde você está:

```bash
kubectl config current-context
kubectl config get-contexts
kubectl get namespaces
```

Um acidente clássico é aplicar no cluster de produção porque o contexto do kubeconfig apontava para lá. Diminua o raio de impacto usando namespaces explícitos (`-n pedidos`) e, em times maiores, contextos com nomes inequívocos (`prod-sa-east-1`).

O ciclo de diagnóstico, na ordem:

```bash
kubectl -n pedidos get pods -o wide
kubectl -n pedidos describe pod pedidos-api
kubectl -n pedidos get events --sort-by=.lastTimestamp
kubectl -n pedidos logs pedidos-api --previous
kubectl -n pedidos exec -it pedidos-api -- sh
```

`get` mostra o estado resumido; `describe` mostra condições, eventos e volumes; `events` mostra o que aconteceu nos últimos minutos; `logs --previous` recupera o log do container que morreu. `exec` só funciona se o processo estiver rodando e a imagem tiver shell.

Alguns estados e o que investigar:

| Estado | Pergunta | Onde olhar |
|---|---|---|
| `Pending` | Falta recurso, nó ou volume? | `describe`, eventos do scheduler |
| `ImagePullBackOff` | Registry, tag ou credencial? | eventos, `imagePullSecrets` |
| `CrashLoopBackOff` | O processo sai sozinho? | `logs --previous`, exit code |
| `Running` sem Ready | Probe ou dependência? | `describe`, endpoints |

Para criar um pod de debug sem sujar o manifesto:

```bash
kubectl -n pedidos run debug --rm -it \
  --image=curlimages/curl:8.10.1 --restart=Never -- sh
```

Esse pod efêmero é útil para testar DNS e conectividade. Evite instalar ferramentas na imagem de produção só para diagnosticar; a imagem fica maior e a superfície de ataque também.

O `kubectl apply` calcula um patch de três vias usando a última configuração aplicada. Isso permite remover campos que você tirou do manifesto. Já o `kubectl create` falha se o objeto existir. Para ver o que mudaria antes de aplicar:

```bash
kubectl diff -f k8s/
kubectl apply -f k8s/ --server-side --dry-run=server
```

`--dry-run=server` valida contra o API server, incluindo admission webhooks, sem persistir. É o mínimo antes de um apply em produção.

```java
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;

public final class HealthServer {
    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        server.createContext("/healthz", exchange -> {
            byte[] body = "ok\n".getBytes();
            exchange.getResponseHeaders().add("Content-Type", "text/plain");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
    }
}
```

Uma aplicação mínima como essa ajuda a separar problema de infraestrutura de problema de framework. Se esse servidor sobe no cluster e responde, a rede e a imagem estão corretas; o defeito está na aplicação maior.

## Armadilhas comuns

- **Aplicar sem conferir o contexto.** Um `apply` no cluster errado pode alterar produção. Sempre confira `current-context` e namespace.
- **Editar recursos vivos e perder no próximo apply.** GitOps pressupõe que o cluster converge para o repositório. Use `kubectl edit` apenas para emergência e registre a mudança depois.
- **Olhar só `logs`.** Container que não inicia não tem log. `describe` e eventos explicam ImagePullBackOff, falta de CPU e volume não montado.
- **Usar `:latest`.** Cada nó pode resolver uma imagem diferente e o rollout fica irreprodutível. Use digest ou SHA.
- **Ignorar requests.** Sem requests, o scheduler acha que o pod cabe em qualquer lugar; o nó fica sobrecarregado e os pods competem por CPU.
- **Esquecer o namespace.** `kubectl get pods` no namespace default mostra vazio e parece que o deploy sumiu. Use `-n` ou configure o namespace no contexto.

## Checklist de domínio

- [ ] Você descreve o caminho de um Deployment até o container rodando
- [ ] Você diagnostica Pending, ImagePullBackOff e CrashLoopBackOff sem chutar
- [ ] Você usa `diff`, `dry-run` e contexto explícito antes de aplicar
- [ ] Você sabe por que etcd precisa de quórum ímpar

## Para ir além

- [Kubernetes — Components](https://kubernetes.io/docs/concepts/overview/components/)
- [Kubernetes — kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Kubernetes — Troubleshooting Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)
