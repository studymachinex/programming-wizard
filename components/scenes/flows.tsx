"use client";

import { useId } from "react";
import { flowLabelWidth, pathLength, pillBox, pointAt } from "@/lib/scenes/iso";
import type { FlowKind } from "@/lib/scenes/types";

export type FlowPath = {
  key: string;
  kind: FlowKind;
  points: [number, number][];
  rate: number;
  label?: string;
};

const SPEED = 140; // px por segundo

export const FLOW_COLOR: Record<FlowKind, string> = {
  req: "#c4b2ff",
  heavy: "#fbbf24",
  bad: "#fb7185",
  hc: "#34d399",
  data: "#22d3ee",
};

const RADIUS: Record<FlowKind, number> = { req: 3.4, heavy: 5, bad: 3.4, hc: 2.4, data: 3.4 };

/**
 * Partículas ao longo de caminhos (polilinhas entre âncoras). Com movimento reduzido, cada fluxo
 * vira uma seta estática, na cor do tipo.
 */
export function Flows({ flows, reduced, epoch }: { flows: FlowPath[]; reduced: boolean; epoch: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <g key={epoch} pointerEvents="none">
      {reduced && (
        <defs>
          {(Object.keys(FLOW_COLOR) as FlowKind[]).map((kind) => (
            <marker key={kind} id={`${uid}-${kind}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={FLOW_COLOR[kind]} />
            </marker>
          ))}
        </defs>
      )}
      {flows.map((f) => {
        const d = f.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const len = pathLength(f.points);
        const dur = Math.max(0.8, len / SPEED);
        const color = FLOW_COLOR[f.kind];
        const mid = pointAt(f.points, 0.5);
        const stop = pointAt(f.points, 0.85);
        return (
          <g key={f.key}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeOpacity={reduced ? 0.8 : 0.2}
              strokeWidth={reduced ? 2 : 1.5}
              strokeDasharray={f.kind === "hc" ? "3 4" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={reduced ? `url(#${uid}-${f.kind})` : undefined}
            />
            {!reduced &&
              Array.from({ length: f.rate }, (_, i) => {
                const begin = `${(-(i * dur) / f.rate).toFixed(2)}s`;
                return (
                  <g key={i}>
                    <circle r={RADIUS[f.kind]} fill={color} opacity={0.95}>
                      <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={d} />
                      {f.kind === "bad" && <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.84;0.86;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />}
                    </circle>
                    {f.kind === "bad" && (
                      <g transform={`translate(${stop.x},${stop.y})`} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0}>
                        <path d="M-4,-4 L4,4 M4,-4 L-4,4" />
                        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.84;0.86;0.97;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
                      </g>
                    )}
                  </g>
                );
              })}
            {f.label && (
              <g transform={`translate(${mid.x},${mid.y - 9})`}>
                <rect x={-flowLabelWidth(f.label) / 2} y={-8} width={flowLabelWidth(f.label)} height={15} rx={7.5} fill="#0b0814" fillOpacity={0.92} stroke={color} strokeOpacity={0.55} />
                <text textAnchor="middle" y={3} fontSize={9} fill={color} fontFamily="ui-monospace, monospace">
                  {f.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
