import { app } from "../../../../scripts/app.js";

function piniaStores() {
  return document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia?._s
    || null;
}

function whenSwitchedOff(key, then) {
  setTimeout(() => {
    try {
      if (app.extensionManager?.setting?.get?.(`openManager.${key}`) === false) then();
    } catch {}
  }, 0);
}

export { piniaStores, whenSwitchedOff };
