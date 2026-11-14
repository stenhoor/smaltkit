// Data URLs as people paste them vs. what a browser page can actually read.
//
// A page can only read a file from another site if that server sends CORS headers. Links copied
// from GitHub (…/blob/… pages and …/raw/… redirects) or Hugging Face (…/blob/… pages) do not, but
// the same files at the hosts' raw-file URLs do. These are rewritten automatically.

interface Rule {
  re: RegExp;
  to: (m: RegExpExecArray) => string;
  host: string;
}

export interface NormalizedUrl {
  url: string;
  changed: boolean;
  note: string;
}

const rules: Rule[] = [
  // https://github.com/{owner}/{repo}/blob/{ref}/{path}  and  …/raw/{ref}/{path}
  {
    re: /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i,
    to: (m) => `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`,
    host: 'GitHub',
  },
  // https://huggingface.co/datasets/{id}/blob/{ref}/{path} → /resolve/
  {
    re: /^https?:\/\/huggingface\.co\/(datasets\/|spaces\/)?([^/]+\/[^/]+)\/blob\/(.+)$/i,
    to: (m) => `https://huggingface.co/${m[1] ?? ''}${m[2]}/resolve/${m[3]}`,
    host: 'Hugging Face',
  },
];

/**
 * Rewrite a pasted data URL to one the browser can fetch: GitHub and Hugging Face file pages become their raw files.
 * @param input What was pasted. Text that isn't an http(s) URL comes back trimmed and unchanged.
 * @returns `url`, the URL to fetch; `changed`, whether it differs from the input; `note`, a sentence for people that
 *   explains a rewrite or why a URL can't work (a GitHub folder), or `''`.
 */
export function normalizeDataUrl(input: string | null | undefined): NormalizedUrl {
  const raw = String(input ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return { url: raw, changed: false, note: '' };
  let url = raw.replace(/[?&]raw=true$/i, '');
  for (const r of rules) {
    const m = r.re.exec(url);
    if (m) {
      const to = r.to(m).replace(/[?#].*$/, '');
      return { url: to, changed: to !== raw, note: `${r.host} file pages can't be read by other sites, so the raw file is used instead: ${to}` };
    }
  }
  if (/^https?:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+\/tree\//i.test(url)) {
    return { url, changed: false, note: 'That is a GitHub folder, not a file: open the file on GitHub and copy its link (or its “Raw” link).' };
  }
  return { url, changed: url !== raw, note: '' };
}

/**
 * Extra help for a CORS / network error message: why it happens and, for GitHub-style links, the
 * URL that works.
 * @param message An error or its message, such as a failed fetch's.
 * @returns A sentence to show under the error: the raw file's URL when the message names a link that has one, else
 *   why the browser blocks the read and what to do. `''` when the message is not about CORS or the network.
 */
export function corsHint(message: unknown): string {
  const text = String(message ?? '');
  if (!/CORS|cross-origin|Failed to fetch|NetworkError|Load failed/i.test(text)) return '';
  const urls = text.match(/https?:\/\/[^\s'")]+/g) ?? [];
  for (const u of urls) {
    const n = normalizeDataUrl(u.replace(/[.,:;]+$/, ''));
    if (n.changed) return `Use the raw file instead: ${n.url}`;
  }
  return 'The browser blocks reading files from servers that do not send CORS headers (Access-Control-Allow-Origin). Use a host that does, such as raw.githubusercontent.com, a CORS-enabled bucket or a CDN, or download the file and import it from your computer.';
}
