# Currículo das trilhas com cenas

Legenda do modo da cena: **S** sequência, **C** camadas, **I** isométrico. "+gráfico" = usar `extra` com
`ChartPanel` ou `GridPanel` do visualizador. A coluna "Cena" é a ideia central; os passos são seus.

Cada módulo com exercício lista o slug do exercício (`exercises/<slug>.json`). Aulas sem Java estão
marcadas com ☐ (aceitam o aviso do validador).

## Posição em /trilhas e no plano

- `app/trilhas/page.tsx`: `redes-backend` entra na Fase 02 (Engenharia), antes de `quarkus-backend`;
  `docker` e `kubernetes` entram na Fase 03 (Escala), antes de `cloud-devops`.
- `app/plano/page.tsx`: acrescente `redes-backend` ao bloco que já tem `quarkus-backend` e `docker`,
  `kubernetes` ao bloco "Reatividade, cloud e System Design".
- `components/ui.tsx`: acrescente os ícones `waypoints` (Waypoints), `container` (Container) e `ship` (Ship)
  ao mapa `icons`.
- `cloud-devops` (fim da Fase 3): título "CI/CD, Cloud & SRE", subtítulo, descrição e outcomes reescritos
  sem Docker e Kubernetes; `estimatedHours` ajustado; o card citar as trilhas novas como pré-requisito.

---

## Fase 1: Redes para Backend

`slug: redes-backend` · `level: intermediario` · `icon: waypoints` · `accent: rune` · ~30 h · `isCore: true`

| # | Módulo / aula (slug) | Título | Cena |
|---|---|---|---|
| **M1** | `fundamentos` | **Do clique ao pacote** | |
| 1 | `cliente-servidor-e-requisicao` | Cliente, servidor e o caminho de uma requisição | I: celular → Wi-Fi → provedor → data center → servidor; latência somando por trecho |
| 2 | `modelo-osi-e-encapsulamento` | Modelo OSI, TCP/IP e encapsulamento | C nested: HTTP ganha TCP, IP, Ethernet; o roteador troca só o Ethernet; o destino desembrulha |
| 3 | `comunicacao-host-a-host` | MAC, switch e a rede local | I: switch aprendendo a tabela MAC, broadcast vs unicast |
| **M2** | `ip` | **IP: endereços, roteamento e NAT** — exercício `redes-calculadora-cidr` | |
| 4 | `pacote-ip-ttl-e-fragmentacao` | O pacote IP: cabeçalho, TTL e fragmentação | C nested + grid do cabeçalho; TTL caindo a cada salto |
| 5 | `subredes-e-cidr` | Sub-redes, CIDR e IPs privados | I: VPC com subnets /24 + grid de máscara bit a bit |
| 6 | `arp-icmp-ping-traceroute` | ARP, ICMP, ping e traceroute | S: ARP who-has; traceroute com TTL 1, 2, 3 e "time exceeded" |
| 7 | `roteamento-e-gateway` | Roteamento: tabela, gateway padrão e longest prefix match | I: 3 roteadores, pacote escolhendo a rota mais específica |
| 8 | `nat-e-ip-publico` | NAT: como dez celulares saem por um IP | I: tabela de tradução no roteador de casa, portas reescritas |
| **M3** | `udp` | **UDP** — exercício `redes-buffer-de-jitter` | |
| 9 | `udp-datagramas` | UDP: datagrama, prós e contras | S: datagramas perdidos e fora de ordem sem ninguém reclamar |
| 10 | `servidor-udp-em-java` | Servidor UDP em Java com DatagramChannel | S: cliente, servidor, timeout e retransmissão na aplicação |
| **M4** | `tcp` | **TCP por dentro** — exercícios `redes-maquina-de-estados-tcp`, `redes-janela-de-congestionamento` | |
| 11 | `tcp-segmento-e-handshake` | Segmento TCP e o three-way handshake | S: SYN, SYN-ACK, ACK com seq/ack e `laneState` |
| 12 | `estados-e-fechamento-tcp` | Estados da conexão: FIN, TIME_WAIT e CLOSE_WAIT | S: fechamento em 4 vias; CLOSE_WAIT acumulando por bug |
| 13 | `controle-de-fluxo` | Controle de fluxo e janela deslizante | S + gráfico: receptor lento anuncia janela 0 |
| 14 | `controle-de-congestionamento` | Congestionamento: slow start, AIMD e perdas | S + gráfico de cwnd (exponencial, linear, corte na perda) |
| 15 | `sockets-e-filas-do-kernel` | Sockets, backlog, SYN queue e accept queue | I: filas enchendo, servidor lento no accept, SYN descartado |
| 16 | `servidor-tcp-em-java` | Servidor TCP em Java: bloqueante, threads virtuais e NIO | I: thread por conexão vs virtual threads vs selector |
| **M5** | `protocolos` | **DNS, TLS e HTTP** — exercício `redes-resolver-dns-com-cache` | |
| 17 | `dns-resolucao-e-cache` | DNS: resolução recursiva, registros e TTL | S: reaproveite a cena P1 do piloto em versão mais funda (CNAME, negative caching) |
| 18 | `tls-handshake` | TLS 1.2 vs 1.3: handshake, chaves e 0-RTT | S: 2 RTT vs 1 RTT vs 0-RTT, com o risco de replay |
| 19 | `https-certificados-e-sni` | HTTPS: certificados, cadeia de confiança e SNI | I: um IP, vários domínios; cadeia raiz → intermediária → folha |
| 20 | `http1-http2-http3` | HTTP/1.1, HTTP/2 e HTTP/3: multiplexação e head-of-line blocking | S: 6 conexões vs streams numa conexão vs QUIC sem HOL do TCP |
| **M6** | `performance` | **Performance de rede no backend** — exercício `redes-pool-de-conexoes` | |
| 21 | `mtu-mss-e-pmtud` | MTU, MSS e Path MTU Discovery | C nested: pacote grande demais, ICMP "fragmentation needed" bloqueado |
| 22 | `nagle-e-delayed-ack` | Nagle e delayed ACK: os 40 ms misteriosos | S: os dois esperando um pelo outro; `TCP_NODELAY` |
| 23 | `custo-de-conexao-e-pooling` | Custo de conexão, keep-alive e connection pooling | S + gráfico: handshake TCP+TLS por requisição vs pool |
| 24 | `portas-efemeras-e-time-wait` | Esgotamento de portas efêmeras | I: serviço abrindo conexão por chamada até acabar a faixa de portas |
| **M7** | `proxies` | **Proxies e balanceamento** — exercício `redes-balanceador-l7` | |
| 25 | `proxy-e-reverse-proxy` | Proxy, reverse proxy e o que cada um enxerga | I: forward proxy na empresa vs reverse proxy no data center |
| 26 | `load-balancer-l4-vs-l7` | Balanceamento L4 vs L7 | I: L4 repassa conexões; L7 termina TLS e roteia por path/header |
| 27 | `acesso-de-rede-ao-banco` | Acesso de rede ao banco: subnets privadas, firewall e security groups | I: banco sem IP público, só a subnet da app chega na 5432 |
| **M8** | `diagnostico` | **Diagnóstico** | |
| 28 | `tcpdump-e-wireshark` | Lendo pacotes com tcpdump e Wireshark | S + text panel: uma captura real comentada linha a linha ☐ |
| 29 | `o-que-acontece-ao-clicar-num-link` | O que acontece quando você clica num link | S: DNS + TCP + TLS + HTTP + resposta, com o tempo de cada fase |
| 30 | `incidentes-de-rede-reais` | Incidentes reais: firewall matando conexões ociosas e portas esgotadas | I: pool do Postgres com conexões mortas pelo firewall; keepalive como cura |

Exercícios (todos com relógio injetado quando houver tempo):
- `redes-calculadora-cidr`: rede, broadcast, faixa de hosts, `contem(ip)`, e roteamento por longest prefix match.
- `redes-buffer-de-jitter`: reordena datagramas por número de sequência, entrega em ordem, reporta perdas após um prazo.
- `redes-maquina-de-estados-tcp`: transições de estado a partir de eventos (SYN, ACK, FIN, timeout), rejeita as inválidas.
- `redes-janela-de-congestionamento`: simula cwnd/ssthresh (slow start, congestion avoidance, perda por timeout e por 3 ACKs duplicados).
- `redes-resolver-dns-com-cache`: cache com TTL, cadeia de CNAME, cache negativo, detecção de laço.
- `redes-pool-de-conexoes`: pool com limite, espera com timeout, descarte de ociosas e validação antes de emprestar.
- `redes-balanceador-l7`: round robin, least connections, health check que tira e devolve backends, roteamento por prefixo de path.

---

## Fase 2: Docker do Básico ao Avançado

`slug: docker` · `level: intermediario` · `icon: container` · `accent: mana` · ~26 h · `isCore: true`

| # | Módulo / aula (slug) | Título | Cena |
|---|---|---|---|
| **M1** | `por-dentro` | **Containers por dentro** — exercício `docker-cota-de-cpu` | |
| 1 | `container-vs-vm` | Container vs VM | I: hypervisor com 3 SOs vs 1 kernel com 3 containers |
| 2 | `namespaces-cgroups-chroot` | As primitivas do Linux: namespaces, cgroups e chroot | I: o mesmo processo visto de dentro e de fora (PID 1 vs PID 4231) |
| 3 | `arquitetura-do-docker` | Arquitetura: CLI, dockerd, containerd, runc e OCI | S: `docker run` atravessando cada componente |
| **M2** | `imagens` | **Imagens e containers** — exercício `docker-overlayfs-em-memoria` | |
| 4 | `imagem-container-e-registry` | Imagem, container e registry | I: pull do registry, imagem local, vários containers |
| 5 | `camadas-e-overlayfs` | Camadas e OverlayFS | C: **cena P2 do piloto** |
| 6 | `ciclo-de-vida-do-container` | Ciclo de vida e comandos essenciais | I: created → running → paused → exited → removed, com terminal ☐ |
| 7 | `logs-em-containers` | Logs: stdout, drivers e rotação | I: app escrevendo em arquivo (perdido) vs stdout coletado |
| **M3** | `redes` | **Redes no Docker** — exercício `docker-alocador-de-ips` | |
| 8 | `redes-bridge-host-none` | Redes: bridge, host e none | I: docker0, veth pairs, container sem rede |
| 9 | `redes-definidas-pelo-usuario-e-dns` | Redes definidas pelo usuário e DNS entre containers | I: `api` acha `db` pelo nome; na bridge padrão, não |
| 10 | `portas-iptables-e-macvlan` | Publicação de portas, iptables e macvlan | I: `-p 8080:80` virando DNAT; macvlan com IP na rede física ☐ |
| **M4** | `storage` | **Volumes e dados** | |
| 11 | `volumes-bind-mounts-tmpfs` | Volumes, bind mounts e tmpfs | I: três montagens no mesmo container, o que sobrevive ao `rm` ☐ |
| 12 | `persistencia-permissoes-e-backup` | Persistência, permissões e backup de volumes | I: UID do container vs dono do diretório; backup com container auxiliar ☐ |
| **M5** | `dockerfile` | **Dockerfile de produção** — exercício `docker-cache-de-build` | |
| 13 | `build-contexto-e-cache` | Como o build funciona: contexto, camadas e cache | C: contexto enorme sem `.dockerignore`; cache invalidado em cascata |
| 14 | `env-arg-e-usuario-nao-root` | ENV, ARG e usuário não-root | C: segredo em ARG vazando no `history`; `USER app` |
| 15 | `entrypoint-cmd-e-sinais` | ENTRYPOINT, CMD, PID 1 e sinais | S: `docker stop` → SIGTERM → 10 s → SIGKILL; shell form engolindo o sinal; shutdown hook em Java |
| 16 | `healthcheck-e-dockerignore` | HEALTHCHECK e .dockerignore | I: container "Up" mas unhealthy |
| 17 | `multi-stage-para-java` | Multi-stage para Java: JDK no build, JRE no runtime | C: 650 MB → 190 MB → jlink 90 MB; layered jar |
| 18 | `tags-digests-e-registry` | Tags, digests e distribuição | I: `latest` mudando debaixo de você; digest imutável |
| **M6** | `operacao` | **Operação de containers** — exercício `docker-politica-de-restart` | |
| 19 | `restart-policies-e-eventos` | Restart policies e eventos | S: on-failure com backoff, unless-stopped após reboot |
| 20 | `docker-api-com-java` | Docker Engine API com Java: monitorando containers | S: cliente Java no socket, stream de eventos, alerta de container parado |
| **M7** | `compose` | **Docker Compose** — exercício `docker-ordem-de-subida` | |
| 21 | `compose-multi-container` | Compose: serviços, redes e volumes | I: app + Postgres + Redis numa rede do projeto ☐ |
| 22 | `ordem-de-subida-e-healthchecks` | Ordem de subida, healthchecks e o ECONNREFUSED clássico | S: app sobe antes do banco aceitar conexão; `depends_on: condition: service_healthy` |
| **M8** | `swarm` | **Orquestração com Swarm: a ponte para o Kubernetes** | |
| 23 | `swarm-services-e-routing-mesh` | Swarm: services, réplicas e routing mesh | I: qualquer node aceita a porta e encaminha ☐ |
| 24 | `overlay-vip-e-dnsrr` | Rede overlay, VIP e DNS round robin | I: VIP estável vs lista de IPs para um HAProxy na frente ☐ |
| **M9** | `seguranca` | **Segurança de containers** | |
| 25 | `capabilities-seccomp-e-rootless` | Capabilities, seccomp e rootless | I: root no container ≠ root no host (e quando é); `--cap-drop ALL` ☐ |
| 26 | `assinatura-sbom-secrets-e-contexto` | Assinatura de imagens, SBOM, secrets e docker context | S: build → assinatura (cosign; Content Trust só como histórico) → verificação no deploy; secrets em arquivo, não em env ☐ |

Exercícios:
- `docker-cota-de-cpu`: dado `cpu.max` (quota/período) e o consumo por período, calcula throttling e tempo de parede.
- `docker-overlayfs-em-memoria`: lookup em camadas, copy-up na escrita, whiteout na remoção, listagem da visão unificada.
- `docker-alocador-de-ips`: IPAM numa subnet com gateway reservado, liberação e reuso, erro de faixa esgotada.
- `docker-cache-de-build`: chave de cache por instrução + hash dos arquivos copiados; diz quais passos rodam de novo.
- `docker-politica-de-restart`: no, on-failure:N, always, unless-stopped, com backoff dobrando até um teto e reset após 10 s rodando.
- `docker-ordem-de-subida`: ordena serviços por `depends_on` (ordenação topológica), espera health quando pedido, acusa ciclo.

Fim da Fase 2: remova o módulo `docker` de `content/tracks/cloud-devops/track.json` e os 4 arquivos de aula
correspondentes; mude a chave da cena P2 para `docker/camadas-e-overlayfs`; aproveite o que for bom das aulas
removidas nas aulas novas (reescrevendo, sem colar).

---

## Fase 3: Kubernetes do Básico ao Avançado

`slug: kubernetes` · `level: avancado` · `icon: ship` · `accent: arcane` · ~40 h · `isCore: true`

| # | Módulo / aula (slug) | Título | Cena |
|---|---|---|---|
| **M1** | `arquitetura` | **Arquitetura e primeiro cluster** — exercício `k8s-loop-de-reconciliacao` | |
| 1 | `por-que-kubernetes` | Por que Kubernetes: estado desejado e reconciliação | I: de um servidor a um cluster que se corrige sozinho |
| 2 | `control-plane` | Control plane: API server, etcd, scheduler e controllers | S: `kubectl apply` até o pod rodar, componente por componente |
| 3 | `data-plane` | Data plane: kubelet, container runtime e kube-proxy | I: o que roda em cada node ☐ |
| 4 | `cluster-local-com-kind` | Cluster local com kind e o que o kubeadm faz | I: nodes como containers ☐ |
| 5 | `kubectl-kubeconfig-e-api` | kubectl, kubeconfig e a API REST | S: contexto, autenticação, `-v=8` mostrando o HTTP ☐ |
| 6 | `etcd-backup-e-restore` | etcd: backup e restore | I: quorum de 3, snapshot, restaurar ☐ |
| **M2** | `objetos` | **YAML, objetos e namespaces** | |
| 7 | `yaml-spec-e-status` | YAML, spec, status e `kubectl explain` | C bands: apiVersion/kind/metadata/spec/status ☐ |
| 8 | `namespaces-quotas-e-limits` | Namespaces, ResourceQuota e LimitRange | I: dois times, um estoura a cota ☐ |
| **M3** | `pods` | **Pods** — exercício `k8s-ciclo-de-vida-do-pod` | |
| 9 | `pod-por-dentro` | Pod por dentro: pause container, rede e volumes compartilhados | I: dois containers falando por localhost ☐ |
| 10 | `init-containers-e-sidecars` | Init containers e sidecars | S: init esperando o banco; sidecar nativo (restartPolicy Always) ☐ |
| 11 | `static-pods-e-debug` | Static pods e debug com ephemeral containers | I: `kubectl debug` anexando um container de ferramentas ☐ |
| 12 | `terminacao-de-pods` | Como um pod termina: SIGTERM, preStop e grace period | S: endpoint removido em paralelo ao SIGTERM; shutdown gracioso em Java |
| **M4** | `deployments` | **Deployments** — exercício `k8s-simulador-de-rollout` | |
| 13 | `deployment-replicaset-pod` | Deployment, ReplicaSet e Pod | I: três níveis de controller; apagar um pod e ver voltar ☐ |
| 14 | `rolling-update-surge-unavailable` | Rolling update: maxSurge e maxUnavailable | I: v1 → v2 em ondas, com rollback |
| 15 | `requests-limits-e-oom` | Requests, limits, QoS e OOMKilled | I + barras: JVM sem `MaxRAMPercentage` sendo morta; throttling de CPU |
| 16 | `probes-readiness-liveness-startup` | Probes: readiness, liveness e startup | I: liveness mal configurada reiniciando pod saudável em loop; endpoint de health em Java |
| **M5** | `workloads` | **Outros workloads** | |
| 17 | `daemonsets` | DaemonSet | I: um agente por node, inclusive no node novo ☐ |
| 18 | `statefulsets-e-pdb` | StatefulSet, identidade estável e PodDisruptionBudget | I: `db-0`, `db-1` com volume próprio; drain respeitando o PDB ☐ |
| 19 | `jobs-e-cronjobs` | Jobs e CronJobs | S: completions, paralelismo, backoffLimit, `concurrencyPolicy` |
| **M6** | `services` | **Services e kube-proxy** — exercício `k8s-selecao-de-endpoints` | |
| 20 | `services-clusterip-nodeport-lb` | Services: ClusterIP, NodePort, LoadBalancer e Ingress | I: **cena P3 do piloto** |
| 21 | `como-a-requisicao-chega-ao-pod` | Como a requisição chega ao pod: iptables vs IPVS | I: DNAT com probabilidades 1/3, 1/2, 1 em cada node ☐ |
| 22 | `headless-externalname-e-traffic-policy` | Headless, ExternalName e traffic policies | I: `externalTrafficPolicy: Local` preservando IP e evitando salto ☐ |
| 23 | `canary-e-blue-green-com-services` | Canary e blue-green só com Services | I: 9 pods v1 + 1 v2 sob o mesmo selector; troca de selector ☐ |
| **M7** | `ingress` | **Ingress e Gateway API** — exercício `k8s-roteador-de-ingress` | |
| 24 | `ingress-controller-e-regras` | Ingress controller e regras de host e path | I: um controller, vários hosts ☐ |
| 25 | `ingress-tls-rewrite-e-503` | TLS, rewrite e o erro 503 | S: 503 por Service sem endpoints, passo a passo ☐ |
| 26 | `gateway-api` | Gateway API: o sucessor do Ingress | I: GatewayClass, Gateway e HTTPRoute por time ☐ |
| **M8** | `config-e-storage` | **Configuração e armazenamento** | |
| 27 | `configmaps-e-secrets` | ConfigMaps e Secrets: como chegam ao pod | I: env (fixo até reiniciar) vs volume (atualiza); Secret é base64, não criptografia; leitura de config em Java |
| 28 | `pv-pvc-e-storageclass` | PV, PVC e StorageClass | I: PVC Pending até o provisionador criar o PV ☐ |
| 29 | `access-modes-e-reclaim-policy` | Access modes, reclaim policy e projected volumes | I: RWO preso a um node; Delete vs Retain ☐ |
| **M9** | `autoscaling` | **Autoscaling** — exercício `k8s-algoritmo-do-hpa` | |
| 30 | `hpa-e-o-algoritmo` | HPA: metrics-server e o algoritmo de réplicas | I + gráfico: CPU subindo, réplicas = ceil(atual × uso / alvo) |
| 31 | `stabilization-vpa-e-cluster-autoscaler` | Stabilization window, VPA e cluster autoscaler | gráfico + I: flapping evitado; node novo quando pods ficam Pending ☐ |
| **M10** | `rede-do-cluster` | **Rede do cluster** — exercício `k8s-avaliador-de-networkpolicy` | |
| 32 | `cni-e-rede-de-pods` | CNI e a rede plana de pods | I: pod do node-1 falando com pod do node-3 sem NAT ☐ |
| 33 | `coredns-e-ndots` | CoreDNS, service discovery e ndots | S: `api` virando 5 consultas por causa de `ndots:5` ☐ |
| 34 | `network-policies` | NetworkPolicy | I: default deny e liberação por label; DNS bloqueado sem querer ☐ |
| **M11** | `seguranca` | **Segurança** — exercício `k8s-autorizador-rbac` | |
| 35 | `rbac-roles-e-bindings` | RBAC: Role, ClusterRole e bindings | I: quem pode o quê, em qual namespace ☐ |
| 36 | `service-accounts-e-usuarios` | ServiceAccounts, usuários e certificados | S: app Java chamando a API com o token montado |
| 37 | `security-context-e-pod-security` | SecurityContext e Pod Security Standards | I: pod privileged recusado pelo namespace restricted ☐ |
| **M12** | `operacao` | **Operação** — exercício `k8s-scheduler-filtro-e-pontuacao` | |
| 38 | `scheduling-affinity-e-taints` | Scheduling: nodeSelector, affinity, taints e topology spread | I: pod sem lugar ficando Pending, e por quê ☐ |
| 39 | `upgrade-do-cluster` | Upgrade do cluster e APIs depreciadas | I: drain, upgrade e uncordon node a node ☐ |
| 40 | `troubleshooting` | Troubleshooting: Pending, CrashLoopBackOff, ImagePullBackOff e Service sem endpoints | I: um incidente por passo, com o comando que acha a causa ☐ |
| 41 | `helm-e-gitops` | Helm e GitOps | S: chart → release; Git como fonte da verdade, Argo CD reconciliando ☐ |

Exercícios:
- `k8s-loop-de-reconciliacao`: compara desejado vs atual e devolve ações (criar, apagar, atualizar), idempotente.
- `k8s-ciclo-de-vida-do-pod`: fases e restarts com backoff de CrashLoopBackOff (10 s dobrando até 5 min, reset após 10 min estável).
- `k8s-simulador-de-rollout`: dado réplicas, maxSurge e maxUnavailable (absolutos ou %), devolve as ondas do rollout.
- `k8s-selecao-de-endpoints`: selector por labels (igualdade e `In`/`NotIn`/`Exists`) + readiness → lista de endpoints.
- `k8s-roteador-de-ingress`: escolhe backend por host e path (Exact antes de Prefix, prefixo mais longo vence, por segmento).
- `k8s-algoritmo-do-hpa`: réplicas desejadas com tolerância de 10%, min/max e janela de estabilização para baixo (relógio injetado).
- `k8s-avaliador-de-networkpolicy`: decide se um pod pode falar com outro dados pods, labels, namespaces e policies (ingress e egress).
- `k8s-autorizador-rbac`: decide `can-i` a partir de Roles, ClusterRoles e bindings, com namespace e curingas.
- `k8s-scheduler-filtro-e-pontuacao`: filtra nodes (recursos, taints/tolerations, nodeSelector) e pontua (menos alocado, spread).

Fim da Fase 3: remova o módulo `kubernetes` de `cloud-devops` e os 4 arquivos; mude a chave da cena P3 para
`kubernetes/services-clusterip-nodeport-lb`; reescreva a identidade de `cloud-devops` (ver topo); acrescente
`docker` e `kubernetes` a `REQUIRED_TRACKS` do checador.

---

## Fase 4: cenas nas aulas de system design

Uma cena por aula, sem mexer no markdown além de remover o que a cena passar a mostrar melhor (opcional).
Não exige terminal; use `shell` só onde fizer sentido (`bash` com `curl`/`redis-cli` na aula de cache).
Não acrescente `system-design-interview` a `REQUIRED_TRACKS` (as aulas de método e comportamentais não têm cena).

| Aula (slug) | Modo | Cena |
|---|---|---|
| `load-balancer-cdn-dns` | S | **cena P1 do piloto** (já feita) |
| `caching-em-todas-as-camadas` | I | browser → CDN → app (cache local) → Redis → banco; hit/miss mudando a latência; stampede |
| `escala-de-banco` | I | primário + réplicas com lag; leitura do seu próprio write; sharding por chave |
| `filas-streams-e-async` | I | produtor mais rápido que consumidor; fila absorve; DLQ; consumer group |
| `rate-limiting-e-consistent-hashing` | I | anel de hash com nós virtuais; nó entra e só 1/N das chaves move |
| `url-shortener` | I | geração de id, cache de redirecionamento, 301 vs 302 |
| `rate-limiter-distribuido` | S | dois gateways, Redis com script atômico, corrida sem Lua |
| `chat-whatsapp` | I | conexões WebSocket por servidor, roteamento por presença, entrega offline |
| `news-feed` | I | fan-out na escrita vs na leitura; celebridade como exceção |
| `notificacoes` | I | pipeline com filas por canal, dedup em duas camadas, retry com jitter e DLQ |
| `pagamentos-e-idempotencia` | S | timeout no meio do pagamento; retry com Idempotency-Key devolvendo o mesmo resultado |
| `uber-matching-geospatial` | I | células H3, motoristas atualizando posição, lease do motorista no matching |
| `airbnb-reservas` | S | dois hóspedes, mesma noite, a restrição do banco escolhendo um; hold pendente expirando |
| `doordash-rastreamento` | I | 125k updates/s, fan-out só para quem está olhando, ponto atrasado descartado por seq |
| `netflix-streaming` | I | Open Connect nos provedores, ABR trocando de bitrate quando a banda cai |
| `google-search` | I | crawler → índice invertido particionado → scatter-gather com corte de cauda |
