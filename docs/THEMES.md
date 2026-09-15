# Theme reference

A theme is a ComfyUI colour palette with an optional `extras` block. ComfyUI reads `colors` and
ignores `extras`; Open Manager reads both. Copy one of the six in
[`open_manager/themes/`](open_manager/themes/) and change the id.

Declare themes in your pack's `pyproject.toml`. They appear on the pack page with an Add button.

```toml
[tool.open_manager]
themes = ["themes/my-theme/my-theme.json"]
```

Subdirectories are fine. A theme the reader has already added is re-read from the installed
pack on load, so raising `version` updates their copy without them pressing Add again.

---

## File

```jsonc
{
  "id": "my_theme",        // unique, the key it is stored under
  "name": "My Theme",      // shown in the theme picker and on the pack page
  "version": 1,            // raise to publish a change
  "light_theme": true,     // light palettes must set this
  "colors": { },           // ComfyUI's palette, see below
  "extras": { }            // Open Manager's, everything after that
}
```

### colors

Standard ComfyUI palette. The keys Open Manager also reads:

| key | group | used for |
| --- | --- | --- |
| `NODE_DEFAULT_COLOR` | `litegraph_base` | header fallback, and the Nodes 2.0 header token |
| `NODE_DEFAULT_BGCOLOR` | `litegraph_base` | body fill, body wash, Nodes 2.0 body token |
| `NODE_TITLE_COLOR` | `litegraph_base` | title ink, and the execution time badge some packs draw |
| `CLEAR_BACKGROUND_COLOR` | `litegraph_base` | canvas colour, and the backdrop scrim |
| `BACKGROUND_IMAGE` | `litegraph_base` | the dot grid |

**Light palettes:** ComfyUI adds 50 to the HSL lightness of every node colour it draws. State
`color` values about 50 points darker than you want. Gradient `stops` are **not** lifted, because
Open Manager paints those itself, so state those at their final value. Getting this backwards is
the most common mistake.

---

## extras

Every field is optional. Unknown keys are dropped, numbers are range checked, and nothing is
animated.

```jsonc
"extras": {
  "shape":      { "radius": 10, "titleHeight": 28, "slotHeight": 20 },
  "links":      { "mode": "spline", "border": false },
  "shadow":     "#04160c",
  "nodeOpacity": 0.95,

  "categories": { "loaders": "#352864",
                  "sampling": { "color": "#4d3979",
                                "gradient": { "angle": 12,
                                              "stops": [[0, "#6b4fa8"], [1, "#2e1f52"]] } } },
  "nodes":      { "KSampler": "#6b4fa8",
                  "VAEDecode": { "color": "#71639a", "title": "Decode" } },

  "body":       { "image": "pack:themes/my-theme/grain.png",
                  "fit": "tile", "opacity": 0.9, "blend": "screen" },
  "icon":       { "image": "pack:themes/my-theme/logo.svg", "size": 16,
                  "node_class_prefix": ["WAS", "Image "] },
  "canvas":     { "image": "pack:themes/my-theme/backdrop.png",
                  "fit": "cover", "position": "center",
                  "opacity": 0.9, "tileAlpha": "flat",
                  "grid": "pack:themes/my-theme/ruler.svg" },
  "glow":       { "selected": "#f2ff59", "blur": 16, "replaceShadow": true }
}
```

### Fields

| field | type | accepted | default |
| --- | --- | --- | --- |
| `shape.radius` | number | 0 to 120 | ComfyUI's |
| `shape.titleHeight` | number | 0 to 120 | ComfyUI's |
| `shape.slotHeight` | number | 0 to 120 | ComfyUI's |
| `links.mode` | string | `straight`, `linear`, `spline` | the reader's setting |
| `links.border` | boolean | | ComfyUI's |
| `shadow` | colour | any CSS colour, or `none` | ComfyUI's |
| `nodeOpacity` | number | 0 to 1 | 1, solid |
| `categories` | object | colour string, or a rule | |
| `nodes` | object | colour string, or a rule | |
| `body` | facet | see below, or `none` | |
| `icon` | facet | see below, or `none` | |
| `canvas` | object | see below | |
| `glow.selected` | colour | required, or the block is dropped | |
| `glow.blur` | number | 0 to 40 | 12 |
| `glow.replaceShadow` | boolean | true drops the drop shadow while lit | false |

### Rules, in `categories` and `nodes`

A value is either a colour string or `{ color, gradient, shadow, body, icon }`. A `nodes` rule
also takes `title`, which relabels the class, capped at 60 characters.

`gradient` is `{ angle, stops }`. `angle` is degrees, any number, wrapped into 0 to 359.
`stops` is 2 to 8 entries of `[offset, colour]` with offset 0 to 1, sorted for you. Fewer than
2 usable stops drops the gradient.

**Category matching** is on the full lowercased category path, longest first, so
`was suite/image/masking` beats `was suite/image`. Core nodes also match the segment below
`model/`.

**Precedence:** a colour the reader set on the node, then a `nodes` rule, then a `categories`
rule, then the top level `extras`. Each facet resolves independently, so a category can supply
the body while the top level supplies the icon.

### Facets, for `body` and `icon`

| field | slot | accepted |
| --- | --- | --- |
| `image` | both | see Images |
| `fit` | body | `tile` or `cover` |
| `opacity` | body | 0 to 1 |
| `blend` | body | `source-over`, `multiply`, `screen`, `overlay`, `soft-light` |
| `glyph` | icon | 1 or 2 characters |
| `color` | icon | glyph colour only, not the image |
| `size` | icon | 4 to 64 |
| `node_class_prefix` | icon | string or array, up to 8 |

A facet may be the string `"none"` to switch the feature off for that rule, or a bare image
string as shorthand for `{ "image": ... }`.

`node_class_prefix` matches the start of the node's class name, case insensitively. **A trailing
space is significant:** `"Image "` matches `Image Blank` and not `ImageScale`, while `"Image"`
matches both. It matches class names, not pack ownership, so a prefix another pack also uses
will match theirs too. Use the narrowest prefix your classes share.

### canvas

| field | accepted | default |
| --- | --- | --- |
| `image` | see Images | |
| `fit` | `cover` or `tile` | `cover` |
| `position` | `center`, `top`, `bottom`, `left`, `right`, `top left`, `top right`, `bottom left`, `bottom right` | `center` |
| `opacity` | 0 to 1, dims toward the canvas colour | 1 |
| `grid` | `false` hides the ruler, or an image reference replaces it | the palette's `BACKGROUND_IMAGE` |
| `tileAlpha` | `flat` stops the grid fading with zoom | fades |

The backdrop is set on the canvas element, so the browser composites it and redrawing the
graph costs nothing extra. `CLEAR_BACKGROUND_COLOR` is replaced while the theme is active and
put back after.

**A backdrop and a ruler are separate layers and work together.** The backdrop sits behind the
canvas; the ruler is tiled onto it. `grid` takes an image so you can ship your own ruler as a
file, which `BACKGROUND_IMAGE` cannot do because that key only holds an inline data URI.

---

## Images

Name a file. Two schemes resolve to one:

| scheme | reads from |
| --- | --- |
| `pack:name.png`, `pack:sub/dir/name.png` | your installed pack directory |
| `theme:name.png`, `theme:sub/dir/name.png` | `user/open_manager/themes/` |

`pack:` is rewritten to the pack it came from when the theme is added. A `data:` URI works too,
if you would rather not ship a file.

| limit | value |
| --- | --- |
| path segments | 6 |
| segment characters | `A-Z a-z 0-9 . _ -` |
| extensions | `png` `jpg` `jpeg` `webp` `gif` `svg` |
| file size | 1MB |
| distinct images per theme | 8 |
| `data:` URI budget | 192kB total, 96kB per body or canvas, 24kB per icon |
| pixels | 2048 for a body or icon image. The backdrop has none, the browser composites it |

Assets are served with `X-Content-Type-Options: nosniff` and a sandboxing CSP. Images are
counted distinctly, so naming one file across sixty categories costs one of the eight.

---

## Readers can turn it off

Under **Settings > Open Manager > Theme**:

| setting | effect |
| --- | --- |
| Theme images behind node bodies | off paints no body art |
| Node background image strength | multiplies the `body.opacity` you asked for |
| Theme icons in node titles | off restores the plain dot |
| Selection glow | off restores ComfyUI's outline |
| Theme graph backdrop | off restores the palette's canvas colour |
| Node body opacity | the opacity itself, absolute. 1 defers to your `nodeOpacity` |

Design for the on state. None of these write to your file.

---

## Nodes 2.0

- `shape.radius` and `shape.titleHeight` are ignored. Vue nodes round their corners in CSS and
  size their header from padding. `shape.slotHeight` still applies.
- Icon and title is offset to preserve the node collapse/expand button which is finally rendered as a state indicator instead of a static orb we replace in LGraph nodes.

---

## Guarantees

| | |
| --- | --- |
| Nothing is saved | Header, title and text colour are applied for the draw and undone after, so they never enter a saved workflow |
| Scoped | `extras` apply only while your theme is active, and geometry is restored when the reader switches away |
| The reader's settings are theirs | `Comfy.LinkRenderMode` and node opacity are never written |
| Bounded | Unknown keys dropped, numbers range checked, no animation |
| Answerable | The effects that cost or intrude most have a setting, listed above. Colours, gradients, `shape`, link drawing, `shadow` and `tileAlpha` have none, so the answer there is to switch theme |
