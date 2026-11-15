import katex from "katex";
import "katex/dist/katex.min.css";
import { splitMath } from "@/lib/qv/math";

function render(tex: string, display: boolean): string {
  // trust is off, so commands that could load links or run code are refused; bad input shows as source text.
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml" });
}

/** Text with \( inline \) and \[ display \] maths typeset by KaTeX. Everything else is shown as plain text. */
export function MathText({ text, className, inline }: { text: string; className?: string; inline?: boolean }) {
  const Tag = inline ? "span" : "div";
  return (
    <Tag className={className} style={{ whiteSpace: inline ? "nowrap" : "pre-wrap" }}>
      {splitMath(text).map((piece, i) =>
        piece.kind === "text" ? (
          <span key={i}>{piece.value}</span>
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: render(piece.value, piece.kind === "display") }} />
        ),
      )}
    </Tag>
  );
}
