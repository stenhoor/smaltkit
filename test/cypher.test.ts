import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeCypher, cypherStatementAt, cypherWordBefore, highlightCypher, splitCypher, tokenizeCypher } from 'smaltkit/cypher';
import { cypherLanguage } from 'smaltkit/editor';
import * as kit from 'smaltkit';

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const spans = (html: string, cls: string) => [...html.matchAll(new RegExp(`<span class="sk-tk-${cls}">([^<]*)</span>`, 'g'))].map((m) => m[1]);

test('the highlight layer shows exactly the text, so it lines up with the textarea', () => {
  const q = "MATCH (a:Person {name: 'Ada & <Bob>'})-[r:KNOWS*1..2]->(b)\n// who\nRETURN b.name, count(*) AS n /* end */";
  assert.equal(strip(highlightCypher(q)), q + '\n');
  assert.equal(strip(highlightCypher("RETURN 'unterminated")), "RETURN 'unterminated\n");
});

test('keywords, functions, labels and types, property keys, parameters, strings, numbers, comments', () => {
  const html = highlightCypher("MATCH (a:Person:Admin)-[:KNOWS|LIKES]->(b {since: 1.5}) WHERE a.age > $min RETURN toUpper(a.name) // x");
  assert.deepEqual(spans(html, 'k'), ['MATCH', 'WHERE', 'RETURN']);
  assert.deepEqual(spans(html, 'obj'), ['Person', 'Admin', 'KNOWS', 'LIKES']);
  assert.deepEqual(spans(html, 'f'), ['toUpper']);
  assert.deepEqual(spans(html, 'i'), ['age', 'name']);
  assert.deepEqual(spans(html, 'p'), ['$min']);
  assert.deepEqual(spans(html, 'n'), ['1.5']);
  assert.deepEqual(spans(html, 'c'), ['// x']);
  // A list comprehension's `|` isn't a type list's.
  const comp = highlightCypher('RETURN [n IN nodes(p) | n.name]');
  assert.deepEqual(spans(comp, 'obj'), []);
  assert.deepEqual(spans(comp, 'i'), ['name']);
  // A map key's colon isn't a label: `since` stays plain.
  assert.ok(!spans(html, 'obj').includes('since'));
});

test('a range in a variable-length pattern is two numbers, not a fraction', () => {
  const nums = tokenizeCypher('[*1..3]').filter((t) => t.type === 'number').map((t) => t.text);
  assert.deepEqual(nums, ['1', '3']);
});

test('statements split at semicolons outside strings and comments', () => {
  const text = "CREATE (:A {s: 'x;y'});\n// ; not here\nMATCH (n) RETURN n";
  assert.deepEqual(splitCypher(text).map((s) => s.sql), ["CREATE (:A {s: 'x;y'})", 'MATCH (n) RETURN n']);
  assert.equal(cypherStatementAt(text, text.length)?.sql, 'MATCH (n) RETURN n');
  assert.equal(cypherStatementAt(text, 3)?.sql, "CREATE (:A {s: 'x;y'})");
  assert.equal(cypherStatementAt('', 0), null);
});

test('completion: labels in a node, types in a relationship, property keys after a dot', () => {
  const vocab = { labels: ['Person', 'Place'], types: ['KNOWS', 'LIVES_IN'], properties: ['name', 'age'] };
  const at = (t: string) => completeCypher(t, t.length, vocab, false);
  assert.deepEqual(at('MATCH (a:P').items.map((i) => [i.label, i.kind]), [['Person', 'label'], ['Place', 'label']]);
  assert.deepEqual(at('MATCH (a)-[:').items.map((i) => i.label), ['KNOWS', 'LIVES_IN']);
  assert.deepEqual(at('MATCH (a) RETURN a.n').items.map((i) => [i.label, i.kind]), [['name', 'prop']]);
  assert.equal(at('MATCH (a) RETURN a.n').start, 'MATCH (a) RETURN a.'.length);
  // Outside a pattern, a colon is a map's: nothing to offer.
  assert.deepEqual(cypherWordBefore('RETURN {a:', 10).qualifier, null);
  const words = at('MATCH (a) RETURN co').items.map((i) => i.label);
  assert.ok(words.includes('count') && words.includes('collect') && words.includes('coalesce'));
  assert.deepEqual(completeCypher('RETURN c', 8, null, false).items, [], 'one letter typed: nothing until asked');
  assert.ok(completeCypher('RETURN c', 8, null, true).items.length > 0);
});

test('cypherLanguage: // comments, statements, completion from the schema\'s graph', () => {
  assert.equal(cypherLanguage.name, 'Cypher');
  assert.equal(cypherLanguage.lineComment, '//');
  assert.equal(cypherLanguage.statementAt?.('MATCH (n) RETURN n', 3)?.sql, 'MATCH (n) RETURN n');
  const schema = { names: new Set<string>(), tables: new Map(), graph: { labels: ['City'], types: [], properties: [] } };
  assert.deepEqual(cypherLanguage.complete?.('MATCH (c:', 9, schema, false).items.map((i) => i.label), ['City']);
  assert.deepEqual(cypherLanguage.complete?.('MATCH (c:', 9, { names: new Set(), tables: new Map() }, false).items, []);
  assert.equal(kit.cypherLanguage, cypherLanguage);
  assert.equal(kit.highlightCypher, highlightCypher);
});
