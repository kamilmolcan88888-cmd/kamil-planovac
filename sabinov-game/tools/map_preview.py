#!/usr/bin/env python3
"""Nakreslí mapu hry (JSON) zhora ako SVG – rýchla kontrola bez spúšťania Godotu.

    python3 tools/map_preview.py                       # data/maps/komenskeho_18.json
    python3 tools/map_preview.py moja_mapa.json -o nahlad.svg

Sever je hore, mierka je v metroch. Súbor otvoríš v ľubovoľnom prehliadači.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCALE = 5.0   # pixelov na meter
MARGIN = 20.0

BUILDING_COLORS = {"apartments": "#c7bda8", "house": "#d9cdb3", "garage": "#8c8c8c",
                   "school": "#ccb38c", "shop": "#b3bfcc", "church": "#e6e0cc", "industrial": "#999ea6"}
AREA_COLORS = {"parking": "#4d4d52", "paved": "#999999", "grass": "#4d803d",
               "playground": "#c7b380", "water": "#3366a6"}
PROP_COLORS = {"tree": "#2f6b2e", "lamp": "#f2d24b", "bench": "#73492e", "crate": "#99733f",
               "bin": "#335940", "ball": "#ffffff", "ramp": "#bf8c33", "stairs": "#a8a8a8"}


def collect_points(data: dict) -> list[list[float]]:
    points: list[list[float]] = [[0.0, 0.0]]
    for key, field in (("roads", "points"), ("sidewalks", "points"), ("areas", "polygon"), ("buildings", "footprint")):
        for item in data.get(key, []):
            points.extend(item.get(field, []))
    points.extend(p["pos"] for p in data.get("props", []))
    return points


def render(data: dict) -> str:
    points = collect_points(data)
    min_e = min(p[0] for p in points) - MARGIN
    max_e = max(p[0] for p in points) + MARGIN
    min_n = min(p[1] for p in points) - MARGIN
    max_n = max(p[1] for p in points) + MARGIN
    width, height = (max_e - min_e) * SCALE, (max_n - min_n) * SCALE

    def xy(p: list[float]) -> str:
        return f"{(p[0] - min_e) * SCALE:.1f},{(max_n - p[1]) * SCALE:.1f}"

    def path(pts: list[list[float]]) -> str:
        return " ".join(xy(p) for p in pts)

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" '
           f'width="{width:.0f}" height="{height:.0f}" font-family="sans-serif">',
           f'<rect width="100%" height="100%" fill="#557842"/>']
    for area in data.get("areas", []):
        out.append(f'<polygon points="{path(area["polygon"])}" fill="{AREA_COLORS.get(area.get("kind"), "#808080")}"/>')
    for sidewalk in data.get("sidewalks", []):
        out.append(f'<polyline points="{path(sidewalk["points"])}" fill="none" stroke="#b5b2aa" '
                   f'stroke-width="{sidewalk.get("width", 2.0) * SCALE:.1f}"/>')
    for road in data.get("roads", []):
        out.append(f'<polyline points="{path(road["points"])}" fill="none" stroke="#333338" '
                   f'stroke-width="{road.get("width", 6.0) * SCALE:.1f}" stroke-linejoin="round"/>')
    for road in data.get("roads", []):
        if road.get("name") and len(road["points"]) >= 2:
            a, b = road["points"][0], road["points"][1]
            mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
            angle = -math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            if angle > 90 or angle < -90:
                angle += 180
            x, y = xy(mid).split(",")
            out.append(f'<text x="{x}" y="{y}" fill="#ffffff" font-size="13" text-anchor="middle" '
                       f'dominant-baseline="middle" transform="rotate({angle:.1f} {x} {y})">{road["name"]}</text>')
    focus = data.get("focus_address")
    for building in data.get("buildings", []):
        is_focus = bool(focus) and building.get("address") == focus
        fill = "#db9e5c" if is_focus else BUILDING_COLORS.get(building.get("kind"), "#bfb8ad")
        out.append(f'<polygon points="{path(building["footprint"])}" fill="{fill}" stroke="#40382e" stroke-width="1"/>')
        label = building.get("address") or building.get("name")
        if label:
            fp = building["footprint"]
            center = [sum(p[0] for p in fp) / len(fp), sum(p[1] for p in fp) / len(fp)]
            x, y = xy(center).split(",")
            out.append(f'<text x="{x}" y="{y}" font-size="12" text-anchor="middle" dominant-baseline="middle" '
                       f'fill="#1f1a14">{label}</text>')
    for prop in data.get("props", []):
        x, y = xy(prop["pos"]).split(",")
        radius = 9.0 if prop["kind"] == "tree" else 3.0
        out.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{PROP_COLORS.get(prop["kind"], "#ff00ff")}" '
                   f'stroke="#000000" stroke-width="0.5"><title>{prop["kind"]}</title></circle>')
    spawns = data.get("spawns", {})
    for car in spawns.get("cars", []):
        x, y = xy(car["pos"]).split(",")
        out.append(f'<rect x="{float(x) - 4.5:.1f}" y="{float(y) - 10.5:.1f}" width="9" height="21" fill="#8c1a1a" '
                   f'stroke="#000" transform="rotate({car.get("heading", 0):.1f} {x} {y})"><title>auto</title></rect>')
    for npc in spawns.get("npcs", []):
        x, y = xy(npc["pos"]).split(",")
        out.append(f'<circle cx="{x}" cy="{y}" r="3.5" fill="#e0b040" stroke="#000"><title>chodec</title></circle>')
    if "player" in spawns:
        x, y = xy(spawns["player"]["pos"]).split(",")
        out.append(f'<circle cx="{x}" cy="{y}" r="5" fill="#3a66d6" stroke="#fff" stroke-width="1.5"><title>hráč</title></circle>')
    # Mierka 50 m a severka.
    bar_y = height - 18
    out.append(f'<line x1="20" y1="{bar_y}" x2="{20 + 50 * SCALE}" y2="{bar_y}" stroke="#fff" stroke-width="3"/>')
    out.append(f'<text x="{20 + 25 * SCALE}" y="{bar_y - 7}" fill="#fff" font-size="13" text-anchor="middle">50 m</text>')
    out.append(f'<text x="{width - 24:.0f}" y="28" fill="#fff" font-size="18" text-anchor="middle">S ↑</text>')
    if data.get("placeholder"):
        out.append(f'<text x="20" y="26" fill="#ffe08a" font-size="15">SCHÉMA – nie je zameraná podľa skutočnosti</text>')
    out.append("</svg>")
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Náhľad mapy hry ako SVG")
    parser.add_argument("map", nargs="?", default=str(ROOT / "data/maps/komenskeho_18.json"))
    parser.add_argument("-o", "--out", default=str(ROOT / "docs/mapa_nahlad.svg"))
    args = parser.parse_args()
    data = json.loads(Path(args.map).read_text(encoding="utf-8"))
    Path(args.out).write_text(render(data), encoding="utf-8")
    print(f"Náhľad uložený: {args.out}")


if __name__ == "__main__":
    main()
