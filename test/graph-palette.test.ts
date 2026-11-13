import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { FAMILY_PALETTE_DARK, FAMILY_PALETTE_LIGHT, GroupColors, THEMES, packRgba8, parseColor } from '../dist/graph/palette.js';

describe('palette', () => {
  it('has the family product colours', () => {
    expect(FAMILY_PALETTE_LIGHT[0]).toBe('#003399');
    expect(FAMILY_PALETTE_LIGHT).toHaveLength(8);
    expect(FAMILY_PALETTE_DARK).toHaveLength(8);
    expect(FAMILY_PALETTE_DARK[7]).toBe('#FF8A5C');
  });

  it('parses hex colours', () => {
    expect(parseColor('#ff0000')).toEqual([1, 0, 0, 1]);
    expect(parseColor('#0f08')).toEqual([0, 1, 0, 0x88 / 255]);
    expect(parseColor('E5622F')[0]).toBeCloseTo(0xe5 / 255);
    expect(parseColor('nonsense')).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it('packs red into the low byte (WGSL unpack4x8unorm)', () => {
    expect(packRgba8([1, 0, 0, 0])).toBe(0xff);
    expect(packRgba8([0, 0, 0, 1])).toBe(0xff000000);
    expect(packRgba8(parseColor('#003399'))).toBe(0xff993300);
  });

  it('assigns groups to slots in order of first appearance, stably', () => {
    const g = new GroupColors();
    expect(g.slot('Person')).toBe(0);
    expect(g.slot('Company')).toBe(1);
    expect(g.slot('Person')).toBe(0);
    expect(g.slot(undefined)).toBe(0);
    expect(g.slot('City')).toBe(2);
    expect(g.color('Company', FAMILY_PALETTE_LIGHT)).toBe('#0E7FAE');
  });

  it('wraps around the palette', () => {
    const g = new GroupColors();
    for (let i = 0; i < 9; i++) g.slot(`g${i}`);
    expect(g.color('g8', ['#111111', '#222222'])).toBe('#111111');
    expect(g.color('g1', [])).toBe('#808080');
  });

  it('uses the Kiln accents for highlight', () => {
    expect(THEMES.light.accent).toEqual(parseColor('#E5622F'));
    expect(THEMES.dark.accent).toEqual(parseColor('#FF8A5C'));
    expect(THEMES.dark.bg).toEqual(parseColor('#14171F'));
  });
});
