#!/usr/bin/env python3
"""Build a self-contained draft board for a Half-PPR 8-team snake draft.

Pulls ADP from FantasyFootballCalculator (filtered to the exact league format)
and enriches it with Sleeper player metadata, then writes a single HTML file
with the data embedded. No server, no auth, no Yahoo API required.
"""

import json
import re
import statistics
import sys
import urllib.request
from pathlib import Path

TEAMS = 8
SCORING = "half-ppr"
SEASON = 2026

FFC_URL = f"https://fantasyfootballcalculator.com/api/v1/adp/{SCORING}?teams={TEAMS}&year={SEASON}"
SLEEPER_URL = "https://api.sleeper.app/v1/players/nfl"

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "draft_board.html"

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "fantasyFootball/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def norm(name):
    """Normalise a player name so FFC and Sleeper spellings line up."""
    n = re.sub(r"[^a-z ]", "", name.lower())
    parts = [p for p in n.split() if p not in SUFFIXES]
    return "".join(parts)


def tier_up(players):
    """Assign tiers per position: a gap in ADP marks a real drop-off."""
    by_pos = {}
    for p in players:
        by_pos.setdefault(p["pos"], []).append(p)
    for pos, group in by_pos.items():
        group.sort(key=lambda x: x["adp"])
        gaps = [b["adp"] - a["adp"] for a, b in zip(group, group[1:])]
        # A tier break is a gap well above the typical spacing for that position.
        cut = max(4.0, statistics.median(gaps) * 2.5) if gaps else 4.0
        tier = 1
        for i, p in enumerate(group):
            if i and group[i]["adp"] - group[i - 1]["adp"] >= cut:
                tier += 1
            p["tier"] = tier
            p["pos_rank"] = i + 1


def main():
    print(f"ADP laden: {TEAMS} Teams, {SCORING}, {SEASON} ...")
    ffc = fetch(FFC_URL)
    meta, raw = ffc["meta"], ffc["players"]
    print(f"  {len(raw)} Spieler aus {meta['total_drafts']} Drafts "
          f"({meta['start_date']} bis {meta['end_date']})")

    print("Sleeper-Metadaten laden ...")
    sleeper = fetch(SLEEPER_URL)
    index = {}
    for s in sleeper.values():
        if s.get("position") in ("QB", "RB", "WR", "TE") and s.get("full_name"):
            index.setdefault(norm(s["full_name"]), s)

    players, matched = [], 0
    for r in raw:
        pos = "DST" if r["position"] == "DEF" else ("K" if r["position"] == "PK" else r["position"])
        s = index.get(norm(r["name"]), {})
        if s:
            matched += 1
        players.append({
            "id": r["player_id"],
            "name": r["name"],
            "pos": pos,
            "team": r["team"],
            "adp": r["adp"],
            "adpFmt": r["adp_formatted"],
            "stdev": r["stdev"] or 0.1,
            "high": r["high"],
            "low": r["low"],
            "n": r["times_drafted"],
            "bye": r["bye"],
            "age": s.get("age"),
            "exp": s.get("years_exp"),
            "depth": s.get("depth_chart_order"),
            "inj": s.get("injury_status"),
        })
    print(f"  {matched}/{len(raw)} mit Sleeper-Daten angereichert")

    tier_up(players)
    players.sort(key=lambda p: p["adp"])

    payload = {
        "meta": {
            "teams": TEAMS,
            "scoring": meta["type"],
            "season": SEASON,
            "drafts": meta["total_drafts"],
            "window": f"{meta['start_date']} – {meta['end_date']}",
            "rounds": meta["rounds"],
        },
        "players": players,
    }

    html = (ROOT / "tools" / "board_template.html").read_text()
    OUT.write_text(html.replace("/*__DATA__*/null", json.dumps(payload, ensure_ascii=False)))
    print(f"\nGeschrieben: {OUT}  ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
