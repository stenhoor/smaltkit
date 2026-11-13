import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import {
  DATE_STEPS, EMPTY_LEAD_MIN_MS, MIN_SPAN_COMMITS, addStep, chooseDateStep, clampWindow, coalesceTicks, commitDateLabels,
  dateLabel, dateTicks, domainOf, floorDate, formatDateTime, indexOfVersion, isFull, minSpan, nearestIndex, panWindow,
  positions, reveal, tickHeight, uOf, versionAt, xOf, zoomWindow,
} from '../dist/timeline/scale.js';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();
const commits = (times: number[], size = 1) => times.map((time, i) => ({ version: i + 1, time, size }));

describe('positions on the ruler', () => {
  it('spaces commits evenly on the commit axis, version 0 first', () => {
    const u = positions(commits([5, 1000, 1001]), 'commit');
    expect([...u]).toEqual([0, 1, 2, 3]);
    expect(domainOf(u)).toEqual({ a: 0, b: 3 });
  });

  it('places commits by time, version 0 just before the first', () => {
    const t0 = at(2026, 0, 1);
    const u = positions(commits([t0, t0 + DAY, t0 + 100 * DAY]), 'time');
    expect(u[1]).toBe(t0);
    expect(u[3]).toBe(t0 + 100 * DAY);
    expect(u[0]).toBeLessThan(t0);
    expect(t0 - u[0]!).toBeCloseTo(3 * DAY, -3);
  });

  it('handles no commits, one commit and equal times', () => {
    expect([...positions([], 'time')]).toEqual([0]);
    expect(domainOf(positions([], 'commit'))).toEqual({ a: 0, b: 1 });
    const one = positions(commits([1e12]), 'time');
    expect([...one]).toEqual([1e12 - EMPTY_LEAD_MIN_MS, 1e12]);
    const same = positions(commits([5e11, 5e11, 5e11]), 'time');
    expect(same[0]).toBe(5e11 - EMPTY_LEAD_MIN_MS);
    expect(domainOf(same).b).toBeGreaterThan(domainOf(same).a);
    // A commit dated before its predecessor sits on it: positions never go back.
    const back = positions(commits([200, 100, 300]), 'time');
    expect([...back.subarray(1)]).toEqual([200, 200, 300]);
  });

  it('maps between domain and pixels both ways', () => {
    const w = { a: 10, b: 20 };
    expect(xOf(15, w, 200)).toBe(100);
    expect(uOf(100, w, 200)).toBe(15);
    expect(uOf(xOf(12.5, w, 333), w, 333)).toBeCloseTo(12.5, 9);
  });
});

describe('nearest commit', () => {
  it('finds the nearest point, ties to the later one', () => {
    const u = new Float64Array([0, 1, 2, 3]);
    expect(nearestIndex(u, -5)).toBe(0);
    expect(nearestIndex(u, 1.4)).toBe(1);
    expect(nearestIndex(u, 1.5)).toBe(2);
    expect(nearestIndex(u, 99)).toBe(3);
    expect(nearestIndex(new Float64Array(0), 1)).toBe(-1);
  });

  it('takes the last of several commits at the same time', () => {
    const u = new Float64Array([0, 10, 10, 10, 20]);
    expect(nearestIndex(u, 9)).toBe(3);
    expect(nearestIndex(u, 11)).toBe(3);
  });

  it('maps versions to points and back, snapping to the last commit at or before', () => {
    const cs = [{ version: 1 }, { version: 2 }, { version: 5 }];
    expect(indexOfVersion(cs, 0)).toBe(0);
    expect(indexOfVersion(cs, 2)).toBe(2);
    expect(indexOfVersion(cs, 4)).toBe(2);
    expect(indexOfVersion(cs, 99)).toBe(3);
    expect(indexOfVersion([], 3)).toBe(0);
    expect([0, 1, 2, 3].map((i) => versionAt(cs, i))).toEqual([0, 1, 2, 5]);
  });
});

describe('ticks', () => {
  it('grow with log(size), never vanish', () => {
    expect(tickHeight(0, 100)).toBe(0.25);
    expect(tickHeight(100, 100)).toBe(1);
    expect(tickHeight(10, 100)).toBeGreaterThan(tickHeight(2, 100));
  });

  it('coalesce per pixel column, keeping the tallest, visiting only the window', () => {
    const cs = Array.from({ length: 10_000 }, (_, i) => ({ version: i + 1, time: i, size: i === 5000 ? 1000 : 1 }));
    const u = positions(cs, 'commit');
    const out = new Float32Array(100);
    const used = coalesceTicks(u, cs, domainOf(u), 100, 1000, out);
    expect(used).toBe(100);
    expect(Math.max(...out)).toBe(1);
    expect(out[50]).toBe(1);
    // Zoomed to 10 commits on 100 px: ten columns have a tick.
    const used2 = coalesceTicks(u, cs, { a: 100.5, b: 110.5 }, 100, 1000, out);
    expect(used2).toBe(10);
    expect(coalesceTicks(u, cs, domainOf(u), 0, 1, out)).toBe(0);
  });
});

describe('zoom and pan', () => {
  const domain = { a: 0, b: 100 };
  it('clamps to the domain and to the narrowest window', () => {
    expect(clampWindow({ a: -10, b: 20 }, domain, 4)).toEqual({ a: 0, b: 30 });
    expect(clampWindow({ a: 90, b: 120 }, domain, 4)).toEqual({ a: 70, b: 100 });
    expect(clampWindow({ a: 50, b: 50.5 }, domain, 4)).toEqual({ a: 50, b: 54 });
    expect(clampWindow({ a: -50, b: 500 }, domain, 4)).toEqual({ a: 0, b: 100 });
    expect(minSpan('commit', { a: 0, b: 2 })).toBe(2);
    expect(minSpan('commit', domain)).toBe(MIN_SPAN_COMMITS);
  });

  it('zooms about a point and keeps it in place', () => {
    const w = zoomWindow(domain, domain, 25, 4, 4);
    expect(w).toEqual({ a: 18.75, b: 43.75 });
    expect(xOf(25, w, 100)).toBeCloseTo(xOf(25, domain, 100), 9);
    expect(zoomWindow(w, domain, 25, 1000, 4).b - zoomWindow(w, domain, 25, 1000, 4).a).toBe(4);
    expect(isFull(zoomWindow(w, domain, 25, 0.001, 4), domain)).toBe(true);
  });

  it('pans within the domain', () => {
    expect(panWindow({ a: 10, b: 20 }, domain, 5, 4)).toEqual({ a: 15, b: 25 });
    expect(panWindow({ a: 10, b: 20 }, domain, -50, 4)).toEqual({ a: 0, b: 10 });
    expect(reveal({ a: 10, b: 20 }, domain, 50, 4, 0)).toEqual({ a: 40, b: 50 });
    expect(reveal({ a: 10, b: 20 }, domain, 15, 4)).toEqual({ a: 10, b: 20 });
  });
});

describe('date labels', () => {
  it('choose a step by range and width', () => {
    expect(chooseDateStep(365 * DAY, 900, 76).unit).toBe('month');
    expect(chooseDateStep(10 * 365 * DAY, 900, 76).unit).toBe('year');
    expect(chooseDateStep(3 * DAY, 900, 76).unit).toBe('hour');
    expect(chooseDateStep(30 * DAY, 900, 76)).toMatchObject({ unit: 'day' });
    expect(chooseDateStep(HOUR, 900, 76).unit).toBe('minute');
    // Narrow: coarser.
    expect(DATE_STEPS.indexOf(chooseDateStep(365 * DAY, 300, 76))).toBeGreaterThan(DATE_STEPS.indexOf(chooseDateStep(365 * DAY, 900, 76)));
  });

  it('align to round local dates', () => {
    const t = at(2026, 10, 3, 14, 37);
    const month = DATE_STEPS.find((s) => s.unit === 'month' && s.count === 3)!;
    expect(floorDate(t, month)).toBe(at(2026, 9, 1));
    expect(addStep(at(2026, 9, 1), month)).toBe(at(2027, 0, 1));
    const quarterHour = DATE_STEPS.find((s) => s.unit === 'minute' && s.count === 15)!;
    expect(floorDate(t, quarterHour)).toBe(at(2026, 10, 3, 14, 30));
    const week = DATE_STEPS.find((s) => s.unit === 'day' && s.count === 7)!;
    expect(new Date(floorDate(t, week)).getDay()).toBe(1);
    const ticks = dateTicks(at(2026, 0, 15), at(2026, 5, 15), DATE_STEPS.find((s) => s.unit === 'month' && s.count === 1)!);
    expect(ticks).toEqual([1, 2, 3, 4, 5].map((m) => at(2026, m, 1)));
  });

  it('read as a date', () => {
    const month = DATE_STEPS.find((s) => s.unit === 'month' && s.count === 1)!;
    expect(dateLabel(at(2026, 10, 1), month)).toBe('Nov');
    expect(dateLabel(at(2027, 0, 1), month)).toBe('Jan 2027');
    expect(dateLabel(at(2026, 10, 3, 14, 5), DATE_STEPS[0]!)).toBe('14:05');
    expect(dateLabel(at(2026, 10, 3), DATE_STEPS[4]!)).toBe('3 Nov');
    expect(formatDateTime(at(2026, 10, 3, 14, 2))).toBe('3 Nov 2026 14:02');
  });

  it('mark the first commit of each period on the commit axis, spaced out', () => {
    // Two commits a day for 120 days.
    const t0 = at(2026, 0, 1, 9);
    const cs = commits(Array.from({ length: 240 }, (_, i) => t0 + Math.floor(i / 2) * DAY + (i % 2) * HOUR));
    const u = positions(cs, 'commit');
    const labels = commitDateLabels(u, cs, domainOf(u), 900, 76);
    expect(labels.length).toBeGreaterThan(2);
    expect(labels.map((l) => dateLabel(l.t, l.step)).slice(0, 2)).toEqual(['1 Jan 2026', '12 Jan']);
    for (let k = 1; k < labels.length; k++) expect(labels[k]!.x - labels[k - 1]!.x).toBeGreaterThanOrEqual(76);
  });
});
