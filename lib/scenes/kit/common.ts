/** Builders genéricos para montar palcos isométricos sem repetir literais. */
import type { IsoBox, IsoFlow, IsoLink, IsoUsers, IsoZone } from "../types";
import type { IconName } from "../iso";

type Rest<T, K extends keyof T> = Partial<Omit<T, K | "type">>;

export function zone(id: string, x: number, y: number, w: number, d: number, o: Rest<IsoZone, "id" | "x" | "y" | "w" | "d"> = {}): IsoZone {
  return { id, type: "zone", x, y, w, d, ...o };
}

export function box(id: string, x: number, y: number, icon: IconName, label: string, o: Rest<IsoBox, "id" | "x" | "y" | "icon" | "label"> = {}): IsoBox {
  return { id, type: "box", x, y, icon, label, ...o };
}

export function users(id: string, x: number, y: number, count: number, label?: string, o: Rest<IsoUsers, "id" | "x" | "y" | "count" | "label"> = {}): IsoUsers {
  return { id, type: "users", x, y, count, label, ...o };
}

export function link(from: string, to: string, o: Partial<Omit<IsoLink, "from" | "to">> = {}): IsoLink {
  return { from, to, ...o };
}

export function flow(from: string, to: string, rate: IsoFlow["rate"] = 2, o: Partial<Omit<IsoFlow, "from" | "to" | "rate">> = {}): IsoFlow {
  return { from, to, rate, ...o };
}
