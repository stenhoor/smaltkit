// Input controls for picking values: a list (checkboxes or radios), a dropdown, buttons, a range and a search box.
// Each one draws into an element in one innerHTML write, wires its own events, and reports the new selection through
// `onChange`; the app decides what a selection means (a filter, a parameter). Styled by ui.css (sk-control, …).
import type { Value } from './format.js';
import { esc } from './svg.js';

/** The element a control draws into (an HTMLElement; tests pass a stand-in). */
export type ControlElement = Pick<HTMLElement, 'innerHTML' | 'querySelector' | 'querySelectorAll'>;

export type ChoiceStyle = 'list' | 'dropdown' | 'buttons';

export interface ChoiceOptions {
  /** The values offered, in order. */
  values: readonly Value[];
  /** The selected values, or null when nothing is selected ("all"). Selected values missing from `values` are kept. */
  selected: readonly Value[] | null;
  /** How a value is shown. Default: String(value). */
  format?: (v: Value) => string;
  /** One value at a time (radios in a list). */
  single?: boolean;
  /** The radio group's name, unique in the page (list style with `single`). */
  name?: string;
  /** Called with the new selection; an empty array clears it. */
  onChange(values: Value[]): void;
}

/** Equal values, across number and bigint (an integer column can come back as either). */
export function sameValue(a: Value, b: Value): boolean {
  return a === b || ((typeof a === 'bigint' || typeof b === 'bigint') && a !== null && b !== null && String(a) === String(b));
}

/**
 * Choose values from a list. `list`: checkboxes (radios when `single`); `dropdown`: the same in a <details> menu, with
 * "All" or "n selected" as its label; `buttons`: chips, Ctrl/Cmd-click to add to the selection. A "Clear" button
 * appears while something is selected.
 */
export function choiceControl(el: ControlElement, style: ChoiceStyle, o: ChoiceOptions): void {
  const fmt = o.format ?? ((v: Value) => String(v ?? ''));
  const values: Value[] = [...o.values];
  const sel = o.selected;
  for (const s of sel ?? []) if (!values.some((v) => sameValue(v, s))) values.push(s);
  const isOn = (v: Value) => !!sel?.some((s) => sameValue(s, v));
  const toggle = (v: Value, additive: boolean) => {
    const cur = sel ?? [];
    if (o.single || !additive) o.onChange(isOn(v) && cur.length === 1 ? [] : [v]);
    else o.onChange(isOn(v) ? cur.filter((s) => !sameValue(s, v)) : [...cur, v]);
  };
  let html: string;
  if (style === 'buttons') {
    html = `<div class="sk-control sk-chips">${values.map((v, i) => `<button type="button" class="sk-chip${isOn(v) ? ' sk-on' : ''}" aria-pressed="${isOn(v)}" data-i="${i}">${esc(fmt(v))}</button>`).join('')}</div>`;
  } else if (style === 'dropdown') {
    const label = sel?.length ? (sel.length === 1 ? fmt(sel[0]!) : `${sel.length} selected`) : 'All';
    html = `<details class="sk-control sk-dropdown"><summary class="sk-input">${esc(label)}</summary><div class="sk-dropdown-list">${values
      .map((v, i) => `<label><input type="checkbox" data-i="${i}"${isOn(v) ? ' checked' : ''}> ${esc(fmt(v))}</label>`)
      .join('')}</div></details>`;
  } else {
    const type = o.single ? 'radio' : 'checkbox';
    const name = o.name ? ` name="${esc(o.name)}"` : '';
    html = `<div class="sk-control sk-list">${values.map((v, i) => `<label><input type="${type}"${name} data-i="${i}"${isOn(v) ? ' checked' : ''}> <span>${esc(fmt(v))}</span></label>`).join('')}</div>`;
  }
  if (sel?.length) html += '<button type="button" class="sk-clear" title="Clear selection">Clear</button>';
  const wasOpen = (el.querySelector?.('details') as HTMLDetailsElement | null)?.open;
  el.innerHTML = html;
  if (wasOpen) (el.querySelector('details') as HTMLDetailsElement).open = true;
  el.querySelector?.('.sk-clear')?.addEventListener('click', () => o.onChange([]));
  el.querySelectorAll?.<HTMLElement>('[data-i]').forEach((node) => {
    const v = values[Number(node.dataset.i)]!;
    if (node.tagName === 'INPUT') node.addEventListener('change', () => toggle(v, style !== 'list' || !o.single));
    else node.addEventListener('click', (e) => toggle(v, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey || !o.single));
  });
}

export interface RangeOptions {
  /** Number inputs or date inputs (values as 'YYYY-MM-DD'). */
  kind: 'number' | 'date';
  /** The data's extent, shown as placeholders and limits. */
  min: Value;
  max: Value;
  /** The current range; null ends are open. */
  value: readonly [Value, Value] | null;
  /** Called with the new range, or null when both ends are empty. */
  onChange(range: [Value, Value] | null): void;
}

/** Two inputs, from and to. */
export function rangeControl(el: ControlElement, o: RangeOptions): void {
  const show = (x: Value | undefined) => (x === null || x === undefined ? '' : esc(o.kind === 'date' ? String(x).slice(0, 10) : x));
  const lim = `min="${show(o.min)}" max="${show(o.max)}"`;
  el.innerHTML = `<div class="sk-control sk-range"><input class="sk-input" type="${o.kind}" data-i="0" aria-label="From" value="${show(o.value?.[0])}" placeholder="${show(o.min)}" ${lim}><span>–</span><input class="sk-input" type="${o.kind}" data-i="1" aria-label="To" value="${show(o.value?.[1])}" placeholder="${show(o.max)}" ${lim}></div>`;
  const inputs = [...(el.querySelectorAll?.<HTMLInputElement>('input') ?? [])];
  for (const input of inputs)
    input.addEventListener('change', () => {
      const vals = inputs.map((i) => (i.value === '' ? null : o.kind === 'number' ? Number(i.value) : i.value)) as [Value, Value];
      o.onChange(vals.every((x) => x === null) ? null : vals);
    });
}

export interface SearchOptions {
  value: string;
  placeholder?: string;
  /** Milliseconds of quiet typing before onChange. Default 250. */
  delay?: number;
  onChange(text: string): void;
}

/** A search box that reports its text after typing pauses. */
export function searchControl(el: ControlElement, o: SearchOptions): void {
  el.innerHTML = `<div class="sk-control"><input class="sk-input" type="search" placeholder="${esc(o.placeholder ?? 'Search…')}" value="${esc(o.value)}"></div>`;
  const input = el.querySelector?.<HTMLInputElement>('input');
  let t: ReturnType<typeof setTimeout> | undefined;
  input?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => o.onChange(input.value), o.delay ?? 250);
  });
}
