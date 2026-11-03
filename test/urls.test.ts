// Runs against the built package (dist/), imported by name as the apps import it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corsHint, normalizeDataUrl } from 'smaltkit/urls';
import * as kit from 'smaltkit';

test('GitHub blob and raw links become raw.githubusercontent.com', () => {
  for (const link of [
    'https://github.com/rfordatascience/tidytuesday/blob/main/data/2024/2024-01-02/x.csv',
    'https://github.com/rfordatascience/tidytuesday/raw/main/data/2024/2024-01-02/x.csv',
    'https://github.com/rfordatascience/tidytuesday/blob/main/data/2024/2024-01-02/x.csv?raw=true',
  ]) {
    const n = normalizeDataUrl(link);
    assert.equal(n.url, 'https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2024/2024-01-02/x.csv');
    assert.equal(n.changed, true);
    assert.match(n.note, /GitHub/);
  }
});

test('Hugging Face blob links become /resolve/', () => {
  const n = normalizeDataUrl('https://huggingface.co/datasets/org/name/blob/main/train.parquet');
  assert.equal(n.url, 'https://huggingface.co/datasets/org/name/resolve/main/train.parquet');
  assert.equal(n.changed, true);
});

test('GitHub folders get a note, other URLs pass through', () => {
  assert.match(normalizeDataUrl('https://github.com/o/r/tree/main/data').note, /folder/);
  assert.deepEqual(normalizeDataUrl('  https://example.com/a.csv '), { url: 'https://example.com/a.csv', changed: false, note: '' });
  assert.deepEqual(normalizeDataUrl('https://example.com/a.csv'), { url: 'https://example.com/a.csv', changed: false, note: '' });
  assert.deepEqual(normalizeDataUrl('data/a.csv'), { url: 'data/a.csv', changed: false, note: '' });
  assert.deepEqual(normalizeDataUrl(null), { url: '', changed: false, note: '' });
});

test('corsHint suggests the raw URL, explains CORS, and ignores other errors', () => {
  assert.equal(
    corsHint('Failed to fetch https://github.com/o/r/blob/main/a.csv.'),
    'Use the raw file instead: https://raw.githubusercontent.com/o/r/main/a.csv',
  );
  assert.match(corsHint('blocked by CORS policy'), /Access-Control-Allow-Origin/);
  assert.equal(corsHint('syntax error near SELECT'), '');
});

test('the package root re-exports every module', () => {
  assert.equal(kit.normalizeDataUrl, normalizeDataUrl);
  assert.equal(kit.corsHint, corsHint);
});
