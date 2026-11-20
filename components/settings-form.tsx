"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Save, UserRound } from "lucide-react";
import { updateProfile } from "@/app/actions";

export function SettingsForm({
  initialName,
  initialGoal,
  initialRole,
}: {
  initialName: string;
  initialGoal: number;
  initialRole: string;
}) {
  const [name, setName] = useState(initialName);
  const [goal, setGoal] = useState(initialGoal);
  const [role, setRole] = useState(initialRole);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateProfile({ name, dailyGoalMinutes: goal, targetRole: role });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="panel p-6">
      <div className="mb-5 flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-arcane-300" />
          <h2 className="text-[14px] font-semibold text-white">Seu perfil local</h2>
        </div>
        {saved && (
          <span className="flex items-center gap-1 font-mono text-[9px] text-emerald-400">
            <Check className="h-3 w-3" /> salvo
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            como devo te chamar
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-arcane-400/30"
            placeholder="Mago"
          />
        </label>

        <label className="block sm:col-span-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            meta diária (minutos)
          </span>
          <input
            type="number"
            min={10}
            max={480}
            step={5}
            value={goal}
            onChange={(e) => setGoal(Number(e.target.value))}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-200 outline-none transition-colors focus:border-arcane-400/30"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            objetivo profissional
          </span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={120}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-arcane-400/30"
            placeholder="Senior Software Engineer na Netflix"
          />
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-600">
            Esse texto aparece no dashboard e no rodapé da barra lateral. Use-o como lembrete do
            destino, não como decoração.
          </p>
        </label>
      </div>

      <button onClick={save} disabled={pending} className="btn-primary mt-5 py-2 text-[12px]">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar configurações
      </button>
    </div>
  );
}
