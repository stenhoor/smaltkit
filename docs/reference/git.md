# smaltkit/git

Reads a local git repository's `.git` folder, read only: objects (loose and packed, with deltas), refs, branches, commits, trees and blobs, a file at any commit, history, and a line diff.

It never writes to `.git` and never talks to a remote. In a page, `gitDirFromHandle` reads the folder through the File
System Access API; `blobId` gives the id git would give a working file, to compare it with a commit's.

## Examples

Open the repository in a folder the user picks:

```ts
import { gitDirFromHandle, openRepository } from 'smaltkit/git';

const root = await showDirectoryPicker();
const repo = await openRepository(gitDirFromHandle(root));
```

A line diff, and the id git gives a file's content:

```ts
import { diffLines, blobId } from 'smaltkit/git';

for (const d of diffLines('a\nb\nc', 'a\nB\nc')) console.log(d.op, d.text);
console.log(await blobId(new TextEncoder().encode('hello\n')));
```

```text
keep a
remove b
add B
keep c
ce013625030ba8dba906f756967f9e9ca394464a
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`applyDelta`](./git/applyDelta) | Applies a git delta to its base, as packs store most objects. |
| [`blobId`](./git/blobId) | The id git gives a file's contents (`git hash-object`): how a working file is compared with a commit's. |
| [`diffLines`](./git/diffLines) | A line diff of two texts (Myers' algorithm): the fewest lines removed and added to turn `a` into `b`. |
| [`gitDirFromHandle`](./git/gitDirFromHandle) | A `GitDir` over a `.git` folder's FileSystemDirectoryHandle (the File System Access API). |
| [`inflate`](./git/inflate) | zlib-inflates `data` (the whole stream, no trailing bytes), with the platform's DecompressionStream. |
| [`openRepository`](./git/openRepository) | Opens a repository from its `.git` folder. |
| [`sha1`](./git/sha1) | SHA-1, as hex, with the platform's Web Crypto. |

### Classes

#### GitError {#GitError}

```ts noplay
class GitError extends Error {
    constructor(message: string);
}
```

A problem reading the repository: what isn't there, or what this reader doesn't handle.

#### Repository {#Repository}

```ts noplay
class Repository {
    #private;
    constructor(dir: GitDir, packs: Pack[]);
    readObject(id: string): Promise<GitObject>;
    readCommit(id: string): Promise<GitCommit>;
    readTree(id: string): Promise<GitTreeEntry[]>;
    readBlob(id: string): Promise<Uint8Array>;
    entryAt(commitish: string, path: string): Promise<GitTreeEntry | null>;
    readFile(commitish: string, path: string): Promise<Uint8Array | null>;
    readText(commitish: string, path: string): Promise<string | null>;
    ref(name: string): Promise<string | null>;
    currentBranch(): Promise<string | null>;
    branches(): Promise<string[]>;
    resolve(name: string): Promise<string>;
    log(commitish: string, options?: {
        path?: string;
        limit?: number;
    }): Promise<GitCommit[]>;
}
```

A git repository, read from its `.git` folder.

### Interfaces

#### DiffLine {#DiffLine}

```ts noplay
interface DiffLine {
    op: 'keep' | 'remove' | 'add';
    text: string;
}
```

One step of a line diff: a line kept, removed (from `a`) or added (from `b`).

#### GitCommit {#GitCommit}

```ts noplay
interface GitCommit {
    id: string;
    tree: string;
    parents: string[];
    author: GitPerson;
    committer: GitPerson;
    message: string;
}
```

#### GitDir {#GitDir}

```ts noplay
interface GitDir {
    file(path: string): Promise<GitFile | null>;
    list(path: string): Promise<string[] | null>;
}
```

The `.git` folder, by paths relative to it (`objects/pack`, `refs/heads/main`).

| Member | |
| --- | --- |
| `file` | The file at the path, or null. |
| `list` | The names in the folder at the path, or null when there is none. |

#### GitFile {#GitFile}

```ts noplay
interface GitFile {
    readonly size: number;
    read(start: number, end: number): Promise<Uint8Array>;
}
```

A file in `.git`, read in ranges so a large pack is never read whole.

#### GitObject {#GitObject}

```ts noplay
interface GitObject {
    type: GitObjectType;
    data: Uint8Array;
}
```

#### GitPerson {#GitPerson}

```ts noplay
interface GitPerson {
    name: string;
    email: string;
    time: number;
    zone: string;
}
```

| Member | |
| --- | --- |
| `time` | Seconds since the epoch. |
| `zone` | The time zone as git writes it: `+0100`. |

#### GitTreeEntry {#GitTreeEntry}

```ts noplay
interface GitTreeEntry {
    mode: string;
    name: string;
    id: string;
    type: 'blob' | 'tree' | 'commit';
}
```

| Member | |
| --- | --- |
| `mode` | `100644` (file), `100755` (executable), `120000` (link), `40000` (folder), `160000` (submodule). |

### Types

#### GitObjectType {#GitObjectType}

```ts noplay
type GitObjectType = 'commit' | 'tree' | 'blob' | 'tag';
```

<!-- api:end -->
