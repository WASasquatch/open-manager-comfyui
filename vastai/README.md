# ComfyUI with Open Manager

> **Create an Instance:** [CUDA 12.9](https://cloud.vast.ai/?ref_id=285284&creator_id=285284&name=ComfyUI%20with%20Open%20Manager) or [CUDA 13](https://cloud.vast.ai/?ref_id=285284&creator_id=285284&name=ComfyUI%20with%20Open%20Manager%20CUDA%2013)

**ComfyUI for AI image and video generation, with [Open Manager](https://github.com/WASasquatch/open-manager-comfyui) in place of ComfyUI-Manager.** Install custom nodes from the Comfy Registry or GitHub, download models from Hugging Face, browse and manage your files on a desktop in the browser, and watch your GPU's VRAM, all from inside ComfyUI.

A community template built on Vast.ai's own ComfyUI image: the same ComfyUI, Instance Portal, Jupyter and SSH, with a different manager.

> **Always current:** images are rebuilt when Vast publishes a new ComfyUI release or Open Manager has a new release, and Open Manager updates itself to its newest release every time ComfyUI starts.

---

## What can I do with this?

- **Text-to-image** with Stable Diffusion 1.5, SDXL, FLUX and other models
- **Image-to-image, inpainting and outpainting**
- **ControlNet, LoRA and embeddings**
- **Upscaling** with ESRGAN and similar models
- **Text-to-video and image-to-video** with Wan 2.x, LTX-Video, Hunyuan and more
- **Custom nodes:** browse, install, update and remove thousands of community node packs
- **Model downloads:** fetch the models a workflow needs, straight onto the instance
- **File management:** rename, move, copy, delete and edit files on the instance from your browser
- **Root terminal access** through Jupyter and SSH

---

## Why Open Manager instead of ComfyUI-Manager?

Open Manager is a manager for the whole ComfyUI workspace, not just its nodes. On a rented GPU, where you can't see the machine's desktop, that matters.

| | |
|---|---|
| **Custom nodes** | Browse the whole Comfy Registry, install from the registry or any GitHub repository, at any version, branch or commit. See what an install will do before it runs: security findings, dependency changes, the nodes it adds, and whether it fits your hardware |
| **Missing nodes** | Open a workflow and see what it is missing, then install it from ComfyUI's own **Install** buttons |
| **Download Manager** | Fetches the models a workflow needs from Hugging Face and GitHub: resumes, verifies, and picks the drive |
| **Model Library** | Every model on disk, across every folder: duplicates, unused files, storage, and a model list to download from |
| **Desktop Mode** | A desktop on its own tab beside your workflows: files, notes, a gallery of your outputs, and programs. No second tool, port or login |
| **File browser** | Your input, output and model folders, with rename, move, copy, delete, new folders, and saving text files and pictures |
| **Resource Monitor** | CPU, RAM, VRAM and temperatures in ComfyUI's toolbar, with a Memory panel showing what is loaded |
| **Fixes for ComfyUI** | Quality of Life Patches fix faults in ComfyUI's interface, each with its own switch |

All of this is switched on in this template. [Watch the tour on YouTube](https://youtu.be/swET9-F8gXs).

---

## Quick Start

### Step 1: Rent

Pick a GPU, set the disk size, and click **Rent**. Any NVIDIA card with 8 GB of VRAM runs ComfyUI; see [How much VRAM?](#how-much-vram) below.

**Choose the disk size with care: it cannot be changed once the instance is created.** This template asks for 100 GB, enough for a few image models and a video model. A 14B video model with its text encoder takes 30 GB or more, so for video work choose 150 to 200 GB.

### Step 2: Wait for setup

The first start downloads the image and sets up ComfyUI in `/workspace`. This template also downloads the SDXL Turbo example workflow and its model, so you can generate straight away. Stable Diffusion 1.5 is already in the image.

### Step 3: Open ComfyUI

Click **Open** on your instance. That opens the Instance Portal, with sign-in handled for you. Click **ComfyUI**.

### Step 4: Start creating

| To | Go to |
|---|---|
| Generate | Load a workflow and click **Run** |
| Install custom nodes | **Extensions** in the top menu, or the **Discovery** tab in the sidebar |
| Download models | **Downloads** in the toolbar, or **Models** for the Model Library |
| Manage files | The **Desktop** tab at the left of the workflow tabs |
| Watch VRAM | The monitor strip in the toolbar. Click it for the Memory panel |

---

## Access

| Method | For | How |
|---|---|---|
| **Web** | Everything in ComfyUI and Open Manager | The **Open** button |
| **Jupyter** | Scripts, uploads and a terminal | **Jupyter** in the Instance Portal |
| **SSH** | Command-line access | [Vast.ai SSH guide](https://docs.vast.ai/instances/sshscp) |
| **SSH tunnel** | Reaching ComfyUI without the sign-in | Forward port `18188` |

Your sign-in token is `OPEN_BUTTON_TOKEN`: run `echo $OPEN_BUTTON_TOKEN` in the Jupyter terminal or over SSH.

**Keep your ComfyUI link to yourself.** It carries that token, and with this template anyone who has it can install packs and delete files.

### Ports

| Service | External port | Internal port |
|---|---|---|
| Instance Portal | 1111 | 11111 |
| ComfyUI | 8188 | 18188 |
| Jupyter | 8080 | 8080 |
| API Wrapper | 8288 | 18288 |
| Syncthing | 8384 | 18384 |

---

## Access keys

Add keys in the **Environment Variables** section of your [Vast.ai account settings](https://cloud.vast.ai/account/). They reach every instance you rent, and never sit in a template.

| Variable | For |
|---|---|
| `HF_TOKEN` | Gated and private Hugging Face models, such as FLUX.1 Dev |
| `GITHUB_TOKEN` | Starring packs, and a higher GitHub rate limit |
| `VIRUS_TOTAL_KEY` | Scanning a pack with VirusTotal |

**Access keys** in the Open Manager menu shows which are set.

---

## Environment variables

| Variable | Default | Does |
|---|---|---|
| `COMFYUI_ARGS` | `--disable-auto-launch --disable-xformers --port 18188 --enable-cors-header` | ComfyUI's launch flags. `--enable-manager` is always added |
| `PROVISIONING_SCRIPT` | none | The address of a script to run on first start, for installing nodes or models |
| `PROVISIONING_COMFYUI_WORKFLOWS` | the SDXL Turbo example | Workflows to download on first start, with the models and nodes they use |
| `OPEN_MANAGER_FILE_WRITES` | `1` | `0` makes the file browser read-only |
| `OPEN_MANAGER_MODEL_HOSTS` | none | More hosts to download models from, such as `civitai.com,cdn.civitai.com` |

On a running instance, put a variable in `/workspace/.env` and run `supervisorctl restart comfyui`. Every switch is in the [Open Manager README](https://github.com/WASasquatch/open-manager-comfyui#server-switches).

---

## How much VRAM?

| Use | Minimum | Recommended |
|---|---|---|
| SD 1.5 and SDXL | 8 GB | 12 GB |
| FLUX.1 Dev | 16 GB | 24 GB |
| Video generation | 24 GB | 48 GB or more |

### CUDA 12 or 13

Two templates, the same apart from CUDA:

| Template | CUDA | Rents machines with |
|---|---|---|
| **ComfyUI with Open Manager** | 12.9 | A driver for CUDA 12.9 or later |
| **ComfyUI with Open Manager CUDA 13** | 13.2, with PyTorch built for CUDA 13 | A driver for CUDA 13.2 or later |

Both are for x86 (amd64) machines.

---

## Where things are

```
/workspace/ComfyUI/
├── models/
│   ├── checkpoints/     SD, SDXL, FLUX and other main models
│   ├── loras/
│   ├── vae/
│   ├── controlnet/
│   ├── clip/
│   ├── embeddings/
│   └── upscale_models/
├── custom_nodes/        Installed node packs
├── output/              What you generate
└── user/                Settings, workflows and Open Manager's files
```

Jupyter's file browser cannot open `checkpoints`; use the `ckpt` folder beside it, which is the same folder.

---

## FAQ

### Is ComfyUI-Manager installed?

No. Open Manager replaces it, and opens from the same **Extensions** button. ComfyUI-Manager is kept out: pip and uv refuse to install it, and a copy that gets in anyway is removed the next time ComfyUI starts. If you need ComfyUI-Manager, use Vast.ai's own ComfyUI template.

### Do my custom nodes and workflows work?

Yes. This is standard ComfyUI. Nodes install into `custom_nodes` as usual, and any ComfyUI workflow loads.

### How do I update?

Open Manager updates itself every time ComfyUI starts. For a newer ComfyUI, start a new instance; the template always uses the newest build.

### Do my models and outputs survive?

While the instance exists, yes, stopped or running. Destroying the instance deletes its disk. To keep files between rentals, copy them off first (Jupyter or Syncthing), or rent with a Vast.ai volume, which lasts until you delete it.

### How do I restart ComfyUI?

With Open Manager's restart button, or `supervisorctl restart comfyui` in the Jupyter terminal.

### Where are the logs?

The Instance Portal's logs page, `supervisorctl tail -f comfyui`, or `/workspace/ComfyUI/user/comfyui.log`.

### Can I stop the instance when a batch finishes?

Yes: `vastai stop instance $CONTAINER_ID` from the instance itself.

---

## Licenses

- **ComfyUI:** GPL-3.0 ([upstream](https://github.com/Comfy-Org/ComfyUI))
- **PyTorch:** BSD-3-Clause ([upstream](https://github.com/pytorch/pytorch))
- **Open Manager:** MIT ([upstream](https://github.com/WASasquatch/open-manager-comfyui))

Open Manager is not affiliated with ComfyUI-Manager, the Comfy Registry or Vast.ai.

## More help

- **Open Manager:** [GitHub](https://github.com/WASasquatch/open-manager-comfyui) and [issues](https://github.com/WASasquatch/open-manager-comfyui/issues)
- **This template in depth:** [VASTAI.md](https://github.com/WASasquatch/open-manager-comfyui/blob/main/VASTAI.md)
- **Guides:** [Desktop Mode](https://github.com/WASasquatch/open-manager-comfyui/blob/main/docs/DESKTOP.md), [Download Manager](https://github.com/WASasquatch/open-manager-comfyui/blob/main/docs/DOWNLOADS.md), [Model Library](https://github.com/WASasquatch/open-manager-comfyui/blob/main/docs/MODELS.md), [Resource Monitor](https://github.com/WASasquatch/open-manager-comfyui/blob/main/docs/MONITOR.md)
- **ComfyUI:** [Official repository](https://github.com/Comfy-Org/ComfyUI)
- **Vast.ai:** [Instance Portal](https://docs.vast.ai/instance-portal), [templates](https://docs.vast.ai/templates)
