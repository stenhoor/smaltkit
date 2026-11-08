// Markdown to HTML, small and safe: everything is escaped, links must be http(s), and raw HTML is shown as text. It
// covers what notes and notebook text use: headings, paragraphs, bold, italic, code, links, lists, quotes, rules, fenced
// code blocks and pipe tables. Grown from smaltbi's text-box renderer (miniMarkdown). Styled by ui.css (.sk-md).

import { esc } from './svg.js';

export interface MarkdownOptions {
  /** Added to each heading's level: with 1, `#` is an `<h2>` (a text box under a page title). Default 0. */
  headingOffset?: number;
}

/** Inline markdown: code spans first (their text is literal), then bold, italic and links. */
export function markdownInline(src: string): string {
  const parts = src.split(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/);
  let html = '';
  // split with two groups gives [text, ticks, code, text, ticks, code, …]
  for (let i = 0; i < parts.length; i += 3) {
    html += emphasis(esc(parts[i] ?? ''));
    if (i + 2 < parts.length) html += `<code>${esc(parts[i + 2]!.replace(/^ (.*) $/, '$1'))}</code>`;
  }
  return html;
}

/** Links first, so bold and italic apply to their labels and the text around them, never to a URL or the tag. */
function emphasis(s: string): string {
  const parts = s.split(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
  let html = '';
  // split with two groups gives [text, label, url, text, label, url, …]
  for (let i = 0; i < parts.length; i += 3) {
    html += strongEm(parts[i] ?? '');
    if (i + 2 < parts.length) html += `<a href="${parts[i + 2]}" target="_blank" rel="noopener">${strongEm(parts[i + 1]!)}</a>`;
  }
  return html;
}

function strongEm(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>');
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Markdown to HTML. */
export function markdown(src: string, options: MarkdownOptions = {}): string {
  const offset = options.headingOffset ?? 0;
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${markdownInline(para.join(' '))}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i]!.trim().startsWith(fence[1]!); i++) body.push(lines[i]!);
      out.push(`<pre><code${fence[2] ? ` class="language-${esc(fence[2])}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flushPara(); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara();
      const level = Math.min(6, h[1]!.length + offset);
      out.push(`<h${level}>${markdownInline(h[2]!)}</h${level}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); out.push('<hr>'); continue; }
    if (/^\s*>/.test(line)) {
      flushPara();
      const body: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]!); i++) body.push(lines[i]!.replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${markdown(body.join('\n'), options)}</blockquote>`);
      continue;
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      const ordered = /\d/.test(item[1]!);
      const start = ordered ? parseInt(item[1]!, 10) : 1;
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]!);
        if (m && /\d/.test(m[1]!) === ordered) items.push(m[2]!);
        else if (items.length && lines[i]!.trim() && /^\s{2,}\S/.test(lines[i]!)) items[items.length - 1] += ' ' + lines[i]!.trim();
        else break;
      }
      i--;
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.map((t) => `<li>${markdownInline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const sep = lines[i + 1];
    if (line.includes('|') && sep !== undefined && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(sep)) {
      flushPara();
      const head = cells(line);
      const align = cells(sep).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      const style = (j: number) => (align[j] ? ` style="text-align:${align[j]}"` : '');
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i]!.includes('|') && lines[i]!.trim(); i++) rows.push(cells(lines[i]!));
      i--;
      out.push(`<table><thead><tr>${head.map((c, j) => `<th${style(j)}>${markdownInline(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((r) => `<tr>${head.map((_, j) => `<td${style(j)}>${markdownInline(r[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return out.join('');
}
