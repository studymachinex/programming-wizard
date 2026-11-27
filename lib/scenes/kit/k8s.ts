/** Presets de Kubernetes: node, pod, control plane, service, ingress e kube-proxy. */
import type { Badge, IsoBox, IsoZone, Resource, Status, Tone } from "../types";
import { box, zone } from "./common";

/** Tamanho padrão de um node: cabem 4 caixas pequenas nos slots A–D. */
export const NODE_SIZE = 4.8;

/** Slots (x, y relativos ao canto da zona) para caixas pequenas dentro de um node. */
export const SLOT = {
  A: [1.1, 1.1],
  B: [3.7, 1.1],
  C: [1.1, 3.7],
  D: [3.7, 3.7],
} as const;
export type SlotName = keyof typeof SLOT;

export function node(id: string, label: string, x: number, y: number, o: Partial<Omit<IsoZone, "id" | "type" | "x" | "y" | "label">> = {}): IsoZone {
  return zone(id, x, y, NODE_SIZE, NODE_SIZE, { label, tone: "zinc", ...o });
}

export function pod(
  id: string,
  parent: string,
  slot: SlotName,
  label: string,
  res: Omit<Resource, "kind" | "name"> & { name: string },
  o: { tone?: Tone; status?: Status; badges?: Badge[]; icon?: IsoBox["icon"]; meter?: number } = {},
): IsoBox {
  const [x, y] = SLOT[slot];
  return box(id, x, y, o.icon ?? "box", label, {
    parent,
    size: "sm",
    tone: o.tone ?? "arcane",
    status: o.status,
    badges: o.badges,
    meter: o.meter,
    res: { kind: "pod", ...res },
  });
}

export function kubeProxy(id: string, parent: string, slot: SlotName = "D", o: { status?: Status } = {}): IsoBox {
  const [x, y] = SLOT[slot];
  return box(id, x, y, "cog", "kube-proxy", { parent, size: "sm", tone: "zinc", status: o.status });
}

export function controlPlane(id: string, x: number, y: number, o: { status?: Status; badges?: Badge[] } = {}): IsoBox {
  return box(id, x, y, "cpu", "control plane", { size: "lg", tone: "sky", status: o.status, badges: o.badges });
}

export function service(
  id: string,
  x: number,
  y: number,
  name: string,
  res: Omit<Resource, "kind" | "name">,
  o: { badges?: Badge[]; status?: Status; label?: string } = {},
): IsoBox {
  return box(id, x, y, "network", o.label ?? `Service ${name}`, {
    size: "md",
    tone: "violet",
    status: o.status,
    badges: o.badges,
    res: { kind: "service", name, ...res },
  });
}

export function ingress(id: string, x: number, y: number, o: { badges?: Badge[]; status?: Status; label?: string } = {}): IsoBox {
  return box(id, x, y, "router", o.label ?? "Ingress controller", { size: "md", tone: "ember", status: o.status, badges: o.badges });
}
