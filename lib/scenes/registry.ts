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
};

export function hasScene(track: string, lesson: string): boolean {
  return `${track}/${lesson}` in LOADERS;
}

export async function loadScene(track: string, lesson: string): Promise<SceneDef | null> {
  const loader = LOADERS[`${track}/${lesson}`];
  return loader ? loader() : null;
}

export const SCENE_KEYS = Object.keys(LOADERS);
