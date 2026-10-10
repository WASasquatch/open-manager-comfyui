# Quality of Life patches

Each patch fixes one fault in ComfyUI's own frontend and has its own switch under
Settings > Open Manager > Quality of Life Patches.

## Layout

| Path | Holds |
|---|---|
| `loader.mjs` | Lists, imports and runs the patches, and registers their settings |
| `shared.mjs` | Helpers more than one patch uses |
| `canvas/` | Canvas input and navigation |
| `interface/` | Menus, dialogs and the rest of ComfyUI's chrome |
| `nodes/` | Node bodies, widgets, badges and node lists |
| `search/` | The node search box |
| `subgraphs/` | Subgraph nodes |

Every `.mjs` file in a category folder is one patch. The server lists them
(`GET /open_manager/v1/api/qol`, `open_manager/qol.py`) sorted by folder, then file, and Settings
shows them grouped by folder.

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
| `defaultValue` | Whether it is on by default |
| `verified` | The frontend version it was last checked against |
| `check()` | `""` when it can apply, otherwise the reason it cannot, logged to the console |
| `on(track, standDown)` | Applies it. Pass every undo step to `track`; call `standDown(reason)` when ComfyUI turns out to have changed or fixed it |
| `menu(node)`, `canvasMenu(canvas)` | Optional extra items for the node and canvas menus |

A file that fails to load, takes longer than 5 seconds to, exports without `key`, `name`, `check`
and `on`, or reuses another patch's `key` is skipped with a warning in the browser console. The
other patches still load. A patch must not await anything at its top level: ComfyUI's startup
waits up to 10 seconds for the patches before carrying on without them.

## Retiring a patch

When ComfyUI fixes the fault, delete the file and its README row. To keep it but switch it off,
rename it to `name.mjs.off` or `_name.mjs`; a folder starting with `_` is left out the same way.
