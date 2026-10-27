const OWN = new Map();

const TRIES = 40;

const RETRY_MS = 500;

function i18nGlobal() {
  let vue = null;
  try { vue = document.getElementById("vue-app")?.__vue_app__; } catch {}
  const i18n = vue?._context?.provides?.[vue?.__VUE_I18N_SYMBOL__]?.global;
  return typeof i18n?.mergeLocaleMessage === "function" ? i18n : null;
}

function commandKey(id) {
  return String(id).replace(/\./g, "_");
}

function localesOf(i18n) {
  const locale = typeof i18n.locale === "string" ? i18n.locale : i18n.locale?.value;
  return [...new Set(["en", locale].filter(Boolean))];
}

function mergeLabels(i18n, labels) {
  const commands = {};
  for (const [id, label] of labels) commands[commandKey(id)] = { label };
  for (const one of localesOf(i18n)) {
    try { i18n.mergeLocaleMessage(one, { commands }); } catch {}
  }
}

function dropLabels(i18n, ids) {
  for (const one of localesOf(i18n)) {
    try {
      const held = i18n.getLocaleMessage(one)?.commands;
      if (!held) continue;
      for (const id of ids) delete held[commandKey(id)];
    } catch {}
  }
}

function labelOwnCommands(commands, tries = 0) {
  if (!tries) for (const one of commands) OWN.set(one.id, one.label);
  const i18n = i18nGlobal();
  if (i18n) {
    mergeLabels(i18n, OWN);
    return;
  }
  if (tries < TRIES) setTimeout(() => labelOwnCommands(commands, tries + 1), RETRY_MS);
}

function isOwnCommand(id) {
  return OWN.has(id);
}

export { i18nGlobal, commandKey, mergeLabels, dropLabels, labelOwnCommands, isOwnCommand };
