#!/usr/bin/env python3
"""Ask for the OpenRouter API key (no echo), validate it with a real call, and store it in .env.

Run it in a real terminal:   python3 scripts/set_openrouter_key.py

The key is never printed, logged or passed on a command line. It is written only to .env, which is
git-ignored; the script refuses to write if .env is not ignored.
"""
from __future__ import annotations

import getpass
import json
import os
import stat
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
VAR = "OPENROUTER_API_KEY"
CHECK_URL = "https://openrouter.ai/api/v1/auth/key"


def validate(key: str) -> tuple[bool, str]:
    """A real authenticated call. Returns (ok, a short description that never contains the key)."""
    req = urllib.request.Request(CHECK_URL, headers={"Authorization": f"Bearer {key}", "User-Agent": "Tabayyun/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.load(resp).get("data", {})
    except urllib.error.HTTPError as e:
        return False, f"OpenRouter rejected the key (HTTP {e.code})."
    except (urllib.error.URLError, TimeoutError) as e:
        return False, f"could not reach OpenRouter ({type(e).__name__})."
    limit = data.get("limit")
    remaining = data.get("limit_remaining")
    parts = [f"usage so far ${data.get('usage', 0):.4f}"]
    parts.append("no credit limit set on the key" if limit is None else f"limit ${limit:.2f}, remaining ${remaining if remaining is not None else 0:.2f}")
    if data.get("is_free_tier"):
        parts.append("free tier (no credits purchased)")
    return True, "; ".join(parts)


def env_is_ignored() -> bool:
    return subprocess.run(["git", "-C", str(ROOT), "check-ignore", "-q", ".env"]).returncode == 0


def write_env(key: str) -> None:
    template = ROOT / ".env.example"  # a first run starts from the documented template (models included)
    lines = (ENV if ENV.exists() else template).read_text(encoding="utf-8").splitlines() if (ENV.exists() or template.exists()) else []
    out, done = [], False
    for line in lines:
        if line.strip().startswith(f"{VAR}="):
            out.append(f"{VAR}={key}")
            done = True
        else:
            out.append(line)
    if not done:
        out.append(f"{VAR}={key}")
    fd = os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    os.chmod(ENV, stat.S_IRUSR | stat.S_IWUSR)


def main() -> int:
    if not sys.stdin.isatty():
        print("This needs a real terminal so the key is not echoed. Open a terminal and run:\n"
              f"  cd {ROOT} && python3 scripts/set_openrouter_key.py", file=sys.stderr)
        return 2
    if not env_is_ignored():
        print(".env is not git-ignored in this repository — refusing to write a secret into it.", file=sys.stderr)
        return 3
    for _attempt in range(3):
        key = getpass.getpass("Paste your OpenRouter API key: ").strip()
        if not key:
            print("Nothing was entered.")
            continue
        ok, info = validate(key)
        if ok:
            write_env(key)
            print(f"Key accepted ({info}). Saved to .env as {VAR} (file mode 600, git-ignored).")
            return 0
        print(f"Not saved: {info} Try again.")
    print("No valid key after three attempts.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
