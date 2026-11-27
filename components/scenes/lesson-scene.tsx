"use client";

import { useEffect, useState } from "react";
import { loadScene } from "@/lib/scenes/registry";
import type { SceneDef } from "@/lib/scenes/types";
import { ScenePlayer } from "./scene-player";

/** Carrega a cena da aula (se existir) e mostra o player. */
export function LessonScene({ track, lesson }: { track: string; lesson: string }) {
  const [def, setDef] = useState<SceneDef | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    // Uma nova tentativa cobre falhas transitórias ao baixar o chunk (deploy, recompilação).
    const load = (attempt: number): Promise<void> =>
      loadScene(track, lesson).then(
        (loaded) => {
          if (alive) setDef(loaded);
        },
        (error) => {
          if (attempt < 2) return new Promise<void>((r) => setTimeout(r, 800)).then(() => load(attempt + 1));
          console.error("[cena] falha ao carregar", error);
          if (alive) setDef(null);
        },
      );
    load(1);
    return () => {
      alive = false;
    };
  }, [track, lesson]);

  if (def === undefined) {
    return <div className="mt-8 h-[560px] animate-pulse rounded-2xl border border-white/[0.06] bg-ink-850/40" aria-hidden />;
  }
  if (!def) return null;
  return <ScenePlayer def={def} track={track} lesson={lesson} />;
}
