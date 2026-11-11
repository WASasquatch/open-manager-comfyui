# Open Manager on Vast.ai

A ComfyUI image for [Vast.ai](https://vast.ai) with Open Manager as its manager. It is Vast's own
ComfyUI image, `vastai/comfy`, with three changes:

| | Vast's ComfyUI image | This image |
|---|---|---|
| Manager | ComfyUI-Manager | Open Manager, from PyPI, updated to its newest release each time ComfyUI starts |
| ComfyUI-Manager | Installed | Removed, and kept out: see [Keeping ComfyUI-Manager out](#keeping-comfyui-manager-out) |
| Open Manager's extras | | On: Desktop Mode, the file browser with writes, the resource monitor strip, whole Hugging Face repositories from the model list |

Everything else is Vast's: the Instance Portal, Jupyter, Syncthing, the API wrapper,
provisioning scripts, and ComfyUI in `/workspace/ComfyUI`.

---

## The image

`ghcr.io/wasasquatch/open-manager-vastai`

| Tag | What it is |
|---|---|
| `latest` | The newest ComfyUI release Vast has built, for CUDA 12.9. Runs on any NVIDIA driver from CUDA 12 up |
| `latest-cuda-12.9` | The same |
| `latest-cuda-13.2` | The newest release, for CUDA 13.2. Needs a CUDA 13 driver, 580 or later |
| `v0.44.0-cuda-12.9-py312` | One ComfyUI release, here 0.44.0. Open Manager still updates when ComfyUI starts |
| `v0.44.0-cuda-12.9-py312-om0.7.0` | The same, naming the Open Manager it was built with |

Use `latest` unless you want a particular ComfyUI. Other releases follow the same pattern once
they have been built.

## Making the template

A template is what you pick on Vast when you rent a machine. If someone has shared this one
with you, open their link and go to [Starting an instance](#starting-an-instance).

**Quick way.** On [cloud.vast.ai/templates](https://cloud.vast.ai/templates), find Vast's own
**ComfyUI** template and click its pencil icon. Change **Image Path:Tag** to
`ghcr.io/wasasquatch/open-manager-vastai:latest`, rename it, and save it with **Create**, which
puts it in **My Templates**. Every other field already matches.

**From a blank template.** **+ New** on the same page, then:

| Field | Value |
|---|---|
| Image Path:Tag | `ghcr.io/wasasquatch/open-manager-vastai:latest` |
| Launch mode | **Jupyter-python notebook + SSH** |
| On-start Script | `entrypoint.sh` |
| Ports | `1111`, `8080`, `8188`, `8288`, `8384` |
| Disk Space | 40 GB at least. Models need more |

Environment variables, one row each:

| Variable | Value |
|---|---|
| `COMFYUI_ARGS` | `--disable-auto-launch --disable-xformers --port 18188 --enable-cors-header --enable-manager` |
| `PORTAL_CONFIG` | `localhost:1111:11111:/:Instance Portal\|localhost:8188:18188:/:ComfyUI\|localhost:8288:18288:/docs:API Wrapper\|localhost:8080:18080:/:Jupyter\|localhost:8080:8080:/terminals/1:Jupyter Terminal\|localhost:8384:18384:/:Syncthing` |
| `COMFYUI_API_BASE` | `http://localhost:18188` |
| `OPEN_BUTTON_PORT` | `1111` |
| `OPEN_BUTTON_TOKEN` | `1` |
| `JUPYTER_DIR` | `/` |
| `DATA_DIRECTORY` | `/workspace/` |

`PORTAL_CONFIG` is one line, with `|` between the entries and no spaces around them.
`--enable-manager` is added to `COMFYUI_ARGS` at start if it is missing, so a template that
leaves it out still runs Open Manager.

The On-start Script is what starts ComfyUI: in the Jupyter and SSH launch modes Vast replaces the
image's own start command, and `entrypoint.sh` runs it again.

**Sharing it.** A template saved as **Public** shows up in Vast's template search. A private one
can still be used by anyone you send its link to. Keep keys out of a template you share: see
[Keys](#keys).

## Starting an instance

1. Pick the template, then a machine. Any NVIDIA card with 8 GB or more runs ComfyUI; what you
   load decides how much you need. For `latest-cuda-13.2`, filter the offers to a CUDA 13
   driver.
2. Set the disk size, and **Rent**.
3. When the instance shows **Open**, click it. That is the Instance Portal. Its **ComfyUI**
   button opens ComfyUI.

The first start downloads the image and copies ComfyUI into `/workspace`, which takes a few
minutes. To install packs or models on first start, set `PROVISIONING_SCRIPT` to the address of
a script, as with Vast's own template; ComfyUI starts when it has finished.

In ComfyUI:

| | Where |
|---|---|
| Open Manager | **Extensions** in the top menu, or the **Discovery** tab in the sidebar |
| Desktop Mode | The icon tab at the left of the workflow tabs. `#desktop` at the end of the address opens straight to it |
| Files | **Folders** and **Documents** on the desktop and in its Start menu. Rename, move, copy, delete, new folders, and saving text files and pictures all work |
| Resource monitor | CPU, RAM, VRAM and temperatures in ComfyUI's control bar. Click it for the Memory panel |

The guides: [Desktop Mode](docs/DESKTOP.md), [Download Manager](docs/DOWNLOADS.md),
[Model Library](docs/MODELS.md), [Resource Monitor](docs/MONITOR.md).

## Keys

Put keys in your Vast account, not the template: the **Environment Variables** section of
[cloud.vast.ai/account](https://cloud.vast.ai/account/). They are set on every instance you rent,
whatever its template, and a template you share never carries them.

| For | Variable |
|---|---|
| Gated and private Hugging Face models | `HF_TOKEN` |
| Starring, and a higher GitHub rate limit | `GITHUB_TOKEN` |
| Scanning an install | `VIRUS_TOTAL_KEY` |

**Access keys** in the Open Manager menu shows which are set. The other names each one answers
to are in the [README](README.md#access-keys-optional).

## Changing a switch

The image sets these, which Open Manager reads when ComfyUI starts:

| Variable | Value | Effect |
|---|---|---|
| `OPEN_MANAGER_ENABLE_DESKTOP` | `1` | Desktop Mode can be on |
| `OPEN_MANAGER_ENABLE_FILES` | `1` | The file browser can be on |
| `OPEN_MANAGER_FILE_WRITES` | `1` | The file browser changes files, and Media Assets can delete outputs |
| `OPEN_MANAGER_REPO_DOWNLOADS` | `1` | Whole Hugging Face repositories in the model list download, configs included |

Every other switch in the [README](README.md#server-switches) is at its default. To change one:

| For | Do |
|---|---|
| Every new instance from the template | Add the variable to the template |
| The instance you are on | Add a line such as `OPEN_MANAGER_FILE_WRITES=0` to `/workspace/.env`, then run `supervisorctl restart comfyui` in the Jupyter terminal |

To fetch models from more hosts, such as Civitai, set
`OPEN_MANAGER_MODEL_HOSTS=civitai.com,cdn.civitai.com`. The download rules are in
[DOWNLOADS.md](docs/DOWNLOADS.md#environment).

Desktop Mode, the file browser, the taskbar and the monitor strip are also settings, under
**Settings → Open Manager**. The image switches them on for a new install; turn them off there.

## Restarts, updates and logs

| | |
|---|---|
| Restart | Open Manager's restart buttons work as anywhere else, and so does `supervisorctl restart comfyui` in the Jupyter terminal |
| Open Manager updates | Each start installs the newest Open Manager on PyPI, if there is one, and says so in the log. Without a connection to PyPI, ComfyUI starts with the version it has |
| ComfyUI updates | Come with a new instance from a newer tag. On a volume, the ComfyUI already there is the one that runs |
| Logs | The Instance Portal's logs page, `supervisorctl tail -f comfyui`, or `/workspace/ComfyUI/user/comfyui.log` |

## Volumes

ComfyUI is copied into `/workspace` the first time an instance starts, unless `/workspace/ComfyUI`
is already there. On a volume that already holds a ComfyUI, such as one from Vast's own template,
that ComfyUI runs as it is:

| | |
|---|---|
| Its `custom_nodes/ComfyUI-Manager` | Skipped at load. You can delete it |
| Desktop Mode, the file browser, the taskbar and the monitor strip | Off until you switch them on under **Settings → Open Manager**. The switches above are already open |

## Keeping ComfyUI-Manager out

| Way back in | What stops it |
|---|---|
| pip or uv installing `comfyui-manager`, as ComfyUI's `manager_requirements.txt` asks | `PIP_CONSTRAINT` and `UV_CONSTRAINT` point at `/opt/open-manager/constraints.txt`, which allows no version of it. The install fails and names `comfyui-manager<0` |
| Installed anyway, such as with the constraint unset | Each start uninstalls it and reinstalls Open Manager |
| A `ComfyUI-Manager` folder in `custom_nodes` | Skipped at load. The log says `Blocked by policy` |
| A template without `--enable-manager` | It is added at start |

A pack whose requirements list `comfyui-manager` fails its requirements install for the same
reason. For ComfyUI-Manager itself, use Vast's own ComfyUI template.

## Security

The ComfyUI address the Instance Portal opens carries the instance's access token. Anyone with
it can do what you can, and with this image that includes deleting files, installing packs and
restarting ComfyUI. Send it only to people you would trust with the machine.

---

## Building the image

For maintainers. The files are in [`vastai/`](vastai/):

| File | Does |
|---|---|
| `Dockerfile` | Installs Open Manager from PyPI on `vastai/comfy`, removes ComfyUI-Manager, and checks at build time that ComfyUI starts with Open Manager as its manager |
| `open-manager/keep.py` | Run before each start: removes ComfyUI-Manager, repairs or updates Open Manager |
| `open-manager/launch.sh` | Sourced by Vast's `comfyui.sh` before ComfyUI starts: runs `keep.py`, adds `--enable-manager`, and leaves Open Manager's restarts to supervisor |
| `open-manager/constraints.txt` | The pip and uv constraint |
| `comfy.settings.json` | The settings a new install starts with |

[`.github/workflows/vastai_image.yml`](.github/workflows/vastai_image.yml) builds both CUDA
variants for amd64 and pushes them to the GitHub Container Registry. It runs every day, after
each PyPI publish, and from **Actions → Vast.ai image → Run workflow**, where a ComfyUI release
such as `v0.44.0` can be named. A ComfyUI and Open Manager pair already published is skipped
unless **rebuild** is ticked.

The first push creates the package as private. Make it public once, in the package's
**Package settings → Change visibility**, or Vast cannot pull it.

A local build:

```sh
docker build --build-arg BASE_IMAGE=vastai/comfy:v0.44.0-cuda-12.9-py312 -t open-manager-vastai vastai
```
