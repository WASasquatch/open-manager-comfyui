import { setKeeping, keepOpenWorkflow } from "../../template-media.mjs";

export default {
  key: "qolTemplateMediaKeep",
  name: "Keep template media in input",
  tooltip: "On: template media files download to input, and those already in temp move there with "
    + "their nodes. Off: they download to temp, which ComfyUI empties when it restarts.",
  defaultValue: false,
  verified: "1.57.4",
  check: () => "",
  on(track) {
    setKeeping(true);
    track(() => setKeeping(false));
    keepOpenWorkflow().catch((error) => {
      console.warn("[Open Manager] Template media: not moved to input", error);
    });
  },
};
