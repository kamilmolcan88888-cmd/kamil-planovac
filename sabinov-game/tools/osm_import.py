#!/usr/bin/env python3
"""Vytvorí mapu hry (JSON) z reálnych dát OpenStreetMap v mierke 1:1.

Použitie (potrebuje internet, stačí čistý Python 3.9+ bez knižníc):

    python3 tools/osm_import.py --street "Komenského" --number 18 --radius 200

Výsledok prepíše data/maps/komenskeho_18.json (zmeň cez --out). Body sú
uložené ako [východ, sever] v metroch od adresy, takže 1 jednotka v Godote je
1 meter v skutočnosti.

Bez internetu sa dá spracovať uložená odpoveď Overpass API:

    python3 tools/osm_import.py --from-file overpass.json --lat 49.1 --lon 21.1

Dáta © prispievatelia OpenStreetMap, licencia ODbL – pri zverejnení hry ich
treba uviesť v titulkoch.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

EARTH_RADIUS = 6378137.0
DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter"
# Výrez okolo Sabinova (juh, západ, sever, východ) na hľadanie adresy.
SABINOV_BBOX = (49.07, 21.05, 49.13, 21.15)

ROAD_WIDTHS = {
    "motorway": 11.0, "trunk": 10.0, "primary": 9.0, "secondary": 8.0,
    "tertiary": 7.0, "unclassified": 6.0, "residential": 6.0,
    "living_street": 5.0, "service": 4.0, "track": 3.0,
}
FOOT_WIDTHS = {"footway": 2.0, "path": 1.5, "pedestrian": 4.0, "cycleway": 2.0, "steps": 2.0}
LEVEL_HEIGHT = 3.0
BUILDING_DEFAULT_LEVELS = {
    "apartments": 4, "residential": 3, "house": 2, "detached": 2,
    "semidetached_house": 2, "terrace": 2, "garage": 1, "garages": 1,
    "shed": 1, "school": 3, "church": 4, "retail": 1, "commercial": 2,
    "industrial": 2, "warehouse": 2,
}
BUILDING_KINDS = {
    "apartments": "apartments", "residential": "apartments", "house": "house",
    "detached": "house", "semidetached_house": "house", "terrace": "house",
    "garage": "garage", "garages": "garage", "shed": "garage",
    "school": "school", "kindergarten": "school", "church": "church",
    "chapel": "church", "retail": "shop", "commercial": "shop",
    "supermarket": "shop", "industrial": "industrial", "warehouse": "industrial",
}


# --- geometria ----------------------------------------------------------------

def to_local(lat: float, lon: float, lat0: float, lon0: float) -> list[float]:
    """GPS -> [východ, sever] v metroch (lokálna dotyková rovina)."""
    east = math.radians(lon - lon0) * EARTH_RADIUS * math.cos(math.radians(lat0))
    north = math.radians(lat - lat0) * EARTH_RADIUS
    return [round(east, 2), round(north, 2)]


def polyline_length(points: list[list[float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def offset_polyline(points: list[list[float]], distance: float) -> list[list[float]]:
    """Posunie lomenú čiaru doľava (distance > 0) alebo doprava."""
    result = []
    count = len(points)
    for i, (x, y) in enumerate(points):
        dirs = []
        if i > 0:
            dirs.append(_unit(x - points[i - 1][0], y - points[i - 1][1]))
        if i < count - 1:
            dirs.append(_unit(points[i + 1][0] - x, points[i + 1][1] - y))
        sx, sy = _unit(sum(d[0] for d in dirs), sum(d[1] for d in dirs))
        if (sx, sy) == (0.0, 0.0):
            sx, sy = dirs[0]
        nx, ny = -sy, sx
        miter = 1.0
        if len(dirs) == 2:
            cos_half = abs(nx * -dirs[0][1] + ny * dirs[0][0])
            miter = 1.0 / max(cos_half, 0.5)
        result.append([round(x + nx * distance * miter, 2), round(y + ny * distance * miter, 2)])
    return result


def _unit(x: float, y: float) -> tuple[float, float]:
    length = math.hypot(x, y)
    return (x / length, y / length) if length > 1e-9 else (0.0, 0.0)


def heading_of(a: list[float], b: list[float]) -> float:
    """Kompasový kurz (stupne v smere hodinových ručičiek od severu) z a do b."""
    return round(math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360.0, 1)


def point_along(points: list[list[float]], distance: float) -> tuple[list[float], float]:
    """Bod a kurz vo vzdialenosti `distance` od začiatku lomenej čiary."""
    remaining = max(distance, 0.0)
    for a, b in zip(points, points[1:]):
        seg = math.dist(a, b)
        if seg <= 1e-9:
            continue
        if remaining <= seg:
            t = remaining / seg
            return [round(a[0] + (b[0] - a[0]) * t, 2), round(a[1] + (b[1] - a[1]) * t, 2)], heading_of(a, b)
        remaining -= seg
    return list(points[-1]), heading_of(points[-2], points[-1])


def distance_to_polyline(points: list[list[float]], p: tuple[float, float]) -> float:
    best = math.inf
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 < 1e-12 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / seg2))
        best = min(best, math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)))
    return best


# --- Overpass -----------------------------------------------------------------

def overpass(query: str, endpoint: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(endpoint, data=body, headers={"User-Agent": "osm-game-map-import/1.0"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def find_address(street: str, number: str, bbox: tuple, endpoint: str) -> tuple[float, float]:
    """GPS adresy. Na Slovensku býva orientačné číslo v addr:streetnumber
    alebo za lomkou v addr:housenumber (súpisné/orientačné)."""
    box = ",".join(str(v) for v in bbox)
    query = f"""[out:json][timeout:60];
(
  nwr["addr:street"~"{street}",i]["addr:streetnumber"="{number}"]({box});
  nwr["addr:street"~"{street}",i]["addr:housenumber"~"(^|/){number}$"]({box});
);
out center tags;
way["highway"]["name"~"{street}",i]({box});
out center tags;"""
    elements = overpass(query, endpoint).get("elements", [])
    addresses = [e for e in elements if "addr:street" in e.get("tags", {})]
    streets = [e for e in elements if "highway" in e.get("tags", {})]
    for group, label in ((addresses, "adresa"), (streets, "ulica (adresa v OSM chýba, beriem stred ulice)")):
        if group:
            element = group[0]
            center = element.get("center", element)
            print(f"Nájdené: {label} – {center['lat']:.6f}, {center['lon']:.6f}")
            return center["lat"], center["lon"]
    raise SystemExit(f"V OpenStreetMap sa nenašla ulica „{street}“. Zadaj polohu cez --lat a --lon.")


def fetch_area(lat: float, lon: float, radius: float, endpoint: str) -> dict:
    around = f"(around:{radius},{lat},{lon})"
    query = f"""[out:json][timeout:120];
(
  way["building"]{around};
  way["highway"]{around};
  way["landuse"]{around};
  way["leisure"]{around};
  way["amenity"="parking"]{around};
  way["natural"="water"]{around};
  node["natural"="tree"]{around};
  node["highway"="street_lamp"]{around};
  node["amenity"="bench"]{around};
);
out tags geom;"""
    return overpass(query, endpoint)


# --- prevod -------------------------------------------------------------------

def parse_number(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.replace(",", ".").replace("m", "").strip())
    except ValueError:
        return None


def address_of(tags: dict) -> str:
    street = tags.get("addr:street", "")
    number = tags.get("addr:streetnumber") or tags.get("addr:housenumber", "").split("/")[-1]
    return f"{street} {number}".strip() if street and number else ""


def convert(osm: dict, lat0: float, lon0: float, radius: float, focus_address: str) -> dict:
    roads, sidewalks, areas, buildings, props = [], [], [], [], []

    for element in osm.get("elements", []):
        tags = element.get("tags", {})
        if element["type"] == "node":
            pos = to_local(element["lat"], element["lon"], lat0, lon0)
            if tags.get("natural") == "tree":
                props.append({"kind": "tree", "pos": pos})
            elif tags.get("highway") == "street_lamp":
                props.append({"kind": "lamp", "pos": pos})
            elif tags.get("amenity") == "bench":
                props.append({"kind": "bench", "pos": pos, "heading": parse_number(tags.get("direction")) or 0.0})
            continue
        if element["type"] != "way" or "geometry" not in element:
            continue
        points = [to_local(g["lat"], g["lon"], lat0, lon0) for g in element["geometry"]]
        closed = len(points) > 3 and points[0] == points[-1]

        if "building" in tags:
            if not closed:
                continue
            kind_tag = tags["building"]
            levels = parse_number(tags.get("building:levels")) or BUILDING_DEFAULT_LEVELS.get(kind_tag, 2)
            height = parse_number(tags.get("height")) or levels * LEVEL_HEIGHT + 0.5
            building = {
                "kind": BUILDING_KINDS.get(kind_tag, BUILDING_KINDS.get(tags.get("amenity", ""), "house")),
                "levels": int(levels),
                "height": round(height, 1),
                "footprint": points[:-1],
                "osm_id": element["id"],
            }
            if address_of(tags):
                building["address"] = address_of(tags)
            if tags.get("name"):
                building["name"] = tags["name"]
            buildings.append(building)
        elif "highway" in tags:
            kind = tags["highway"]
            if kind in ROAD_WIDTHS:
                width = parse_number(tags.get("width"))
                if width is None and parse_number(tags.get("lanes")):
                    width = parse_number(tags["lanes"]) * 3.25
                width = width or ROAD_WIDTHS[kind]
                roads.append({"name": tags.get("name", ""), "kind": kind, "width": round(width, 1),
                              "points": points, "osm_id": element["id"]})
                # Chodník pozdĺž cesty: podľa značky sidewalk, inak pri uliciach v obci na oboch stranách.
                side = tags.get("sidewalk", tags.get("sidewalk:both"))
                if side is None:
                    side = "both" if kind in ("residential", "tertiary", "secondary", "primary") else "no"
                if side == "yes":
                    side = "both"
                edge = width / 2 + 1.0
                if side in ("both", "left"):
                    sidewalks.append({"width": 2.0, "points": offset_polyline(points, edge)})
                if side in ("both", "right"):
                    sidewalks.append({"width": 2.0, "points": offset_polyline(points, -edge)})
            elif kind in FOOT_WIDTHS and tags.get("area") != "yes":
                sidewalks.append({"width": parse_number(tags.get("width")) or FOOT_WIDTHS[kind],
                                  "points": points, "osm_id": element["id"]})
        elif closed:
            area_kind = None
            if tags.get("amenity") == "parking":
                area_kind = "parking"
            elif tags.get("leisure") == "playground":
                area_kind = "playground"
            elif tags.get("leisure") in ("park", "garden", "pitch") or tags.get("landuse") in ("grass", "meadow", "village_green"):
                area_kind = "grass"
            elif tags.get("natural") == "water":
                area_kind = "water"
            if area_kind:
                areas.append({"kind": area_kind, "polygon": points[:-1], "osm_id": element["id"]})

    data = {
        "name": f"Sabinov – {focus_address or 'výrez'} (OpenStreetMap)",
        "version": 1,
        "placeholder": False,
        "source": "© prispievatelia OpenStreetMap (ODbL), import tools/osm_import.py",
        "origin": {"lat": lat0, "lon": lon0},
        "radius": radius,
        "focus_address": focus_address,
        "roads": roads,
        "sidewalks": sidewalks,
        "areas": areas,
        "buildings": buildings,
        "props": props,
    }
    data.update(make_spawns(roads, sidewalks))
    return data


def make_spawns(roads: list[dict], sidewalks: list[dict]) -> dict:
    """Hráč, autá a chodci na najbližšej ceste a chodníkoch pri adrese."""
    spawns: dict = {"player": {"pos": [0.0, 0.0], "heading": 0.0}, "cars": [], "npcs": []}
    routes: list[list[list[float]]] = []
    drivable = [r for r in roads if polyline_length(r["points"]) > 20.0]
    if drivable:
        road = min(drivable, key=lambda r: distance_to_polyline(r["points"], (0.0, 0.0)))
        length = polyline_length(road["points"])
        lane = offset_polyline(road["points"], -road["width"] / 4)   # pravý jazdný pruh
        for fraction in (0.3, 0.5, 0.7):
            pos, heading = point_along(lane, length * fraction)
            spawns["cars"].append({"pos": pos, "heading": heading})
        kerb = offset_polyline(road["points"], road["width"] / 2 + 1.0)
        pos, heading = point_along(kerb, length * 0.4)
        spawns["player"] = {"pos": pos, "heading": heading}
    walkable = sorted((s for s in sidewalks if polyline_length(s["points"]) > 15.0),
                      key=lambda s: distance_to_polyline(s["points"], (0.0, 0.0)))[:3]
    for index, sidewalk in enumerate(walkable):
        routes.append(sidewalk["points"])
        length = polyline_length(sidewalk["points"])
        for k, fraction in enumerate((0.25, 0.75)):
            pos, _ = point_along(sidewalk["points"], length * fraction)
            spawns["npcs"].append({"pos": pos, "route": index, "aggressive": (index + k) % 2 == 0})
    return {"npc_routes": routes, "spawns": spawns}


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenStreetMap -> mapa hry (JSON, metre, 1:1)")
    parser.add_argument("--street", default="Komenského")
    parser.add_argument("--number", default="18")
    parser.add_argument("--radius", type=float, default=200.0, help="polomer výrezu v metroch")
    parser.add_argument("--lat", type=float, help="stred výrezu (preskočí hľadanie adresy)")
    parser.add_argument("--lon", type=float)
    parser.add_argument("--from-file", help="uložená odpoveď Overpass (JSON) namiesto sťahovania")
    parser.add_argument("--save-raw", help="uloží surovú odpoveď Overpass do súboru")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data/maps/komenskeho_18.json"))
    args = parser.parse_args()

    if (args.lat is None) != (args.lon is None):
        parser.error("--lat a --lon treba zadať spolu")
    if args.from_file:
        if args.lat is None:
            parser.error("pri --from-file zadaj aj --lat a --lon (stred mapy)")
        osm = json.loads(Path(args.from_file).read_text(encoding="utf-8"))
        lat, lon = args.lat, args.lon
    else:
        if args.lat is not None:
            lat, lon = args.lat, args.lon
        else:
            lat, lon = find_address(args.street, args.number, SABINOV_BBOX, args.endpoint)
        osm = fetch_area(lat, lon, args.radius, args.endpoint)
        if args.save_raw:
            Path(args.save_raw).write_text(json.dumps(osm), encoding="utf-8")

    data = convert(osm, lat, lon, args.radius, f"{args.street} {args.number}")
    if not data["roads"] and not data["buildings"]:
        raise SystemExit("Vo výreze nie sú žiadne cesty ani budovy – skontroluj polohu a polomer.")
    out = Path(args.out)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Zapísané {out}: {len(data['buildings'])} budov, {len(data['roads'])} ciest, "
          f"{len(data['sidewalks'])} chodníkov, {len(data['props'])} objektov.")
    if not any(b.get("address") == data["focus_address"] for b in data["buildings"]):
        print(f"Pozor: budova s adresou „{data['focus_address']}“ vo výreze nie je označená – "
              "v OSM jej chýba adresa. Doplň ju ručne do JSON (pole address) alebo priamo v OpenStreetMap.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
