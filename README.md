# fantasyFootball

A private, non-commercial assistant for a single fantasy football league.

It reads league data from the Yahoo Fantasy Sports API and passes it to a locally
running AI assistant that helps with lineup decisions, waiver-wire pickups and trade
evaluation.

> **Status:** early development. Yahoo Fantasy Sports API access has been requested and
> is pending approval — the client is not functional until credentials are provisioned.

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

## Setup

Setup instructions will be added once API credentials are available.

---

## Disclaimer

This project is not affiliated with, endorsed by or sponsored by Yahoo, Yahoo Fantasy
Sports, the NFL or any of its teams. All trademarks belong to their respective owners.

**Author:** klumbdev · Independent developer, private individual
