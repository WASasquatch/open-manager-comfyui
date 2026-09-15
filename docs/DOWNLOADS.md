# Download Manager

Fetches the models a workflow needs, from a URL you paste or from the workflow itself.

![Download Manager](docs/download-manager.png)

Open it from the **Downloads** button at the right of the workflow tab strip, from the Open
Manager menu, or from the command palette.

## What it does

- **Add by URL** — paste a link; the name, folder and account are read from it before anything
  is fetched.
- **Add from a workflow** — lists the models a workflow declares, including those inside
  subgraphs. Files already on disk are dimmed but still selectable, so a broken one can be
  replaced.
- **Resumes** — a transfer continues from where it stopped rather than starting again, and
  survives a restart.
- **Verifies** — every download is hashed as it arrives and checked against the hash the host
  or the workflow declared.
- **Chooses where it lands** — where a folder has several registered paths, you pick which.
- **Checks there is room** — each file is measured at its host before anything is queued, and
  added to what is already queued for that drive. Three downloads that each fit on their own
  can still not fit together. It is a question, not a refusal.

## Tabs

| | Holds |
|---|---|
| Transfers › Downloading | queued and in flight |
| Transfers › Suspended | paused, failed or cancelled — all resumable |
| Transfers › Finished | transfers that completed |
| Downloaded › On Disk | the file is still there |
| Downloaded › Archive | downloaded before, since deleted — one click to fetch again |

Every tab is always listed, whether or not it holds anything.

## What it supports

### Out of the box

**Hosts.** Hugging Face and GitHub, plus the storage hosts each redirects its bytes to. Every
hop is checked, so a redirect leaving this set ends the download.

```
huggingface.co            github.com
hf.co                     raw.githubusercontent.com
cdn-lfs.huggingface.co    objects.githubusercontent.com
cdn-lfs-us-1.huggingface.co   release-assets.githubusercontent.com
cdn-lfs-eu-1.huggingface.co
transfer.xethub.hf.co
```

**Model formats**, into any of ComfyUI's registered model folders:

```
.safetensors   .sft   .gguf
```

**Media formats**, into ComfyUI's `input` folder, where the graph reads them from:

```
images   .png .jpg .jpeg .webp .gif .bmp .tif .tiff .avif
video    .mp4 .webm .mov .mkv .m4v .avi
audio    .mp3 .wav .flac .ogg .oga .opus .m4a .aac
```

**Gated and private models.** Set `HF_TOKEN` before ComfyUI starts, or paste it into
**Open Manager > Access keys**. Get one at huggingface.co/settings/tokens.

```bat
set HF_TOKEN=hf_xxx
```

Sent only to `huggingface.co` and `hf.co`. The CDN a download is redirected to gets nothing.

**Also handled without configuration**

- A Hugging Face `/blob/` link is rewritten to `/resolve/`, so pasting the page you were
  reading fetches the file rather than the HTML.
- Resume after a pause, a failure, or a restart.
- SHA256 verification against the hash Hugging Face publishes for the file.
- Several registered paths per folder, from `extra_model_paths.yaml`.
- Models declared inside subgraphs, not only at the top level of a workflow.

### What it will not do unless you say so

| Not supported by default | How to enable | What you take on |
|---|---|---|
| Any other host | `OPEN_MANAGER_MODEL_HOSTS` — adds to the list above | Whatever that host serves |
| Pickle-backed weights: `.ckpt` `.pt` `.pth` `.bin` | `OPEN_MANAGER_MODEL_FORMATS` — **replaces** the model list | These run code when a model is loaded |
| Other media containers | `OPEN_MANAGER_MEDIA_FORMATS` — **replaces** the media list | Whatever reads them |

Both format variables replace rather than extend, so name every format you want, including the
safe ones you are keeping.

### What it will not do at all

- **Plain http.** Every hop must be https, and there is no setting for it.
- **`.svg`.** It is a document that can carry script, not an image format.
- **Video platforms.** There is no extraction of media from a page; a URL must point at a file.
- **Paths you type.** A download lands in a folder ComfyUI registers, under a plain filename.
  Both the URL and the name you save it as are checked, so an allowed link cannot be written
  under an arbitrary extension.

You are asked once per account before the first download from it, and the answer is kept apart
from pack trust — trusting someone's code and trusting a file they host are different questions.

## Settings

Under **Open Manager → Downloads**.

| Setting | Default | What it does |
|---|---|---|
| Show the Download Manager button | on | The Downloads button in the tab strip. Turn it off and reach the panel from the command palette. |
| Where new downloads are stored | `default` | `default` uses ComfyUI's own first path, honouring `is_default` in `extra_model_paths.yaml`. `most-free` picks the registered path with the most room. Either way the location is shown before the download starts. |
| Models downloaded at once, in parallel | 2 | Parallel transfers, clamped to 1–8. |
| Add and fetch model URLs from a node's menu | on | Right-click a node to download the models it names, or add a URL to it so a shared graph carries its weights. |

Related, under **Open Manager → Interface**: *Remember trusted authors, or ask every time* (`author` asks once per
account, `action` asks every time). Under **Open Manager → Windows**: *Download Manager as a window* (off opens it as a modal instead, centred and closing on a click away), alongside the size, text and shadow settings shared by every window.

## Environment

Read once at start-up, so ComfyUI must be restarted after changing one.

| Variable | Effect |
|---|---|
| `OPEN_MANAGER_MODEL_HOSTS` | Hosts to allow **in addition to** the built-in list, comma separated. |
| `OPEN_MANAGER_MODEL_FORMATS` | Model extensions to allow **instead of** the safe set. |
| `OPEN_MANAGER_MEDIA_FORMATS` | Media extensions to allow **instead of** the built-in set. |
| `HF_TOKEN` | Hugging Face token. Also reads `HUGGING_FACE_HUB_TOKEN` and `OPEN_MANAGER_HF_TOKEN`. Read per request, not at start-up. |

Keys are read from the environment, never written to it: this process loads third-party packs
that can read `os.environ`, and the installer inherits it when a pack's requirements are installed.

```bash
OPEN_MANAGER_MODEL_HOSTS=civitai.com,cdn.civitai.com
OPEN_MANAGER_MODEL_FORMATS=.safetensors,.sft,.gguf,.ckpt
```

## Related

- [MODELS.md](MODELS.md) — what is already on disk, and what is there twice.
- [MONITOR.md](MONITOR.md) — what is loaded into memory right now.
