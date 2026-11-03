// Tiny DOM toolkit: element builder, menus, dialogs, toasts, downloads. No framework.

type Attrs = Record<string, unknown>;
type Child = Node | string | null | undefined | false;

/** h('button.primary', { onclick }, 'Save') */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K, attrs?: Attrs, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K];
export function h(sel: string, attrs?: Attrs, ...children: (Child | Child[])[]): HTMLElement;
export function h(sel: string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export { esc } from './svg.js';

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(name: string, data: BlobPart, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  hint?: string;
}

let openMenu: HTMLElement | null = null;

export function closeMenu(): void {
  openMenu?.remove();
  openMenu = null;
}

/** A context / dropdown menu at a point. */
export function showMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = h('div.sk-menu', { role: 'menu' });
  for (const it of items) {
    if (it.separator) {
      menu.append(h('div.sk-menu-sep'));
      continue;
    }
    menu.append(
      h(
        'button.sk-menu-item',
        {
          role: 'menuitem',
          disabled: !!it.disabled,
          onclick: () => {
            closeMenu();
            it.action?.();
          },
        },
        it.label,
        it.hint ? h('span.sk-menu-hint', {}, it.hint) : null,
      ),
    );
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  openMenu = menu;
  (menu.querySelector('button:not([disabled])') as HTMLElement | null)?.focus();
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    if (openMenu && !openMenu.contains(e.target as Node)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

/** A modal dialog. Resolves with the value passed to close(), or null when dismissed. */
export function dialog<T = unknown>(title: string, body: Node, buttons: { label: string; primary?: boolean; value?: () => T | Promise<T> | undefined }[] = [{ label: 'Close' }], opts: { wide?: boolean } = {}): Promise<T | null> {
  return new Promise((resolve) => {
    const dlg = h('dialog.sk-dialog' + (opts.wide ? '.sk-wide' : '')) as HTMLDialogElement;
    const foot = h('div.sk-dialog-foot');
    for (const b of buttons) {
      foot.append(
        h(
          'button' + (b.primary ? '.sk-primary' : ''),
          {
            onclick: async () => {
              try {
                const v = b.value ? await b.value() : null;
                if (v === undefined) return; // validation failed: stay open
                dlg.close();
                resolve(v as T | null);
              } catch (e) {
                toast(String((e as Error).message ?? e), 'error');
              }
            },
          },
          b.label,
        ),
      );
    }
    dlg.append(h('div.sk-dialog-head', {}, h('h2', {}, title)), h('div.sk-dialog-body', {}, body), foot);
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(null);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function toast(text: string, kind: 'info' | 'error' | 'ok' = 'info', ms = 3500): void {
  let host = document.querySelector('.sk-toasts');
  if (!host) document.body.append((host = h('div.sk-toasts')));
  const t = h('div.sk-toast.sk-' + kind, { role: 'status' }, text);
  host.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Download-safe file name. */
export function fileName(s: string): string {
  return s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'download';
}
