"""Maxine — a natural-language ops agent for the Creality K1 SE.

You talk to it ("how's the print going?", "pause it", "print the benchy"). It uses
Claude tool-use to drive the printer through Moonraker. Every LLM call streams into
PostHog AI observability as a trace, so you can literally watch the agent think.

Named after Max, PostHog's hedgehog. This is the "showing, not telling."
"""

from __future__ import annotations

import json
import os
import uuid

from observability import get_llm_client, get_posthog
from printer import Printer, PrinterError

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
DISTINCT_ID = os.environ.get("DEMO_USER", "tori-superday")

SYSTEM = """You are Maxine, the ops agent for Tori's Creality K1 SE 3D printer.
You control the printer through tools. Be concise and practical, with a little of
PostHog's dry humour. Rules:
- Always check status before acting on an in-progress print.
- Confirm intent in your wording before destructive actions (cancel), but you may
  pause/resume/start directly when asked clearly.
- When asked to print a file, list files first if you're unsure of the exact name,
  then match the closest one.
- Report temps and progress in plain language. Never invent printer state — only
  report what the tools return."""

TOOLS = [
    {"name": "get_printer_status", "description": "Current printer state, temps, file, and progress.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "list_gcode_files", "description": "List recent G-code files available to print.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "start_print", "description": "Start printing a G-code file by its exact path.",
     "input_schema": {"type": "object", "properties": {"filename": {"type": "string"}}, "required": ["filename"]}},
    {"name": "pause_print", "description": "Pause the current print.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "resume_print", "description": "Resume a paused print.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "cancel_print", "description": "Cancel the current print (destructive).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "home_axes", "description": "Home all axes (G28).",
     "input_schema": {"type": "object", "properties": {}}},
]


class Maxine:
    def __init__(self) -> None:
        self.posthog = get_posthog()
        self.llm = get_llm_client(self.posthog)
        self.printer = Printer()

    def _dispatch(self, name: str, args: dict) -> str:
        """Run a tool, and mirror real-world side effects into product analytics."""
        p = self.printer
        try:
            if name == "get_printer_status":
                return p.status().human()
            if name == "list_gcode_files":
                return json.dumps(p.list_files())
            if name == "start_print":
                out = p.start_print(args["filename"])
                self.posthog.capture(DISTINCT_ID, "print_started", {"filename": args["filename"]})
                return out
            if name == "pause_print":
                self.posthog.capture(DISTINCT_ID, "print_paused", {})
                return p.pause_print()
            if name == "resume_print":
                self.posthog.capture(DISTINCT_ID, "print_resumed", {})
                return p.resume_print()
            if name == "cancel_print":
                self.posthog.capture(DISTINCT_ID, "print_cancelled", {})
                return p.cancel_print()
            if name == "home_axes":
                return p.home()
            return f"Unknown tool: {name}"
        except PrinterError as e:
            return f"Printer error: {e}"

    def ask(self, prompt: str) -> str:
        """One natural-language command -> one PostHog trace."""
        trace_id = str(uuid.uuid4())
        messages = [{"role": "user", "content": prompt}]

        for _ in range(8):  # cap tool-use rounds
            resp = self.llm.messages.create(
                model=MODEL,
                max_tokens=1024,
                system=SYSTEM,
                tools=TOOLS,
                messages=messages,
                posthog_distinct_id=DISTINCT_ID,
                posthog_trace_id=trace_id,
                posthog_properties={"surface": "k1se-agent", "command": prompt, "printer": "Creality K1 SE"},
            )
            messages.append({"role": "assistant", "content": resp.content})

            if resp.stop_reason != "tool_use":
                return "".join(b.text for b in resp.content if b.type == "text").strip()

            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    output = self._dispatch(block.name, block.input or {})
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": output})
            messages.append({"role": "user", "content": results})

        return "Stopped after too many tool-use rounds. Check the trace in PostHog."

    def shutdown(self) -> None:
        self.posthog.flush()
