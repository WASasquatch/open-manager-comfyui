"""Runs the requirement installs queued for this start, before custom nodes load."""

from __future__ import annotations

import importlib
import importlib.util
import logging
import os
import sys


def _pending():
    try:
        return importlib.import_module("open_manager.pending")
    except ImportError:
        pass
    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "open_manager")
    name = "_open_manager_held_installs"
    spec = importlib.util.spec_from_file_location(
        name, os.path.join(folder, "__init__.py"), submodule_search_locations=[folder]
    )
    if spec is None or spec.loader is None:
        return None
    package = importlib.util.module_from_spec(spec)
    sys.modules[name] = package
    spec.loader.exec_module(package)
    return importlib.import_module(f"{name}.pending")


try:
    held = _pending()
    if held is not None:
        held.run_queued()
except Exception as error:
    logging.warning("[Open Manager] held installs not run (%s: %s)", type(error).__name__, error)
