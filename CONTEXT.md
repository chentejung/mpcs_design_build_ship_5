# Odds Desk

A read-only watchlist of Polymarket prediction markets: people follow the questions they care about and watch the
crowd's chance on each one move live. Nobody trades here.

## Markets

**Market**:
One Polymarket question with exactly two Outcomes, and the only thing a user can follow.
_Avoid_: bet, contract, question (in code)

**Event**:
A group of Markets about one question, like "Which party wins the House?", shown as a heading. An Event cannot be
followed; its Markets can.
_Avoid_: group, multi-market

**Outcome**:
One of a Market's two sides, such as Yes/No, Hawks/Pacers or Over/Under. The **first Outcome** is the one whose Price
is tracked; the second is its complement.
_Avoid_: side, answer, token

**Category**:
One of the seven areas Markets are drawn from: Politics, Sports, Crypto, Finance, Tech, World (gamma's Geopolitics) or
Culture.
_Avoid_: tag, topic

**Catalog**:
The Markets the system tracks: the top Markets by 24-hour volume in each Category, plus every followed Market.
_Avoid_: feed, universe

**Place**:
Where in the world a Market is about: a country (ISO 3166-1 alpha-2 code, such as `IR` or `US`) or a region
(`region:middle-east`, `region:europe`, `region:asia`, `region:africa`, `region:latin-america`,
`region:north-america`, `region:oceania`). A Market can have several. The worker reads them from gamma's tags, or
failing that from country names in the Market's text; a Sports Market's Place is its league's home.
_Avoid_: location, geo, country (for a region)

**Global**:
A Market with no Place, such as most Crypto, Tech and Culture Markets.
_Avoid_: worldwide, unplaced, none

**Finished**:
A Market whose trading has ended; its final Price is frozen. Who actually won is not tracked.
_Avoid_: resolved, settled, expired

## Prices

**Price**:
The first Outcome's current value between 0 and 1, the midpoint between the best offers to buy and to sell. This
word is used in code and data.
_Avoid_: odds, probability, yes_price

**Chance**:
A Price shown to people as a percentage, like "62% Hawks". This word is used in the UI.
_Avoid_: odds, probability, likelihood

**Moved**:
How long ago a Market's Price last changed. A quiet Market can have moved long ago while the data is still Fresh.
_Avoid_: updated (that word belongs to Freshness)

**Δ** (delta):
How far a Market's Price has moved over a window (Δ 1h, Δ 24h): the current Price minus the Price at the start of
the window, shown in Chance points with a sign and one decimal ("+2.4", "−0.7"), or "—" when there isn't enough
history that old.
_Avoid_: change %, gain, return

## People

**Follow**:
A user's choice to watch one Market. Each user has at most 25, Finished Markets included.
_Avoid_: save, subscribe, favorite, bookmark

**Watchlist**:
All of one user's Follows: live Markets first, then a collapsed Finished section.
_Avoid_: portfolio, my list, dashboard

**Alert**:
A user's level on a Market they Follow: "tell me when the first Outcome is **above** (or **below**) X%", phrased
with the Outcome ("Yes above 60%", "Hawks below 40%"). It is **triggered** once, by the first changed Price that
crosses it, and records that Price and time; it never fires again. In-app only. At most 3 per Market and 50 per
user; Unfollowing a Market deletes its Alerts.
_Avoid_: notification, trigger (as a noun), watch

**Recap**:
What changed on a user's Watchlist since their last visit, shown at the top of it: each followed Market whose
displayed Chance moved by at least 2 points (from → to, with direction), and each Market that became Finished.
"Nothing big moved since …" when none did; no Recap on a first visit. Prices are kept for 7 days, so after a longer
absence the Recap covers only the last 7 days and says so. **Replay** animates each bar from then to now.
_Avoid_: digest, summary, notifications

## The system

**Run**:
One execution of the worker that refreshes Prices. A Run is **ok** when its price step succeeded, **failed** when it
didn't, and **skipped** when a previous Run was still in progress. Problems refreshing the Catalog are warnings and
don't fail a Run.
_Avoid_: job, sync, tick, poll

**Freshness**:
Whether the system's data is current, judged from the latest Runs:
- **Fresh**: the last ok Run was less than 30 seconds ago.
- **Stale**: there has been no ok Run for 30 seconds or more, or the live connection dropped.
- **Down**: the latest Run that wasn't skipped failed.

Freshness is about the system, not about any one Market; compare Moved.
_Avoid_: live, up to date (as statuses)

_Note_: "Odds Desk" is the app's name, not a term. Everywhere else, the word is Chance.
