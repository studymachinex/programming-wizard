"use client";

import { Children, isValidElement, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const first = Children.toArray(children)[0];
  const className =
    isValidElement<{ className?: string }>(first) && first.props.className
      ? first.props.className
      : "";
  const match = className.match(/language-([a-zA-Z0-9+#-]+)/);
  const language = (match?.[1] ?? "java").toLowerCase();
  const labels: Record<string, string> = {
    java: "Java",
    sql: "SQL",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    bash: "Shell",
    sh: "Shell",
    xml: "XML",
    properties: "Properties",
    javascript: "JS",
    typescript: "TS",
    kotlin: "Kotlin",
    text: "Texto",
    md: "Markdown",
    markdown: "Markdown",
  };

  async function copy() {
    const text = preRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0814]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-400/50" />
          <span className="h-2 w-2 rounded-full bg-amber-400/50" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/50" />
          <span className="ml-2 font-mono text-[9.5px] uppercase tracking-[0.15em] text-zinc-600">
            {labels[language] ?? language}
          </span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
          aria-label="Copiar código"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "copiado" : "copiar"}
        </button>
      </div>
      <pre
        ref={preRef}
        className="hljs overflow-x-auto px-4 py-4 text-[12.5px] leading-[1.75] sm:text-[13px]"
      >
        {children}
      </pre>
    </div>
  );
}
