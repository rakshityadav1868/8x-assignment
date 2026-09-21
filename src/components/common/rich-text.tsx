import { Fragment } from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny, safe markdown subset for AI output: paragraphs, "- " / "1. " lists, "#" headings,
 * **bold**, *italic*, `code`. Optional `renderCitation` turns inline `[n]` / `[n, m]` into nodes.
 * No HTML is ever injected.
 */
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[\d+(?:\s*,\s*\d+)*\])/g;

function Inline({ text, renderCitation }: { text: string; renderCitation?: (nums: number[], key: string) => React.ReactNode }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
          return (
            <strong key={i} className="font-semibold text-white">
              {p.slice(2, -2)}
            </strong>
          );
        if (p.startsWith("`") && p.endsWith("`"))
          return (
            <code key={i} className="rounded bg-white/10 px-1 font-mono text-[0.9em]">
              {p.slice(1, -1)}
            </code>
          );
        const cite = p.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
        if (cite && renderCitation)
          return renderCitation(
            cite[1].split(",").map((n) => Number(n.trim())),
            `c${i}`,
          );
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      blocks.push({ kind: "h", text: h[1] });
    } else if (ul) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ul") last.items.push(ul[1]);
      else blocks.push({ kind: "ul", items: [ul[1]] });
    } else if (ol) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ol") last.items.push(ol[1]);
      else blocks.push({ kind: "ol", items: [ol[1]] });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}

export function RichText({
  text,
  className,
  renderCitation,
}: {
  text: string;
  className?: string;
  renderCitation?: (nums: number[], key: string) => React.ReactNode;
}) {
  const blocks = parse(text);
  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((b, i) => {
        if (b.kind === "h")
          return (
            <p key={i} className="pt-1 font-semibold text-white">
              <Inline text={b.text} renderCitation={renderCitation} />
            </p>
          );
        if (b.kind === "p")
          return (
            <p key={i}>
              <Inline text={b.text} renderCitation={renderCitation} />
            </p>
          );
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={cn("space-y-1 pl-4", b.kind === "ul" ? "list-disc marker:text-sky-400/70" : "list-decimal marker:text-white/40")}>
            {b.items.map((it, j) => (
              <li key={j} className="pl-0.5">
                <Inline text={it} renderCitation={renderCitation} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
