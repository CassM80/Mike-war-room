# Mike Cassidy Auction War Room — Sprint 26.1

## Consensus-Anchored Auction AI

The mock simulator now treats the Player Pool's Consensus $ as the single source of truth for AI valuation.

- User-edited Consensus $ values automatically become the mock's price anchor.
- Rankings affect nomination order and player interest, never the base auction price.
- AI private maximum bids use controlled adjustments for personality, roster need, budget pressure, room inflation, and a small player-specific opinion.
- Ordinary computer teams are hard-capped near market; the Chaos Agent has a wider but controlled range.
- Every live nomination displays Consensus $, Expected Sale range, and Your Safe Max.
- Expected Sale is based on competitive bidder ceilings rather than the single wildest bidder.
- Mock state uses a new isolated storage version so older overinflated simulations do not carry forward.
