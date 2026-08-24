#!/usr/bin/env python3
"""Liest das fertige Draftboard einer Saison aus der gespeicherten Yahoo-Seite.

Jeder Pick steht dort als title="Name, Team-Pos, Runde.Pick", die Teamnamen
als eigene title-Attribute in der Kopfzeile. Daraus entsteht die Datei, aus
der die Gegnerprofile fuer die naechste Saison gebaut werden.

  python3 tools/parse_draft_result.py _raw/2026/board.html 2026
"""

import html
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICK = re.compile(r'title="([^",]+), ([A-Za-z]+)-([A-Z]+), (\d+)\.(\d+)"')
TEAM = re.compile(r'<div title="([^"]+)" class="Pos\(st\)')


def main(path, season):
    raw = Path(path).read_text(errors="replace")
    teams = list(dict.fromkeys(TEAM.findall(raw)))       # Reihenfolge = Sitzordnung
    picks = []
    for name, team, pos, rnd, num in PICK.findall(raw):
        picks.append({"name": html.unescape(name), "team": team, "pos": pos,
                      "round": int(rnd), "pick": int(num)})
    seen, uniq = set(), []
    for p in picks:                                       # Yahoo rendert manche doppelt
        k = (p["round"], p["pick"])
        if k not in seen:
            seen.add(k)
            uniq.append(p)
    uniq.sort(key=lambda p: (p["round"], p["pick"]))

    n = len(teams)
    for p in uniq:                                        # Snake: gerade Runden rueckwaerts
        seat = p["pick"] if p["round"] % 2 else n - p["pick"] + 1
        p["seat"] = seat
        p["manager"] = teams[seat - 1] if seat <= len(teams) else "?"
        p["overall"] = (p["round"] - 1) * n + p["pick"]

    print(f"{len(teams)} Teams, {len(uniq)} Picks gelesen")
    print("Sitzordnung:", ", ".join(f"{i+1}. {t}" for i, t in enumerate(teams)))

    profiles = {}
    for t in teams:
        seq = [p["pos"] for p in sorted([q for q in uniq if q["manager"] == t],
                                        key=lambda q: q["round"])]
        profiles[t] = seq

    out = ROOT / "tools" / f"draft_{season}.json"
    out.write_text(json.dumps({
        "_source": f"Yahoo Draftboard {season}, Football Fanatics 2",
        "seating": teams,
        "profiles": profiles,
        "picks": uniq,
    }, indent=1, ensure_ascii=False))
    print(f"\n-> {out.name}")

    print("\nWann ging welche Position zuerst?")
    for pos in ["QB", "RB", "WR", "TE", "K", "DEF"]:
        ps = [p for p in uniq if p["pos"] == pos]
        if ps:
            print(f"  {pos:<4} erster Pick {ps[0]['overall']:>3} ({ps[0]['name']})"
                  f"   gesamt {len(ps)}")

    print("\nPositionsfolge je Manager:")
    for t, seq in profiles.items():
        c = Counter(seq)
        print(f"  {t[:26]:<27}{' '.join(seq)}"
              f"   [{' '.join(f'{k}{c[k]}' for k in ['QB','RB','WR','TE','K','DEF'] if c[k])}]")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "2026"))
