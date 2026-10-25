import { claim, ready, later, readSetting, writeSetting } from "./media/hold.mjs";

const ASK = "openManager.qolTemplateMediaAsk";

const CHOICE = "openManager.qolTemplateMediaDownloads";

export default {
  key: "qolTemplateMediaDownloads",
  name: "Template media downloads",
  tooltip: "Always: ComfyUI downloads a template's media files as it opens. Ask: offered once the "
    + "template is open. Never: left to the Download Manager.",
  options: ["Always", "Ask", "Never"],
  defaultValue: "Ask",
  verified: "1.57.3",
  check: ready,
  on(track, standDown, choice) {
    if (choice === "Never") track(claim("never", standDown));
    later(() => {
      const ask = readSetting(ASK);
      if (readSetting(CHOICE) === choice && ask !== undefined && ask !== (choice === "Ask")) {
        writeSetting(ASK, choice === "Ask");
      }
    });
    track(() => later(() => {
      if (readSetting(CHOICE) === "Always" && readSetting(ASK) === true) writeSetting(ASK, false);
    }));
  },
};
