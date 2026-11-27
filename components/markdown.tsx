import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "@/components/code-block";
import { slugify } from "@/lib/utils";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

/** Ids únicos na ordem do documento: "a", "a-1", "a-2"... (mesma regra em extractHeadings). */
function headingIds() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const idFor = headingIds();
  return (
    <div className={`lesson-prose ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          h1: ({ children }) => (
            <h2 id={idFor(textOf(children))}>{children}</h2>
          ),
          h2: ({ children }) => <h2 id={idFor(textOf(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={idFor(textOf(children))}>{children}</h3>,
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl">
              <table>{children}</table>
            </div>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt ?? ""} className="rounded-xl border border-white/10" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function extractHeadings(content: string) {
  const headings: { id: string; text: string; level: number }[] = [];
  const idFor = headingIds();
  let inCode = false;
  for (const line of content.split("\n")) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const text = match[2].replace(/[*_`]/g, "").trim();
      const id = idFor(text); // conta também o H1, que o Markdown renderiza com id
      if (match[1].length > 1) headings.push({ id, text, level: match[1].length });
    }
  }
  return headings;
}
