// smaltkit/git against real repositories made with the git command: every read is compared with what git says.
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRepository, blobId, diffLines, applyDelta, GitError, type GitDir, type Repository } from 'smaltkit/git';

let dir: string;
const git = (...args: string[]) => execFileSync('git', args, {
  cwd: dir, encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'ada@example.org', GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'ada@example.org', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
}).trim();
const commitAt = (n: number, msg: string) => {
  const date = `${1_700_000_000 + n * 60} +0100`;
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', msg], {
    cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'ada@example.org', GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'ada@example.org', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
};

/** A GitDir over a folder on disk (what gitDirFromHandle is in a page). */
function nodeDir(root: string): GitDir {
  return {
    async file(path) {
      const p = join(root, path);
      try {
        if (!statSync(p).isFile()) return null;
      } catch {
        return null;
      }
      const size = statSync(p).size;
      return {
        size,
        read: async (s, e) => {
          const fd = openSync(p, 'r');
          try {
            const buf = new Uint8Array(e - s);
            readSync(fd, buf, 0, e - s, s);
            return buf;
          } finally {
            closeSync(fd);
          }
        },
      };
    },
    async list(path) {
      try {
        return readdirSync(join(root, path));
      } catch {
        return null;
      }
    },
  };
}

/** A notebook-like file, long enough that a later version is stored as a delta in a pack. */
const notebook = (n: number) => Array.from({ length: 200 }, (_, i) => `cell('c${i}'); export const v${i} = ${i === 50 ? n : i};`).join('\n') + '\n';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'smaltkit-git-'));
  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'nb'));
  for (let n = 1; n <= 6; n++) {
    writeFileSync(join(dir, 'nb/shop.nb.ts'), notebook(n));
    writeFileSync(join(dir, `other${n % 2}.txt`), `other ${n}\n`);
    git('add', '-A');
    commitAt(n, `step ${n}\n\nbody ${n}`);
  }
  git('tag', 'v1');
  git('tag', '-a', 'v1-annotated', '-m', 'annotated');
  git('branch', 'feature/x', 'HEAD~2');
});

after(() => rmSync(dir, { recursive: true, force: true }));

async function check(repo: Repository) {
  const head = git('rev-parse', 'HEAD');
  assert.equal(await repo.resolve('HEAD'), head);
  assert.equal(await repo.resolve('main'), head);
  assert.equal(await repo.resolve('v1-annotated'), head, 'an annotated tag peels to its commit');
  assert.equal(await repo.resolve('feature/x'), git('rev-parse', 'HEAD~2'));
  assert.equal(await repo.currentBranch(), 'main');
  assert.deepEqual(await repo.branches(), ['feature/x', 'main']);

  const c = await repo.readCommit(head);
  assert.equal(c.tree, git('rev-parse', 'HEAD^{tree}'));
  assert.deepEqual(c.parents, [git('rev-parse', 'HEAD~1')]);
  assert.deepEqual(c.author, { name: 'Ada', email: 'ada@example.org', time: 1_700_000_360, zone: '+0100' });
  assert.equal(c.message, 'step 6\n\nbody 6\n');

  const entries = (await repo.readTree(c.tree)).map((e) => `${e.mode} ${e.type} ${e.id}\t${e.name}`);
  assert.deepEqual(entries, git('ls-tree', 'HEAD').split('\n').map((l) => l.replace(/^040000/, '40000')));

  for (const rev of ['HEAD', 'HEAD~3', 'feature/x']) {
    assert.equal(await repo.readText(rev, 'nb/shop.nb.ts'), git('show', `${rev}:nb/shop.nb.ts`) + '\n', rev);
  }
  assert.equal(await repo.readFile('HEAD', 'nb/missing.nb.ts'), null);
  assert.equal(await repo.readFile('HEAD', 'nb'), null, 'a folder is not a file');

  const working = readFileSync(join(dir, 'nb/shop.nb.ts'));
  assert.equal(await blobId(working), git('hash-object', 'nb/shop.nb.ts'));
  assert.equal((await repo.entryAt('HEAD', 'nb/shop.nb.ts'))!.id, git('rev-parse', 'HEAD:nb/shop.nb.ts'));

  assert.deepEqual((await repo.log('HEAD')).map((x) => x.id), git('log', '--format=%H').split('\n'));
  assert.deepEqual((await repo.log('HEAD', { limit: 2 })).map((x) => x.id), git('log', '-2', '--format=%H').split('\n'));
  assert.deepEqual((await repo.log('HEAD', { path: 'other1.txt' })).map((x) => x.id), git('log', '--format=%H', '--', 'other1.txt').split('\n'));
  assert.equal(await repo.resolve('HEAD~3'), git('rev-parse', 'HEAD~3'));
  assert.equal(await repo.resolve('main^'), git('rev-parse', 'main^'));
  assert.equal(await repo.resolve('HEAD~1^1~1'), git('rev-parse', 'HEAD~1^1~1'));
  await assert.rejects(repo.resolve('nope'), GitError);
  await assert.rejects(repo.resolve('HEAD^2'), /has 1 parent/);
}

test('loose objects and loose refs read as git reads them', async () => {
  await check(await openRepository(nodeDir(join(dir, '.git'))));
});

test('after gc: packed objects (with deltas) and packed refs read the same', async () => {
  git('gc', '-q', '--aggressive');
  assert.deepEqual(readdirSync(join(dir, '.git/objects')).filter((n) => /^[0-9a-f]{2}$/.test(n)), [], 'every object is packed');
  const verify = git('verify-pack', '-v', ...readdirSync(join(dir, '.git/objects/pack')).filter((n) => n.endsWith('.idx')).map((n) => `.git/objects/pack/${n}`));
  assert.match(verify, /chain length = [1-9]/, 'the pack has delta chains');
  await check(await openRepository(nodeDir(join(dir, '.git'))));
});

test('deltas that name their base by id (REF_DELTA) read the same', async () => {
  git('-c', 'repack.useDeltaBaseOffset=false', 'repack', '-a', '-d', '-f', '-q');
  const verify = git('verify-pack', '-v', ...readdirSync(join(dir, '.git/objects/pack')).filter((n) => n.endsWith('.idx')).map((n) => `.git/objects/pack/${n}`));
  assert.match(verify, /chain length = [1-9]/);
  await check(await openRepository(nodeDir(join(dir, '.git'))));
});

test('a folder without HEAD is refused with the reason', async () => {
  await assert.rejects(openRepository(nodeDir(dir)), /no HEAD here: pick the repository folder that holds \.git/);
});

test('applyDelta: copy and insert instructions', () => {
  const base = new TextEncoder().encode('hello world');
  // base size 11, result size 12; copy 6 bytes from 0 ("hello "), insert "there!"
  const delta = new Uint8Array([11, 12, 0x90, 6, 6, ...new TextEncoder().encode('there!')]);
  assert.equal(new TextDecoder().decode(applyDelta(base, delta)), 'hello there!');
  assert.throws(() => applyDelta(base, new Uint8Array([10, 1])), /a base of 10 bytes, not 11/);
});

test('diffLines: the fewest removed and added lines', () => {
  const show = (a: string, b: string) => diffLines(a, b).map((l) => ({ keep: ' ', remove: '-', add: '+' })[l.op] + l.text).join('|');
  assert.equal(show('a\nb\nc', 'a\nb\nc'), ' a| b| c');
  assert.equal(show('a\nb\nc', 'a\nx\nc'), ' a|-b|+x| c');
  assert.equal(show('', 'a\nb'), '+a|+b');
  assert.equal(show('a\nb', ''), '-a|-b');
  assert.equal(show('a\nb\nc\nd', 'b\nc\nd\ne'), '-a| b| c| d|+e');
  const a = notebook(1).split('\n');
  const b = [...a];
  b.splice(10, 1, 'changed');
  b.splice(100, 0, 'inserted');
  const d = diffLines(a.join('\n'), b.join('\n'));
  assert.equal(d.filter((l) => l.op !== 'keep').length, 3);
});
