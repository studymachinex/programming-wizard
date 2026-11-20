"use client";

import { useState, useTransition } from "react";
import { Bookmark, Check, CheckCircle2, Loader2 } from "lucide-react";
import { setLessonCompletion, toggleLessonBookmark } from "@/app/actions";
import { cn } from "@/lib/utils";

export function LessonActions({
  lessonId,
  completed,
  bookmarked,
  compact = false,
}: {
  lessonId: string;
  completed: boolean;
  bookmarked: boolean;
  compact?: boolean;
}) {
  const [isCompleted, setCompleted] = useState(completed);
  const [isBookmarked, setBookmarked] = useState(bookmarked);
  const [pending, startTransition] = useTransition();

  function toggleComplete() {
    const next = !isCompleted;
    setCompleted(next);
    startTransition(async () => {
      await setLessonCompletion(lessonId, next);
    });
  }

  function toggleBookmark() {
    const next = !isBookmarked;
    setBookmarked(next);
    startTransition(async () => {
      await toggleLessonBookmark(lessonId);
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
      <button
        onClick={toggleComplete}
        disabled={pending}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-60",
          compact ? "px-3 py-2 text-[12px]" : "px-4 py-2.5",
          isCompleted
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15"
            : "border-arcane-400/40 bg-arcane-500 text-white shadow-[0_8px_30px_-10px_rgba(139,92,246,0.8)] hover:bg-arcane-400"
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isCompleted ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {isCompleted ? "Aula concluída" : "Marcar como concluída"}
      </button>
      <button
        onClick={toggleBookmark}
        disabled={pending}
        title={isBookmarked ? "Remover dos favoritos" : "Salvar nos favoritos"}
        className={cn(
          "grid place-items-center rounded-xl border transition-colors disabled:opacity-60",
          compact ? "h-9 w-9" : "h-[42px] w-[42px]",
          isBookmarked
            ? "border-ember/25 bg-ember/10 text-ember"
            : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-arcane-400/25 hover:text-arcane-300"
        )}
      >
        <Bookmark className={cn("h-4 w-4", isBookmarked && "fill-current")} />
      </button>
    </div>
  );
}
