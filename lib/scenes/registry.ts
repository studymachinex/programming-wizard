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
};

export function hasScene(track: string, lesson: string): boolean {
  return `${track}/${lesson}` in LOADERS;
}

export async function loadScene(track: string, lesson: string): Promise<SceneDef | null> {
  const loader = LOADERS[`${track}/${lesson}`];
  return loader ? loader() : null;
}

export const SCENE_KEYS = Object.keys(LOADERS);
