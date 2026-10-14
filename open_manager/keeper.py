"""Restart ComfyUI from a process of its own, for when ComfyUI no longer answers."""

from __future__ import annotations

import base64
import hmac
import json
import os
import runpy
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TOKEN = "OPEN_MANAGER_KEEPER_TOKEN"

REASON = "ComfyUI stopped answering"

_wake = threading.Event()

_asked = {"restart": False}


class _Server(ThreadingHTTPServer):
    allow_reuse_address = os.name != "nt"
    daemon_threads = True
    token = ""


class _Handler(BaseHTTPRequestHandler):
    def _reply(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        try:
            length = max(0, min(int(self.headers.get("Content-Length") or 0), 512))
        except ValueError:
            length = 0
        given = self.rfile.read(length).decode("utf-8", "replace").strip().encode("utf-8")
        if self.path != "/restart" or not hmac.compare_digest(
                given, self.server.token.encode("utf-8")):
            self._reply(403, {"ok": False, "reason": "refused"})
            return
        self._reply(200, {"ok": True, "reason": ""})
        _asked["restart"] = True
        _wake.set()

    def log_message(self, *_args) -> None:
        pass


def _wait_parent(config: dict) -> None:
    """Return once ComfyUI's process has ended or replaced itself."""
    if os.name == "nt":
        import ctypes

        kernel = ctypes.windll.kernel32
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        handle = kernel.OpenProcess(0x00100000, False, int(config["pid"]))
        if handle:
            kernel.WaitForSingleObject(handle, 0xFFFFFFFF)
    else:
        try:
            while os.read(int(config["fd"]), 1):
                pass
        except OSError:
            pass
    _wake.set()


def _save_queue(config: dict) -> None:
    """Write the queue ComfyUI last kept where its next start queues it again."""
    folder = Path(config["jobs"])
    try:
        index = json.loads(Path(config["index"]).read_text("utf-8"))
    except (OSError, ValueError):
        index = []
    jobs = []
    for entry in index if isinstance(index, list) else []:
        try:
            key, stalled = entry
            if not str(key).isalnum():
                continue
            job = json.loads((folder / f"{key}.json").read_text("utf-8"))
            job["stalled"] = bool(stalled)
        except (OSError, ValueError, TypeError):
            continue
        jobs.append(job)
    Path(config["requeue"]).write_text(
        json.dumps({"at": time.time(), "reason": REASON, "jobs": jobs}), "utf-8")


def _restart(config: dict) -> None:
    """Save the queue, end ComfyUI and start it again."""
    try:
        _save_queue(config)
    except OSError:
        pass
    session = os.environ.get("__COMFY_CLI_SESSION__")
    if session:
        try:
            open(session + ".reboot", "w").close()
        except OSError:
            pass
        try:
            os.kill(int(config["pid"]), 9)
        except OSError:
            pass
        return
    sys.argv = [config["helper"], str(config["pid"]), config["cwd"], config["command"], "0",
                config["log"]]
    runpy.run_path(config["helper"], run_name="__main__")


def main() -> None:
    config = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
    token = os.environ.pop(TOKEN, "")
    if not token:
        return
    server = _Server(("127.0.0.1", int(config["port"])), _Handler)
    server.token = token
    threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Thread(target=_wait_parent, args=(config,), daemon=True).start()
    _wake.wait()
    if _asked["restart"]:
        _restart(config)


if __name__ == "__main__":
    main()
