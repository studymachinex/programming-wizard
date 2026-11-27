"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS, TONE } from "@/lib/scenes/iso";
import type { SeqMessage, SequenceStage as SequenceStageData } from "@/lib/scenes/types";

const LEFT = 34; // margem reservada aos colchetes
const HEADER = 88;
const ROW = 38;
const STAGGER = 350;

const MSG_COLOR = { ctrl: "#a78bfa", ok: "#34d399", bad: "#fb7185", data: "#22d3ee" } as const;
const NOTE_COLOR = {
  ok: { bg: "#0f3d2f", fg: "#a7f3d0", line: "#34d399" },
  warn: { bg: "#4a3410", fg: "#fde68a", line: "#f59e0b" },
  bad: { bg: "#4c1527", fg: "#fecdd3", line: "#fb7185" },
  info: { bg: "#241c3d", fg: "#ddd6fe", line: "#7c6bc4" },
} as const;

/** Chaves usadas para decidir o que já foi visto em passos anteriores. */
export const noteKey = (n: { lane: string; at: number; text: string }) => `n:${n.lane}:${n.at}:${n.text}`;
export const bracketKey = (b: { fromAt: number; toAt: number; label: string }) => `b:${b.fromAt}:${b.toAt}:${b.label}`;

/** Quantidade de linhas que o diagrama ocupa (para reservar a mesma altura em todos os passos). */
export function rowsOf(stage: SequenceStageData): number {
  let max = 0;
  for (const m of stage.messages) max = Math.max(max, m.at + (m.span ?? 0) + (m.from === m.to ? 1 : 0));
  for (const n of stage.notes ?? []) max = Math.max(max, n.at + 1);
  for (const b of stage.brackets ?? []) max = Math.max(max, b.toAt);
  return max;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Diagrama de sequência. Mensagens já vistas aparecem estáticas; as novas são desenhadas em ordem. */
export function SequenceStage({
  stage,
  seen,
  replay,
  epoch,
  reduced,
  fit,
  minRows,
  ariaLabel,
}: {
  stage: SequenceStageData;
  /** Ids (mensagens, notas e colchetes) que já apareceram em passos anteriores. */
  seen: Set<string>;
  replay: boolean;
  epoch: number;
  reduced: boolean;
  fit: boolean;
  minRows: number;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = stage.lanes.length;
  const laneW = Math.max(110, size.w ? Math.floor((size.w - LEFT) / n) : 140);
  const totalW = LEFT + laneW * n;
  const rows = Math.max(minRows, rowsOf(stage));
  const H = HEADER + 24 + rows * ROW + 36;
  const fitsWidth = size.w > 0 && totalW <= size.w + 1;
  const zoom = fit && fitsWidth && size.h > 0 ? Math.min(1, size.h / H) : 1;
  const laneX = (id: string) => LEFT + laneW * (stage.lanes.findIndex((l) => l.id === id) + 0.5);
  const Y = (at: number) => HEADER + 24 + at * ROW;

  const fresh = (m: SeqMessage) => !reduced && (replay || !seen.has(m.id));
  const newMessages = stage.messages.filter(fresh).sort((a, b) => a.at - b.at);
  const delayOf = (m: SeqMessage) => newMessages.indexOf(m) * STAGGER;
  const delayForRow = (at: number) => newMessages.filter((m) => m.at <= at).length * STAGGER;
  const endDelay = newMessages.length * STAGGER;

  return (
    <div ref={wrapRef} className="h-full w-full overflow-auto">
      <svg
        key={epoch}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${totalW} ${H}`}
        width={totalW * zoom}
        height={H * zoom}
        className="mx-auto block max-w-none select-none"
      >
        {/* lanes */}
        {stage.lanes.map((lane) => {
          const x = laneX(lane.id);
          const tone = TONE[lane.tone ?? "zinc"];
          const Icon = lane.icon ? ICONS[lane.icon] : null;
          const lines = wrap(lane.label, Math.max(10, Math.floor((laneW - 12) / 6.3)));
          const state = stage.laneState?.[lane.id];
          const sc = state ? NOTE_COLOR[state.tone ?? "info"] : null;
          return (
            <g key={lane.id}>
              <line x1={x} y1={HEADER - 2} x2={x} y2={H - 12} stroke="#3b3158" strokeWidth={1.3} strokeDasharray="4 5" />
              <circle cx={x} cy={22} r={16} fill={tone.right} stroke={tone.stroke} strokeOpacity={0.7} />
              {Icon && <Icon x={x - 8} y={14} width={16} height={16} color="rgba(255,255,255,0.95)" strokeWidth={2} />}
              {lines.slice(0, 2).map((line, i) => (
                <text key={i} x={x} y={52 + i * 12} textAnchor="middle" fontSize={11} fill="#e4e0f0" fontWeight={600} fontFamily="Inter, system-ui, sans-serif">
                  {line}
                </text>
              ))}
              {state && sc && (
                <g key={state.text} style={reduced ? undefined : { animation: "scene-fade-in 400ms ease both" }}>
                  <rect x={x - (state.text.length * 5.2 + 14) / 2} y={HEADER - 22} width={state.text.length * 5.2 + 14} height={16} rx={8} fill={sc.bg} stroke={sc.line} strokeOpacity={0.7} />
                  <text x={x} y={HEADER - 10.5} textAnchor="middle" fontSize={9.5} fill={sc.fg} fontFamily="ui-monospace, monospace">
                    {state.text}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* colchetes */}
        {(stage.brackets ?? []).map((b) => {
          const y1 = Y(b.fromAt);
          const y2 = Y(b.toAt);
          const x = LEFT - 12;
          const isNew = !reduced && (replay || !seen.has(bracketKey(b)));
          return (
            <g key={bracketKey(b)} style={isNew ? { animation: `scene-fade-in 400ms ease ${endDelay}ms both` } : undefined}>
              <path d={`M${x + 6},${y1} L${x},${y1} L${x},${y2} L${x + 6},${y2}`} fill="none" stroke="#8b7fc7" strokeWidth={1.4} />
              <text transform={`translate(${x - 5},${(y1 + y2) / 2}) rotate(-90)`} textAnchor="middle" fontSize={9.5} fill="#b6aee0" fontFamily="ui-monospace, monospace">
                {b.label}
              </text>
            </g>
          );
        })}

        {/* mensagens */}
        {stage.messages.map((m) => {
          const isNew = fresh(m);
          const delay = isNew ? delayOf(m) : 0;
          const color = MSG_COLOR[m.tone ?? "ctrl"];
          const anim = (name: string, ms: number, extra = 0) => (isNew ? { animation: `${name} ${ms}ms ease ${delay + extra}ms both` } : undefined);
          const y1 = Y(m.at);
          const y2 = Y(m.at + (m.span ?? 0));

          if (m.from === m.to) {
            const x = laneX(m.from);
            const d = `M${x + 4},${y1} C${x + 44},${y1 - 8} ${x + 44},${y1 + 24} ${x + 6},${y1 + 18}`;
            return (
              <g key={m.id}>
                <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={isNew ? 80 : undefined} style={isNew ? ({ "--len": 80, animation: `scene-draw 450ms ease ${delay}ms both` } as React.CSSProperties) : undefined} />
                <polygon points={`${x + 5},${y1 + 18} ${x + 13},${y1 + 13.5} ${x + 13},${y1 + 22.5}`} fill={color} style={anim("scene-fade-in", 200, 300)} />
                <g style={anim("scene-fade-in", 300)}>
                  <text x={x + 50} y={y1 + 4} fontSize={11} fill="#ece9f7" paintOrder="stroke" stroke="#0b0814" strokeWidth={3} fontFamily="Inter, system-ui, sans-serif">
                    {m.label}
                  </text>
                  {m.detail && (
                    <text x={x + 50} y={y1 + 18} fontSize={10} fill="#9a93b8" paintOrder="stroke" stroke="#0b0814" strokeWidth={3} fontFamily="ui-monospace, monospace">
                      {m.detail}
                    </text>
                  )}
                </g>
              </g>
            );
          }

          const xa = laneX(m.from);
          const xb = laneX(m.to);
          const dir = Math.sign(xb - xa) || 1;
          const sx = xa + dir * 4;
          const fullEx = xb - dir * 4;
          const ex = m.lost ? sx + (fullEx - sx) * 0.55 : fullEx;
          const ey = m.lost ? y1 + (y2 - y1) * 0.55 : y2;
          const len = Math.hypot(ex - sx, ey - y1);
          const ang = Math.atan2(ey - y1, ex - sx);
          const head = `${ex},${ey} ${ex - 9 * Math.cos(ang) + 4.2 * Math.sin(ang)},${ey - 9 * Math.sin(ang) - 4.2 * Math.cos(ang)} ${ex - 9 * Math.cos(ang) - 4.2 * Math.sin(ang)},${ey - 9 * Math.sin(ang) + 4.2 * Math.cos(ang)}`;
          const mx = (xa + xb) / 2;
          const top = Math.min(y1, y2);
          const bottom = Math.max(y1, y2);
          return (
            <g key={m.id}>
              <line x1={sx} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={isNew ? len : undefined} style={isNew ? ({ "--len": len, animation: `scene-draw 400ms ease ${delay}ms both` } as React.CSSProperties) : undefined} />
              {m.lost ? (
                <g transform={`translate(${ex},${ey})`} stroke="#fb7185" strokeWidth={2.2} strokeLinecap="round" style={anim("scene-fade-in", 200, 350)}>
                  <path d="M-5,-5 L5,5 M5,-5 L-5,5" />
                </g>
              ) : (
                <polygon points={head} fill={color} style={anim("scene-fade-in", 200, 300)} />
              )}
              <g style={anim("scene-fade-in", 300)}>
                <text x={mx} y={top - 8} textAnchor="middle" fontSize={11} fill="#ece9f7" paintOrder="stroke" stroke="#0b0814" strokeWidth={3} fontFamily="Inter, system-ui, sans-serif">
                  {m.label}
                </text>
                {m.detail && (
                  <text x={mx} y={bottom + 14} textAnchor="middle" fontSize={10} fill="#9a93b8" paintOrder="stroke" stroke="#0b0814" strokeWidth={3} fontFamily="ui-monospace, monospace">
                    {m.detail}
                  </text>
                )}
              </g>
              {isNew && (
                <circle
                  r={3.6}
                  fill={color}
                  style={{ "--x1": `${sx}px`, "--y1": `${y1}px`, "--x2": `${ex}px`, "--y2": `${ey}px`, animation: `scene-fly 550ms ease-in-out ${delay}ms both` } as React.CSSProperties}
                />
              )}
            </g>
          );
        })}

        {/* notas */}
        {(stage.notes ?? []).map((note) => {
          const idx = stage.lanes.findIndex((l) => l.id === note.lane);
          const x = laneX(note.lane);
          const col = NOTE_COLOR[note.tone ?? "info"];
          const maxChars = Math.max(14, Math.min(28, Math.floor((laneW * 1.15) / 5.4)));
          const lines = wrap(note.text, maxChars);
          const w = Math.max(...lines.map((l) => l.length)) * 5.5 + 16;
          const h = lines.length * 12 + 8;
          const onLeft = idx === n - 1;
          const nx = onLeft ? x - 10 - w : x + 10;
          const y = Y(note.at);
          const isNew = !reduced && (replay || !seen.has(noteKey(note)));
          return (
            <g key={noteKey(note)} style={isNew ? { animation: `scene-fade-in 350ms ease ${delayForRow(note.at)}ms both` } : undefined}>
              <rect x={nx} y={y - h / 2} width={w} height={h} rx={6} fill={col.bg} stroke={col.line} strokeOpacity={0.75} />
              {lines.map((line, i) => (
                <text key={i} x={nx + 8} y={y - h / 2 + 15 + i * 12} fontSize={10} fill={col.fg} fontFamily="Inter, system-ui, sans-serif">
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
