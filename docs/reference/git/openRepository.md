# openRepository

<!-- api:start -->

```ts
import { openRepository } from 'smaltkit/git';
function openRepository(dir: GitDir): Promise<Repository>;
```

Opens a repository from its `.git` folder. A `.git` that is a file (a worktree's) isn't read.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `dir` | `GitDir` | The `.git` folder, from gitDirFromHandle or any GitDir. |

## Returns

`Promise<Repository>`: The repository, to read its refs, commits, trees, files and history.

## Errors

- GitError when the folder has no HEAD (the promise rejects).

<!-- api:end -->

## Examples

History of a file, in a repository the user picks:

```ts
import { gitDirFromHandle, openRepository, GitError } from 'smaltkit/git';

try {
  const folder = await showDirectoryPicker();
  const repo = await openRepository(gitDirFromHandle(await folder.getDirectoryHandle('.git')));
  console.log(await repo.branches());
} catch (e) {
  if (e instanceof GitError) console.log(e.message);
  else throw e;
}
```


## See also

- [`Repository`](../git#Repository): what it reads.
- [`gitDirFromHandle`](./gitDirFromHandle).
- [`diffLines`](./diffLines).
