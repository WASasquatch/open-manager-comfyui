import { floatingPanel } from "./windows.mjs";

const PROGRAM = "registry-report";

const REPORTED = new Set(["flagged", "banned"]);

function reportable(status) {
  return REPORTED.has(String(status || "").toLowerCase());
}

function keepAbove(panel, modal) {
  panel.el.classList.add("om-float-over");
  const watch = new MutationObserver(() => {
    if (modal.isConnected && panel.el.isConnected) return;
    panel.el.classList.remove("om-float-over");
    watch.disconnect();
  });
  watch.observe(document.body, { childList: true });
}

async function openRegistryReport(pack, version, from = null) {
  const { runProgramById } = await import("./programs.mjs");
  await runProgramById(PROGRAM, { pack, version });
  const modal = from?.closest?.(".om-backdrop");
  const panel = floatingPanel(`${PROGRAM}:main`);
  if (modal && panel?.el && !panel.el.classList.contains("om-float-over")) keepAbove(panel, modal);
}

function linkReport(node, status, pack, version) {
  if (!node || !pack || !reportable(status)) return node;
  node.classList.add("om-report-link");
  node.setAttribute("role", "button");
  node.tabIndex = 0;
  const open = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openRegistryReport(pack, version, node).catch((error) => {
      console.warn("[Open Manager] Registry Report did not open", error);
    });
  };
  node.addEventListener("click", open);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") open(event);
  });
  return node;
}

export { reportable, openRegistryReport, linkReport };
