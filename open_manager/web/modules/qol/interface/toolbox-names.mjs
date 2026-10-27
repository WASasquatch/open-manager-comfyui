import { piniaStores } from "../shared.mjs";
import { i18nGlobal, commandKey, mergeLabels, dropLabels, isOwnCommand } from "../../command-labels.mjs";

const MESSAGE_SYNTAX = /[{}@|]/;

const REGISTERS = new Set(["registerCommand", "registerCommands"]);

function textOf(value) {
  try {
    return String((typeof value === "function" ? value() : value) || "").trim();
  } catch {
    return "";
  }
}

export default {
  key: "qolToolboxNames",
  name: "Extension toolbox buttons show their names",
  tooltip: "ComfyUI names a selection toolbox button only from a translation file, so a button "
    + "an extension adds shows no name on hover. On, it shows the name the extension gave it.",
  issues: [],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    if (!i18nGlobal()) return "ComfyUI's translations changed";
    if (typeof piniaStores()?.get("command")?.$onAction !== "function") return "ComfyUI's command store changed";
    return "";
  },
  on(track) {
    const i18n = i18nGlobal();
    const store = piniaStores().get("command");
    const added = new Set();
    const fill = () => {
      const missing = new Map();
      for (const command of store.commands || []) {
        const id = command?.id;
        if (!id || added.has(id) || isOwnCommand(id)) continue;
        if (i18n.te(`commands.${commandKey(id)}.label`)) continue;
        const label = textOf(command.label) || textOf(command.tooltip);
        if (label && !MESSAGE_SYNTAX.test(label)) missing.set(id, label);
      }
      if (!missing.size) return;
      mergeLabels(i18n, missing);
      for (const id of missing.keys()) added.add(id);
    };
    fill();
    const stop = store.$onAction(({ name, after }) => {
      if (REGISTERS.has(name)) after(fill);
    });
    track(() => {
      stop();
      dropLabels(i18n, added);
      added.clear();
    });
  },
};
