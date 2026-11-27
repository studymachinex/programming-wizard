# Fase 0: as três cenas do piloto

As cenas ficam anexadas a aulas que **já existem**, para o usuário avaliar o visual sem esperar as trilhas
novas. Os arquivos já nascem no lugar definitivo; na Fase 2 e na Fase 3 só a chave do registro muda.

| Modo | Arquivo / export | Chave do registro na Fase 0 | Chave definitiva |
|---|---|---|---|
| Sequência | `lib/scenes/system-design/building-blocks.ts` / `resolucaoDns` | `system-design-interview/load-balancer-cdn-dns` | a mesma |
| Camadas | `lib/scenes/docker/imagens.ts` / `camadasEOverlayfs` | `cloud-devops/imagens-layers-dockerfile` | `docker/camadas-e-overlayfs` |
| Iso | `lib/scenes/kubernetes/services.ts` / `serviceEIngress` | `cloud-devops/services-ingress-dns` | `kubernetes/services-clusterip-nodeport-lb` |

O texto abaixo dá a intenção de cada passo. Escreva o texto final (título, 1 a 3 parágrafos curtos,
callout) em português claro, frases diretas, sem jargão sem explicação. Respeite os limites do checador.

---

## P1. "Do nome ao IP: como o DNS resolve `loja.com.br`" (sequência, shell `bash`)

Lanes: `nav` Navegador (globe), `so` Cache do SO (cpu), `res` Resolver recursivo (search), `raiz`
Servidor raiz (server), `tld` TLD .br (server), `aut` Autoritativo (server).
Métricas: `Consultas de rede`, `Latência`, `Cache`.

Objetivos: entender a resolução recursiva (passo 5), saber o papel do TTL (passo 7), ligar DNS a CDN e
balanceamento (passo 8).

1. **contexto · "Um nome"**. O usuário digita `loja.com.br`; o navegador precisa de um IP para abrir a
   conexão. Mensagens: `nav→so` "qual o IP de loja.com.br?" e nota no `so` "não está em cache" (warn).
   Métricas: consultas 0, latência 0 ms, cache "vazio".
2. **problema · "Ninguém sabe"**. O SO pergunta ao resolver configurado (do provedor ou 8.8.8.8). O resolver
   também não tem a resposta e começa do topo: `so→res`, `res→raiz` "loja.com.br?", `raiz→res` "não sei;
   pergunte ao .br" (detail: `NS a.dns.br`), com `span: 1`. Bracket "1 RTT ≈ 20 ms".
3. **conceito · "Delegação"**. `res→tld`, `tld→res` "pergunte ao autoritativo" (detail: `NS ns1.loja.com.br`).
   Callout chave: cada nível só conhece o próximo; ninguém guarda o mundo inteiro.
4. **conceito · "A resposta"**. `res→aut`, `aut→res` "A 203.0.113.10, TTL 300" (tone ok). Métricas:
   consultas 3, latência ≈ 90 ms.
5. **solução · "Volta e guarda"**. `res→so`, `so→nav` com a resposta; notas "guardado por 300 s" no `res` e
   no `so`. Bracket total "≈ 110 ms". Cache "res + SO".
6. **conceito · "Segunda visita"**. Diagrama limpo (ids novos): uma mensagem `nav→so` e a resposta
   imediata `so→nav` (laço curto). Métricas: consultas 0, latência < 1 ms. Callout bom-saber: o cache é o
   motivo de o DNS aguentar a internet.
7. **trade-off · "TTL"**. Notas comparando TTL 30 s (troca de IP rápida em failover, mais consultas) e TTL
   1 dia (quase tudo em cache, mas um IP errado fica no ar por horas). Métricas iguais ao passo 6.
   Callout atenção: baixe o TTL **antes** de uma migração, não durante.
8. **conceito · "DNS que escolhe"**. Volta o fluxo do passo 4, mas o autoritativo responde IPs diferentes
   por região: duas mensagens `aut→res` em linhas diferentes com detail "resolver em SP → edge GRU" e
   "resolver em Lisboa → edge LIS". É assim que CDNs e balanceamento global (GeoDNS) mandam cada usuário
   ao ponto mais próximo.
9. **resumo · "Resumo"**. Diagrama completo do passo 5 com todas as mensagens estáticas e
   `laneState` em cada lane resumindo o papel ("guarda por TTL", "delega", "dono do domínio").

Terminal (outputs declarados, formato real do `dig`, IPs de documentação 203.0.113.0/24 e 198.51.100.0/24):
`dig loja.com.br` (passos 1–5), `dig +trace loja.com.br` (passos 2–4: mostra a cadeia raiz → .br →
autoritativo), `dig loja.com.br +short`, `dig loja.com.br` com "Query time: 0 msec" no passo 6.

---

## P2. "Camadas e OverlayFS: o que é uma imagem" (camadas, shell `docker`)

Pilhas `bands`. Métricas: `Camadas`, `Tamanho baixado`, `Containers`.

Objetivos: ver a imagem como pilha somente leitura (passo 1), entender copy-on-write (passo 4), ordenar o
Dockerfile para aproveitar o cache (passo 8).

1. **contexto · "Uma pilha"**. Pilha "Imagem loja/app:1.0" com 4 layers readonly, de cima para baixo:
   `app.jar` (12 MB), `dependências` (`lib/*.jar`, 48 MB), `JRE 21` (`/opt/java`, 140 MB), `debian-slim`
   (`/etc /bin /usr`, 75 MB). Cada linha do Dockerfile que muda arquivos gera uma camada.
2. **conceito · "O container"**. Segunda pilha "Container web": as mesmas 4 layers (mesmos ids, em tom
   muted) e, em cima, `camada gravável` (status new). `merged` mostra a visão unificada com arquivos de
   várias camadas. Métrica containers 1.
3. **conceito · "Leitura"**. Ler `/etc/app.conf`: o OverlayFS procura de cima para baixo e usa a primeira
   camada que tem o arquivo. Destaque (`hi`) na layer `debian-slim` e o chip `app.conf` com tone info.
4. **problema · "Escrever no que é só leitura"**. O app altera `/etc/app.conf`. **Copy-up**: o arquivo é
   copiado inteiro para a camada gravável e alterado lá; a imagem não muda. Chip `app.conf` aparece na
   gravável (tone warn). Callout atenção: arquivo grande alterado = cópia grande (banco de dados dentro do
   container é má ideia; use volume).
5. **conceito · "Apagar"**. `rm /usr/share/doc`: não dá para apagar de uma camada de baixo; a gravável
   ganha um **whiteout** (`.wh.doc`) que esconde o arquivo na visão unificada.
6. **conceito · "Compartilhar"**. Terceira pilha "Container worker" sobre as mesmas 4 layers. Métricas:
   containers 2, tamanho baixado continua 275 MB. As camadas de baixo existem uma vez só no disco.
7. **problema · "Uma linha muda tudo"**. Dockerfile ruim: `COPY . .` antes de `RUN mvn dependency:go-offline`.
   Mudar uma linha do código invalida a camada do `COPY` e **todas as de cima**, então as dependências são
   baixadas de novo. As layers afetadas ficam com status bad. Métrica tamanho baixado 60 MB a cada build.
8. **solução · "Ordem certa"**. Copie primeiro só o `pom.xml`, resolva dependências, depois copie o código.
   Agora só a camada `app.jar` muda (status new); as outras ficam ok (do cache). Tamanho baixado 12 MB.
   `cmd`: `docker build -t loja/app:1.1 .`.
9. **resumo · "Resumo"**. Imagem + 2 containers; `merged` do container web; nada em destaque.

Terminal (outputs declarados): `docker history loja/app:1.0`, `docker diff web` (mostra `C /etc`,
`C /etc/app.conf`, `D /usr/share/doc` a partir do passo 5), `docker image inspect loja/app:1.0 --format
'{{json .RootFS.Layers}}'`, `docker ps` derivado de `res` (as pilhas não têm `res`; declare a saída).

---

## P3. "Service e Ingress: endereço fixo para pods que mudam" (iso, shell `kubectl`)

Base: 3 zonas `node-1..3` lado a lado (use os presets de `kit/k8s.ts`), pod `web` no node-1 e três pods
`api` (um por node), cada um com `res` (kind pod, nome com hash, IP 10.244.x.y, node). Usuários fora do
cluster aparecem a partir do passo 8. Métricas: `Pods da API`, `Endpoints`, `Req/s`, `Erros`.

Objetivos: entender por que não se usa o IP do pod (passo 2), usar um Service como nome fixo (passo 3),
ver o Service desviar de pods doentes (passo 7), expor para fora com Ingress (passo 9).

1. **contexto · "O site chama a API"**. `web` chama um pod `api` direto pelo IP (fluxo `web→api-1`, link
   com label `10.244.1.7`). Erros 0%.
2. **problema · "O IP muda"**. O pod `api-1` é recriado (o antigo sai, um novo entra com outro IP). O `web`
   continua chamando o IP velho: fluxo `bad`. Erros 33%.
3. **solução · "Um nome fixo"**. Entra o box `Service api` (ícone network, tone violet) acima dos nodes com
   badge `ClusterIP 10.96.0.20`. O `web` chama o Service, que divide entre os 3 pods. Erros 0%.
   `cmd`: `kubectl expose deploy api --port=80 --target-port=8080`.
4. **conceito · "Labels"**. Badges `app=api` nos pods e `selector app=api` no Service. Links tracejados
   Service→pods. Endpoints 3.
5. **conceito · "Quem faz a mágica"**. Entra um box pequeno `kube-proxy` em cada node; callout chave: o
   Service não é um processo no caminho; o kube-proxy programa regras (iptables/IPVS) em cada node e o
   pacote é reescrito ali mesmo.
6. **problema · "Pod doente"**. `api-2` perde o banco: status bad, badge "readiness falhou", fluxo `hc` do
   kubelet falhando, parte das requisições do Service para ele vira `bad`. Erros 4%.
7. **solução · "Sai da lista"**. `api-2` fica muted e sai dos endpoints (link tracejado some). Fluxos só
   para `api-1` e `api-3`. Endpoints 2, erros 0%. Callout atenção: sem readiness probe, o Kubernetes não
   sabe que o pod está doente.
8. **conceito · "De fora do cluster"**. Usuários entram; o Service vira `NodePort 30080`; fluxo
   usuários→node-2→Service. Callout: NodePort expõe uma porta alta em todo node; LoadBalancer pede um IP
   público ao provedor de nuvem.
9. **solução · "Ingress"**. Entra `Ingress controller` (ícone router) na borda e um segundo Service `web`.
   Regras como badges: `loja.com.br/ → web`, `/api → api`. Fluxos usuários→ingress→services→pods.
10. **resumo · "Resumo"**. Tudo saudável, fluxos normais, `kube-proxy` visível, nada em destaque.

Terminal: derivados `kubectl get pods -o wide` e `kubectl get svc`; outputs declarados para
`kubectl get endpoints api` (muda nos passos 6–7), `kubectl describe svc api`, `kubectl get ingress` (a
partir do passo 9). No passo 2, `kubectl get pods -o wide` deve mostrar o pod novo com IP novo.
