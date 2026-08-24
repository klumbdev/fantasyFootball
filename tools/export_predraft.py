#!/usr/bin/env python3
"""Exportiert die Board-Rangfolge als CSV fuer Yahoos Pre-Draft-Ranks.

Die Liste ist Yahoos Autopick-Reihenfolge: laeuft die Uhr ab, nimmt Yahoo den
besten verfuegbaren Spieler daraus. Eine statische Liste kann keine Bye-Weeks
und keine Runs beruecksichtigen - aber die grossen Fehler verhindert sie:

- dauerhaft Verletzte stehen ganz unten (werden nie autogepickt)
- angeschlagene Spieler ruecken nach hinten (Faktor 1,3 wie im Board)
- nach dem besten QB fallen alle weiteren QBs 25 Plaetze - das Feld ist
  flach, ein zweiter frueher QB waere Verschwendung
- nach den zwei besten TEs fallen die uebrigen 15 Plaetze
- Kicker und Defenses stehen gesammelt am Ende (Runde 14/15)
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "draft_board.html").read_text()
players = json.loads(re.search(r"const DATA = (\{.*?\});\n", html, re.S).group(1))["players"]

qbs = sorted([p for p in players if p["pos"] == "QB" and p.get("vorRank")],
             key=lambda p: p["vorRank"])
tes = sorted([p for p in players if p["pos"] == "TE" and p.get("vorRank")],
             key=lambda p: p["vorRank"])
best_qb = qbs[0]["id"] if qbs else None
top_tes = {p["id"] for p in tes[:2]}


def score(p):
    if p.get("sev") == "out":
        return 100000 + p["adp"]          # nie autopicken
    if p["pos"] in ("K", "DST"):
        return 5000 + p["adp"]
    base = p["vorRank"] if p.get("vorRank") else 200 + p["adp"] * 0.5
    if p.get("sev") == "risk":
        base *= 1.3
    if p["pos"] == "QB" and p["id"] != best_qb:
        base += 25
    if p["pos"] == "TE" and p["id"] not in top_tes:
        base += 15
    return base


ordered = sorted(players, key=score)
lines = ["rank,name,team,position"]
for i, p in enumerate(ordered, 1):
    name = p.get("alias") or p["name"]          # Defenses unter Yahoos Spitznamen
    pos = "DEF" if p["pos"] == "DST" else p["pos"]
    lines.append(f"{i},{name},{p['team'] or ''},{pos}")
out = ROOT / "yahoo_predraft.csv"
out.write_text("\n".join(lines) + "\n")
print(f"{len(ordered)} Spieler -> {out.name}")

print("\nTop 20:")
for i, p in enumerate(ordered[:20], 1):
    print(f"  {i:>3}  {p['pos']:<4} {p['name']}" + ("  [angeschlagen]" if p.get("sev") == "risk" else ""))
print("\nKontrollpunkte:")
qb_pos = [i + 1 for i, p in enumerate(ordered) if p["pos"] == "QB"][:4]
print(f"  QBs auf Raengen: {qb_pos} ...")
kd = next(i + 1 for i, p in enumerate(ordered) if p["pos"] in ("K", "DST"))
print(f"  erster K/DEF auf Rang {kd}")
outp = [i + 1 for i, p in enumerate(ordered) if p.get("sev") == "out"]
print(f"  dauerhaft Verletzte auf Raengen {min(outp)}-{max(outp)}" if outp else "  keine Verletzten markiert")
jean = next((i + 1 for i, p in enumerate(ordered) if "Jeanty" in p["name"]), None)
print(f"  Jeanty auf Rang {jean}")
