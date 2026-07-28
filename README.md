# Mike Cassidy Auction War Room — Sprint 26.2

## Nomination / Valuation Separation

The mock simulator now treats nomination timing and bidding value as two separate systems.

- Consensus $ remains the sole price anchor for AI bid ceilings, expected sale ranges, and sale-price comparisons.
- Consensus $ no longer affects whether a player is nominated early or late.
- Nomination priority is driven by personal/provider rank, tier, roster need, drafter personality, and controlled randomness.
- Lowering an elite player's Consensus $ creates a potential bargain; it does not make that player disappear from the nomination queue.
- Raising a player's Consensus $ changes bidding behavior without artificially moving that player up the nomination order.
- Mock state uses a new isolated storage version so Sprint 26.1 drafts do not carry into this test.
