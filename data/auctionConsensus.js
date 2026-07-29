// Sprint 28.0 — verified auction-consensus snapshot plus transparent modeled coverage policy.
// 12-team, full-PPR, $200 baseline. Values are intentionally separate from live ranking sync.
const AUCTION_CONSENSUS_META = {
  label: "Auction Consensus",
  season: 2026,
  teams: 12,
  scoring: "PPR",
  budget: 200,
  updated: "2026-07-28",
  source: "Fantasy Football Helper consensus preview",
  coveragePolicy: "Verified values first; rank-modeled $1+ baseline for the draft-relevant pool"
};

const MARKET_COVERAGE_POLICY = {
  label: "War Room Modeled Baseline",
  overallDepth: 300,
  positionDepth: { QB: 32, RB: 88, WR: 116, TE: 48 },
  minimumDraftableValue: 1
};

const AUCTION_CONSENSUS_VALUES = {
  "bijan robinson": 67,
  "jahmyr gibbs": 65,
  "jamar chase": 63,
  "puka nacua": 63,
  "jaxon smith njigba": 61,
  "christian mccaffrey": 56,
  "jonathan taylor": 54,
  "amon ra st brown": 54,
  "ceedee lamb": 52,
  "devon achane": 48,
  "drake london": 48,
  "justin jefferson": 48,
  "james cook": 47,
  "ashton jeanty": 43,
  "trey mcbride": 39,
  "saquon barkley": 39,
  "chase brown": 38,
  "omarion hampton": 38,
  "jeremiyah love": 38,
  "rashee rice": 37
};
