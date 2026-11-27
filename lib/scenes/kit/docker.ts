/** Presets de Docker: host, container, rede e volume. */
import type { Badge, IsoBox, IsoZone, Resource, Status } from "../types";
import { box, zone } from "./common";

export function host(id: string, label: string, x: number, y: number, w = 6, d = 4): IsoZone {
  return zone(id, x, y, w, d, { label, tone: "zinc" });
}

export function container(
  id: string,
  x: number,
  y: number,
  name: string,
  res: Omit<Resource, "kind" | "name"> = {},
  o: { parent?: string; status?: Status; badges?: Badge[] } = {},
): IsoBox {
  return box(id, x, y, "container", name, {
    parent: o.parent,
    size: "sm",
    tone: "mana",
    status: o.status,
    badges: o.badges,
    res: { kind: "container", name, ...res },
  });
}

export function network(id: string, label: string, x: number, y: number, w: number, d: number): IsoZone {
  return zone(id, x, y, w, d, { label, tone: "sky", dashed: true, th: 4 });
}

export function volume(id: string, x: number, y: number, name: string, o: { parent?: string; status?: Status } = {}): IsoBox {
  return box(id, x, y, "hard-drive", name, { parent: o.parent, size: "sm", tone: "ember", status: o.status, res: { kind: "volume", name } });
}
