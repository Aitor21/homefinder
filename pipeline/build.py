"""HomeFinder pipeline orchestrator.

    python pipeline/build.py                 run every stage that has no output yet
    python pipeline/build.py --force         rerun everything (network cache still applies)
    python pipeline/build.py --stage climate run one stage
    python pipeline/build.py --list          show stage status

Everything is cached under pipeline/cache/, so reruns are cheap and interrupting
a run is safe. Deleting pipeline/data/<stage>.json forces just that stage.
"""
from __future__ import annotations

import argparse
import importlib
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "stages"))

import common as c  # noqa: E402

# Order matters: prices needs climate, access and terrain; emit needs everything.
STAGES = [
    ("places", "stages.places"),
    ("worldclim", "stages.worldclim"),
    ("climate", "stages.climate"),
    ("access", "stages.access"),
    ("amenities", "stages.amenities"),
    ("terrain", "stages.terrain"),
    ("prices", "stages.prices"),
    ("airquality", "stages.airquality"),
    ("internet", "stages.internet"),
    ("costs", "stages.costs"),
    ("emit", "emit"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", help="run only this stage")
    ap.add_argument("--force", action="store_true", help="rerun stages that already have output")
    ap.add_argument("--list", action="store_true", help="show which stages have run")
    args = ap.parse_args()

    if args.list:
        for name, _ in STAGES:
            if name == "emit":
                done = (c.WEB_DATA / "towns.json").exists()
            else:
                done = c.stage_exists(name)
            print(f"  [{'x' if done else ' '}] {name}")
        return

    todo = [s for s in STAGES if not args.stage or s[0] == args.stage]
    if args.stage and not todo:
        raise SystemExit(f"unknown stage '{args.stage}'. Known: {', '.join(s for s, _ in STAGES)}")

    for name, module in todo:
        already = c.stage_exists(name) if name != "emit" else (c.WEB_DATA / "towns.json").exists()
        if already and not args.force and not args.stage:
            c.log(f"skip {name} (already built; --force to redo)")
            continue
        c.log(f"=== {name} ===")
        try:
            importlib.import_module(module).run()
        except Exception:
            traceback.print_exc()
            raise SystemExit(f"stage '{name}' failed")

    c.log("pipeline complete")


if __name__ == "__main__":
    main()
