/** Presets de redes: cliente, roteador, switch, servidor e lanes comuns do modo sequência. */
import type { IsoBox, SeqLane, Status } from "../types";
import { box } from "./common";

export function client(id: string, x: number, y: number, label = "cliente", o: { status?: Status } = {}): IsoBox {
  return box(id, x, y, "globe", label, { size: "md", tone: "mana", status: o.status });
}

export function router(id: string, x: number, y: number, label = "roteador", o: { status?: Status } = {}): IsoBox {
  return box(id, x, y, "router", label, { size: "md", tone: "ember", status: o.status });
}

export function networkSwitch(id: string, x: number, y: number, label = "switch", o: { status?: Status } = {}): IsoBox {
  return box(id, x, y, "network", label, { size: "md", tone: "sky", status: o.status });
}

export function server(id: string, x: number, y: number, label = "servidor", o: { status?: Status } = {}): IsoBox {
  return box(id, x, y, "server", label, { size: "md", tone: "arcane", status: o.status });
}

/** Lanes frequentes em diagramas de sequência. */
export const LANE = {
  cliente: { id: "cli", label: "Cliente", icon: "globe", tone: "mana" },
  servidor: { id: "srv", label: "Servidor", icon: "server", tone: "arcane" },
  proxy: { id: "lb", label: "Load balancer", icon: "scale", tone: "ember" },
} satisfies Record<string, SeqLane>;
