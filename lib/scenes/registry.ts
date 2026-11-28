import type { SceneDef } from "./types";

type Loader = () => Promise<SceneDef>;

/**
 * Aula → cena. A chave é "<trilha>/<aula>". Cada módulo de cenas é carregado sob demanda,
 * então a página de uma aula só baixa o código da cena dela.
 */
const LOADERS: Record<string, Loader> = {
  // Fase 0 (piloto): cenas anexadas a aulas que já existem. Na Fase 2 e na Fase 3 só a chave muda.
  "system-design-interview/load-balancer-cdn-dns": () => import("./system-design/building-blocks").then((m) => m.resolucaoDns),
  "cloud-devops/imagens-layers-dockerfile": () => import("./docker/imagens").then((m) => m.camadasEOverlayfs),
  "cloud-devops/services-ingress-dns": () => import("./kubernetes/services").then((m) => m.serviceEIngress),

  // Fase 1: trilha Redes para Backend.
  "redes-backend/cliente-servidor-e-requisicao": () => import("./redes/fundamentos").then((m) => m.caminhoDaRequisicao),
  "redes-backend/modelo-osi-e-encapsulamento": () => import("./redes/fundamentos").then((m) => m.encapsulamento),
  "redes-backend/comunicacao-host-a-host": () => import("./redes/fundamentos").then((m) => m.redeLocal),
  "redes-backend/pacote-ip-ttl-e-fragmentacao": () => import("./redes/ip").then((m) => m.pacoteIp),
  "redes-backend/subredes-e-cidr": () => import("./redes/ip").then((m) => m.subredesECidr),
  "redes-backend/arp-icmp-ping-traceroute": () => import("./redes/ip").then((m) => m.arpEIcmp),
  "redes-backend/roteamento-e-gateway": () => import("./redes/ip").then((m) => m.roteamento),
  "redes-backend/nat-e-ip-publico": () => import("./redes/ip").then((m) => m.nat),
  "redes-backend/udp-datagramas": () => import("./redes/udp").then((m) => m.udpDatagramas),
  "redes-backend/servidor-udp-em-java": () => import("./redes/udp").then((m) => m.servidorUdp),
  "redes-backend/tcp-segmento-e-handshake": () => import("./redes/tcp").then((m) => m.handshakeTcp),
  "redes-backend/estados-e-fechamento-tcp": () => import("./redes/tcp").then((m) => m.estadosTcp),
  "redes-backend/controle-de-fluxo": () => import("./redes/tcp").then((m) => m.controleDeFluxo),
  "redes-backend/controle-de-congestionamento": () => import("./redes/tcp").then((m) => m.congestionamento),
  "redes-backend/sockets-e-filas-do-kernel": () => import("./redes/tcp").then((m) => m.filasDoKernel),
  "redes-backend/servidor-tcp-em-java": () => import("./redes/tcp").then((m) => m.servidorTcp),
  "redes-backend/dns-resolucao-e-cache": () => import("./redes/protocolos").then((m) => m.dnsResolucaoECache),
  "redes-backend/tls-handshake": () => import("./redes/protocolos").then((m) => m.tlsHandshake),
  "redes-backend/https-certificados-e-sni": () => import("./redes/protocolos").then((m) => m.httpsECertificados),
  "redes-backend/http1-http2-http3": () => import("./redes/protocolos").then((m) => m.http123),
  "redes-backend/mtu-mss-e-pmtud": () => import("./redes/performance").then((m) => m.mtuMssPmtud),
  "redes-backend/nagle-e-delayed-ack": () => import("./redes/performance").then((m) => m.nagleEDelayedAck),
  "redes-backend/custo-de-conexao-e-pooling": () => import("./redes/performance").then((m) => m.custoDeConexao),
  "redes-backend/portas-efemeras-e-time-wait": () => import("./redes/performance").then((m) => m.portasEfemeras),
  "redes-backend/proxy-e-reverse-proxy": () => import("./redes/proxies").then((m) => m.proxyEReverseProxy),
  "redes-backend/load-balancer-l4-vs-l7": () => import("./redes/proxies").then((m) => m.balanceamentoL4L7),
  "redes-backend/acesso-de-rede-ao-banco": () => import("./redes/proxies").then((m) => m.acessoAoBanco),
  "redes-backend/tcpdump-e-wireshark": () => import("./redes/diagnostico").then((m) => m.tcpdumpEWireshark),
  "redes-backend/o-que-acontece-ao-clicar-num-link": () => import("./redes/diagnostico").then((m) => m.cliqueNumLink),
  "redes-backend/incidentes-de-rede-reais": () => import("./redes/diagnostico").then((m) => m.incidentesDeRede),

  // Fase 2: trilha Docker do Básico ao Avançado.
  "docker/container-vs-vm": () => import("./docker/por-dentro").then((m) => m.containerVsVm),
  "docker/namespaces-cgroups-chroot": () => import("./docker/por-dentro").then((m) => m.namespacesCgroups),
  "docker/arquitetura-do-docker": () => import("./docker/por-dentro").then((m) => m.arquiteturaDocker),
  "docker/imagem-container-e-registry": () => import("./docker/imagens").then((m) => m.imagemContainerRegistry),
  "docker/camadas-e-overlayfs": () => import("./docker/imagens").then((m) => m.camadasEOverlayfs),
  "docker/ciclo-de-vida-do-container": () => import("./docker/imagens").then((m) => m.cicloDeVida),
  "docker/logs-em-containers": () => import("./docker/imagens").then((m) => m.logsEmContainers),
  "docker/redes-bridge-host-none": () => import("./docker/redes").then((m) => m.redesBridgeHostNone),
  "docker/redes-definidas-pelo-usuario-e-dns": () => import("./docker/redes").then((m) => m.redesDefinidasPeloUsuario),
  "docker/portas-iptables-e-macvlan": () => import("./docker/redes").then((m) => m.portasIptablesMacvlan),
};

export function hasScene(track: string, lesson: string): boolean {
  return `${track}/${lesson}` in LOADERS;
}

export async function loadScene(track: string, lesson: string): Promise<SceneDef | null> {
  const loader = LOADERS[`${track}/${lesson}`];
  return loader ? loader() : null;
}

export const SCENE_KEYS = Object.keys(LOADERS);
