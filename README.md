# Open Manager for ComfyUI  ![Open Manager](https://img.shields.io/badge/Open-Manager-yellow) ![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node-blue) ![License](https://img.shields.io/badge/License-MIT-green) [![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/ThompsonJordan?country.x=US&locale.x=en_US)

<img src="./open-manager-banner.png" width="80%" alt="Open Manager for ComfyUI">

## An alternative package manager for ComfyUI. 

Browse the Comfy Registry with ease, install from registry or GitHub, and see what
an install would do to your environment before it runs. It warns; it never blocks.

**_Open Manager_** _is not affiliated with ComfyUI-Manager or the Comfy Registry._

---

## Why Open Manager?

ComfyUI Manager is a great package manager for ComfyUI, but it has some limitations:

- It isn't transparent about the status of packages (e.g., flagged, withheld).
- It quietly substitutes an approved version when the one you asked for is flagged, without telling you it did.
- It installs without showing you the dependency changes an install would make to your environment.
- It doesn't show each pack's licence, so there is no at-a-glance read on whether one fits your project; e.g., a pack is AGPL and your project can't accept its source-disclosure terms.
- It can install from a Git URL, but there is nowhere to keep those repositories: no list, no update path, and no inspection before it runs. A friend's repo, or a pack not yet on the registry, is a fresh paste every time.

Open Manager addresses these limitations by:

| | |
| --- | --- |
| Full registry | Every version with its status, including the flagged and withheld ones |
| Warn, never block | Install is always available; risk changes the wording of the confirmation, not whether the button exists |
| Before you install | The findings against a version and the dependency changes an install would make, shown first |
| What's in the box | A GitHub install is read before it lands: compiled binaries, pickle-format data, bundled wheels and bytecode shipped without its source are named, with what each one means and the note that false positives are possible |
| Missing nodes | The packs for the node types a workflow is missing, with an attempt to find the best match on GitHub |
| From anywhere | The registry, or straight from a GitHub repository after inspection |
| Your own list | A GitHub tab holding repositories you add, kept in `user/` so it outlives an uninstall |
| Licences | Read from each pack and shown, sortable by type, most permissive first |
| Fast sync | The whole 5,500 Comfy Registry pack catalogue in about 3 seconds rather than 31+ seconds, with the concurrency yours to set |
| Any ref | Read a pack's page at another branch or a recent commit, README and gallery together, and install that ref straight from GitHub to test a change |

The only version that cannot be installed is one the registry has banned. Set
`OPEN_MANAGER_ALLOW_BANNED=1` to lift that too.

---

## Installing

Two ways to load, one core. Pick either.

**As a custom node**, beside the official manager. Clone into `custom_nodes` and restart:

```sh
cd ComfyUI/custom_nodes
git clone https://github.com/WASasquatch/open-manager-comfyui.git
```

It coexists with ComfyUI-Manager and adds its own sidebar tab.

**As a pip package**, through `--enable-manager`:

```sh
pip uninstall comfyui-manager
pip install git+https://github.com/WASasquatch/open-manager-comfyui.git

# Launch ComfyUI with --enable-manager flag
python main.py --enable-manager
```

It takes the `comfyui_manager` name and replaces the official manager. A later install of
`comfyui-manager`, or a desktop auto-update, puts the official one back.

Nothing is downloaded or built at load time.

---

## Notes

**Internet required.** Open Manager reads the Comfy Registry live. It contacts these hosts,
and only these:

| Host | When |
|---|---|
| `api.comfy.org` | browsing and installing |
| `cdn.comfy.org` | downloading a registry version to install |
| `codeload.github.com` | downloading a GitHub repository to install |
| `raw.githubusercontent.com` | reading a pack's licence; README images |
| `api.github.com` | naming a licence, when the GitHub licence lookup is on (off by default); a pack page's README, stats and gallery, when README enrichment is on (on by default); listing branches and commits, when you open the ref picker; starring a repository, when you press Star |
| wherever a pack points | a gallery entry given as an absolute URL, when galleries are on. Turn galleries off to keep to the hosts above |

**Settings.** Everything is off or at its default until you change it, under
`Settings -> Open Manager`. Set `open_manager.registry.BASE_URL` to route the registry
through a mirror or a private index.

Reading a pack page costs up to three GitHub API calls. Anonymously that is 60 an hour,
so roughly twenty new pack pages; setting a token raises it to 5,000. Without one, pages
still show their README, gallery and versions, because those are read from the raw content
host, which is not rate limited in the same way.


**Your GitHub list.** The GitHub tab holds repositories you add by URL or as `owner/repo`.
Each one installs, updates and uninstalls like a registry pack, and the list is written to
`user/open_manager/github_sources.json`, outside the pack, so removing and reinstalling Open
Manager leaves it intact. Uninstalling a repository keeps it on the list; **Remove from list**
takes it off and uninstalls it in one step.

---

## For pack authors

Declare a `[tool.open_manager]` table in your `pyproject.toml` to carry Open Manager specific
information. Every field is optional, read from your repository, and packs without the table
are unaffected.

```toml
[tool.open_manager]
incompatible = ["numpy>=2.0"]                   # declare known conflicts with other packages
source = "github"                               # prefer installing from the repository
branch = "main"                                 # default branch to install from
docs = "https://example.com/docs"               # documentation URL
funding = "https://ko-fi.com/you"               # funding URL
release_note = "1.4.0 needs a restart."         # your note on the current release, 600 chars
example_workflows = ["examples/interp.json"]    # list example workflows to load
themes = ["themes/my-theme.json"]               # list themes to offer
gallery = [                                     # images to show off the pack, up to 24, `png`,
                                                # `jpg`, `jpeg`, `gif`, `webp` and `avif`
  "docs/before.png",                            #   a path in your repository
  "https://cdn.example.com/after.webp",         #   or an image hosted anywhere
]
```

**Gallery.** are read on the pack page when README enrichment is on, which it is unless you turn
it off. `release_note` is shown above the version list, so it is read before a version is chosen;
the rest appear below the README.

For an installed pack these are read from the copy on disk, so what you shipped is what its
page shows, with the repository as the fallback.

---

## Theme format

A theme is a ComfyUI colour palette with an optional `extras` block. ComfyUI reads `colors`
and ignores `extras`; Open Manager reads both. Themes listed in `[tool.open_manager] themes`
appear on the pack page with an Add button.

The six shipped themes are in [`open_manager/themes/`](open_manager/themes/) and are the
intended starting point: copy one, change the id and the colours.

```jsonc
{
  "id": "my_theme",              // unique; the key it is stored under
  "name": "My Theme",            // shown in the theme picker
  "version": 1,                  // raise to publish a change
  "light_theme": true,           // light palettes must set this, or the interface stays dark

  "colors": {
    "node_slot":      { "IMAGE": "#64b5f6", "LATENT": "#ff9cf9" },   // wire colour per socket
    "litegraph_base": { "CLEAR_BACKGROUND_COLOR": "#211927",         // canvas
                        "NODE_DEFAULT_COLOR": "#f2ff59",             // node header
                        "NODE_DEFAULT_BGCOLOR": "#2e2438",           // node body
                        "BACKGROUND_IMAGE": "data:image/svg+xml;base64,..." },
    "comfy_base":     { "fg-color": "#f0efed", "bg-color": "#211927" }  // interface, incl. Open Manager
  },

  "extras": {
    "shape":      { "radius": 10, "titleHeight": 28, "slotHeight": 20 },
    "links":      { "mode": "spline", "border": false },   // spline | linear | straight
    "categories": { "loaders": "#352864", "sampling": "#4d3979" },  // header per node category
    "nodes":      { "KSampler": "#6b4fa8",                          // header per node class
                    "VAEDecode": { "color": "#71639a", "title": "Decode" } },
    "glow":       { "selected": "#f2ff59", "blur": 16 }             // static, on selection
  }
}
```

Notes worth knowing before you write one:

| | |
| --- | --- |
| Categories | Matched on the full lowercased category path, longest first, so `was suite/image/masking` wins over `was suite/image`. Core nodes also match the segment below `model/`, so `model/sampling` is `sampling` |
| Precedence | A colour the user set on a node wins, then a `nodes` rule, then a `categories` tint |
| Nothing is saved | Header, title and text colour are applied for the draw and undone after, so they never enter a saved workflow |
| Bounded | Unknown keys are dropped and numbers are range-checked; there is no animation, and a theme cannot ask for one |
| Scoped | `extras` apply only while your theme is active, and geometry is restored when the user switches away |
| SVGs | Yeah, I know they're bad. I used photoshop and online PSD to SVG, and I thought it would be better than PNG to SVG. |

---

## Licence

MIT, see [`LICENSE`](LICENSE).
