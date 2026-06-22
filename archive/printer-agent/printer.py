"""Moonraker client for the Creality K1 SE.

The K1 SE runs Klipper + Moonraker. Moonraker exposes a JSON HTTP API on
http://<printer-ip>:7125 over the local network. If your K1 was never opened up,
run the Creality Helper Script (github.com/Guilouz/Creality-Helper-Script) once to
enable Moonraker/Fluidd on the LAN. Most LAN clients are "trusted" so no API key is
needed; set MOONRAKER_API_KEY only if yours requires one.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import requests


class PrinterError(RuntimeError):
    """Raised when Moonraker returns an error or is unreachable."""


@dataclass
class PrinterStatus:
    state: str  # "standby" | "printing" | "paused" | "complete" | "error" | ...
    filename: str | None
    progress_pct: float  # 0-100
    nozzle_temp: float
    nozzle_target: float
    bed_temp: float
    bed_target: float
    message: str | None

    def human(self) -> str:
        bits = [f"state={self.state}"]
        if self.filename:
            bits.append(f"file={self.filename} ({self.progress_pct:.0f}%)")
        bits.append(f"nozzle={self.nozzle_temp:.0f}/{self.nozzle_target:.0f}C")
        bits.append(f"bed={self.bed_temp:.0f}/{self.bed_target:.0f}C")
        if self.message:
            bits.append(f"msg={self.message}")
        return ", ".join(bits)


class Printer:
    def __init__(self, host: str | None = None, api_key: str | None = None, timeout: float = 8.0):
        host = host or os.environ.get("PRINTER_IP")
        if not host:
            raise PrinterError("PRINTER_IP not set (e.g. 192.168.1.42 or 192.168.1.42:7125)")
        if ":" not in host:
            host = f"{host}:7125"
        self.base = f"http://{host}"
        self.timeout = timeout
        self.session = requests.Session()
        key = api_key or os.environ.get("MOONRAKER_API_KEY")
        if key:
            self.session.headers["X-Api-Key"] = key

    # --- low level -------------------------------------------------------
    def _get(self, path: str, **params: Any) -> dict:
        try:
            r = self.session.get(f"{self.base}{path}", params=params, timeout=self.timeout)
            r.raise_for_status()
            return r.json().get("result", {})
        except requests.RequestException as e:
            raise PrinterError(f"GET {path} failed: {e}") from e

    def _post(self, path: str, **params: Any) -> dict:
        try:
            r = self.session.post(f"{self.base}{path}", params=params, timeout=self.timeout)
            r.raise_for_status()
            return r.json().get("result", {})
        except requests.RequestException as e:
            raise PrinterError(f"POST {path} failed: {e}") from e

    # --- high level (these map 1:1 to the agent's tools) -----------------
    def is_alive(self) -> bool:
        try:
            self._get("/server/info")
            return True
        except PrinterError:
            return False

    def status(self) -> PrinterStatus:
        objs = "print_stats&heater_bed&extruder&display_status&virtual_sdcard"
        data = self._get(f"/printer/objects/query?{objs}").get("status", {})
        ps = data.get("print_stats", {})
        bed = data.get("heater_bed", {})
        noz = data.get("extruder", {})
        disp = data.get("display_status", {})
        sd = data.get("virtual_sdcard", {})
        progress = float(disp.get("progress", sd.get("progress", 0.0)) or 0.0) * 100
        return PrinterStatus(
            state=ps.get("state", "unknown"),
            filename=ps.get("filename") or None,
            progress_pct=progress,
            nozzle_temp=float(noz.get("temperature", 0.0)),
            nozzle_target=float(noz.get("target", 0.0)),
            bed_temp=float(bed.get("temperature", 0.0)),
            bed_target=float(bed.get("target", 0.0)),
            message=disp.get("message") or None,
        )

    def list_files(self, limit: int = 25) -> list[dict]:
        files = self._get("/server/files/list", root="gcodes")
        rows = files if isinstance(files, list) else []
        rows.sort(key=lambda f: f.get("modified", 0), reverse=True)
        return [{"path": f.get("path"), "size": f.get("size")} for f in rows[:limit]]

    def start_print(self, filename: str) -> str:
        self._post("/printer/print/start", filename=filename)
        return f"Started print: {filename}"

    def pause_print(self) -> str:
        self._post("/printer/print/pause")
        return "Print paused."

    def resume_print(self) -> str:
        self._post("/printer/print/resume")
        return "Print resumed."

    def cancel_print(self) -> str:
        self._post("/printer/print/cancel")
        return "Print cancelled."

    def home(self) -> str:
        self._post("/printer/gcode/script", script="G28")
        return "Homing all axes (G28)."

    def run_gcode(self, script: str) -> str:
        self._post("/printer/gcode/script", script=script)
        return f"Ran G-code: {script}"
