# Open Manager for ComfyUI  ![Open Manager](https://img.shields.io/badge/Open-Manager-yellow) ![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node-blue) [![PyPI](https://img.shields.io/pypi/v/comfyui-open-manager?label=PyPI&color=yellow)](https://pypi.org/project/comfyui-open-manager/) ![License](https://img.shields.io/badge/License-MIT-green) [![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/ThompsonJordan?country.x=US&locale.x=en_US) [![Security: SkillsLLM](https://skillsllm.com/security-check/badge.svg?owner=WASasquatch&repo=open-manager-comfyui)](https://skillsllm.com/security-check/np9Y21IG35Fk)

<img src="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/open-manager-banner.png" alt="Open Manager for ComfyUI">

| | |
| --- | --- |
| <a href="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/download-manager.png"><img src="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/download-manager.png" width="400" alt="Download Manager"></a><br>**[Download Manager](docs/DOWNLOADS.md)** | <a href="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/model-library.png"><img src="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/model-library.png" width="400" alt="Model Library"></a><br>**[Model Library](docs/MODELS.md)** |
| <a href="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/monitor-panel.png"><img src="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/monitor-panel.png" width="400" alt="Resource Monitor"></a><br>**[Resource Monitor](docs/MONITOR.md)** | <a href="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/desktop.png"><img src="https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/docs/desktop.png" width="400" alt="Desktop Mode"></a><br>**[Desktop Mode](docs/DESKTOP.md)** |

The whole workspace at once: [one screenshot](https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/open-manager-screenshot.png).

https://github.com/user-attachments/assets/5f264d2f-b11b-4ca9-9f69-73a553213e85

## A manager for the whole ComfyUI workspace, not just its nodes.

| | |
| --- | --- |
| Packs | Browse the Comfy Registry, install from registry or GitHub, see what an install does before it runs |
| Workspace | Models on disk, downloads, memory, outputs, and your own files |
| For remote ComfyUI instances | A desktop on a tab of its own. No swapping between tools just to view outputs, or manage files |
| Off by default | Model Library, the monitor strip and Desktop Mode |
| Never | A node in your graph. Nothing is installed or built at load time |

**_Open Manager_** _is not affiliated with ComfyUI-Manager or the Comfy Registry._

---

## Install

| Mode | Result |
| --- | --- |
| Custom node | Sits beside ComfyUI-Manager. Its own sidebar tab |
| pip package | Replaces the official manager, under `--enable-manager` |

```sh
# as a custom node
cd ComfyUI/custom_nodes
git clone https://github.com/WASasquatch/open-manager-comfyui.git

# or as the manager
pip uninstall comfyui-manager
pip install comfyui-open-manager
python main.py --enable-manager
```

| | |
| --- | --- |
| Update | `pip install --upgrade comfyui-open-manager` |
| uv environment | `uv pip install comfyui-open-manager`. Pack requirements install through uv too |
| Portable build | Use its own interpreter: `python_embeded\python.exe -m pip install ...` |
| Name clash | Both packages own `comfyui_manager`. Uninstall the other first. On a portable build Open Manager still loads if the other is installed again; elsewhere installing it again replaces Open Manager |
| Log | `--enable-manager` writes `user/comfyui.log`, rotating to `comfyui.prev.log` and `comfyui.prev2.log`. `OPEN_MANAGER_NO_LOG` leaves it alone |

### Access keys (optional)

Set under Access keys in the Open Manager menu. A variable, where set, is used instead.

| For | Variables | Get one at |
|---|---|---|
| Gated and private models | `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN`, `OPEN_MANAGER_HF_TOKEN` | huggingface.co/settings/tokens |
| Starring, higher rate limit | `GITHUB_TOKEN`, `GH_TOKEN`, `OPEN_MANAGER_GITHUB_TOKEN` | github.com/settings/tokens |
| Scanning an install | `VIRUS_TOTAL_KEY`, `VIRUSTOTAL_API_KEY`, `OPEN_MANAGER_VIRUSTOTAL_KEY` | virustotal.com/gui/my-apikey |

---

## Packs

| | |
| --- | --- |
| Every version | Flagged, withheld and banned included |
| Before you install | Findings, dependency changes, new nodes, hardware fit |
| Contents named | Binaries, pickles, wheels, bytecode |
| Licences | Per pack, sortable |
| Your own repos | By URL or `owner/repo`, kept in `user/` |
| Any ref | Branch, tag or commit |
| Workflow gaps | Missing nodes, and which pack won a duplicate name |
| Themes | Gradients, icons, backdrops |
| Fast sync | Whole registry in seconds |

Findings reword the confirmation. A registry ban blocks Install until *Install versions the
registry has banned* is on.

## Beyond packs

Four pieces. None of them adds a node to your graph.

| | | Default |
| --- | --- | --- |
| [Download Manager](docs/DOWNLOADS.md) | Fetches the models a workflow needs: resumes, verifies, picks the drive | on |
| [Model Library](docs/MODELS.md) | What is on disk across every registered folder: duplicates, unreferenced files, storage | off |
| [Resource Monitor](docs/MONITOR.md) | CPU, RAM, VRAM and temperatures in ComfyUI's control bar, with a Memory panel behind it | strip off, Memory button on |
| [Desktop Mode](docs/DESKTOP.md) | Files, notes, outputs and programs on a tab of their own | off, and needs `OPEN_MANAGER_ENABLE_DESKTOP` |

Every panel opens as a movable window, or centred on the page. One setting each.

### Remote installs

Desktop Mode is served by ComfyUI's own server: no second port, no second login.

### Server switches

Set to `1`. What ships on is closed with a `NO_` switch; what ships off is opened with its own.

| Variable | Closes |
|---|---|
| `OPEN_MANAGER_NO_INSTALL` | Installing and removing packs |
| `OPEN_MANAGER_NO_GITHUB` | Adding and installing GitHub repositories |
| `OPEN_MANAGER_NO_DOWNLOADS` | Fetching models |
| `OPEN_MANAGER_NO_RESTART` | Restarting ComfyUI |
| `OPEN_MANAGER_NO_KEYS` | Writing access keys |
| `OPEN_MANAGER_APPROVED_ONLY` | Anything the registry has not approved |

| Variable | Opens |
|---|---|
| `OPEN_MANAGER_ENABLE_DESKTOP` | Desktop Mode, for readers who switch it on in the settings |
| `OPEN_MANAGER_ENABLE_FILES` | The file browser, for readers who switch it on in the settings |
| `OPEN_MANAGER_FILE_WRITES` | Renaming, moving, copying and deleting files, making folders, and saving text files and pictures |
| `OPEN_MANAGER_ALLOW_BANNED` | Installing versions the registry has banned, whatever the setting says |

The server refuses what a closed switch governs and names the variable. Desktop Mode and the
file browser are hidden rather than refused, and their settings do nothing until the machine
opens them.

---

## Reference

### Where it appears

| Interface | Way in |
|---|---|
| Current | A sidebar tab |
| Legacy menu (`Settings -> Comfy -> Use new menu -> Disabled`) | An **Open Manager** button on that menu |
| Where it replaces the manager | The top menu's **Extensions** button as well |

**Extensions** follows ComfyUI: the panel on the modern interface, the classic menu of
destinations under `--enable-manager-legacy-ui`. Override it under *What the Extensions button
opens*. Both carry every destination, and the sidebar tab is unaffected.

ComfyUI's own manager links, such as the missing-nodes panel's, open the same place. Turn on
*Use ComfyUI's Nodes Manager* to have them, and **Extensions**, open ComfyUI's Nodes Manager
instead. Every install it starts is still run by Open Manager. So are the **Install** buttons
ComfyUI shows for missing nodes, whichever is set.

*Quality of Life Patches* fixes faults in ComfyUI's own interface from Open Manager, each with
its own switch. *Nodes Manager fits its contents* sizes the Nodes Manager's frame to its
contents. On screens 3000px wide and over, the frame otherwise cuts off the right side, close
button and filters.

### Network

Open Manager reads the Comfy Registry live. What it contacts:

| Host | When |
|---|---|
| `api.comfy.org` | Browsing and installing |
| `cdn.comfy.org` | Downloading a registry version to install |
| `codeload.github.com` | Downloading a GitHub repository to install |
| `raw.githubusercontent.com` | Licences, READMEs, images |
| `api.github.com` | Pack stats and gallery, branches, tags and commits, starring, licence lookup |
| `pypi.org` | Checking for a newer Open Manager |
| `www.virustotal.com` | Scanning an install, with a key |
| `huggingface.co`, `github.com` and their download hosts | Model downloads. `OPEN_MANAGER_MODEL_HOSTS` adds others |
| Wherever a pack points | Pack icons. README and gallery images given as absolute URLs, unless *Read pack README and repository metadata* is off |

### Settings

Under `Settings -> Open Manager`.

| | |
|---|---|
| Trust | Answer once per author, or every time |

A GitHub token, set under Access keys in the Open Manager menu or as `GITHUB_TOKEN`, raises 60
anonymous calls an hour to 5,000. Without one, pack pages still show README, gallery and
versions.

The registry address is `BASE_URL` in `open_manager/registry.py`, and `BASE` in
`open_manager/catalog.py` for the offline copy. Both can point at a mirror or a private index.

### Trust

| | |
|---|---|
| Asked | Before installing a pack from GitHub, loading a workflow from a pack, or downloading a model. Registry installs too, with *Ask before installing a registry pack from an untrusted author* on |
| Remembered in | `user/open_manager/trusted_authors.json` |
| Never | Hides a finding |

### Requirements

`torch`, `torchaudio`, `torchsde` and `torchvision` are never installed from a pack's
requirements: they carry the build your ComfyUI was set up with. Anything held back is named
in the install output. To substitute a package, map it in
`user/open_manager/pip_overrides.json`:

```json
{ "opencv-python": "opencv-python-headless>=4.9" }
```

### Your GitHub list

| | |
|---|---|
| Add | By URL or as `owner/repo` |
| Behaves like | A registry pack: installs, updates, uninstalls |
| Written to | `user/open_manager/github_sources.json`, outside the pack, so it survives an uninstall |
| Remove from list | Delists and uninstalls in one step |

---

## For pack authors

Declare a `[tool.open_manager]` table in `pyproject.toml` and every Open Manager user sees it.
Every field is optional. Packs without the table are unaffected.

| Field | Gives you |
| --- | --- |
| `capabilities` | What your pack does, as its own panel on your page |
| `release_note` | Your words above the version list, not a changelog guess |
| `incompatible` | Name a package and version; users are warned before installing |
| `source` | Say GitHub and the panel recommends it over the registry copy |
| `themes` | Ship colour palettes with gradients, icons, backdrops and rulers |
| `example_workflows` | Loadable from your page, with thumbnails |
| `gallery` | Screenshots from your repo or elsewhere |
| `docs`, `funding` | Buttons in your page header |

```toml
[tool.open_manager]
incompatible = ["numpy>=2.0"]                   # declare known conflicts with other packages
source = "github"                               # prefer installing from the repository
branch = "main"                                 # named in the GitHub recommendation
docs = "https://example.com/docs"               # documentation URL
funding = "https://ko-fi.com/you"               # funding URL
release_note = "1.4.0 needs config regen."      # shown above the version list, 600 chars
capabilities = [                                # what your pack does, its own page panel
  "filesystem", "network", "subprocess",        #   from a fixed list, see below
]
example_workflows = ["workflows/*.json"]        # a path, a glob, or a directory
themes = ["themes/my-theme.json"]               # list themes to offer
gallery = [                                     # shown off on the pack page, up to 24, `png`,
                                                # `jpg`, `jpeg`, `gif`, `webp`, `avif`, and
                                                # `mp4`, `webm`, `mov`, `m4v` for clips
  "docs/*.png",                                 #   a path or glob in your repository
  "https://cdn.example.com/after.webp",         #   or a file hosted anywhere
]
```

| Left out | Falls back to |
| --- | --- |
| `example_workflows` | `workflows/`, `workflow/`, `examples/`, `example/`, `example_workflows/` |
| `docs`, `funding` | `[project.urls]` |
| An installed pack's fields | The copy on disk, then the repository |

Workflow thumbnails are not declared. An image beside a workflow and named for it is paired
with it automatically, following
[ComfyUI's workflow templates convention](https://docs.comfy.org/custom-nodes/workflow_templates):
`workflows/hdr.json` picks up `workflows/hdr.webp`, `.png`, `.jpg`, `.jpeg` or `.gif`, and a
numbered variant such as `hdr-1.png` counts too. Workflows without one show as a plain row.

### Capabilities

Your own account of what your pack does, in fixed words so that two packs describe themselves
the same way.

`filesystem` `network` `subprocess` `binaries` `environment` `dynamic_code` `packages`
`models` `credentials` `telemetry` `compilation` `hardware`

| | |
|---|---|
| Outside the list | Refused, and named on your page as unrecognised |
| Case and hyphens | Forgiven. `Dynamic-Code` resolves to `dynamic_code` |
| Declaring nothing | No panel |
| Not a substitute for | The archive inspection, which reads what is actually in the box |

### Themes

A ComfyUI colour palette plus an optional `extras` block: gradient or flat headers per node
category or class, a title icon, an image behind node bodies, see-through bodies, a graph
backdrop, shadow colours and a selection glow. Packs ship them, users add them from the pack
page.

```toml
[tool.open_manager]
themes = ["themes/my-theme/my-theme.json"]
```

Full reference in [`docs/THEMES.md`](docs/THEMES.md). Examples in
[`open_manager/themes/`](https://github.com/WASasquatch/open-manager-comfyui/tree/main/open_manager/themes/).

---

## Licence

MIT, see [`LICENSE`](LICENSE).

The GitHub mark shown on links to github.com is `mark-github` from
[Octicons](https://github.com/primer/octicons), MIT licensed, Copyright (c) GitHub Inc. It is
used only for links that go to GitHub.
