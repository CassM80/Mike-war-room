# Sprint 32.1 — Automatic Auction Clock

- Every nomination now opens with an automatic $1 bid by the nominating team.
- A visible three-second auction clock starts immediately and resets after every user or AI bid.
- AI teams bid automatically according to their limits and personalities.
- When the clock expires, the current high bidder wins without another confirmation click.
- An uncontested user nomination is automatically added to the user's roster for $1.
- Pass removes the user from future bidding while the AI room finishes the auction automatically.
- The clock pauses when the browser tab is hidden and resumes when the user returns.

# Sprint 31.1 — Performance Engine

Cached draft snapshots, League Values and live recommendation results; removed off-screen gallery rebuilds from the live sale path; reduced duplicate renders and repeated team/player scans.

# Mike Cassidy Auction War Room — Sprint 31.0

## Recommendation Intelligence Engine

- Recommended Now no longer ranks players primarily by the next empty starting slot.
- The engine shifts automatically through BUILD, BALANCE, VALUE, and ENDGAME recommendation phases.
- Starter need, FLEX value, bench upside, tier-drop risk, League Value, personal edge, scarcity, market heat, opponent demand, legal max bid, and remaining dollars are scored together.
- Bench recommendations favor RB/WR upside, sleepers, strong personal targets, young/breakout profiles, and useful price points.
- Replacement-level backup QB/TE options are suppressed when stronger FLEX or bench values remain.
- Recommendation reasons now explain starter value, FLEX value, bench upside, personal edge, or an approaching tier drop.

# Mike Cassidy Auction War Room — Sprint 30.3.1

## Recommended Now

- Renamed the live War Room recommendation panel from **Your Top Targets** to **Recommended Now**.
- The underlying Sprint 30.3 dynamic recommendation logic is unchanged.
- The panel still recalculates automatically after every recorded sale.

# Mike Cassidy Auction War Room — Sprint 30.3

## Dynamic Top Targets

- Your Top Targets now recalculates after every recorded sale.
- Sold and avoided players disappear automatically.
- Ranking responds to open starters/FLEX, remaining budget, legal max bid, scarcity, positional market conditions, opponent demand, League Value, and the personal board.
- Each target includes a live reason and League Value.
- Clicking a target opens its War Room dossier.

# Mike Cassidy Auction War Room — Sprint 30.2

## Full League Team Tracking

- Winner selection now lists every Headquarters team.
- Every sale stores its winning team, price, and player.
- War Room derives team budgets, position counts, roster demand, and affordability from recorded sales.
- Nomination and player recommendations now account for opponent positional demand and remaining budgets.
- Legacy ME/OTHER sales remain compatible.

# Mike Cassidy Auction War Room — Sprint 29.2

## Nomination / Valuation Separation

The mock simulator now treats nomination timing and bidding value as two separate systems.

- League Value remains the sole price anchor for AI bid ceilings, expected sale ranges, and sale-price comparisons.
- League Value no longer affects whether a player is nominated early or late.
- Nomination priority is driven by personal/provider rank, tier, roster need, drafter personality, and controlled randomness.
- Lowering an elite player's League Value creates a potential bargain; it does not make that player disappear from the nomination queue.
- Raising a player's League Value changes bidding behavior without artificially moving that player up the nomination order.
- Mock state uses a new isolated storage version so Sprint 26.1 drafts do not carry into this test.


## Sprint 26.2.1 — Elite Nomination Priority Hotfix

- Mock nominations now use neutral provider/search ADP, including the normalized `adp` field.
- Personal rankings and League Value cannot bury elite players in the nomination order.
- Early-draft nominations come from phase-based public-rank pools.
- Public top-12 players are guaranteed to be nominated by pick 24.
- League Value remains the sole price anchor for AI bidding.


## Sprint 26.3 — User Nominations + Pointer Feedback

- The mock draft now pauses when the nomination rotation reaches your team.
- Search and select any undrafted player, then nominate that player at $1.
- AI bidding begins immediately using the same League Value-anchored limits.
- Bid +$1, Bid to Safe Max, Pass, and Nominate Player now show a hand pointer on hover.
- Mock storage and service-worker cache were advanced for a clean deployment.


## Sprint 27.0 — Player Data Integrity
- Canonical player IDs and alias-aware matching for suffix/name variants.
- Sleeper search rank is no longer silently presented as dedicated ADP; the board labels the field Market Rank and identifies fallbacks.
- Player Data Health panel reports missing prices, missing ranks, duplicate identities, and suspicious price/rank conflicts.
- Market sync and player-universe joins use canonical name aliases while preserving user-owned prices and evaluations.


## Sprint 28.0 — Market Coverage Expansion
- Player Data Health now audits the top 300 draft-relevant QB/RB/WR/TE players instead of flagging every fringe player and defense.
- Rank-derived $1+ modeled baselines extend through transparent positional coverage limits.
- Every market value now identifies its source: verified consensus, curated baseline, modeled baseline, user edit, or unpriced.
- Market Coverage Audit separately grades price coverage, usable ranking coverage, and live-provider coverage.
- K/DEF records no longer distort missing-rank or missing-price health counts.
- Service-worker cache advanced to Sprint 28.0.


## Sprint 28.1 — Ranking Integrity
- Added a War Room Market Rank derived primarily from auction-market values.
- Raw provider rank is retained only as a secondary reference and tiebreaker.
- Bulk Board, Blueprint, integrity diagnostics, coverage ordering, and Mock Draft nomination prominence now use War Room rank.
- Service-worker cache advanced to Sprint 28.1.

## Sprint 28.2 — ESPN Ranking Blend
- Added a bundled ESPN Mike Clay 2026 PPR positional-ranking snapshot for QB/RB/WR/TE.
- War Room auction baselines now blend verified/curated values with ESPN positional context.
- Added conservative ESPN auction curves for a 12-team, one-QB, $200 PPR room.
- Curated or consensus values are capped when they sit far above the ESPN positional tier, reducing stale inflation.
- War Room Rank remains auction-value driven, with ESPN rank used before the raw provider rank as a tiebreaker.
- Bulk Player Board now shows ESPN positional reference (`EWR17`, `ERB15`, etc.) alongside provider reference (`P12`).
- User-edited prices remain authoritative and are never overwritten by the blend.
- Service-worker cache advanced to Sprint 28.2.


## Sprint 28.3 — QB Market Calibration
- Added a one-QB replacement-value calibration after the ESPN auction blend.
- QB1–QB3 retain 90% of blended value; QB4–QB6 retain 80%; QB7–QB10 retain 65%; QB11–QB15 retain 45%; QB16+ settle at $1.
- Calibration is skipped for two-QB or Superflex configurations.
- User-edited market prices remain authoritative and bypass calibration.
- Recommendation scores now include a modest opportunity-cost penalty for meaningful QB spending in one-QB leagues.
- Market source labels identify one-QB-calibrated prices.
- Service-worker cache advanced to Sprint 28.3.


## Sprint 29.1 — QB Ranking Integrity Fix
- ESPN positional rank is now the primary QB ordering signal when available.
- Provider positional rank may blend with ESPN, but provider overall/search rank can no longer manufacture an elite positional rank.
- Players omitted from a trusted ESPN positional pool are placed behind that pool before auction curves are applied.
- Fixes Fernando Mendoza being treated as QB3 and priced above established top quarterbacks.


## Sprint 29.2 — League Value Terminology
- Renamed the user-facing `Consensus $` column to `League Value`.
- Draft Prep, the Bulk Player Board, Mock Draft, sorting labels, refresh status, and explanatory copy now use the league-specific terminology.
- The underlying dynamic valuation logic is unchanged: external consensus remains an evidence source, while League Value is the final price tailored to Headquarters settings.
- Service-worker cache advanced to Sprint 29.2.

## Sprint 30.0 — Zero-Click Intelligence

- Added an auto-updating Zero-Click Board to the live War Room.
- Best Fit Now is calculated from personal conviction, open roster slots, League Value, scarcity and live room conditions.
- Roster Priority identifies the position and player that best fit the remaining build.
- Scarcity Watch identifies the thinnest meaningful position pool still relevant to the user's roster.
- Selected-player pivots are now generated automatically from available players and current League Values instead of relying on static text.
- Zero-click recommendations open the player dossier with one tap and require no current-bid entry.
- Renamed the live dossier's MARKET label to LEAGUE VALUE for terminology consistency.

## Sprint 30.1 — War Room Layout Polish

- Rebalanced the desktop War Room so Live Draft Intelligence receives enough vertical space for the Zero-Click Board.
- Prevented the Zero-Click Board from extending underneath the Record & Next area.
- Made the Live Draft Intelligence panel independently scrollable when alerts and nomination strategy exceed the available height.
- Kept the intelligence panel title visible while scrolling.
- Reduced the Record & Next footprint and compacted its fields without changing the recording workflow.
- Added a shorter landscape layout for lower-height laptop and tablet screens.
- Service-worker cache advanced to Sprint 30.1.

## Sprint 32.0 — Intelligent Mock Draft
- Added six War Room-style command cards to Mock Draft: remaining budget, legal max bid, players left, average dollars per player, market temperature, and draft phase.
- Added a live Auction Coach with BID / CAUTION / PASS guidance and concise reasons.
- Added position-level room inflation, opponent demand, and a plain-language room signal.
- Added dynamic Recommended Now targets for the current mock roster and budget.
- Added post-pick reflection after every sale to reinforce disciplined auction decisions.
- Mock state remains isolated from the live War Room.


## Sprint 32.2A — Demand Foundation
- Replaced exposed positional “NEED” counts in Mock Draft Room Intelligence with dynamic Demand tiers.
- Demand tiers scale to the configured league size: Very High, High, Moderate, Low, and Saturated.
- Reworked price signals into plain English relative to League Value.
- Updated Auction Coach market reasons to explain above/below League Value rather than showing an unexplained percentage.
- Preserved existing mock-draft state and valuation logic; this sprint changes presentation and creates the foundation for the full Demand Score model.
## Sprint 32.2B — UI Polish
- Renamed the live right-rail section from **Live Draft Intelligence** to **Auction Coach**.
- Moved the **Zero-Click Board** below auction coaching and the suggested nomination so the rail now reads from decision support to quick-reference reminders.
- Preserved all Sprint 32.2A demand and market-value logic.

