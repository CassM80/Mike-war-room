# Mike Cassidy Auction War Room — Sprint 26.2

## Nomination / Valuation Separation

The mock simulator now treats nomination timing and bidding value as two separate systems.

- Consensus $ remains the sole price anchor for AI bid ceilings, expected sale ranges, and sale-price comparisons.
- Consensus $ no longer affects whether a player is nominated early or late.
- Nomination priority is driven by personal/provider rank, tier, roster need, drafter personality, and controlled randomness.
- Lowering an elite player's Consensus $ creates a potential bargain; it does not make that player disappear from the nomination queue.
- Raising a player's Consensus $ changes bidding behavior without artificially moving that player up the nomination order.
- Mock state uses a new isolated storage version so Sprint 26.1 drafts do not carry into this test.


## Sprint 26.2.1 — Elite Nomination Priority Hotfix

- Mock nominations now use neutral provider/search ADP, including the normalized `adp` field.
- Personal rankings and Consensus $ cannot bury elite players in the nomination order.
- Early-draft nominations come from phase-based public-rank pools.
- Public top-12 players are guaranteed to be nominated by pick 24.
- Consensus $ remains the sole price anchor for AI bidding.


## Sprint 26.3 — User Nominations + Pointer Feedback

- The mock draft now pauses when the nomination rotation reaches your team.
- Search and select any undrafted player, then nominate that player at $1.
- AI bidding begins immediately using the same Consensus-anchored limits.
- Bid +$1, Bid to Safe Max, Pass, and Nominate Player now show a hand pointer on hover.
- Mock storage and service-worker cache were advanced for a clean deployment.
