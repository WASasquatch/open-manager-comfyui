# Resource Monitor

A compact CPU, RAM and VRAM readout, and a Memory panel behind it. No nodes are added to
reach any of this.

![Memory panel](docs/monitor-panel.png)

A **Memory** button sits beside Downloads and Models and opens the panel. That button is not
tied to the strip: switching the strip off leaves the panel where it was, rather than reachable
only from the command palette.

The strip itself is off by default. Switch it on under **Open Manager → Monitor**; it appears in
ComfyUI's floating control bar. Clicking it opens the same panel.

## The strip

`CPU 17% · RAM 49% · VRAM 91% · GPU 46°`

By default each figure is drawn the way it reads: a share of a total as a bar left to right, a
temperature as a column like a thermostat, so the two kinds are not mistaken for each other.
The strip is built from the reading, so a machine with four cards gets four of each, labelled
`VRAM:0`, `GPU:0` and so on. A single card is named without an index, and a processor
temperature keeps the sensor's own name unless two of them would read the same.

Six styles, under *How the resource monitor strip is drawn*:

| Style | |
|---|---|
| `mixed` | The default: bars for shares, columns for temperatures |
| `horizontal` | Everything as a bar |
| `vertical` | Everything as a column, each name written down the side of its own |
| `…-compact` | The same, with the text on the bar, or, in the vertical one, no figure at all |

A vertical name is rotated rather than stacked a letter to a line: upright letters want the
whole height of the control bar for a name like `VRAM:0`. It sits beside the track, never over
it. `vertical-compact` drops the figure to the hover and shows the column alone, which is the
narrowest the strip gets: 130 pixels for four readings, against 286 for `horizontal-compact`
and 377 for `mixed`. Every hover says the share first, then what it is a share of.

A column in either vertical style runs the full height of the strip rather than a fixed
number of pixels, so every one is the same height as the longest name beside it and as the
controls it sits among.

## The Memory panel

- **Live graphs** for CPU, system memory and graphics memory, on a fixed nought-to-hundred
  scale so they can be compared by eye. Four minutes of history, kept even while the panel is
  closed. Fold any graph away by its header bar.
- **Models held** — what ComfyUI is holding, how much of each is resident on the card, and how
  much is offloaded.
- **Block maps** — for a model whose weights stream, a square per stretch of the model in the
  order it is written, coloured by where that stretch currently is. The figures step in whole
  pages, so they sit slightly off the byte figure above them; the key says which is which.

## Giving memory back

Two buttons in a strip under the panel's header. **Clear VRAM** unloads every model ComfyUI is
holding. **Clear RAM** clears the cached results of the last run — and unloads the models with
them, because the cached results hold on to them. ComfyUI frees the two together in that one
direction, and that asymmetry is passed on rather than papered over.

Both ask first, every time, and say plainly what they do not check:

> Clear VRAM?
> This clears VRAM regardless of what is using it.

Neither looks at what is using the memory before it frees it, so there is no version of either
that is safe to fire by accident — and a button that only sometimes asks is a button whose
confirmation stops being read. Where a prompt is running, the dialog says what it is.

The freeing itself is handed to ComfyUI's prompt worker as a flag, which is how ComfyUI frees
memory for itself, so it happens on the thread that owns the models.

**Unload** on a single model does the same for that one and its clones, and asks in the same
way — naming the model, what it frees, and the one guard that does exist:

> Unload SDXL?
> This unloads SDXL regardless of what is holding it.

It is refused while a prompt is running: pulling weights out from under a sampler is a way to
fail a run that was going to succeed.

## The light

A dot in the panel's header, left of the close button. Hovering it says why.

| | Means |
|---|---|
| Grey | Idle. Says whether anything is still held. |
| Green | Working — the card is drawing power and getting through it. |
| Amber, steady | *Potential memory stall*: running, quiet, and memory nearly full. It may just be a slow step. |
| Amber, pulsing | *Memory stalled*: nothing has moved for the better part of a minute with memory full. |
| Red | The last run went out of memory, within the last two minutes. |

The hedging is deliberate. A quiet card is not a stalled one — it may be waiting on the disk,
on a node that runs on the processor, or on a model being moved. So quiet only becomes
suspicious when memory is nearly full, and suspicion only becomes a claim once nothing has
moved for forty-five seconds. A light that cried stall at every slow node would be one you
learned to ignore.

## Nothing runs unless something is watching

The server samples only while a panel holds a lease, and a lease that stops being renewed
expires. A counter alone would leak — a closed tab never gets to decrement one — so a browser
that goes away simply stops renewing and sampling stops. Readings are pushed over the websocket
ComfyUI already holds open, so a reading costs one message rather than a request and a reply.

## What can be read, and what cannot

| Reading | Source | Availability |
|---|---|---|
| CPU load, per core | `psutil` | A ComfyUI dependency; absent readings are omitted, not zeroed |
| System memory | ComfyUI's own `model_management` | Always |
| VRAM, per device | ComfyUI's own `model_management` | Always |
| GPU temperature, utilisation and power draw | NVIDIA's NVML, where installed | Omitted entirely when it is not |
| CPU temperature | `psutil.sensors_temperatures` | Linux only — Windows exposes no such reading to Python, so it is absent there |

A figure that cannot be taken is left out rather than shown as zero, which would read as
"idle" rather than "unknown".

## Settings

Under **Open Manager → Monitor**.

| Setting | Default | What it does |
|---|---|---|
| Resource monitor strip | **off** | The whole feature. Nothing is sampled while it is off. |
| Where the resource monitor strip sits | `control` | `control` is ComfyUI's floating control bar, beside the queue controls and any other monitor already there. `topbar` is the workflow tab strip, ahead of the account button. Falls back to the tab strip where a build has no control bar. |
| Seconds between monitor readings | 2 | Clamped to 1–10. The Memory panel asks for one a second while it is open. |
| Show CPU in the monitor strip | on | |
| Show RAM in the monitor strip | on | |
| Show VRAM in the monitor strip | on | |
| Show temperatures in the monitor strip | on | The thermometers, where the platform reports any. |
| How the resource monitor strip is drawn | `mixed` | One of the six styles above. |
| Show the Memory button, which opens this panel | on | The button that opens this panel. Separate from the strip. |

Shared with every window, under **Open Manager → Windows**:

| Setting | Default | What it does |
|---|---|---|
| Memory panel as a window | on | Off, it opens as a modal: centred, in front of everything, closing when you click away or press Escape. Each surface has its own toggle, so Memory can be a modal while the Download Manager is a window. |
| Default window size | `large` | `compact`, `standard` or `large`. Scales each window's own default, so their relative sizes are kept. A window you have resized keeps the size you gave it. |
| Header height | 44 | 24 to 80. |
| Title text size | 15 | 10 to 28. The title bar and section headings, independent of the header height. |
| Content text size | 13 | 10 to 22. Body text inside windows. |
| Drop shadow | on | The shadow that lifts a window off the graph behind it. |
| Windows can be dragged | on | Presentation only. Off, a window always opens in the middle and cannot be dragged away. A screen too small to move a window around in presents it centred whatever this says, and goes back to floating when there is room again. |

And under **Open Manager → Interface**:

| Setting | Default | What it does |
|---|---|---|
| Where the Downloads, Models and Memory buttons sit | `topbar` | `topbar` puts Downloads, Models and Memory in the workflow tab strip with their names. `control` puts them in the floating control bar as icons, with the name on the hover. |

## Related

- [MODELS.md](MODELS.md) — what is on disk, as against what is loaded.
- [DOWNLOADS.md](DOWNLOADS.md) — fetching models, and where they land.
