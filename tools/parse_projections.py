#!/usr/bin/env python3
"""Liest Yahoos Projektionstabelle aus einer gespeicherten Draft-Seite.

Die Seite rechnet mit dem Scoring der Liga, in der sie geoeffnet wurde. Stammt
sie aus einem Mock mit Yahoo-Standard, werden QBs zu niedrig bewertet; die
Korrektur auf 6 Punkte je Pass-TD und -2 je Interception erfolgt hier, weil
beide Spalten in der Tabelle stehen und nichts geschaetzt werden muss.
"""

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLS = ["xrank", "adp", "bye", "proj", "gp", "pass_yds", "pass_td", "int",
        "rush_att", "rush_yds", "rush_td", "targets", "rec", "rec_yds",
        "rec_td", "ret_td", "two_pt", "fum_lost"]

ROW = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
NAME = re.compile(r'class="ys-player" data-id="(\d+)".*?_ys_1i9qkex">([^<]+)</span>', re.S)
ABBR = re.compile(r'<abbr title="([^"]*)"><span[^>]*>([^<]+)</span>', re.S)
CELL = re.compile(r'<td[^>]*>(.*?)</td>', re.S)

# Yahoo-Standard -> euer Scoring
PASS_TD_DELTA = 2     # 6 statt 4
INT_DELTA = -1        # -2 statt -1


def num(t):
    t = re.sub(r'<[^>]+>', '', t).strip()
    t = html.unescape(t).replace(",", "")
    if t in ("", "-", "--"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def main(*paths):
    # Yahoo rendert nur rund 100 Zeilen gleichzeitig. Mehrere Ausschnitte werden
    # ueber die Spieler-ID zusammengefuehrt, damit die Liste vollstaendig wird.
    out, skipped, seen = [], 0, set()
    bodies = []
    for p in paths:
        rows = ROW.findall(Path(p).read_text(errors="replace"))
        bodies += rows
        print(f"  {Path(p).name}: {len(rows)} Zeilen")
    for body in bodies:
        m = NAME.search(body)
        if not m:
            continue
        pid, name = m.group(1), html.unescape(m.group(2)).strip()
        tags = [t for _, t in ABBR.findall(body)]
        pos = next((t for t in tags if t in ("QB", "RB", "WR", "TE", "K", "DEF")), None)
        team = next((t for t in tags if t not in ("QB", "RB", "WR", "TE", "K", "DEF")
                     and not t.startswith("Bye")), None)
        cells = CELL.findall(body)[1:]                      # erste Zelle ist der Spieler
        vals = dict(zip(COLS, [num(c) for c in cells]))
        if vals.get("proj") is None or int(pid) in seen:
            skipped += 1
            continue
        seen.add(int(pid))
        rec = {"id": int(pid), "name": name, "pos": "DST" if pos == "DEF" else pos,
               "team": team, **{k: vals.get(k) for k in COLS}}
        # QB-Korrektur auf das Liga-Scoring
        adj = rec["proj"]
        if rec["pos"] == "QB":
            adj += PASS_TD_DELTA * (rec["pass_td"] or 0) + INT_DELTA * (rec["int"] or 0)
        rec["proj_league"] = round(adj, 2)
        out.append(rec)

    out.sort(key=lambda r: -r["proj_league"])
    (ROOT / "tools" / "projections.json").write_text(json.dumps(out, indent=1))
    print(f"{len(out)} Spieler gelesen, {skipped} ohne Projektion uebersprungen")
    from collections import Counter
    print("Positionen:", dict(Counter(r["pos"] for r in out)))
    print("\nGroesste QB-Korrektur:")
    for r in sorted([r for r in out if r["pos"] == "QB"],
                    key=lambda r: -(r["proj_league"] - r["proj"]))[:6]:
        print(f"  {r['name']:<18} {r['proj']:>7.2f} -> {r['proj_league']:>7.2f}"
              f"   (+{r['proj_league']-r['proj']:.1f})")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
