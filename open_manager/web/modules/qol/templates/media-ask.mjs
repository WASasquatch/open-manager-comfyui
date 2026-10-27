import { claim, ready, later, readSetting, writeSetting } from "./media/hold.mjs";
import { whenSwitchedOff } from "../shared.mjs";

const KEY = "qolTemplateMediaAsk";

const CHOICE = "openManager.qolTemplateMediaDownloads";

export default {
  key: "qolTemplateMediaAsk",
  name: "Ask before downloading template media",
  tooltip: "Opening a template offers the media files it is missing in place of downloading them.",
  defaultValue: true,
  verified: "1.57.4",
  check: ready,
  on(track, standDown) {
    track(claim("ask", standDown));
    later(() => {
      const choice = readSetting(CHOICE);
      if (choice !== undefined && choice !== "Ask") writeSetting(CHOICE, "Ask");
    });
    track(() => whenSwitchedOff(KEY, () => {
      if (readSetting(CHOICE) === "Ask") writeSetting(CHOICE, "Always");
    }));
  },
};
