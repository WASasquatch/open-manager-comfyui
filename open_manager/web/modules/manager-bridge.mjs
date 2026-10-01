import { api } from "../../../scripts/api.js";
import { API } from "./base.mjs";
import { install, installFromRepo, loadInstalledIndex, foldId } from "./installs.mjs";
import { packQuery } from "./registry.mjs";

const BRIDGE_CLASS = "om-bridge";

let bridging = 0;

function answerTask(uiId, stage, outcome = {}) {
  return api.fetchApi(`${API}/manager/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ui_id: uiId, stage, ...outcome }),
  }).catch(() => null);
}

async function stillInstalled(packId) {
  try {
    const held = await (await api.fetchApi("/v2/customnode/installed")).json();
    const want = foldId(packId);
    return Object.values(held || {}).some((one) =>
      foldId(one?.cnr_id || "") === want || foldId(one?.aux_id || "") === want);
  } catch {
    return true;
  }
}

async function settled(result, name, packId) {
  if (result === false) return { status: "error", messages: [`${name} was not installed.`] };
  if (!result?.ok) {
    return { status: "error", messages: [result?.reason || `${name} did not install.`] };
  }
  if (result.pip_ran && !result.pip_ok) {
    return {
      status: "error",
      messages: [`${name} is in place but its requirements did not install.`,
                 ...(result.pip_errors || []).slice(0, 8)],
    };
  }
  if (packId && !(await stillInstalled(packId))) {
    return { status: "error", messages: [`${name} was removed after its scan.`] };
  }
  return { status: "success", messages: [`Installed ${name}.`] };
}

async function readPack(packId) {
  const answer = await api.fetchApi(`${API}/pack/${encodeURIComponent(packId)}?${packQuery()}`);
  const data = await answer.json();
  if (!answer.ok) throw new Error(data.detail || `${packId} could not be read from the registry.`);
  return data;
}

async function registryRun(job) {
  const data = await readPack(job.id);
  const exact = /^\d/.test(job.version || "") && !job.update;
  const wanted = exact ? job.version
    : (data.resolution?.newest || data.resolution?.latest_active);
  const entry = (data.versions || []).find((one) => one.version === wanted);
  const name = data.pack?.name || job.id;
  if (!entry) return { status: "error", messages: [`No installable version of ${name} was found.`] };
  return new Promise((resolve) => {
    install({
      packId: job.id,
      entry: { ...entry, name },
      control: null,
      rowsRoot: null,
      overwrite: !!job.installed,
      installedVersion: job.installed_version || "",
      onDone: async (result) => resolve(await settled(result, name, job.id)),
    }).then(async (went) => {
      if (!went) resolve(await settled(false, name, ""));
    }).catch((error) => resolve({ status: "error", messages: [error.message || String(error)] }));
  });
}

async function repoRun(job) {
  let repo = String(job.repository || "").trim();
  if (!repo && job.id.includes("/")) repo = `https://github.com/${job.id}`;
  if (!repo) repo = String((await readPack(job.id)).pack?.repository || "").trim();
  if (!repo) return { status: "error", messages: [`${job.id} has no repository to install from.`] };
  const title = job.id.includes("/") ? job.id.split("/").pop() : job.id;
  const result = await installFromRepo({ repo, title, overwrite: !!job.installed }, null);
  return settled(result, title, "");
}

async function runTask(job) {
  bridging += 1;
  document.body.classList.add(BRIDGE_CLASS);
  try {
    return job.source === "github" ? await repoRun(job) : await registryRun(job);
  } catch (error) {
    return { status: "error", messages: [error.message || String(error)] };
  } finally {
    bridging -= 1;
    if (!bridging) document.body.classList.remove(BRIDGE_CLASS);
  }
}

function watchManagerBridge() {
  api.addEventListener("om-manager-run", async (event) => {
    const job = event.detail || {};
    if (!job.ui_id || !job.id) return;
    await answerTask(job.ui_id, "ack");
    const outcome = await runTask(job);
    await answerTask(job.ui_id, "done", outcome);
    loadInstalledIndex();
  });
}

export { watchManagerBridge };
