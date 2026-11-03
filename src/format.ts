// Value formatting for labels, tooltips, tables and cards. Built on Intl; formatters are cached.
/** A value as smaltdb returns it. */
export type Value = null | number | bigint | string | Uint8Array;

/** What a column holds, for choosing a formatter. */
export type ColumnType = 'number' | 'text' | 'date' | 'datetime' | 'bool' | 'any';

/**
 * A display format: a preset name (number, integer, decimal, percent, currency, currency0, compact,
 * currency-compact, date, datetime, month, year, text), a small pattern such as "$#,0.00" or "0.0%",
 * or an object.
 */
export type Format = string | FormatSpec;

export interface FormatSpec {
  preset?: string;
  decimals?: number;
  currency?: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  percent?: boolean;
  /** Multiply before formatting (e.g. 0.001 to show thousands). */
  scale?: number;
  locale?: string;
  /** Date pattern tokens: YYYY YY MMMM MMM MM M DD D HH mm ss Q. */
  date?: string;
}

const PRESETS: Record<string, FormatSpec> = {
  number: { decimals: undefined },
  integer: { decimals: 0 },
  decimal: { decimals: 2 },
  percent: { percent: true, decimals: 1 },
  currency: { currency: 'USD', decimals: 2 },
  'currency0': { currency: 'USD', decimals: 0 },
  compact: { compact: true },
  'currency-compact': { currency: 'USD', compact: true },
  date: { date: 'YYYY-MM-DD' },
  datetime: { date: 'YYYY-MM-DD HH:mm' },
  month: { date: 'MMM YYYY' },
  year: { date: 'YYYY' },
  text: {},
};

export function formatSpec(f: Format | undefined): FormatSpec {
  if (!f) return {};
  if (typeof f === 'string') return PRESETS[f] ?? parsePattern(f);
  if (f.preset) return { ...(PRESETS[f.preset] ?? {}), ...f };
  return f;
}

/**
 * A small Excel-like pattern: "$#,0.00", "0.0%", "#,0 kg", "€#,0.0,,\"M\"" is not supported
 * (use { compact: true } instead). Prefix/suffix text around the number part is kept.
 */
function parsePattern(p: string): FormatSpec {
  const m = /^([^#0]*)([#0,]*)(?:\.(0+))?(%?)(.*)$/.exec(p);
  if (!m || !m[2]) return { prefix: p };
  return { prefix: m[1] || undefined, decimals: m[3]?.length ?? 0, percent: m[4] === '%', suffix: m[5] || undefined };
}

const cache = new Map<string, Intl.NumberFormat>();

function numberFormat(spec: FormatSpec, locale: string | undefined): Intl.NumberFormat {
  const key = JSON.stringify([spec, locale]);
  let nf = cache.get(key);
  if (!nf) {
    const o: Intl.NumberFormatOptions = {};
    if (spec.currency) {
      o.style = 'currency';
      o.currency = spec.currency;
    }
    if (spec.percent) o.style = 'percent';
    if (spec.compact) {
      o.notation = 'compact';
      o.maximumFractionDigits = spec.decimals ?? 1;
    }
    if (spec.decimals !== undefined) {
      o.minimumFractionDigits = spec.compact ? 0 : spec.decimals;
      o.maximumFractionDigits = spec.decimals;
    } else if (!spec.compact && !spec.currency) {
      o.maximumFractionDigits = 2;
    }
    try {
      nf = new Intl.NumberFormat(locale, o);
    } catch {
      nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    }
    cache.set(key, nf);
  }
  return nf;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Parse an ISO-like date string (or epoch number) into its parts without time-zone shifts. */
export function dateParts(v: Value): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  if (typeof v === 'number') {
    const dt = new Date(v > 1e11 ? v : v * 1000);
    return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds() };
  }
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) return null;
  return { y: +m[1]!, mo: +m[2]!, d: m[3] ? +m[3] : 1, h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0, s: m[6] ? +m[6] : 0 };
}

export function formatDate(v: Value, pattern: string): string {
  const p = dateParts(v);
  if (!p) return v === null ? '' : String(v);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|mm|ss|Q/g, (t) => {
    switch (t) {
      case 'YYYY':
        return String(p.y);
      case 'YY':
        return pad(p.y % 100);
      case 'MMMM':
        return MONTHS[p.mo - 1] ?? '';
      case 'MMM':
        return (MONTHS[p.mo - 1] ?? '').slice(0, 3);
      case 'MM':
        return pad(p.mo);
      case 'M':
        return String(p.mo);
      case 'DD':
        return pad(p.d);
      case 'D':
        return String(p.d);
      case 'HH':
        return pad(p.h);
      case 'mm':
        return pad(p.mi);
      case 'ss':
        return pad(p.s);
      case 'Q':
        return String(Math.ceil(p.mo / 3));
      default:
        return t;
    }
  });
}

export interface Formatter {
  (v: Value): string;
}

/** Build a formatter for a field's format and type. */
export function formatter(f: Format | undefined, type: ColumnType = 'any', locale?: string): Formatter {
  const spec = formatSpec(f);
  if (spec.date) {
    const pattern = spec.date;
    return (v) => (v === null ? '(Blank)' : formatDate(v, pattern));
  }
  const numeric = type === 'number' || spec.currency || spec.percent || spec.compact || spec.decimals !== undefined;
  const nf = numberFormat(spec, spec.locale ?? locale);
  const pre = spec.prefix ?? '';
  const suf = spec.suffix ?? '';
  const scale = spec.scale ?? 1;
  return (v) => {
    if (v === null || v === undefined) return '(Blank)';
    if (typeof v === 'number' || typeof v === 'bigint') {
      if (!numeric && type !== 'any') return pre + String(v) + suf;
      return pre + nf.format(Number(v) * scale) + suf;
    }
    if (v instanceof Uint8Array) return `<${v.length} bytes>`;
    if (numeric && v !== '' && !isNaN(Number(v))) return pre + nf.format(Number(v) * scale) + suf;
    return pre + v + suf;
  };
}

/** A short formatter for axis ticks: compact numbers. */
export function axisFormatter(f: Format | undefined, locale?: string): Formatter {
  const spec = formatSpec(f);
  if (spec.date) return formatter(f, 'date', locale);
  const short: FormatSpec = { ...spec, compact: true, decimals: spec.percent ? 0 : 1 };
  if (spec.percent) delete short.compact;
  return formatter(short, 'number', locale);
}
