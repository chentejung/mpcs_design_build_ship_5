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
