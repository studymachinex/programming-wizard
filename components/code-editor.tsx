"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { autocompletion } from "@codemirror/autocomplete";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { javaCompletions } from "@/lib/editor/java-completions";

/** Cores alinhadas ao tema do app (ink + arcane). */
const theme = EditorView.theme(
  {
    "&": { backgroundColor: "#0a0712", color: "#e4e0f0", fontSize: "12.5px", height: "100%" },
    ".cm-content": { fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", caretColor: "#c4b2ff", padding: "12px 0" },
    ".cm-gutters": { backgroundColor: "#0c0916", color: "#4b4463", border: "none", borderRight: "1px solid rgba(255,255,255,0.05)" },
    ".cm-activeLine": { backgroundColor: "rgba(139,92,246,0.06)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(139,92,246,0.10)", color: "#c4b2ff" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(139,92,246,0.28) !important" },
    ".cm-cursor": { borderLeftColor: "#c4b2ff" },
    ".cm-matchingBracket": { backgroundColor: "rgba(34,211,238,0.18)", outline: "none" },
    ".cm-tooltip": { backgroundColor: "#141021", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e0f0" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "rgba(139,92,246,0.3)", color: "#f4f1ff" },
    ".cm-tooltip-autocomplete > ul": { fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace", fontSize: "12px", maxHeight: "16em" },
    ".cm-completionDetail": { color: "#7d7598", fontStyle: "normal", marginLeft: "0.8em" },
    ".cm-completionMatchedText": { color: "#c4b2ff", textDecoration: "none", fontWeight: "600" },
    ".cm-completionIcon": { opacity: "0.8", width: "1.4em" },
    ".cm-completionIcon-snippet:after": { content: "'⌁'", color: "#fbbf24" },
    ".cm-completionInfo": { backgroundColor: "#141021", border: "1px solid rgba(255,255,255,0.1)" },
    ".cm-diagnostic-error": { borderLeft: "3px solid #fb7185" },
    ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy #fb7185" },
    ".cm-scroller": { overflow: "auto" },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.definitionKeyword], color: "#c4b2ff" },
  { tag: [t.typeName, t.className], color: "#67e8f9" },
  { tag: [t.string, t.special(t.string)], color: "#86efac" },
  { tag: [t.number, t.bool, t.null], color: "#fbbf24" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#5b5470", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#f0abfc" },
  { tag: t.annotation, color: "#fda4af" },
  { tag: [t.operator, t.punctuation], color: "#9d95b8" },
]);

export type EditorDiagnostic = { line: number; message: string };

export function CodeEditor({
  value,
  onChange,
  onRun,
  onSave,
  diagnostics = [],
  height = "420px",
}: {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  onSave?: () => void;
  diagnostics?: EditorDiagnostic[];
  height?: string;
}) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  // Mantém os callbacks atuais sem recriar as extensões a cada render.
  const handlers = useRef({ onRun, onSave });
  handlers.current = { onRun, onSave };

  const extensions = useMemo(
    () => [
      java(),
      indentUnit.of("    "),
      syntaxHighlighting(highlight),
      // Sugestões só sob demanda (Ctrl+Espaço), como numa entrevista sem IDE.
      autocompletion({ override: [javaCompletions], activateOnTyping: false, maxRenderedOptions: 80 }),
      lintGutter(),
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => (handlers.current.onRun?.(), true) },
          { key: "Mod-s", run: () => (handlers.current.onSave?.(), true), preventDefault: true },
        ]),
      ),
    ],
    [],
  );

  // Erros de compilação viram sublinhados na linha correspondente.
  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    const doc = view.state.doc;
    const marks: CmDiagnostic[] = diagnostics
      .filter((d) => d.line >= 1 && d.line <= doc.lines)
      .map((d) => {
        const line = doc.line(d.line);
        return { from: line.from, to: Math.max(line.from, line.to), severity: "error", message: d.message };
      });
    view.dispatch(setDiagnostics(view.state, marks));
  }, [diagnostics]);

  return (
    <CodeMirror
      ref={ref}
      value={value}
      height={height}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ foldGutter: false, highlightActiveLine: true, autocompletion: false, tabSize: 4 }}
      aria-label="Editor de código Java"
    />
  );
}
