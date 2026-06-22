"""CLI for Maxine.

  python main.py                      # interactive REPL
  python main.py --once "pause it"    # single command, then exit
  python main.py --status             # just print printer status
"""

from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

load_dotenv()

from agent import Maxine  # noqa: E402  (load_dotenv must run first)
from printer import Printer, PrinterError  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Maxine — natural-language ops for the K1 SE")
    ap.add_argument("--once", metavar="CMD", help="run a single command and exit")
    ap.add_argument("--status", action="store_true", help="print raw printer status and exit")
    args = ap.parse_args()

    if args.status:
        try:
            print(Printer().status().human())
            return 0
        except PrinterError as e:
            print(f"Could not reach printer: {e}", file=sys.stderr)
            return 1

    maxine = Maxine()
    try:
        if args.once:
            print(maxine.ask(args.once))
            return 0

        print("Maxine online. Talk to your printer. Ctrl-C to quit.\n")
        while True:
            try:
                cmd = input("you > ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0
            if not cmd:
                continue
            print(f"maxine > {maxine.ask(cmd)}\n")
    finally:
        maxine.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
