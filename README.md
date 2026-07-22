# War Room — Production Sprint 23.0

## Conviction Score

Adds a persistent, user-specific 1–5 star Conviction Score to every personal player evaluation.

- 1★ Avoid
- 2★ Discount Only
- 3★ Neutral (default for existing and unrated players)
- 4★ Love
- 5★ Plant the Flag

### Included
- Individual star picker in Scouting / Personal Evaluation
- Backward-compatible personal evaluation storage (`conviction`)
- Conviction badges on the Personal Board
- Bulk board conviction editing
- Bulk filters for high and low conviction
- Bulk sorting by conviction
- Draft DNA assigns conviction based on gut and price answers
- Conviction influences effective War Room action: 5★ = ATTACK, 4★ = VALUE, 1★ = AVOID
- Backup schema advanced to version 3

# War Room — Sprint 22.9

Removes the persistent personal-board-cleared marker that blocked Draft DNA from rebuilding a board after reset. Reset now relies on clean profile mode and empty evaluation storage; completing DNA can immediately create and persist a fresh personalized board.
