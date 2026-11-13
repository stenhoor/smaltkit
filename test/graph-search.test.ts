import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { matchNodes } from '../dist/graph/search.js';

const nodes = [
  { id: 1, label: 'Ada Lovelace', group: 'Person' },
  { id: 'acme', label: 'ACME Corp', group: 'Company' },
  { id: 42 },
  { id: 'x', group: 'person' },
];

describe('search', () => {
  it('matches label, id and group case-insensitively', () => {
    expect(matchNodes(nodes, 'ada')).toEqual([0]);
    expect(matchNodes(nodes, 'ACME')).toEqual([1]);
    expect(matchNodes(nodes, '42')).toEqual([2]);
    expect(matchNodes(nodes, 'PERSON')).toEqual([0, 3]);
    expect(matchNodes(nodes, 'corp')).toEqual([1]);
  });

  it('trims the query and matches nothing for an empty one', () => {
    expect(matchNodes(nodes, '  lovelace ')).toEqual([0]);
    expect(matchNodes(nodes, '')).toEqual([]);
    expect(matchNodes(nodes, '   ')).toEqual([]);
    expect(matchNodes(nodes, 'zzz')).toEqual([]);
  });
});
