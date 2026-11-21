#!/usr/bin/env python3
"""Start the Living World orchestrator with the Kenari credential attached.

Mirrors the sanctioned custom.kenari pattern (see bin/run-agent.py in that
connector): fetches only the hsurr: surrogate from the Secure Vault
connection and passes it to the orchestrator process as KENARI_API_KEY.
Muse swaps in the real key on egress to kenari.id. The surrogate is never
printed or logged, and the real key never exists in this repo.

Usage: python3 run.py
"""
import os, subprocess, sys
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import dynamic_credential_entry

HERE = os.path.dirname(os.path.abspath(__file__))
BUN = "/opt/hatch-image/bin/bun"


def main():
    entry = dynamic_credential_entry("custom.kenari")
    env = dict(os.environ)
    env["KENARI_API_KEY"] = str(entry["surrogate"]).strip()
    proc = subprocess.run([BUN, "run", "src/index.ts"], env=env, cwd=HERE)
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
