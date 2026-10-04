# Model Library

Everything on disk, across every model folder ComfyUI registers, including the ones on
other drives.

![Model Library](model-library.png)

Off by default. Switch it on under **Open Manager → Library**; a **Models** button appears in
the workflow tab strip. It also opens from the Open Manager menu and the command palette.

Nothing is read until the panel is opened, and nothing is hashed until you ask for it.

## What it answers

| Tab | Answers |
|---|---|
| All | What is there: every model file, its folder, which drive, when it last changed |
| Duplicates | What is there twice, and how much of it you would get back |
| No reference found | What no saved workflow appears to ask for |
| Not downloaded | What a workflow asks for that is not on disk, and fetches the ones it can |
| Discover | What ComfyUI-Manager's model list offers, which of it is here, and fetches the rest |
| Storage | Where it all is, and how full each drive is |

## Duplicates, and what a duplicate claim is worth

Duplicates are checked at three depths, and the answer always says which was used.

| Depth | Reads | Says |
|---|---|---|
| Names | Nothing | Same name and size. Nothing has been read. |
| Quick check | 2 MB per file | Same name, size, and the first and last megabyte. |
| Verify fully | Every byte | Identical, with the hash. Or: same name, different contents. |

Only the full check reports reclaimable space. The first two can disprove a match, never
prove one.

**Same name, different contents.** Which of the two loads depends on the order ComfyUI
searches its folders, so a workflow naming that file may not get the one you mean.

## Not downloaded

Two different questions wear the same name here, and the tab keeps them apart.

**What can be fetched.** Where a workflow recorded *where* a model came from (ComfyUI writes
that on the node as `properties.models`), the tab lists it with the account it came from and
the workflows waiting on it, selectable, with one **Download** button for the batch. That runs
through the same trust prompt, free-space check and queue as any other download.

Trust is asked once per account. Declining one account does not cancel the others in the
batch; the models skipped are counted, and their accounts named.

**What cannot.** A workflow that only names a file gives no source. Those are listed, and
cannot be fetched from here.

## Discover

ComfyUI-Manager's model list, read from its repository the first time the tab opens, again once
the copy is a day old, and on **Update list**. Newest additions first.

| Show | Lists |
|---|---|
| Available | Not on disk, and allowed by the download rules |
| On disk | Already in a model folder |
| Not downloadable | Refused by the download rules, with the reason |
| All | Everything in the list |

Narrow it further by type, by base model, or with the filter box.

**Where an entry lands.** In the subfolder ComfyUI-Manager names, under the registered folder it
belongs to: `controlnet/SDXL` is an `SDXL` folder inside whichever `controlnet` path **Where new
downloads are stored** picks. A workflow made on an install that used ComfyUI-Manager names the
file the same way.

**On disk** means a file at that place or, for a filename the list uses only once, a file of that
name in any model folder. It reads the library's last walk, so **Rescan** after moving files by
hand.

**Not downloadable** is whatever the Download Manager refuses: pickle formats, hosts outside the
allowed set, URLs that name no file, and folders no installed pack registers. Each row names the
environment variable that would allow it, where one would; see [DOWNLOADS.md](DOWNLOADS.md).

**Whole repositories.** A few entries are a Hugging Face repository rather than a file. With
`OPEN_MANAGER_REPO_DOWNLOADS=1` each is read from Hugging Face when it is downloaded and its files
queued into a folder of the repository's name: weights in an allowed format, and the `.json`,
`.txt` and `.model` config and tokenizer files beside them. A repository whose weights are only in
a refused format is refused whole.

Selected entries go through the same trust prompt, free-space check and queue as any other
download.

## Per file

The **Manage** menu on any row offers:

- **Hash**: sha256, taken once and remembered against the file's size and modification time,
  so a file replaced in place is hashed again rather than reported as what it used to be.
- **Where it came from**: the download that fetched it, the account it came from, the hash
  that was expected, and the saved workflows naming it. A model you copied in by hand says so
  rather than showing an empty panel.
- **Copy path**, **Copy hash**.
- **Delete file**: one file, confirmed, and only inside a folder ComfyUI registers.

## What it will not do

- **Delete more than one model file at a time.**
- **Touch anything outside a registered model folder.** A path is resolved and checked against
  the folders ComfyUI itself declares, and `custom_nodes`, `input`, `output` and `temp` are
  excluded from the library entirely.
- **Claim a reference search is exhaustive.** It reads saved workflow JSON. A workflow saved in
  API form, a widget shape it does not recognise, or a path built at run time will not appear,
  so "no reference found" means what it says and not "unused".

The one sweep that exists is for `.part` files left behind by downloads that stopped, shown on
the Storage tab, and it only ever removes part files that no entry in the Download Manager is
waiting on. It is not shown at all when there are none.

## Settings

Under **Open Manager → Library**.

| Setting | Default | What it does |
|---|---|---|
| Model Library panel, and the Models button | on | The whole feature, and the Models button. |
| Let the Model Library read the contents of a file | on | Hashing and full duplicate confirmation read a model end to end: on a large library that is hundreds of gigabytes. Turn it off and the library still reports names, sizes, folders, duplicates by name and what nothing references, and never opens a file. A digest already taken is still shown. |
| Show what each pack costs to load, on the Installed list | off | Reads ComfyUI's own import timings back out of its log and puts the seconds beside each installed pack. Nothing is measured or run. |

Shared with every window, under **Open Manager → Windows**:

| Setting | Default | What it does |
|---|---|---|
| Model Library as a window | on | Off, it opens centred and closes on a click away or Escape. |
| Default window size | `large` | `compact`, `standard` or `large`. Scales each window's own default, so their relative sizes are kept. A window you have resized keeps the size you gave it. |
| Header height | 44 | 24 to 80. |
| Title text size | 15 | 10 to 28. The title bar and section headings, independent of the header height. |
| Content text size | 13 | 10 to 22. Body text inside windows. |
| Drop shadow | on | The shadow that lifts a window off the graph behind it. |
| Windows can be dragged | on | Off, a window always opens in the middle and cannot be moved. On a screen too small to move it around, a window is centred either way. |

And under **Open Manager → Interface**:

| Setting | Default | What it does |
|---|---|---|
| Where the Downloads, Models and Memory buttons sit | `topbar` | `topbar` puts Downloads, Models and Memory in the workflow tab strip with their names. `control` puts them in the floating control bar as icons. |

## Access keys

The library needs none. Fetching a gated model does: set `HF_TOKEN` before ComfyUI starts, or
paste it into **Access keys** in the Open Manager menu. See [DOWNLOADS.md](DOWNLOADS.md).

## Related

- [DOWNLOADS.md](DOWNLOADS.md): fetching the models this lists, and where they land.
- [MONITOR.md](MONITOR.md): what is loaded into memory right now, as against on disk.
- [DESKTOP.md](DESKTOP.md): files, notes, outputs and programs, on a tab of their own.
