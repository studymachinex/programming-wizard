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

// ---------- posições ----------

/** Posição (x, y) do i-ésimo elemento de uma fileira HORIZONTAL na tela (no iso, (i*g, -i*g) mantém a altura). */
export function rowXY(i: number, gap = 2.4): [number, number] {
  return [i * gap, -i * gap];
}

// ---------- bits e endereços ----------

export const octets = (ip: string): number[] => ip.split(".").map(Number);
export const bin8 = (n: number): string => n.toString(2).padStart(8, "0");
/** "192.168.0.23" -> "11000000 10101000 00000000 00010111" (já em 4 grupos). */
export const ipBits = (ip: string): string[] => octets(ip).map(bin8);
/** Máscara de prefixo /n em 4 octetos. */
export const maskOctets = (prefix: number): number[] =>
  [0, 1, 2, 3].map((i) => {
    const bitsHere = Math.max(0, Math.min(8, prefix - i * 8));
    return bitsHere === 0 ? 0 : (0xff << (8 - bitsHere)) & 0xff;
  });
export const maskStr = (prefix: number): string => maskOctets(prefix).join(".");
export const andOctets = (a: number[], b: number[]): number[] => a.map((v, i) => v & b[i]);

// ---------- saídas de terminal reaproveitáveis ----------

const round1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** Saída do `ping -c N` com estatísticas corretas (min/avg/max/mdev calculados dos tempos). */
export function pingOutput(o: { host: string; ip: string; ttl: number; times: number[]; bytes?: number }): string {
  const n = o.times.length;
  const avg = o.times.reduce((a, b) => a + b, 0) / n;
  const mdev = Math.sqrt(o.times.reduce((a, t) => a + (t - avg) ** 2, 0) / n);
  const hostLabel = o.host === o.ip ? o.ip : `${o.host} (${o.ip})`;
  const from = hostLabel;
  return [
    `PING ${hostLabel} 56(84) bytes of data.`,
    ...o.times.map((t, i) => `64 bytes from ${from}: icmp_seq=${i + 1} ttl=${o.ttl} time=${round1(t)} ms`),
    "",
    `--- ${o.host} ping statistics ---`,
    `${n} packets transmitted, ${n} received, 0% packet loss, time ${(n - 1) * 1001 + 1}ms`,
    `rtt min/avg/max/mdev = ${round1(Math.min(...o.times))}/${round1(avg)}/${round1(Math.max(...o.times))}/${(Math.round(mdev * 1000) / 1000).toFixed(3)} ms`,
  ].join("\n");
}

/** Checksum do cabeçalho IPv4 (RFC 791): complemento de um da soma de palavras de 16 bits. Devolve "0x...." */
export function ipv4Checksum(o: { totalLength: number; id: number; flagsFragment: number; ttl: number; protocol: number; src: string; dst: string }): string {
  const s = octets(o.src);
  const d = octets(o.dst);
  const words = [0x4500, o.totalLength, o.id, o.flagsFragment, (o.ttl << 8) | o.protocol, 0, (s[0] << 8) | s[1], (s[2] << 8) | s[3], (d[0] << 8) | d[1], (d[2] << 8) | d[3]];
  let sum = words.reduce((a, b) => a + b, 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >> 16);
  return "0x" + (~sum & 0xffff).toString(16).padStart(4, "0");
}
