"""G-code parser for FDM 3D-printer files.

Single-pass, state-preserving parser that tracks modal G-code state
(G90/G91 for XYZ, M82/M83 for E, current feedrate) and computes:
- axis bounds (min/max for X, Y, Z) and print size
- travel vs. extrusion distance
- total filament length consumed (sum of positive dE)
- estimated print time (sum of dist / feedrate, no acceleration model)
- layer count (preferred: slicer ;LAYER:/;LAYER_COUNT: comments;
  fallback: unique Z values at which extrusion occurred)
"""

from __future__ import annotations

import math
import re
from typing import Iterable

_TOKEN_RE = re.compile(r"([XYZEFxyzef])(-?\d+(?:\.\d+)?)")
_LAYER_COUNT_RE = re.compile(r";\s*LAYER_COUNT\s*:\s*(\d+)", re.IGNORECASE)
_LAYER_RE = re.compile(r";\s*LAYER\s*:\s*(-?\d+)", re.IGNORECASE)

# Default filament assumptions for mass estimation.
# 1.75 mm filament + PLA (~1.24 g/cm^3) is the most common FDM combo.
DEFAULT_FILAMENT_DIAMETER_MM = 1.75
DEFAULT_FILAMENT_DENSITY_G_CM3 = 1.24


def _typical_layer_height(zs: list[float]) -> float | None:
    """Median of consecutive differences (robust to first-layer offsets)."""
    if len(zs) < 2:
        return None
    diffs = [round(b - a, 4) for a, b in zip(zs, zs[1:]) if b - a > 1e-4]
    if not diffs:
        return None
    diffs.sort()
    return diffs[len(diffs) // 2]


def analyze(
    lines: Iterable[str],
    filament_diameter_mm: float = DEFAULT_FILAMENT_DIAMETER_MM,
    filament_density_g_cm3: float = DEFAULT_FILAMENT_DENSITY_G_CM3,
) -> dict:
    # Modal state.
    x = y = z = e = 0.0
    e_high_water = 0.0  # max E seen since last G92 E... (for absolute-mode filament accounting)
    feed = 0.0  # mm/min
    abs_xyz = True
    abs_e = True
    last_cmd: str | None = None  # for modal G0/G1 (rarely used without explicit code)

    inf = float("inf")
    # Motion bounds: any XYZ move (homing, probing, prime line, wipe, ...).
    min_x = min_y = min_z = inf
    max_x = max_y = max_z = -inf
    # Print bounds: only moves with active extrusion - represent the model envelope.
    min_px = min_py = min_pz = inf
    max_px = max_py = max_pz = -inf

    travel_dist = 0.0
    print_dist = 0.0
    filament_mm = 0.0
    time_s = 0.0

    extrusion_zs: set[float] = set()
    slicer_layer_count: int | None = None
    slicer_layer_indices: set[int] = set()

    line_count = 0
    has_any_move = False

    for raw in lines:
        line_count += 1

        # Fast-path slicer comments before stripping them.
        if ";" in raw:
            m = _LAYER_COUNT_RE.search(raw)
            if m:
                try:
                    slicer_layer_count = int(m.group(1))
                except ValueError:
                    pass
            m = _LAYER_RE.search(raw)
            if m:
                try:
                    slicer_layer_indices.add(int(m.group(1)))
                except ValueError:
                    pass

        # Strip comment and whitespace.
        code = raw.split(";", 1)[0].strip()
        if not code:
            continue

        # Identify command word (first token, e.g. G1 / G0 / G28 / M82).
        head, _, _rest = code.partition(" ")
        head_up = head.upper()

        if head_up in ("G90",):
            abs_xyz = True
            abs_e = True
            continue
        if head_up in ("G91",):
            abs_xyz = False
            abs_e = False
            continue
        if head_up == "M82":
            abs_e = True
            continue
        if head_up == "M83":
            abs_e = False
            continue
        if head_up == "G92":
            # Reset coordinate system: G92 X.. Y.. Z.. E..
            for axis, val_s in _TOKEN_RE.findall(code):
                val = float(val_s)
                a = axis.upper()
                if a == "X":
                    x = val
                elif a == "Y":
                    y = val
                elif a == "Z":
                    z = val
                elif a == "E":
                    e = val
                    e_high_water = val
            continue

        if head_up in ("G0", "G1", "G00", "G01"):
            cmd = "G1"
        elif head_up in ("G2", "G3", "G02", "G03"):
            # Arc moves: approximate by treating endpoint as a straight line.
            cmd = "G1"
        else:
            # Unknown / non-move command - ignore.
            last_cmd = head_up
            continue
        last_cmd = cmd

        new_x, new_y, new_z, new_e = x, y, z, e
        had_xyz = False
        had_e = False
        for axis, val_s in _TOKEN_RE.findall(code):
            val = float(val_s)
            a = axis.upper()
            if a == "X":
                new_x = val if abs_xyz else x + val
                had_xyz = True
            elif a == "Y":
                new_y = val if abs_xyz else y + val
                had_xyz = True
            elif a == "Z":
                new_z = val if abs_xyz else z + val
                had_xyz = True
            elif a == "E":
                new_e = val if abs_e else e + val
                had_e = True
            elif a == "F":
                if val > 0:
                    feed = val

        if not (had_xyz or had_e):
            continue

        dx = new_x - x
        dy = new_y - y
        dz = new_z - z
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)
        de = new_e - e

        if had_xyz:
            has_any_move = True
            if new_x < min_x:
                min_x = new_x
            if new_x > max_x:
                max_x = new_x
            if new_y < min_y:
                min_y = new_y
            if new_y > max_y:
                max_y = new_y
            if new_z < min_z:
                min_z = new_z
            if new_z > max_z:
                max_z = new_z

        # Filament: only count NEW extrusion (E rising above the high-water mark
        # since the last G92 E... reset). This correctly ignores retract+unretract
        # cycles in absolute extrusion mode (M82) and matches sum-of-positive-dE
        # behavior in relative mode (M83).
        is_extrusion_move = False
        if new_e > e_high_water:
            filament_mm += new_e - e_high_water
            e_high_water = new_e
            is_extrusion_move = True

        if is_extrusion_move:
            if dist > 0:
                print_dist += dist
            # Track Z where extrusion happens (rounded to 3 decimals).
            extrusion_zs.add(round(new_z, 3))
            # Update print bounds with the segment endpoint (start is the previous
            # extrusion endpoint, which was added when we got to it).
            if had_xyz:
                if new_x < min_px:
                    min_px = new_x
                if new_x > max_px:
                    max_px = new_x
                if new_y < min_py:
                    min_py = new_y
                if new_y > max_py:
                    max_py = new_y
                if new_z < min_pz:
                    min_pz = new_z
                if new_z > max_pz:
                    max_pz = new_z
            # Also seed bounds with the starting point of this first extrusion
            # segment, otherwise a single G1 X.. E.. would only record the
            # endpoint. Cheap to do unconditionally - min/max idempotent.
            if x < min_px:
                min_px = x
            if x > max_px:
                max_px = x
            if y < min_py:
                min_py = y
            if y > max_py:
                max_py = y
            if z < min_pz:
                min_pz = z
            if z > max_pz:
                max_pz = z
        elif dist > 0:
            travel_dist += dist

        if dist > 0 and feed > 0:
            time_s += dist / (feed / 60.0)

        x, y, z, e = new_x, new_y, new_z, new_e

    # Layer count: prefer slicer hints, fallback to unique extrusion Z.
    if slicer_layer_count is not None:
        layer_count = slicer_layer_count
    elif slicer_layer_indices:
        layer_count = len(slicer_layer_indices)
    else:
        layer_count = len(extrusion_zs)

    sorted_zs = sorted(extrusion_zs)
    layer_height = _typical_layer_height(sorted_zs)

    has_extrusion = min_px != inf
    if has_extrusion:
        bounds = {
            "x": [min_px, max_px],
            "y": [min_py, max_py],
            "z": [min_pz, max_pz],
        }
        size = {
            "x": max_px - min_px,
            "y": max_py - min_py,
            "z": max_pz - min_pz,
        }
    elif has_any_move:
        # No extrusion at all (e.g. probing-only file): fall back to motion bounds.
        bounds = {
            "x": [min_x, max_x],
            "y": [min_y, max_y],
            "z": [min_z, max_z],
        }
        size = {
            "x": max_x - min_x,
            "y": max_y - min_y,
            "z": max_z - min_z,
        }
    else:
        bounds = {"x": [0.0, 0.0], "y": [0.0, 0.0], "z": [0.0, 0.0]}
        size = {"x": 0.0, "y": 0.0, "z": 0.0}

    if has_any_move:
        motion_bounds = {
            "x": [min_x, max_x],
            "y": [min_y, max_y],
            "z": [min_z, max_z],
        }
    else:
        motion_bounds = {"x": [0.0, 0.0], "y": [0.0, 0.0], "z": [0.0, 0.0]}

    total_dist = travel_dist + print_dist

    # Mass = length_mm * cross_section_mm^2 * density_g/cm^3 / 1000
    # (1 mm^3 = 0.001 cm^3)
    cross_section_mm2 = math.pi * (filament_diameter_mm / 2.0) ** 2
    filament_volume_mm3 = filament_mm * cross_section_mm2
    filament_g = filament_volume_mm3 * filament_density_g_cm3 / 1000.0

    return {
        "lineCount": line_count,
        "bounds": bounds,
        "size": size,
        "motionBounds": motion_bounds,
        "travelDistanceMm": travel_dist,
        "printDistanceMm": print_dist,
        "totalDistanceMm": total_dist,
        "filamentMm": filament_mm,
        "filamentM": filament_mm / 1000.0,
        "filamentG": filament_g,
        "filamentVolumeCm3": filament_volume_mm3 / 1000.0,
        "filamentDiameterMm": filament_diameter_mm,
        "filamentDensityGCm3": filament_density_g_cm3,
        "estimatedTimeS": time_s,
        "layerCount": layer_count,
        "layerHeightMm": layer_height,
    }
