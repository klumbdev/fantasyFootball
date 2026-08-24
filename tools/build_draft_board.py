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
TIER_CAP = 6  # groesste sinnvolle Tier-Laenge fuer die Anzeige

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
        # A tier break is a gap that is unusually large *for its draft depth*.
        # Absolute thresholds fail because ADP thins out the deeper you go: two
        # picks apart is a chasm in round 1 and noise in round 12. Comparing each
        # gap against the median of its neighbours adapts to that automatically.
        gaps = [b["adp"] - a["adp"] for a, b in zip(group, group[1:])]
        tier, held = 1, 0
        for i, p in enumerate(group):
            if i:
                local = gaps[max(0, i - 7):i + 7] or [1.0]
                natural = gaps[i - 1] >= max(1.0, statistics.median(local) * 2.2)
                # Some positions run as a smooth curve with no real cliff (RB does
                # in this format). A tier of 25 tells the drafter nothing, so cap
                # the run length and split on the widest gap available.
                if natural or held >= TIER_CAP:
                    tier, held = tier + 1, 0
            p["tier"] = tier
            p["pos_rank"] = i + 1
            held += 1


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

    # Yahoo-Verletzungsreport der Liga ueberlagern. Er ist aktueller und
    # liga-spezifischer als der Sleeper-Status.
    inj = json.loads((ROOT / "tools" / "injuries.json").read_text())["players"]
    lookup = {norm(k): v for k, v in inj.items()}
    hits = 0
    for p in players:
        v = lookup.get(norm(p["name"]))
        if v:
            p["sev"], p["injNote"] = v
            hits += 1
    print(f"  Verletzungsreport: {hits}/{len(inj)} Eintraege im Spielerpool zugeordnet")
    missing = [k for k in inj if norm(k) not in {norm(p["name"]) for p in players}]
    if missing:
        print("    ausserhalb der ADP-Liste:", ", ".join(missing))

    # Yahoos liga-eigene Rangliste ueberlagern. Sie ist auf die Scoring-Settings
    # gerechnet und ist zugleich die Liste, nach der die Mitspieler draften -
    # eine grosse Abweichung zur ADP sagt also voraus, wann jemand WIRKLICH geht.
    yr = json.loads((ROOT / "tools" / "yahoo_rank.json").read_text())["ranks"]
    yrank = {norm(n): i + 1 for i, n in enumerate(yr)}
    for p in players:
        r = yrank.get(norm(p["name"]))
        if r:
            p["lrank"] = r
            p["ldelta"] = round(p["adp"] - r, 1)   # positiv = geht frueher als ADP
    print(f"  Liga-Rangliste: {sum(1 for p in players if p.get('lrank'))}/{len(yr)} zugeordnet")

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
