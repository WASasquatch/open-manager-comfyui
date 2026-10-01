import { app } from "../../../scripts/app.js";
import { panelSetting } from "./settings.mjs";

const SIDES = ["Top", "Bottom", "Left", "Right"];

const ALIGN_COMMAND = "openmanager.alignGroups";

const ALIGN_LABEL = "Align Selected Groups To";

let lastPress = null;

function groupAlignOn() {
  return panelSetting("openManager.groupAlign", true) !== false;
}

function isGroup(item) {
  const Group = window.LiteGraph?.LGraphGroup;
  return !!Group && item instanceof Group;
}

function selectedGroups(canvas) {
  return [...(canvas?.selectedItems || [])].filter(isGroup);
}

function carried(groups) {
  const inside = new Set();
  const walk = (group) => {
    for (const child of group._children || []) {
      if (inside.has(child)) continue;
      inside.add(child);
      if (isGroup(child)) walk(child);
    }
  };
  for (const group of groups) walk(group);
  return inside;
}

function edges(group) {
  const [x, y, w, h] = group.boundingRect;
  return { left: x, top: y, right: x + w, bottom: y + h };
}

function shift(group, dx, dy, moved) {
  if (moved.has(group) || group.pinned) return;
  moved.add(group);
  group.move(dx, dy, true);
  for (const child of group._children || []) {
    if (isGroup(child)) {
      shift(child, dx, dy, moved);
    } else if (!moved.has(child)) {
      moved.add(child);
      child.move?.(dx, dy);
    }
  }
}

function alignGroups(canvas, side) {
  const chosen = selectedGroups(canvas);
  for (const group of chosen) group.recomputeInsideNodes();
  const inside = carried(chosen);
  const groups = chosen.filter((group) => !inside.has(group));
  if (groups.length < 2) return;
  const all = groups.map(edges);
  const target = side === "left" || side === "top"
    ? Math.min(...all.map((one) => one[side]))
    : Math.max(...all.map((one) => one[side]));
  const moved = new Set();
  canvas.graph?.beforeChange?.();
  groups.forEach((group, index) => {
    const delta = target - all[index][side];
    if (!delta) return;
    if (side === "left" || side === "right") shift(group, delta, 0, moved);
    else shift(group, 0, delta, moved);
  });
  canvas.graph?.afterChange?.();
  canvas.setDirty(true, true);
}

function sideOptions(canvas) {
  return SIDES.map((side) => ({
    content: side,
    callback: () => alignGroups(canvas, side.toLowerCase()),
  }));
}

function groupAlignMenuItems(canvas) {
  if (!groupAlignOn() || selectedGroups(canvas).length < 2) return [];
  return [
    null,
    { content: ALIGN_LABEL, has_submenu: true, submenu: { options: sideOptions(canvas) } },
  ];
}

function openAlignMenu() {
  const canvas = app.canvas;
  if (!canvas || selectedGroups(canvas).length < 2) return;
  const at = lastPress || { clientX: innerWidth / 2, clientY: innerHeight / 3 };
  const event = new MouseEvent("contextmenu", { clientX: at.clientX, clientY: at.clientY });
  new window.LiteGraph.ContextMenu(sideOptions(canvas), { event, title: ALIGN_LABEL });
}

const alignCommand = {
  id: ALIGN_COMMAND,
  label: ALIGN_LABEL,
  icon: "icon-[lucide--align-start-horizontal]",
  function: openAlignMenu,
};

function alignToolboxCommands(item) {
  if (!groupAlignOn() || !isGroup(item)) return [];
  return selectedGroups(app.canvas).length >= 2 ? [ALIGN_COMMAND] : [];
}

function watchAlignPress() {
  window.addEventListener("pointerdown", (event) => {
    lastPress = { clientX: event.clientX, clientY: event.clientY };
  }, true);
}

export { groupAlignMenuItems, alignGroups, alignCommand, alignToolboxCommands, watchAlignPress };
