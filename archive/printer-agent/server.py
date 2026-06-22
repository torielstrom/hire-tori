"""Tiny HTTP bridge so the website and the ESP32 button can talk to Maxine.

  python server.py            # serves on :8787

Endpoints:
  GET  /status          -> printer status JSON
  POST /command {text}  -> Maxine runs the command, returns {reply, trace}
  POST /hire            -> the ESP32 "Hire Me" button hits this (fires a PostHog
                          event + asks Maxine to print the hire-me token)
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify, request  # noqa: E402
from flask_cors import CORS  # noqa: E402

from agent import DISTINCT_ID, Maxine  # noqa: E402
from printer import PrinterError  # noqa: E402

app = Flask(__name__)
CORS(app)
maxine = Maxine()


@app.get("/status")
def status():
    try:
        return jsonify(vars(maxine.printer.status()))
    except PrinterError as e:
        return jsonify({"error": str(e)}), 502


@app.post("/command")
def command():
    text = (request.get_json(silent=True) or {}).get("text", "").strip()
    if not text:
        return jsonify({"error": "missing 'text'"}), 400
    return jsonify({"reply": maxine.ask(text)})


@app.post("/hire")
def hire():
    """The big red button. Press -> PostHog event -> Maxine reacts."""
    source = (request.get_json(silent=True) or {}).get("source", "esp32-button")
    maxine.posthog.capture(DISTINCT_ID, "hire_button_pressed", {"source": source})
    reply = maxine.ask("Someone just pressed the Hire Tori button. Check the printer "
                       "status and tell them, with a bit of flair, whether it's ready to print.")
    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8787")))
