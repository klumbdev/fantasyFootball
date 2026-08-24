#!/usr/bin/env python3
"""Klaert, ob die frisch erstellte YDN-App schon Fantasy-Zugriff hat.

Ablauf:
  1) Auth-URL ausgeben -> im Browser bestaetigen
  2) Der Redirect auf https://localhost:8080/callback schlaegt im Browser fehl
     (kein Server dort) - das ist erwartet. Entscheidend ist der ?code=... Teil
     in der Adresszeile. Den hierher kopieren.
  3) Token tauschen, Fantasy-Endpoint anfragen, Ergebnis bewerten.

Aufruf:  python3 tools/yahoo_auth_test.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "tokens.json"

AUTH = "https://api.login.yahoo.com/oauth2/request_auth"
TOKEN = "https://api.login.yahoo.com/oauth2/get_token"
FANTASY = ("https://fantasysports.yahooapis.com/fantasy/v2/"
           "users;use_login=1/games;game_keys=nfl/leagues?format=json")


ENV_FILES = [".env.appYahoo", ".env"]
# Beide Schreibweisen zulassen: die aus .env.example und die tatsaechlich genutzte.
ALIASES = {
    "YAHOO_CLIENT_ID": ("clientID", "client_id", "YAHOO_CLIENT_ID"),
    "YAHOO_CLIENT_SECRET": ("clientSecret", "client_secret", "YAHOO_CLIENT_SECRET"),
    "YAHOO_REDIRECT_URI": ("redirectURI", "redirect_uri", "YAHOO_REDIRECT_URI"),
}


def load_env():
    """Credentials aus einer lokalen .env-Datei lesen. Werte werden nie ausgegeben."""
    found = {}
    for fn in ENV_FILES:
        p = ROOT / fn
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            found[k.strip()] = v.strip().strip("\"'")
        print(f"   Credentials gelesen aus {fn}")
        break
    return found


FILE_ENV = {}


def env(name, required=True):
    for alias in ALIASES.get(name, (name,)):
        v = os.environ.get(alias) or FILE_ENV.get(alias)
        if v:
            return v
    if not required:
        return ""
    return input(f"{name}: ").strip()


def post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    global FILE_ENV
    FILE_ENV = load_env()
    cid = env("YAHOO_CLIENT_ID")
    sec = env("YAHOO_CLIENT_SECRET")
    redirect = env("YAHOO_REDIRECT_URI", required=False) or "https://localhost:8080/callback"
    print(f"   Client ID endet auf …{cid[-6:]}  |  Redirect: {redirect}")

    # Schritt 1: Scope explizit anfragen. Fehlt der App die Fantasy-Berechtigung,
    # quittiert Yahoo das hier bereits mit invalid_scope - das ist die Antwort.
    # --no-scope: Yahoo den Scope weglassen und die App-Permissions entscheiden
    # lassen. Fallback, wenn "fspt-r" mit invalid_scope abgelehnt wurde.
    params = {"client_id": cid, "redirect_uri": redirect, "response_type": "code"}
    if "--no-scope" not in sys.argv:
        params["scope"] = "fspt-r"
    else:
        print("   Modus: ohne scope-Parameter")
    url = AUTH + "?" + urllib.parse.urlencode(params)
    print("\n1) Browser oeffnet sich - Zugriff bestaetigen.")
    if not webbrowser.open(url):
        print("   (ging nicht auf - URL manuell oeffnen:)\n   " + url)
    print("\n2) Der Browser landet auf einer Fehlerseite (localhost laeuft nicht) -")
    print("   das ist normal. Aus der Adresszeile den Wert hinter ?code= kopieren.\n")

    raw = input("code (oder komplette URL): ").strip()
    if "error=" in raw and "code=" not in raw:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(raw).query)
        err = q.get("error", ["?"])[0]
        print("\n   Yahoo hat die Autorisierung abgelehnt:", err)
        if err == "invalid_scope" and "--no-scope" not in sys.argv:
            print("\n=> Der App fehlt die Fantasy-Berechtigung.")
            print("   Letzter Versuch ohne Scope-Parameter:")
            print("     python3 tools/yahoo_auth_test.py --no-scope")
        return 1
    if "code=" in raw:
        raw = urllib.parse.parse_qs(urllib.parse.urlparse(raw).query)["code"][0]

    print("\n3) Token tauschen ...")
    try:
        tok = post(TOKEN, {"client_id": cid, "client_secret": sec, "redirect_uri": redirect,
                           "code": raw, "grant_type": "authorization_code"})
    except urllib.error.HTTPError as e:
        print("   FEHLGESCHLAGEN:", e.code, e.read().decode()[:400])
        return 1

    TOKENS.write_text(json.dumps(tok, indent=2))
    print(f"   ok - Token gespeichert in {TOKENS.name}")
    print("   gewaehrter scope:", tok.get("scope", "(keiner angegeben)"))

    print("\n4) Fantasy-Endpoint testen ...")
    req = urllib.request.Request(FANTASY, headers={"Authorization": "Bearer " + tok["access_token"]})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"   HTTP {e.code}: {e.read().decode()[:300]}")
        print("\n=> KEIN Fantasy-Zugriff. Die Freigabe steht noch aus - heute Abend")
        print("   laeuft der Draft ueber draft_board.html.")
        return 1

    games = data["fantasy_content"]["users"]["0"]["user"][1]["games"]
    found = []
    for k, v in games.items():
        if k == "count":
            continue
        leagues = v["game"][1].get("leagues", {})
        for lk, lv in leagues.items():
            if lk == "count":
                continue
            lg = lv["league"][0]
            found.append((lg["name"], lg["league_key"], lg["num_teams"]))

    print("\n=> FANTASY-ZUGRIFF FUNKTIONIERT.")
    print(f"   {len(found)} Liga(en) gefunden:")
    for name, key, teams in found:
        print(f"     - {name}  ({teams} Teams)  league_key={key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
