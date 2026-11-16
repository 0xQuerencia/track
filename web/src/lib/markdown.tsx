import type { ReactNode } from "react";

/*
 * A small Markdown reader that produces React elements. It has no dependency,
 * never parses HTML, and never uses dangerouslySetInnerHTML: every piece of
 * text reaches the DOM as a React text node, so `<script>` and `onerror=` in a
 * note are shown as plain characters. Links are kept only for http, https and
 * mailto targets; any other target (javascript:, data:, relative paths) is
 * shown as its label text.
 *
 * Supported: ATX headings, paragraphs, **bold**, *italic*, `code`, fenced code,
 * bulleted and numbered lists, read-only task items, blockquotes, horizontal
 * rules, [text](url) links and bare http(s) URLs. Images are shown as text.
 */

export const MAX_MARKDOWN_CHARS = 100_000;
const MAX_INLINE_DEPTH = 4;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const HORIZONTAL_RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const TASK = /^\[( |x|X)\](?:[ \t]+(.*))?$/;
const LANGUAGE = /^[\w+#.-]{1,30}$/;

const LINK = /\[([^[\]\n]{1,300})\]\(((?:[^()\s]|\([^()\s]*\)){1,2000})(?:[ \t]+"[^"\n]{0,200}")?\)/y;
const STRONG_STAR = /\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/y;
const STRONG_UNDER = /(?<![\p{L}\p{N}])__(?!\s)([\s\S]+?)(?<!\s)__(?![\p{L}\p{N}])/uy;
const EM_STAR = /\*(?![\s*])([\s\S]+?)(?<![\s*])\*/y;
const EM_UNDER = /(?<![\p{L}\p{N}])_(?![\s_])([\s\S]+?)(?<![\s_])_(?![\p{L}\p{N}])/uy;
const BARE_URL = /https?:\/\/[^\s<>"'`[\]]+/y;
const CODE_RUN = /`+/y;

/** Returns the normalized URL when it is a link we allow, otherwise null. */
export function safeMarkdownHref(raw: string): string | null {
  const value = raw.trim();
  if (!value || /[\u0000- \u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
}

function matchAt(pattern: RegExp, text: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(text);
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HORIZONTAL_RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line)
  );
}

/* ---------- inline ---------- */

function linkNode(label: string, target: string, depth: number, key: number): ReactNode {
  const href = safeMarkdownHref(target);
  const children = inline(label, depth + 1);
  if (!href) return <span key={key}>{children}</span>;
  return (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

/** Reads inline Markdown into nodes. Unmatched markers stay as plain text. */
export function inline(text: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = "";
  let i = 0;
  const flush = () => {
    if (buffer) out.push(buffer);
    buffer = "";
  };
  const push = (node: ReactNode) => {
    flush();
    out.push(node);
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === "`") {
      const run = matchAt(CODE_RUN, text, i)?.[0] ?? "`";
      const close = text.indexOf(run, i + run.length);
      if (close !== -1) {
        const code = text.slice(i + run.length, close);
        push(<code key={out.length}>{code}</code>);
        i = close + run.length;
      } else {
        buffer += run;
        i += run.length;
      }
      continue;
    }

    if (depth < MAX_INLINE_DEPTH && ch === "[") {
      const match = matchAt(LINK, text, i);
      if (match) {
        push(linkNode(match[1], match[2], depth, out.length));
        i += match[0].length;
        continue;
      }
    }

    if (depth < MAX_INLINE_DEPTH && (ch === "*" || ch === "_")) {
      const patterns =
        ch === "*"
          ? [
              { re: STRONG_STAR, tag: "strong" as const },
              { re: EM_STAR, tag: "em" as const },
            ]
          : [
              { re: STRONG_UNDER, tag: "strong" as const },
              { re: EM_UNDER, tag: "em" as const },
            ];
      let handled = false;
      for (const { re, tag } of patterns) {
        const match = matchAt(re, text, i);
        if (!match) continue;
        const children = inline(match[1], depth + 1);
        push(
          tag === "strong" ? (
            <strong key={out.length}>{children}</strong>
          ) : (
            <em key={out.length}>{children}</em>
          ),
        );
        i += match[0].length;
        handled = true;
        break;
      }
      if (handled) continue;
    }

    if (ch === "h" && (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1]))) {
      const match = matchAt(BARE_URL, text, i);
      if (match) {
        const url = match[0].replace(/[.,;:!?)]+$/, "");
        const href = safeMarkdownHref(url);
        if (href) {
          push(
            <a key={out.length} href={href} target="_blank" rel="noopener noreferrer nofollow">
              {url}
            </a>,
          );
          i += url.length;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

/* ---------- blocks ---------- */

type ListItem = { checked: boolean | null; content: string };

function readFence(lines: string[], start: number, open: RegExpExecArray, key: number): [ReactNode, number] {
  const marker = open[1];
  const language = LANGUAGE.test(open[2] ?? "") ? open[2] : "";
  const body: string[] = [];
  let i = start + 1;
  const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`);
  while (i < lines.length && !closing.test(lines[i])) {
    body.push(lines[i]);
    i += 1;
  }
  const node = (
    <pre key={key} className="md-code">
      <code className={language ? `language-${language}` : undefined}>{body.join("\n")}</code>
    </pre>
  );
  return [node, Math.min(i + 1, lines.length)];
}

function readList(lines: string[], start: number): [ReactNode, number] {
  const first = LIST_ITEM.exec(lines[start]) as RegExpExecArray;
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;

  const sameList = (line: string | undefined): RegExpExecArray | null => {
    if (line === undefined || HORIZONTAL_RULE.test(line)) return null;
    const match = LIST_ITEM.exec(line);
    return match && /\d/.test(match[2]) === ordered ? match : null;
  };

  while (i < lines.length) {
    const match = sameList(lines[i]);
    if (!match) break;
    const task = TASK.exec(match[3]);
    let content = task ? (task[2] ?? "") : match[3];
    const checked = task ? task[1].toLowerCase() === "x" : null;
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      /^\s{2,}\S/.test(lines[i]) &&
      !LIST_ITEM.test(lines[i])
    ) {
      content += ` ${lines[i].trim()}`;
      i += 1;
    }
    items.push({ checked, content });
    if (i < lines.length && lines[i].trim() === "" && sameList(lines[i + 1])) i += 1;
  }

  const Tag = ordered ? "ol" : "ul";
  const node = (
    <Tag key={`list-${start}`} className="md-list">
      {items.map((item, index) => (
        <li key={index} className={item.checked === null ? undefined : "md-task"}>
          {item.checked === null ? null : (
            <input type="checkbox" checked={item.checked} disabled readOnly aria-label={item.checked ? "Done" : "Not done"} />
          )}
          {inline(item.content)}
        </li>
      ))}
    </Tag>
  );
  return [node, i];
}

function renderBlocks(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = out.length;

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const [node, next] = readFence(lines, i, fence, key);
      out.push(node);
      i = next;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length - 1;
      const text = (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "");
      const Tag = HEADING_TAGS[level];
      out.push(<Tag key={key}>{inline(text)}</Tag>);
      i += 1;
      continue;
    }

    if (HORIZONTAL_RULE.test(line)) {
      out.push(<hr key={key} />);
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i += 1;
      }
      out.push(<blockquote key={key}>{renderBlocks(inner)}</blockquote>);
      continue;
    }

    if (LIST_ITEM.test(line) && !HORIZONTAL_RULE.test(line)) {
      const [node, next] = readList(lines, i);
      out.push(node);
      i = next;
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    out.push(<p key={key}>{inline(paragraph.join(" "))}</p>);
  }
  return out;
}

/** Turns Markdown source into React nodes. Safe for untrusted input. */
export function markdownNodes(source: string | null | undefined): ReactNode[] {
  const text = (source ?? "").slice(0, MAX_MARKDOWN_CHARS).replace(/\r\n?/g, "\n");
  return renderBlocks(text.split("\n"));
}
