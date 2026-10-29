const PANEL = "graph-canvas-panel";

const BOUNDS = ".pointer-events-none.absolute.inset-0:empty";

const BOX = '[data-testid="selection-rectangle"]';

const LOOK_EVERY = 500;

const LOOKS = 240;

const FULL_CSS = `
#${PANEL} > ${BOUNDS} {
  position: fixed;
}
${BOX} {
  z-index: 1;
}`;

function hostClips() {
  const panel = document.getElementById(PANEL);
  if (!panel) return null;
  return !!panel.querySelector(`:scope > ${BOUNDS}`);
}

export default {
  key: "qolSelectionBoxInFull",
  name: "Selection box covers the whole drag",
  tooltip: "ComfyUI cuts the box dragged to select nodes off at the bottom of the panels above "
    + "the canvas, so with the job queue open it shows as a line under the selection. On, it "
    + "covers the whole drag and passes under the panels.",
  issues: ["Comfy-Org/ComfyUI_frontend#19102"],
  defaultValue: true,
  verified: "1.57.4",
  check() {
    return "";
  },
  on(track, standDown) {
    const tag = document.createElement("style");
    tag.id = "om-qol-selection-box-in-full";
    tag.textContent = FULL_CSS;
    document.head.appendChild(tag);
    let looks = 0;
    let timer = 0;
    const look = () => {
      timer = 0;
      const clips = hostClips();
      if (clips === false) {
        standDown("ComfyUI draws the selection box in full itself");
        return;
      }
      looks += 1;
      if (clips === null && looks < LOOKS) timer = setTimeout(look, LOOK_EVERY);
    };
    look();
    track(() => {
      clearTimeout(timer);
      tag.remove();
    });
  },
};
