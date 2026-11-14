# smaltkit/controls

Controls for picking values: a list (checkboxes or radios), a dropdown, buttons, a range and a search box, each reporting its selection through `onChange`.

## Examples

```ts
import { choiceControl } from 'smaltkit/controls';

choiceControl(document.querySelector('#region')!, 'dropdown', {
  values: ['North', 'South', 'East'],
  selected: ['North'],
  onChange: (values) => console.log(values),
});
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### choiceControl {#choiceControl}

```ts
function choiceControl(el: ControlElement, style: ChoiceStyle, o: ChoiceOptions): void;
```

Choose values from a list. `list`: checkboxes (radios when `single`); `dropdown`: the same in a &lt;details> menu, with
"All" or "n selected" as its label; `buttons`: chips, Ctrl/Cmd-click to add to the selection. A "Clear" button
appears while something is selected.

#### rangeControl {#rangeControl}

```ts
function rangeControl(el: ControlElement, o: RangeOptions): void;
```

Two inputs, from and to.

#### sameValue {#sameValue}

```ts
function sameValue(a: Value, b: Value): boolean;
```

Equal values, across number and bigint (an integer column can come back as either).

#### searchControl {#searchControl}

```ts
function searchControl(el: ControlElement, o: SearchOptions): void;
```

A search box that reports its text after typing pauses.

### Interfaces

#### ChoiceOptions {#ChoiceOptions}

```ts
interface ChoiceOptions {
    values: readonly Value[];
    selected: readonly Value[] | null;
    format?: (v: Value) => string;
    single?: boolean;
    name?: string;
    onChange(values: Value[]): void;
}
```

| Member | |
| --- | --- |
| `values` | The values offered, in order. |
| `selected` | The selected values, or null when nothing is selected ("all"). Selected values missing from `values` are kept. |
| `format?` | How a value is shown. Default: String(value). |
| `single?` | One value at a time (radios in a list). |
| `name?` | The radio group's name, unique in the page (list style with `single`). |
| `onChange` | Called with the new selection; an empty array clears it. |

#### RangeOptions {#RangeOptions}

```ts
interface RangeOptions {
    kind: 'number' | 'date';
    min: Value;
    max: Value;
    value: readonly [
        Value,
        Value
    ] | null;
    onChange(range: [
        Value,
        Value
    ] | null): void;
}
```

| Member | |
| --- | --- |
| `kind` | Number inputs or date inputs (values as 'YYYY-MM-DD'). |
| `min` | The data's extent, shown as placeholders and limits. |
| `value` | The current range; null ends are open. |
| `onChange` | Called with the new range, or null when both ends are empty. |

#### SearchOptions {#SearchOptions}

```ts
interface SearchOptions {
    value: string;
    placeholder?: string;
    delay?: number;
    onChange(text: string): void;
}
```

| Member | |
| --- | --- |
| `delay?` | Milliseconds of quiet typing before onChange. Default 250. |

### Types

#### ChoiceStyle {#ChoiceStyle}

```ts
type ChoiceStyle = 'list' | 'dropdown' | 'buttons';
```

#### ControlElement {#ControlElement}

```ts
type ControlElement = Pick<HTMLElement, 'innerHTML' | 'querySelector' | 'querySelectorAll'>;
```

The element a control draws into (an HTMLElement; tests pass a stand-in).

<!-- api:end -->
