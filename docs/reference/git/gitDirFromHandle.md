# gitDirFromHandle

<!-- api:start -->

```ts
import { gitDirFromHandle } from 'smaltkit/git';
function gitDirFromHandle(root: FileSystemDirectoryHandle): GitDir;
```

A `GitDir` over a `.git` folder's FileSystemDirectoryHandle (the File System Access API).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `root` | `FileSystemDirectoryHandle` | The handle of the `.git` folder. |

## Returns

`GitDir`: What openRepository reads from.

<!-- api:end -->

## Examples

```ts
import { gitDirFromHandle, openRepository } from 'smaltkit/git';

const folder = await showDirectoryPicker();
const dotGit = await folder.getDirectoryHandle('.git');
const repo = await openRepository(gitDirFromHandle(dotGit));
```


## See also

- [`openRepository`](./openRepository).
