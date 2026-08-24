# fantasyFootball

A private, non-commercial assistant for a single fantasy football league.

It reads league data from the Yahoo Fantasy Sports API and passes it to a locally
running AI assistant that helps with lineup decisions, waiver-wire pickups and trade
evaluation.

> **Status:** early development. Yahoo Fantasy Sports API access has been requested and
> is pending approval. A YDN application exists, but the Fantasy Sports permission is not
> attached to it yet: requesting scope `fspt-r` returns `invalid_scope`, and a token
> obtained without a scope parameter is rejected by the Fantasy endpoints with
> `oauth_problem="additional_authorization_required"`. The draft board below works
> independently of this and needs no Yahoo credentials.

---

## Scope

This is a personal side project, not a product.

| | |
|---|---|
| **Users** | The author and the ~12 members of one private league |
| **Distribution** | None. Runs locally on the author's own machine |
| **Commercial use** | None. No revenue, no ads, no paid tiers, no public sign-up |
| **API access level** | **Read-only.** Write access is neither needed nor requested |

There is no hosted service, no app store listing and no public deployment. The code is
published here for transparency only.

---

## What it does

- Pulls the current league configuration, standings and weekly matchups
- Compares my roster against my opponent's for the upcoming matchup
- Surfaces free agents and waiver-wire candidates worth a claim
- Provides context for evaluating proposed trades

The retrieved data is handed to an AI assistant (Claude) as context. Every decision —
lineup changes, waiver claims, trades — is made by a human in the Yahoo Fantasy web app
or mobile app. This tool never submits anything back to Yahoo.

---

## Yahoo Fantasy Sports API usage

All calls are **GET only**. The resources used:

| Resource | Purpose |
|---|---|
| `users;use_login=1/games/leagues` | Discover the leagues the authenticated user belongs to |
| `league/{key}/settings` | Scoring rules, roster positions, waiver configuration |
| `league/{key}/standings` | Season standings |
| `league/{key}/scoreboard` | Weekly matchups |
| `league/{key}/teams` | Teams in the league |
| `team/{key}/roster` | Own and opponent rosters |
| `league/{key}/players` | Player stats, projected points, ownership, ranks |
| `league/{key}/transactions` | Adds, drops, trades and waiver activity |

Only leagues the authenticated user is a member of are accessed. No other Yahoo user's
data is requested at any point.

### Rate limiting

Expected volume is a few hundred requests per week, concentrated Tuesday to Sunday
during the NFL season. Responses are cached locally so repeated questions within a
session do not generate repeated API calls. Documented rate limits and the Yahoo API
Terms of Service are respected.

---

## Authentication

OAuth 2.0 three-legged flow against the author's own Yahoo account.

- Client ID and client secret are read from environment variables and are **never**
  committed to this repository
- Access and refresh tokens are stored in a local file that is git-ignored
- Tokens are refreshed automatically and are not shared with any third party

```
YAHOO_CLIENT_ID=...
YAHOO_CLIENT_SECRET=...
YAHOO_REDIRECT_URI=https://localhost:8080/callback
```

---

## Data handling

- API responses live in memory for the running session plus a short-lived local cache
- Nothing is stored long-term, aggregated into a dataset or written to a remote system
- Nothing is redistributed, resold, republished or shown to anyone outside the league
- No analytics, no telemetry, no third-party data sharing

---

## Draft board

`draft_board.html` is a self-contained draft assistant that needs no Yahoo access at all.
It is built from publicly available data and runs offline in a browser.

```bash
python3 tools/build_draft_board.py   # fetches data, writes draft_board.html
open draft_board.html
```

It shows, for a Half-PPR 8-team snake draft:

- ADP, positional rank and tier breaks, derived from real drafts in that exact format
- the probability that a player is still available at your next pick, from the ADP
  distribution (mean and standard deviation per player)
- open lineup slots, bye-week clashes among your starters, and positional runs

Data sources, both public and unauthenticated:

| Source | Used for |
|---|---|
| FantasyFootballCalculator ADP API | ADP, standard deviation, draft range, bye weeks |
| Sleeper players API | injury status, depth chart position, age, experience |

Rankings are consensus ADP, not a projection model.

## Repository layout

```
draft_board.html            generated — the tool you actually use during a draft
tools/build_draft_board.py  fetches data and renders the board
tools/board_template.html   markup, styling and draft logic
tools/yahoo_auth_test.py    OAuth flow, checks whether Fantasy access is provisioned
```

## Setup

Yahoo credentials go in a local `.env` file (see `.env.example`); it is git-ignored,
as are the OAuth tokens. Once the Fantasy Sports permission is provisioned:

```bash
python3 tools/yahoo_auth_test.py   # verifies access and lists your leagues
```

---

## Disclaimer

This project is not affiliated with, endorsed by or sponsored by Yahoo, Yahoo Fantasy
Sports, the NFL or any of its teams. All trademarks belong to their respective owners.

**Author:** klumbdev · Independent developer, private individual
