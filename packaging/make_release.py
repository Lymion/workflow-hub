"""Prepare a GitHub release for the auto-updater.

    python packaging/make_release.py <version> <setup.exe> <out_dir>

Writes into out_dir:
- Workflow-Hub_<version>_x64-setup.exe  (no spaces: GitHub renames spaces in asset names)
- latest.json   (what the app checks: version, notes, signed download link)
- notes.md      (this version's section of CHANGELOG.md, for the release page)
The setup.exe's signature (<setup.exe>.sig) comes from the Tauri build, signed
with the TAURI_SIGNING_PRIVATE_KEY secret.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "Lymion/workflow-hub"


def changelog_notes(version: str, text: str | None = None) -> str:
    text = text if text is not None else (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    m = re.search(rf"^## {re.escape(version)}\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
    if not m or not m.group(1).strip():
        raise SystemExit(f"CHANGELOG.md has no section '## {version}'. Add what this version changes, then tag again.")
    return m.group(1).strip()


def latest_json(version: str, signature: str, asset: str, notes: str, now: datetime | None = None) -> dict:
    return {
        "version": version,
        "notes": notes,
        "pub_date": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {"windows-x86_64": {"signature": signature.strip(), "url": f"https://github.com/{REPO}/releases/download/v{version}/{asset}"}},
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    version, setup, out = argv[0].lstrip("v"), Path(argv[1]), Path(argv[2])
    sig = Path(str(setup) + ".sig")
    if not sig.is_file():
        raise SystemExit(f"{sig.name} is missing: the build wasn't signed. Add the TAURI_SIGNING_PRIVATE_KEY secret in the repository settings.")
    out.mkdir(parents=True, exist_ok=True)
    asset = f"Workflow-Hub_{version}_x64-setup.exe"
    shutil.copy2(setup, out / asset)
    notes = changelog_notes(version)
    (out / "latest.json").write_text(json.dumps(latest_json(version, sig.read_text(encoding="utf-8"), asset, notes), indent=2), encoding="utf-8")
    (out / "notes.md").write_text(notes + "\n\nTo install: download the setup file below and run it. If Workflow Hub is already installed (0.3.0 or later), it offers this update by itself.\n", encoding="utf-8")
    print(f"Release files for {version} in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
