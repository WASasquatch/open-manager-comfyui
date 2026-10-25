# Quality of Life patches

Each patch fixes one fault in ComfyUI's own frontend and has its own switch under
Settings > Open Manager > Quality of Life Patches.

## Layout

| Path | Holds |
|---|---|
| `loader.mjs` | Registers the settings from the server's list, then imports and runs the patches |
| `shared.mjs` | Helpers more than one patch uses |
| `assets/` | The Media Assets panel and the assets behind it |
| `canvas/` | Canvas input and navigation |
| `interface/` | Menus, dialogs and the rest of ComfyUI's chrome |
| `nodes/` | Node bodies, widgets, badges and node lists |
| `search/` | The node search box |
| `subgraphs/` | Subgraph nodes |
| `templates/` | Workflow templates and what opening one fetches |

Every `.mjs` file in a category folder is one patch. The server lists them
(`GET /open_manager/v1/api/qol`, `open_manager/qol.py`) sorted by folder, then file, and Settings
shows them grouped by folder. A folder inside a category holds one patch's own modules, named
after it (`nodes/nodes2-widgets/` for `nodes/nodes2-widgets.mjs`), or the modules several patches
share, named after what they share (`templates/media/`), and is never listed.

## Adding a patch

Put it in the folder for the area it fixes, named for what it does in lowercase letters, digits
and dashes. A new area is a new folder, named the same way. Add a row to the Quality of Life
Patches table in the top-level README.

The file's default export:

| Field | |
|---|---|
| `key` | The setting id is `openManager.<key>`. Unique, and never renamed once shipped, since it holds each user's switch |
| `name` | The setting's label |
| `tooltip` | The setting's tooltip |
| `issues` | `owner/repo#number` for each issue it answers, linked beside the label |
| `defaultValue` | Whether it is on by default, or which of its `options` |
| `options` | Optional. Choices in place of a switch; the first leaves ComfyUI as it is and stops the patch |
| `verified` | The frontend version it was last checked against |
| `check()` | `""` when it can apply, otherwise the reason it cannot, logged to the console |
| `on(track, standDown, choice)` | Applies it. Pass every undo step to `track`; call `standDown(reason)` when ComfyUI turns out to have changed or fixed it. A patch with `options` gets the chosen one, and is stopped and started again when it changes |
| `menu(node)`, `canvasMenu(canvas)` | Optional extra items for the node and canvas menus |

The server reads `key`, `name`, `tooltip`, `issues`, `defaultValue` and `verified` from the file
without running it, and every setting is registered from that list before any patch loads, so a
slow or broken patch never costs its switch. Write them as plain values: `true` or `false`,
strings in double quotes joined with `+`, a top-level `const NAME = "..."` string, or a list of
strings. A field the server cannot read is warned about in the browser console, and that
patch's setting then waits for the file to load.

Each file is imported with no time limit and retried twice. One that still fails, exports
without `check` and `on`, or reuses another patch's `key` keeps its switch, shows as Failed in
Open Manager Settings, and leaves the other patches running. A patch must not await anything at
its top level: ComfyUI's startup waits up to 10 seconds for the patches before carrying on, and
any that arrive later start then.

## Retiring a patch

When ComfyUI fixes the fault, delete the file and its README row. To keep it but switch it off,
rename it to `name.mjs.off` or `_name.mjs`; a folder starting with `_` is left out the same way.
