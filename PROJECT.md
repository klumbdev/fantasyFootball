# Projektstand

Arbeitsnotizen zu *Football Fanatics 2*. Festgehalten, damit die Befunde eines
Nachmittags nicht in einem Chatverlauf verschwinden — besonders die, die mich
etwas gekostet haben.

Stand: 24. August 2026

---

## Die Liga

| | |
|---|---|
| Name | Football Fanatics 2 |
| League ID | 818256 |
| Teams | 8 |
| Draft | Mo, 24.08.2026, 14:15 EDT / 20:15 MESZ, Live Standard Draft |
| Pickzeit | **45 Sekunden** |
| Runden | 15 |
| Reihenfolge | wird ~30 Minuten vor Beginn ausgelost |

**Startaufstellung:** QB, WR, WR, RB, RB, TE, W/R/T, K, DEF + 6 Bank

Also **zwei** Wide Receiver, nicht drei. Ich hatte drei angenommen und die
Bedarfsrechnung des Boards damit über Stunden falsch gestellt.

### Scoring

Yahoo-Standard mit zwei Abweichungen, die beide zählen:

| Kategorie | Liga | Yahoo-Standard |
|---|---|---|
| **Passing TD** | **6** | 4 |
| **Interception** | **−2** | −1 |
| Passing Yards | 25 Yards je Punkt | gleich |
| Rushing / Receiving Yards | 10 Yards je Punkt | gleich |
| Rushing / Receiving TD | 6 | gleich |
| **Receptions** | **0,5** (Half-PPR) | gleich |
| Fumbles Lost | −2 | gleich |

Die 6 Punkte pro Pass-TD sind der wichtigste Einzelfaktor des ganzen Projekts.
Sie heben Josh Allen von 330 auf 380 projizierte Punkte und machen ihn damit
vom unauffälligen QB1 zum Ausreißer.

---

## Was gebaut ist

```
draft_board.html            erzeugt — das Werkzeug für den Draft
tools/build_draft_board.py  holt Daten, verknüpft Quellen, rendert das Board
tools/board_template.html   Markup, Gestaltung, Draftlogik
tools/parse_projections.py  liest Yahoos Projektionstabelle aus gespeicherten Seiten
tools/yahoo_auth_test.py    OAuth-Flow, prüft ob Fantasy-Zugriff freigeschaltet ist
tools/injuries.json         Verletzungsreport der Liga, von Hand gepflegt
tools/yahoo_rank.json       Yahoos liga-eigene Top 25
tools/projections.json      erzeugt — Projektionen inklusive VOR
_raw/                       Rohmaterial von Yahoo, wird nicht mehr gebraucht
```

Neu bauen: `python3 tools/build_draft_board.py`

### Was das Board kann

- **Empfehlung** oben, nach *Value over Replacement* statt nach ADP
- **Überlebenswahrscheinlichkeit** bis zum eigenen nächsten Pick, aus ADP und
  ihrer Streuung
- **Grenznutzen**: besetzte Positionen fallen aus dem Vorschlag
- **Bye-Week-Kollisionen** fließen in die Bewertung ein
- **Verletzungen** aus dem Liga-Report, dauerhaft Ausgefallene ausgegraut
- **Positionslauf-Warnung**, mit Aussage ob der Lauf einen selbst betrifft
- **Sammelabgleich**: Pickliste einfügen statt Namen tippen
- **Yahoos Schreibweise** — „J. Gibbs", „Patriots" — damit nichts übersetzt
  werden muss

Bedienung: Zeile anklicken = weg, Shift+Klick = eigener Pick. Undo nimmt einen
ganzen Abgleich in einem Zug zurück.

---

## Yahoo API

Beantragt am 24.08.2026, Bearbeitungszeit laut Yahoo ein bis zwei Wochen.

Eine YDN-App existiert (Client ID in `.env.appYahoo`, Confidential Client,
Redirect `https://localhost:8080/callback`). Der Fantasy-Zugriff fehlt ihr aber:

- `scope=fspt-r` → `invalid_scope`
- ohne Scope → Token wird ausgestellt, Endpoint antwortet `401`
  mit `oauth_problem="additional_authorization_required"`

Beides geprüft, kein Konfigurationsfehler auf unserer Seite. Der Self-Service
über `developer.yahoo.com/apps/create` führt nicht weiter — dort erscheint
Fantasy Sports gar nicht mehr in der Berechtigungsliste.

Nach Freigabe: `python3 tools/yahoo_auth_test.py` listet die Ligen samt
`league_key`.

---

## Datenquellen und ihre Tücken

### FantasyFootballCalculator (ADP)

`https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=8&year=2026`

**Der `teams`-Parameter wird ignoriert.** Eine Abfrage mit `teams=14` liefert
byteweise dieselben Werte. Es ist allgemeine Half-PPR-ADP, nicht nach
Ligagröße gefiltert. Praktisch verkraftbar, weil ADP eine Pick-Nummer ist und
bei Pick 20 in jeder Ligagröße 19 Spieler weg sind — aber der Marktschnitt
stammt aus tieferen Ligen, in denen QB und TE aus echter Knappheit früher
gehen.

### Yahoo-Projektionen

Yahoo rechnet **mit dem Scoring der Liga, in der die Seite geöffnet wurde.**
Eine aus einem Mock gespeicherte Seite unterschätzt deshalb jeden QB. Nachweis
durch Rückrechnung: Bei fünf QBs passte der Rest nach Abzug aller bekannten
Kategorien exakt auf 4 Punkte je Pass-TD und −1 je Interception, nicht auf 6
und −2. Bei Passempfängern ergab dieselbe Rechnung 0,5 Punkte je Reception,
also identisch mit unserer Liga.

Daraus folgt: **RB, WR und TE sind unverändert übertragbar, QBs brauchen
`+2 × Pass-TD − 1 × Interception`.** `parse_projections.py` macht genau das.

Yahoos Spielerliste zeigt nur **verfügbare** Spieler. In einem beendeten Mock
beginnt sie deshalb bei Rang 183 — die Top 182 sind gedraftet. Der Schalter
**„Drafted"** blendet sie ein. Ich hatte das zunächst für Virtualisierung
gehalten und in die falsche Richtung geschickt.

### Namensabgleich

Drei Fallen, alle produktiv aufgetreten:

- Yahoo schreibt `B. Robinson` — Bijan und Brian sind daran nicht zu
  unterscheiden, auch nicht über Team oder Position. Auflösung über die
  nächstliegende ADP; ohne plausible ADP wird nicht zugeordnet.
- `A. Brown` (A.J.) und `A. St. Brown` (Amon-Ra) kollidieren, wenn man nur das
  letzte Namenswort nimmt. Der volle Nachname trennt sie.
- Defenses heißen bei Yahoo `Patriots`, in der ADP-Quelle `New England
  Defense`. Jede Defense trägt jetzt beide Namen.

---

## Strategie

### Es gibt kaum Knappheit bei RB und WR

Bei 8 Teams braucht die Liga 16 RB- und 16 WR-Starter plus acht FLEX. Am
Übergang zum Ersatzspieler passiert fast nichts:

| Position | letzter Starter | nächster | Abfall |
|---|---|---|---|
| WR16 | ADP 31,5 | ADP 31,8 | **0,3 Picks** |
| RB16 | ADP 33,2 | ADP 36,2 | 3,0 Picks |
| QB8 | ADP 78,8 | ADP 88,4 | 9,6 Picks |
| TE8 | ADP 101,7 | ADP 110,1 | 8,4 Picks |

Nach einer Position zu greifen, statt den besten Spieler zu nehmen, kostet
also Wert. Positionsläufe bei RB und WR kann man laufen lassen.

### Korrektur: QB und TE sind ihren Preis wert

Meine erste Empfehlung lautete, QB und TE bewusst laufen zu lassen, weil
Yahoos liga-eigene Rangliste McBride auf 14 und Allen auf 20 führt und die
Liga sie damit scheinbar überzahlt. **Die Projektionen widerlegen das.**

Ersatzniveau für 8 Teams: QB9 = 320 Punkte, TE9 = 129, RB23 = 175, WR19 = 173.

- Josh Allen 380 Punkte → **VOR +60**, Rang 10 insgesamt
- Trey McBride 187 → **VOR +58**, Rang 11
- Zum Vergleich Jahmyr Gibbs 298 → VOR +123, Rang 1

Das QB-Feld ist von QB2 bis QB12 extrem flach — 349 bis 312, nur zwei Punkte
pro Woche Unterschied. Allen liegt aber 31 Punkte über QB2 und 68 über dem,
was in Runde 10 noch übrig ist. Ohne die 6-Punkte-Regel wäre er unauffällig;
mit ihr ist er ein legitimer Zweitrundenpick.

### Verletzungen mit Draftrelevanz

Stand 24.08., aus dem Verletzungsreport der Liga:

| ADP | Spieler | Diagnose |
|---|---|---|
| 27,2 | Malik Nabers (WR14) | Kreuzbandriss |
| 59,0 | Alec Pierce (WR29) | PUP-Liste, mindestens 4 Spiele |
| 98,5 | Tucker Kraft (TE7) | Kreuzbandriss |
| 101,9 | Patrick Mahomes (QB13) | Kreuzbandriss |

Angeschlagen, aber draftbar: Puka Nacua (Leiste, ADP 3), Ashton Jeanty
(Sprunggelenk, 15), Josh Jacobs (Leiste, 25), Breece Hall (Leiste, 36),
Tyler Warren (Leiste, TE, 72).

---

## Fehler, die aufgetreten sind

Festgehalten, weil sie sich wiederholen können.

1. **WR 3 statt WR 2.** Aus dem Endkader abgeleitet statt aus den Settings
   gelesen. Dazu überschrieb ein im Browser gespeicherter Stand die Korrektur
   — Startaufstellungen brauchen eine Versionsnummer.
2. **Vorschlag mit 0 % Wahrscheinlichkeit.** Die Bewertung belohnte „geht bald
   weg", ohne auszuschließen, wer *sicher schon weg ist*. Vor dem eigenen Pick
   ist die Empfehlung eine Prognose und muss auf Erreichbare beschränkt sein.
3. **106 Spieler auf einmal gestrichen.** Eingefügt wurde die Spielerliste
   statt der Pickliste. Große Sammelaktionen brauchen eine Rückfrage und eine
   Rücknahme in einem Zug.
4. **Bijan Robinsons Wert bei Brian Robinson.** Siehe Namensabgleich oben.
5. **Vier QBs und drei TEs im Mock-Kader.** VOR misst den Wert für einen
   *Startplatz* und meldet ihn weiter, auch wenn der Platz vergeben ist. Ohne
   Grenznutzen empfiehlt das Board endlos Ersatzleute.
6. **Liga-PDFs im öffentlichen Repo.** `git add -A` hat sie eingesammelt. Sie
   enthalten Namen der Mitspieler und die Kader der Vorsaison. Aus dem
   aktuellen Stand entfernt, in der Historie unter `d3d9741` noch vorhanden.

---

## Offen

- Yahoo-Freigabe abwarten, dann Client ID nachreichen und
  `yahoo_auth_test.py` laufen lassen
- Projektionen nach der Freigabe direkt über die API holen statt über
  gespeicherte Seiten
- Assistent für die Saison: Waiver, Aufstellung, Trades — dort zahlt sich VOR
  stärker aus als an einem Draftabend
- Entscheiden, ob die Historie wegen der PDFs umgeschrieben wird
- `_raw/` löschen, sobald sicher ist, dass nichts mehr gebraucht wird (135 MB)

### Waiver Wire

Bei 8 Teams bleibt die Waiver-Liste das ganze Jahr gut gefüllt: 120 gedraftete
Spieler bei 230 mit ADP. Über eine Saison liegt dort mehr Ertrag als in
einzelnen Draftpicks — und weniger Aufwand als in jeder Optimierung des
Draftabends.
