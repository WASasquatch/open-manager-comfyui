import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { refreshExtras, registerThemes, repairLinkMode, watchThemeExtras } from "../themes.js";
import "./styles.mjs";
import { API } from "./base.mjs";
import { toast, notify, askText } from "./ui.mjs";
import { loadInstalledIndex, loadTrustedAuthors } from "./installs.mjs";
import { applyWindowLook, floatPanels, floatHooks, taskbarOn, applyHeaderHeight } from "./windows.mjs";
import { openPack } from "./packs.mjs";
import { loadKeys, migrateKeys, migrateEntryMode, panelSetting } from "./settings.mjs";
import { refreshPackThemes } from "./pack-extras.mjs";
import { refreshMissingIfActive, openPanelWindow, togglePanelWindow, openManagerMenu, addLegacyMenuButton, renderSidebar } from "./discovery.mjs";
import { syncOptions } from "./registry.mjs";
import { openDownloadManager, nodeModels, addModelUrlToNode, downloadNodeModels } from "./downloads.mjs";
import { readLegacyUi, managerEntry, mountTopbar, remountTopbar } from "./topbar.mjs";
import { deskGates } from "./programs.mjs";
import { MONITOR_STYLES, wireMonitorLink } from "./monitor.mjs";
import { paintTabs } from "./tab-marks.mjs";
import { startPanel, closeStart, openStart, paintTaskbar, taskbarShow, taskbarSync, applyTaskbar } from "./taskbar.mjs";
import { deskLayer, desktopOn, applyDeskLook, repaintLooks, showDesk, hideDesk, deskShowing, applyDesktop } from "./desktop.mjs";
import { paintDeskLive, paintDeskIcons } from "./desk-icons.mjs";
import { sessionKeep, startDesktop } from "./session.mjs";
import { wireRunBar } from "./runbar.mjs";
import { restorePauseForGraph } from "./pause.mjs";
import { openMemoryPanel } from "./memory.mjs";
import { openDesktopSettings } from "./desk-settings.mjs";
import { openModelLibrary } from "./library.mjs";
import { watchGrips, applyGrips, gripMenuItem } from "./grips.mjs";
import { patchResize } from "./node-resize.mjs";
import { watchJump } from "./socket-jump.mjs";

let lastMissingTypes = null;

let topbarReady = false;

floatHooks.add(taskbarSync);

floatHooks.add(paintDeskLive);

floatHooks.add(sessionKeep);

app.registerExtension({
  name: "openmanager.browser",
  settings: [
    {
      id: "openManager.linkModeRepair",
      name: "Link render mode repair",
      category: ["Open Manager", "Internal", "linkModeRepair"],
      type: "hidden",
      defaultValue: 0,
    },
    {
      id: "openManager.windowManager",
      name: "Pack manager as a window",
      category: ["Open Manager", "Windows", "windowManager"],
      type: "boolean",
      defaultValue: true,
      tooltip: "The Registry, Installed, GitHub and Missing browser. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowPacks",
      name: "Pack pages as windows",
      category: ["Open Manager", "Windows", "windowPacks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A pack's own page: its versions, README, nodes and gallery. One window per pack. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowDownloads",
      name: "Download Manager as a window",
      category: ["Open Manager", "Windows", "windowDownloads"],
      type: "boolean",
      defaultValue: true,
      tooltip: "The download queue. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowLibrary",
      name: "Model Library as a window",
      category: ["Open Manager", "Windows", "windowLibrary"],
      type: "boolean",
      defaultValue: true,
      tooltip: "What is on disk: duplicates, unreferenced files and storage. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowMemory",
      name: "Memory panel as a window",
      category: ["Open Manager", "Windows", "windowMemory"],
      type: "boolean",
      defaultValue: true,
      tooltip: "What is loaded and what it weighs. On, it opens as a movable window that stays "
        + "open while you work. Off, it opens centred and closes on a click away or "
        + "Escape.",
    },
    {
      id: "openManager.windowSize",
      name: "Default window size",
      category: ["Open Manager", "Windows", "windowSize"],
      type: "combo",
      options: ["compact", "standard", "large"],
      defaultValue: "large",
      tooltip: "The size a window opens at until you resize it, as a share of the browser "
        + "window.",
    },
    {
      id: "openManager.themeNodeArt",
      name: "Theme images behind node bodies",
      category: ["Open Manager", "Theme", "themeNodeArt"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may paint a texture behind every node body. Off paints nothing and "
        + "leaves the theme's colours, gradients, icons and glow alone.",
    },
    {
      id: "openManager.themeNodeArtOpacity",
      name: "Node background image strength",
      category: ["Open Manager", "Theme", "themeNodeArtOpacity"],
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.05 },
      defaultValue: 1,
      onChange: () => refreshExtras(),
      tooltip: "Multiplies the image strength the theme declares: 1 is as declared, lower is "
        + "fainter.",
    },
    {
      id: "openManager.themeTitleIcons",
      name: "Theme icons in node titles",
      category: ["Open Manager", "Theme", "themeTitleIcons"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may replace the dot at the left of a node's title with an icon. Off "
        + "restores the dot. A subgraph keeps its own marker, a node whose dot colour you set "
        + "keeps your colour, and no icon is drawn when zoomed far out.",
    },
    {
      id: "openManager.themeGlow",
      name: "Selection glow",
      category: ["Open Manager", "Theme", "themeGlow"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may light a selected node with a coloured halo and suppress its drop "
        + "shadow while it does. Off falls back to ComfyUI's own outline and shadow, both "
        + "coloured by the theme.",
    },
    {
      id: "openManager.themeBackdrop",
      name: "Theme graph backdrop",
      category: ["Open Manager", "Theme", "themeBackdrop"],
      type: "boolean",
      defaultValue: true,
      onChange: () => refreshExtras(),
      tooltip: "A theme may put an image behind the graph in place of ComfyUI's flat canvas "
        + "colour. Off restores the palette's canvas colour. ComfyUI's dot grid is drawn over "
        + "the image unless the theme turns it off or replaces it.",
    },
    {
      id: "openManager.themeNodeOpacity",
      name: "Node body opacity",
      category: ["Open Manager", "Theme", "themeNodeOpacity"],
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.05 },
      defaultValue: 1,
      onChange: () => refreshExtras(),
      tooltip: "How solid a node body is drawn: 0.6 is 60 percent, whatever the theme asks "
        + "for. At 1 the theme's own value is used, or solid if it sets none. Title bars, "
        + "widgets and text boxes are unaffected.",
    },
    {
      id: "openManager.desktop",
      onChange: () => {
        if (desktopOn() && panelSetting("openManager.taskbar", false) !== true) {
          app.extensionManager.setting.set("openManager.taskbar", true).then(() => {
            applyTaskbar();
            toast("Taskbar switched on.", { kind: "ok" });
          }).catch(() => {});
        }
        applyDesktop();
      },
      name: "Desktop mode, on a tab of its own",
      category: ["Open Manager", "Desktop", "desktop"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Adds a desktop tab at the left of the workflow tabs. Switches the "
        + "taskbar on. Has no effect unless OPEN_MANAGER_ENABLE_DESKTOP is set.",
    },
    {
      id: "openManager.desktopWallpaper",
      onChange: () => applyDeskLook(),
      name: "Desktop wallpaper",
      category: ["Open Manager", "Desktop", "desktopWallpaper"],
      type: "text",
      defaultValue: "",
      tooltip: "The name of an image in your wallpapers directory, or an address beginning "
        + "http, https or a slash. Empty for a plain desktop.",
    },
    {
      id: "openManager.desktopFit",
      onChange: () => applyDeskLook(),
      name: "How the wallpaper fills the desktop",
      category: ["Open Manager", "Desktop", "desktopFit"],
      type: "combo",
      options: ["cover", "contain", "centre", "tile"],
      defaultValue: "cover",
      tooltip: "Cover fills the desktop and crops what does not fit. Contain shows the whole "
        + "image and leaves space around it. Centre shows it at its own size. Tile repeats it "
        + "from the top left.",
    },
    {
      id: "openManager.desktopFocusX",
      onChange: () => applyDeskLook(),
      name: "Wallpaper position across",
      category: ["Open Manager", "Desktop", "desktopFocusX"],
      type: "slider",
      attrs: { min: 0, max: 100, step: 1 },
      defaultValue: 50,
      tooltip: "Which part of the wallpaper to show when it is wider than the desktop: 0 is "
        + "the left edge, 100 the right. No effect where the whole image fits.",
    },
    {
      id: "openManager.desktopFocusY",
      onChange: () => applyDeskLook(),
      name: "Wallpaper position down",
      category: ["Open Manager", "Desktop", "desktopFocusY"],
      type: "slider",
      attrs: { min: 0, max: 100, step: 1 },
      defaultValue: 50,
      tooltip: "Which part of the wallpaper to show when it is taller than the desktop: 0 is "
        + "the top edge, 100 the bottom.",
    },
    {
      id: "openManager.windowColour",
      onChange: () => repaintLooks(),
      name: "Window colour",
      category: ["Open Manager", "Desktop", "windowColour"],
      type: "text",
      defaultValue: "",
      tooltip: "A colour for every window bar: accent, green, amber, red, purple, teal, grey "
        + "or a #rrggbb, or two of these separated by a comma for a gradient. Empty draws "
        + "the plain theme bar.",
    },
    {
      id: "openManager.programWindows",
      name: "A window each time",
      category: ["Open Manager", "Desktop", "programWindows"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Programs that allow several windows, such as the Image Viewer and the Video "
        + "Player, open a new window each time instead of reusing the one already open.",
    },
    {
      id: "openManager.programColours",
      onChange: () => repaintLooks(),
      name: "Program window colours",
      category: ["Open Manager", "Desktop", "programColours"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A program may ask for a colour on its own window bar, taken from the theme's "
        + "palette. Switch this off to draw every window bar the same.",
    },
    {
      id: "openManager.desktopIconSize",
      onChange: () => applyDeskLook(),
      name: "Desktop icon size",
      category: ["Open Manager", "Desktop", "desktopIconSize"],
      type: "slider",
      attrs: { min: 28, max: 96, step: 4 },
      defaultValue: 44,
      tooltip: "How large a desktop icon is drawn, in pixels.",
    },
    {
      id: "openManager.desktopLabelSize",
      onChange: () => applyDeskLook(),
      name: "Desktop label size",
      category: ["Open Manager", "Desktop", "desktopLabelSize"],
      type: "slider",
      attrs: { min: 9, max: 18, step: 1 },
      defaultValue: 12,
      tooltip: "The type size of the name under each icon, in pixels.",
    },
    {
      id: "openManager.taskbar",
      onChange: () => applyTaskbar(),
      name: "Taskbar along the bottom, and a minimise button",
      category: ["Open Manager", "Windows", "taskbar"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Lists open windows in a strip at the foot of the screen, and gives every "
        + "window a minimise button. Switching it off restores anything minimised at the time.",
    },
    {
      id: "openManager.taskbarHide",
      onChange: () => { taskbarSync(); taskbarShow(true); },
      name: "Hide the taskbar until the pointer nears it",
      category: ["Open Manager", "Desktop", "taskbarHide"],
      type: "boolean",
      defaultValue: false,
      tooltip: "The bar slides away and comes back when the pointer reaches the bottom of "
        + "the screen. It stays out while its menu is open.",
    },
    {
      id: "openManager.startLabel",
      onChange: () => taskbarSync(),
      name: "Write Start on the Start button",
      category: ["Open Manager", "Desktop", "startLabel"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Off, the button is its mark alone and the width of the Desktop tab.",
    },
    {
      id: "openManager.taskbarGroups",
      onChange: () => applyTaskbar(),
      name: "Group windows of the same kind in the taskbar",
      category: ["Open Manager", "Windows", "taskbarGroups"],
      type: "boolean",
      defaultValue: false,
      tooltip: "One entry per kind of window, with a list of its windows.",
    },
    {
      id: "openManager.windowIcons",
      name: "Show an icon in each window title",
      category: ["Open Manager", "Windows", "windowIcons"],
      type: "boolean",
      defaultValue: true,
      onChange: () => applyWindowLook(),
      tooltip: "A window with an icon shows it before its title. Off keeps title bars "
        + "to text.",
    },
    {
      id: "openManager.fileBrowser",
      onChange: () => { remountTopbar(); if (deskLayer) paintDeskIcons(); },
      name: "ComfyUI file browser",
      category: ["Open Manager", "Desktop", "fileBrowser"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A window onto ComfyUI's input, output, temp and model directories. Read-only "
        + "unless OPEN_MANAGER_FILE_WRITES is set. Has no effect unless "
        + "OPEN_MANAGER_ENABLE_FILES is set.",
    },
    {
      id: "openManager.aero",
      onChange: () => applyWindowLook(),
      name: "Aero window headers",
      category: ["Open Manager", "Windows", "aero"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Draws every window header as glass: the theme's colours, translucent, over a "
        + "blur of what is behind the window.",
    },
    {
      id: "openManager.aeroAlpha",
      onChange: () => applyWindowLook(),
      name: "Aero opacity",
      category: ["Open Manager", "Windows", "aeroAlpha"],
      type: "slider",
      attrs: { min: 10, max: 100, step: 5 },
      defaultValue: 55,
      tooltip: "How solid the glass is. Lower shows more of the wallpaper through it.",
    },
    {
      id: "openManager.aeroDark",
      onChange: () => applyWindowLook(),
      name: "Aero darkening",
      category: ["Open Manager", "Windows", "aeroDark"],
      type: "slider",
      attrs: { min: 0, max: 70, step: 2 },
      defaultValue: 18,
      tooltip: "How far the glass is darkened.",
    },
    {
      id: "openManager.aeroBlur",
      onChange: () => applyWindowLook(),
      name: "Aero blur",
      category: ["Open Manager", "Windows", "aeroBlur"],
      type: "slider",
      attrs: { min: 0, max: 40, step: 2 },
      defaultValue: 12,
      tooltip: "How far what is behind the window is softened before it is seen through the "
        + "header.",
    },
    {
      id: "openManager.blurAmount",
      onChange: () => applyWindowLook(),
      name: "Inactive blur",
      category: ["Open Manager", "Windows", "blurAmount"],
      type: "slider",
      attrs: { min: 1, max: 12, step: 1 },
      defaultValue: 3,
      tooltip: "How much windows not in front are blurred when Blur inactive windows "
        + "is on.",
    },
    {
      id: "openManager.blurInactive",
      onChange: () => applyWindowLook(),
      name: "Blur inactive windows",
      category: ["Open Manager", "Windows", "blurInactive"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Blurs the contents of every window except the one in front. Windows not in "
        + "front are dimmed slightly either way.",
    },
    {
      id: "openManager.windowShadow",
      onChange: () => applyWindowLook(),
      name: "Drop shadow",
      category: ["Open Manager", "Windows", "windowShadow"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Draws a shadow under each window.",
    },
    {
      id: "openManager.windowTitleSize",
      onChange: () => applyWindowLook(),
      name: "Title text size",
      category: ["Open Manager", "Windows", "windowTitleSize"],
      type: "number",
      defaultValue: 15,
      tooltip: "Size in pixels of the text in a window's title bar and on its section "
        + "headings. Clamped to 10-28.",
    },
    {
      id: "openManager.windowTextSize",
      onChange: () => applyWindowLook(),
      name: "Content text size",
      category: ["Open Manager", "Windows", "windowTextSize"],
      type: "number",
      defaultValue: 13,
      tooltip: "Size in pixels of the body text inside windows: lists, descriptions and "
        + "READMEs. Clamped to 10-22.",
    },
    {
      id: "openManager.tabMarks",
      onChange: () => paintTabs(),
      name: "Colour and title workflow tabs",
      category: ["Open Manager", "Interface", "tabMarks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Adds Colour and Title to the right-click menu on a workflow tab. Both are "
        + "saved in the workflow, and setting either marks it as changed.",
    },
    {
      id: "openManager.managerEntry",
      name: "What the Extensions button opens",
      category: ["Open Manager", "Interface", "managerEntry"],
      type: "combo",
      options: ["auto", "panel", "classic"],
      defaultValue: "auto",
      tooltip: "'auto' follows ComfyUI: the classic menu where it was started with "
        + "--enable-manager-legacy-ui, and the panel otherwise. 'panel' always opens the "
        + "manager. 'classic' always opens the menu.",
    },
    {
      id: "openManager.trustMode",
      name: "Remember trusted authors, or ask every time",
      category: ["Open Manager", "Interface", "trustMode"],
      type: "combo",
      options: ["author", "action"],
      defaultValue: "author",
      tooltip: "By author: asked once per account, and anything they publish is allowed from then on. By action: asked every time, naming the account, and nothing is remembered. Findings against a pack are shown either way.",
    },
    {
      id: "openManager.trustRegistry",
      name: "Ask before installing a registry pack from an untrusted author",
      category: ["Open Manager", "Interface", "trustRegistry"],
      type: "boolean",
      defaultValue: false,
      tooltip: "GitHub installs and model downloads always ask. On, registry packs ask as "
        + "well, once per author. Findings against a pack are shown either way.",
    },
    {
      id: "openManager.imageWorkflows",
      name: "Right-click a README image to load its workflow",
      category: ["Open Manager", "Interface", "imageWorkflows"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Right-clicking a README image that carries a workflow offers to load it. "
        + "Off keeps the browser's own menu on README images.",
    },
    {
      id: "openManager.packLinks",
      name: "Open README links to other packs here",
      category: ["Open Manager", "Interface", "packLinks"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A README link to another pack's repository opens that pack's page in Open Manager rather than leaving for GitHub. Middle-click and ctrl-click always go to GitHub.",
    },
    {
      id: "openManager.textareaGrips",
      onChange: () => applyGrips(),
      name: "Drag multiline text boxes to size them",
      category: ["Open Manager", "Interface", "textareaGrips"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Puts a grip along the bottom edge of every multiline text box on a node. "
        + "Dragging it sets that box's height and the node grows to match; boxes you have not "
        + "dragged go on sharing what is left. Double-click a grip, or use the node's menu, to "
        + "give a box back. Heights are saved in the workflow.",
    },
    {
      id: "openManager.edgeResize",
      name: "Resize nodes from their side and bottom edges",
      category: ["Open Manager", "Interface", "edgeResize"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Drag a node's left or right edge to set its width on its own, or its bottom edge "
        + "to set its height on its own. The corners still do both at once. The top edge is left "
        + "alone, because that is the title bar a node is dragged by.",
    },
    {
      id: "openManager.multiResize",
      name: "Resize every selected node together",
      category: ["Open Manager", "Interface", "multiResize"],
      type: "boolean",
      defaultValue: true,
      tooltip: "With more than one node selected, dragging a corner or an edge of any of them "
        + "applies the same change to all of them. Each node still stops at its own smallest size.",
    },
    {
      id: "openManager.installPolicy",
      name: "What an install may do to packages already here",
      category: ["Open Manager", "Interface", "installPolicy"],
      type: "combo",
      options: ["new", "upgrade", "downgrade", "all"],
      defaultValue: "new",
      tooltip: "The starting choice in the install dialog, which every install can change. "
        + "'new' installs only what is not here yet and holds back any requirement that would "
        + "replace an installed package. 'upgrade' allows upgrades and holds back downgrades, "
        + "'downgrade' the reverse. 'all' installs exactly what the pack asks for. Held-back "
        + "requirements are named in the install output.",
    },
    {
      id: "openManager.socketJump",
      name: "Middle-click a connected socket to follow the link",
      category: ["Open Manager", "Interface", "socketJump"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Moves the view to the node at the other end and selects it, keeping the zoom "
        + "where it is. An output feeding several nodes offers a list of them. Only sockets that "
        + "carry a link are taken; on an empty socket ComfyUI's own middle-click reroute still "
        + "applies, and middle-drag anywhere else still pans.",
    },
    {
      id: "openManager.enrichMetadata",
      name: "Read pack README and repository metadata",
      category: ["Open Manager", "Registry", "enrichMetadata"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A pack page reads its README, repository stats and gallery from the "
        + "repository. Cached until the pack's versions change. Off keeps a pack page to the "
        + "registry alone.",
    },
    {
      id: "openManager.autoRenew",
      name: "Renew the offline registry",
      category: ["Open Manager", "Registry", "autoRenew"],
      type: "combo",
      options: [
        { text: "Off (manual only)", value: "off" },
        { text: "On every start", value: "startup" },
        { text: "When stale", value: "stale" },
      ],
      defaultValue: "startup",
      tooltip: "When the panel loads, refresh the cached registry in the background: never, once per launch, or only when older than the stale threshold.",
    },
    {
      id: "openManager.staleDays",
      name: "Days before the offline registry counts as stale",
      category: ["Open Manager", "Registry", "staleDays"],
      type: "number",
      defaultValue: 7,
      tooltip: "How old the offline copy of the registry may get before the 'When stale' "
        + "renewal policy refreshes it.",
    },
    {
      id: "openManager.parallelSync",
      name: "Sync the registry in parallel",
      category: ["Open Manager", "Registry", "parallelSync"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Read several catalogue pages at once. Off reads one page at a time.",
    },
    {
      id: "openManager.syncConcurrency",
      name: "Catalogue pages read at once when syncing",
      category: ["Open Manager", "Registry", "syncConcurrency"],
      type: "number",
      defaultValue: 8,
      tooltip: "How many pages a parallel sync keeps in flight. Clamped to 1-16. Higher "
        + "risks the registry rate-limiting you.",
    },
    {
      id: "openManager.allowBanned",
      name: "Install versions the registry has banned",
      category: ["Open Manager", "Registry", "allowBanned"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Off, a banned version shows as Blocked and will not install. On, it installs "
        + "after a confirmation that names the ban.",
    },
    {
      id: "openManager.galleryShow",
      name: "Show pack galleries",
      category: ["Open Manager", "Gallery", "galleryShow"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Show the images a pack lists in [tool.open_manager] gallery. Entries given as absolute URLs are fetched from wherever the pack points, so turning this off keeps the panel to the hosts it already uses.",
    },
    {
      id: "openManager.galleryThumb",
      name: "Gallery thumbnail size",
      category: ["Open Manager", "Gallery", "galleryThumb"],
      type: "number",
      defaultValue: 120,
      tooltip: "Edge of a gallery thumbnail in pixels. Clamped to 80-320; the grid fits as many columns as the width allows.",
    },
    {
      id: "openManager.galleryExpanded",
      name: "Open pack galleries by default",
      category: ["Open Manager", "Gallery", "galleryExpanded"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Start the gallery open on a pack page rather than collapsed. The images are "
        + "fetched either way once the section is drawn.",
    },
    {
      id: "openManager.licenseUseApi",
      name: "Name licences through the GitHub API",
      category: ["Open Manager", "Licences", "licenseUseApi"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Ask GitHub to name a repository's licence in one request instead of guessing "
        + "at filenames. Needs a GitHub token, set under Open Manager > Access keys. Without "
        + "one the limit is 60 requests an hour, which one listing spends. Falls back to "
        + "reading files when the API cannot answer.",
    },
    {
      id: "openManager.licenseRace",
      name: "Fetch licence filenames together",
      category: ["Open Manager", "Licences", "licenseRace"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Try every candidate licence filename at once rather than one after another. "
        + "One round trip per repository, at the cost of more requests.",
    },
    {
      id: "openManager.licenseConcurrency",
      name: "Repositories read at once when naming licences",
      category: ["Open Manager", "Licences", "licenseConcurrency"],
      type: "number",
      defaultValue: 8,
      tooltip: "How many repositories are read at once when resolving licences for a listing. Clamped to 1-32.",
    },
    {
      id: "openManager.scanOnInstall",
      name: "Scan every new install before it is finished",
      category: ["Open Manager", "Scanning", "scanOnInstall"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Check a freshly placed pack against VirusTotal before its requirements are "
        + "installed and before ComfyUI is asked to restart. Needs a VirusTotal key, set under "
        + "Open Manager > Access keys. Where the day's allowance is spent you are asked "
        + "whether to install without scanning.",
    },
    {
      id: "openManager.panelHeaders",
      onChange: () => applyHeaderHeight(),
      name: "Header height",
      category: ["Open Manager", "Windows", "panelHeaders"],
      type: "number",
      defaultValue: 44,
      tooltip: "Height in pixels of the title and section bars in the floating panels. "
        + "Clamped to 24-80.",
    },
    {
      id: "openManager.monitor",
      onChange: () => remountTopbar(),
      name: "Resource monitor strip",
      category: ["Open Manager", "Monitor", "monitor"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A compact CPU, RAM and VRAM readout.",
    },
    {
      id: "openManager.monitorPlacement",
      onChange: () => remountTopbar(),
      name: "Where the resource monitor strip sits",
      category: ["Open Manager", "Monitor", "monitorPlacement"],
      type: "combo",
      options: ["control", "topbar"],
      defaultValue: "control",
      tooltip: "'control' puts the readout in ComfyUI's floating control bar, beside the queue controls and next to any other monitor already there. 'topbar' puts it in the workflow tab strip, ahead of the account button. Falls back to the tab strip where a build has no control bar.",
    },
    {
      id: "openManager.monitorStyle",
      onChange: () => remountTopbar(),
      name: "How the resource monitor strip is drawn",
      category: ["Open Manager", "Monitor", "monitorStyle"],
      type: "combo",
      options: MONITOR_STYLES,
      defaultValue: "mixed",
      tooltip: "'mixed' draws a share of a total as a bar and a temperature as a column. "
        + "'horizontal' draws everything as bars, and 'vertical' as columns with each name "
        + "down the side. The compact styles put the text on the bar, or at the foot of the "
        + "column; 'vertical-compact' leaves the figure to the hover.",
    },
    {
      id: "openManager.monitorInterval",
      onChange: () => remountTopbar(),
      name: "Seconds between monitor readings",
      category: ["Open Manager", "Monitor", "monitorInterval"],
      type: "number",
      defaultValue: 2,
      tooltip: "How often the machine is sampled while the strip is on screen, clamped to 1 to 10 seconds. Once a second while the Memory panel is open.",
    },
    {
      id: "openManager.monitorCpu",
      onChange: () => remountTopbar(),
      name: "Show CPU in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorCpu"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Processor load. Needs psutil, which ComfyUI already depends on; the reading is left out where it cannot be taken.",
    },
    {
      id: "openManager.monitorRam",
      onChange: () => remountTopbar(),
      name: "Show RAM in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorRam"],
      type: "boolean",
      defaultValue: true,
      tooltip: "System memory in use, as a share of the total. Always available.",
    },
    {
      id: "openManager.monitorTemp",
      onChange: () => remountTopbar(),
      name: "Show temperatures in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorTemp"],
      type: "boolean",
      defaultValue: true,
      tooltip: "A thermometer per graphics card, and per processor package where the platform reports one. Graphics temperatures come from NVIDIA's own tooling where it is installed; Windows reports no processor temperature to Python, so that reading is simply absent there.",
    },
    {
      id: "openManager.monitorVram",
      onChange: () => remountTopbar(),
      name: "Show VRAM in the monitor strip",
      category: ["Open Manager", "Monitor", "monitorVram"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Graphics memory in use, as a share of the total, one meter per device. A machine with four cards gets four, labelled VRAM:0 to VRAM:3, and a machine with one names it VRAM. Always available.",
    },
    {
      id: "openManager.startupTimes",
      name: "Show what each pack costs to load, on the Installed list",
      category: ["Open Manager", "Library", "startupTimes"],
      type: "boolean",
      defaultValue: false,
      tooltip: "The import time ComfyUI logs for each pack, in seconds, shown beside it on the Installed list with the total.",
    },
    {
      id: "openManager.hashOnDemand",
      name: "Let the Model Library read the contents of a file",
      category: ["Open Manager", "Library", "hashOnDemand"],
      type: "boolean",
      defaultValue: true,
      tooltip: "On, the library offers hashing and duplicate confirmation, which read each "
        + "model end to end. Off, the library still reports names, sizes, folders, duplicates "
        + "by name, and what no workflow references, and never opens a file. A digest already "
        + "taken is still shown.",
    },
    {
      id: "openManager.floatingPanels",
      name: "Windows can be dragged",
      category: ["Open Manager", "Windows", "floatingPanels"],
      type: "boolean",
      defaultValue: true,
      tooltip: "For panels set to open as windows. On, a window can be dragged anywhere and "
        + "reopens where you left it. Off, it always opens in the middle and cannot be moved. "
        + "A browser window too small to move a panel around in presents it centred.",
    },
    {
      id: "openManager.modelLibrary",
      onChange: () => remountTopbar(),
      name: "Model Library panel, and the Models button",
      category: ["Open Manager", "Library", "modelLibrary"],
      type: "boolean",
      defaultValue: false,
      tooltip: "Adds a Models button that opens the model library: everything on disk across every folder ComfyUI registers, what is held in more than one place, and what no saved workflow appears to reference.",
    },
    {
      id: "openManager.downloadButton",
      onChange: () => remountTopbar(),
      name: "Show the Download Manager button",
      category: ["Open Manager", "Downloads", "downloadButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Adds a Downloads button that opens the Download Manager.",
    },
    {
      id: "openManager.pauseButton",
      onChange: () => remountTopbar(),
      name: "Pause button beside Run",
      category: ["Open Manager", "Monitor", "pauseButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Pausing saves what the run has finished, without models. The next Run of that "
        + "workflow, in this session or a later one, continues from there.",
    },
    {
      id: "openManager.runBar",
      onChange: () => remountTopbar(),
      name: "Run progress bar above the header",
      category: ["Open Manager", "Monitor", "runBar"],
      type: "boolean",
      defaultValue: false,
      tooltip: "A strip across the top of the window while a prompt runs: the graph's "
        + "progress as a gradient, and the running node's own progress filling the block "
        + "that node will occupy.",
    },
    {
      id: "openManager.memoryButton",
      onChange: () => remountTopbar(),
      name: "Show the Memory button",
      category: ["Open Manager", "Monitor", "memoryButton"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Opens the Memory panel: live graphs, what ComfyUI is holding, and where each "
        + "model's weights sit.",
    },
    {
      id: "openManager.buttonPlacement",
      onChange: () => remountTopbar(),
      name: "Where the Downloads, Models and Memory buttons sit",
      category: ["Open Manager", "Interface", "buttonPlacement"],
      type: "combo",
      options: ["topbar", "control"],
      defaultValue: "topbar",
      tooltip: "'topbar' puts Downloads, Models and Memory in the workflow tab strip with "
        + "their names. 'control' puts them in ComfyUI's floating control bar as icons, with "
        + "the name on the hover. Falls back to the tab strip where a build has no control "
        + "bar.",
    },
    {
      id: "openManager.downloadLocation",
      name: "Where new downloads are stored",
      category: ["Open Manager", "Downloads", "downloadLocation"],
      type: "combo",
      options: ["default", "most-free"],
      defaultValue: "default",
      tooltip: "Which of the paths ComfyUI registers for a model folder a download starts "
        + "on. 'default' is ComfyUI's own first path, which honours is_default in "
        + "extra_model_paths.yaml. 'most-free' picks the registered path with the most room. "
        + "The location is shown before the download starts and can be changed.",
    },
    {
      id: "openManager.downloadWorkers",
      name: "Models downloaded at once, in parallel",
      category: ["Open Manager", "Downloads", "downloadWorkers"],
      type: "number",
      defaultValue: 2,
      tooltip: "How many downloads run in parallel. Clamped to 1-8. A stalled transfer holds "
        + "its slot.",
    },
    {
      id: "openManager.nodeModelMenu",
      name: "Add and fetch model URLs from a node's menu",
      category: ["Open Manager", "Downloads", "nodeModelMenu"],
      type: "boolean",
      defaultValue: true,
      tooltip: "Right-clicking a node offers to download the models it names, and to add a "
        + "URL to it. Added URLs are checked against the same host and format rules as any "
        + "other download.",
    },
  ],
  commands: [
    {
      id: "openmanager.panel",
      label: "Open Manager: open the panel",
      function: () => openPanelWindow(),
    },
    {
      id: "openmanager.memory",
      label: "Open Manager: open the Memory panel",
      function: () => openMemoryPanel(),
    },
    {
      id: "openmanager.start",
      label: "Open Manager: open the Start menu",
      function: () => {
        if (!taskbarOn()) {
          toast("The taskbar is off. Switch it on under Open Manager > Windows.");
          return;
        }
        paintTaskbar();
        if (startPanel) closeStart(true);
        else openStart();
      },
    },
    {
      id: "openmanager.desktop",
      label: "Open Manager: show or hide the desktop",
      function: () => {
        if (deskGates.desktop === false) {
          toast("Desktop mode is not switched on for this install "
            + "(OPEN_MANAGER_ENABLE_DESKTOP).");
          return;
        }
        if (!desktopOn()) {
          toast("Desktop mode is off. Switch it on in the Open Manager settings, under "
            + "Desktop.");
          return;
        }
        if (deskShowing()) hideDesk();
        else showDesk();
      },
    },
    {
      id: "openmanager.desktopsettings",
      label: "Open Manager: desktop settings",
      function: () => openDesktopSettings(),
    },
    {
      id: "openmanager.minimise",
      label: "Open Manager: minimise the window in front",
      function: () => {
        if (!taskbarOn()) {
          toast("The taskbar is off, so windows cannot be minimised.");
          return;
        }
        const front = [...floatPanels.values()].find((one) => one.el.isConnected && !one.modal
          && !one.isMinimised() && one.el.classList.contains("om-float-active"));
        if (!front) { toast("No window to minimise."); return; }
        front.minimise();
      },
    },
    {
      id: "openmanager.restore",
      label: "Open Manager: restore the last minimised window",
      function: () => {
        const away = [...floatPanels.values()]
          .filter((one) => one.el.isConnected && one.isMinimised())
          .sort((a, b) => a.minimisedAt() - b.minimisedAt());
        if (!away.length) { toast("Nothing is minimised."); return; }
        away[away.length - 1].present();
      },
    },
    {
      id: "openmanager.library",
      label: "Open Manager: open the Model Library",
      function: () => openModelLibrary(),
    },
    {
      id: "openmanager.downloads",
      label: "Open Manager: open the Download Manager",
      function: () => openDownloadManager(),
    },
    {
      id: "openmanager.open",
      label: "Open Manager: browse a pack",
      function: async () => {
        const packId = await askText("Registry pack id");
        if (packId) await openPack(packId);
      },
    },
    {
      id: "Comfy.Manager.Menu.ToggleVisibility",
      label: "Open Manager: toggle the menu",
      function: () => (managerEntry() === "classic"
        ? openManagerMenu()
        : togglePanelWindow("registry")),
    },
    {
      id: "Comfy.Manager.CustomNodesManager.ToggleVisibility",
      label: "Open Manager: toggle the pack browser",
      function: () => togglePanelWindow("registry"),
    },
  ],
  getNodeMenuItems(node) {
    const items = [];
    if (panelSetting("openManager.nodeModelMenu", true) !== false) {
      const declared = nodeModels(node);
      items.push(null);
      if (declared.length) {
        items.push({
          content: `Download ${declared.length} model${declared.length === 1 ? "" : "s"} for this node`,
          callback: () => downloadNodeModels(node),
        });
      }
      items.push({
        content: "Add a model URL to this node",
        callback: () => addModelUrlToNode(node),
      });
    }
    const reset = gripMenuItem(node);
    if (reset) {
      if (!items.length) items.push(null);
      items.push(reset);
    }
    return items;
  },
  afterConfigureGraph(missingNodeTypes) {
    lastMissingTypes = Array.isArray(missingNodeTypes)
      ? missingNodeTypes.map((m) => (typeof m === "string" ? m : m?.type || m?.name)).filter(Boolean)
      : null;
    refreshMissingIfActive();
    restorePauseForGraph();
  },
  setup() {
    app.extensionManager.registerSidebarTab({
      id: "openmanager",
      icon: "om-tab-icon",
      title: "Discovery",
      tooltip: "Open Manager: Node Discovery",
      type: "custom",
      render: renderSidebar,
    });
    addLegacyMenuButton();
    topbarReady = true;
    wireMonitorLink();
    mountTopbar();
    wireRunBar();

    readLegacyUi().catch(() => {});
    migrateEntryMode();

    loadKeys().then(() => migrateKeys()).catch(() => {});

    loadInstalledIndex();
    loadTrustedAuthors();

    applyWindowLook();
    applyTaskbar();
    startDesktop();
    watchGrips();
    patchResize();
    watchJump();
    registerThemes().catch(() => {});
    watchThemeExtras();
    refreshPackThemes().then((updated) => {
      if (!updated.length) return;
      toast(`Updated ${updated.length === 1 ? updated[0] : `${updated.length} themes`} `
        + "from the installed pack.", { kind: "ok" });
    }).catch(() => {});
    repairLinkMode().then((fixed) => {
      if (!fixed) return;
      notify("Link shape put back",
        `An earlier version of Open Manager set ComfyUI's link render mode to ${fixed.from} `
        + `for every theme. It has been set back to ${fixed.to}. To keep ${fixed.from}, set `
        + "it under Settings > Lite Graph > Link Render Mode; this will not change it again.");
    }).catch(() => {});
    const policy = app.extensionManager.setting.get("openManager.autoRenew") ?? "startup";
    const staleDays = app.extensionManager.setting.get("openManager.staleDays") ?? 7;
    api.fetchApi(`${API}/catalog/auto-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, stale_days: staleDays, ...syncOptions() }),
    }).catch(() => {});
  },
});

export { lastMissingTypes, topbarReady };
