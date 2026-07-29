// Sprint 29.0 — Dynamic League Valuation Engine.
// External rankings and market prices remain evidence. This layer converts that
// evidence into a value for the league currently configured in Headquarters.

const VALUATION_BASELINE={teams:12,budget:200,scoring:'PPR',roster:{qb:1,rb:2,wr:2,te:1,flex:2,superflex:0,k:1,def:1,bench:7},keepers:0,keeperBudget:0};
const FLEX_ALLOCATION={RB:.43,WR:.47,TE:.10};
const BENCH_ALLOCATION={QB:.11,RB:.35,WR:.40,TE:.12,K:.01,DEF:.01};

function normalizedScoringLevel(scoring){
  const value=String(scoring||'PPR').toLowerCase();
  if(value.includes('half'))return .5;
  if(value.includes('standard'))return 0;
  return 1;
}
function leagueSettingsSnapshot(config=leagueConfig){
  const roster={...VALUATION_BASELINE.roster,...(config?.roster||{})};
  return {
    teams:Math.max(2,Number(config?.teamCount||VALUATION_BASELINE.teams)),
    budget:Math.max(1,Number(config?.budget||VALUATION_BASELINE.budget)),
    scoring:config?.scoring||VALUATION_BASELINE.scoring,
    ppr:normalizedScoringLevel(config?.scoring),
    roster,
    keepers:Math.max(0,Number(config?.keepers||0)),
    keeperBudget:Math.max(0,Number(config?.keeperBudget||0))
  };
}
function effectiveStarterDemand(pos,settings=leagueSettingsSnapshot()){
  const r=settings.roster;
  if(pos==='QB')return Number(r.qb||0)+Number(r.superflex||0)*.92;
  if(pos==='RB')return Number(r.rb||0)+Number(r.flex||0)*FLEX_ALLOCATION.RB+Number(r.superflex||0)*.025;
  if(pos==='WR')return Number(r.wr||0)+Number(r.flex||0)*FLEX_ALLOCATION.WR+Number(r.superflex||0)*.025;
  if(pos==='TE')return Number(r.te||0)+Number(r.flex||0)*FLEX_ALLOCATION.TE+Number(r.superflex||0)*.01;
  if(pos==='K')return Number(r.k||0);
  if(pos==='DEF')return Number(r.def||0);
  return 0;
}
function keeperRosterReduction(pos,settings){
  if(!settings.keepers)return 0;
  const shares={QB:.08,RB:.39,WR:.40,TE:.11,K:.01,DEF:.01};
  return settings.keepers*(shares[pos]||0);
}
function replacementRankForLeague(pos,settings=leagueSettingsSnapshot()){
  const starterDemand=effectiveStarterDemand(pos,settings);
  const benchDemand=Number(settings.roster.bench||0)*(BENCH_ALLOCATION[pos]||0);
  const kept=Math.min(starterDemand+benchDemand,keeperRosterReduction(pos,settings));
  return Math.max(1,Math.round(settings.teams*Math.max(0,starterDemand+benchDemand-kept)));
}
function baselineReplacementRank(pos){
  return replacementRankForLeague(pos,leagueSettingsSnapshot({teamCount:VALUATION_BASELINE.teams,budget:VALUATION_BASELINE.budget,scoring:VALUATION_BASELINE.scoring,roster:VALUATION_BASELINE.roster}));
}
function scoringValueMultiplier(pos,settings=leagueSettingsSnapshot()){
  const ppr=settings.ppr;
  if(pos==='RB')return .97+ppr*.05;
  if(pos==='WR')return .91+ppr*.09;
  if(pos==='TE')return .90+ppr*.10;
  return 1;
}
function availableAuctionBudget(settings=leagueSettingsSnapshot()){
  return Math.max(1,settings.budget-settings.keeperBudget);
}
function leagueDemandMultiplier(base,settings=leagueSettingsSnapshot()){
  const pos=base?.pos;
  const replacement=replacementRankForLeague(pos,settings);
  const baseline=Math.max(1,baselineReplacementRank(pos));
  const scarcityRatio=replacement/baseline;
  const rank=Math.max(1,positionRankFor(base)||espnPositionRankFor(base)||replacement);
  const proximity=Math.max(0,Math.min(1,rank/replacement));
  // Elite players are stable; players near replacement react more strongly.
  let multiplier=Math.pow(scarcityRatio,.30+.34*proximity);
  if(pos==='QB'){
    if(Number(settings.roster.superflex||0)>0)multiplier*=1.52;
    else if(Number(settings.roster.qb||0)>=2)multiplier*=1.42;
    else if(Number(settings.roster.qb||0)===1)multiplier*=.90;
  }
  return multiplier;
}
function dynamicLeagueValue(base,evidenceValue){
  const evidence=Math.max(0,Number(evidenceValue||0));
  if(!evidence||!base)return 0;
  const settings=leagueSettingsSnapshot();
  const budgetScale=availableAuctionBudget(settings)/VALUATION_BASELINE.budget;
  const demand=leagueDemandMultiplier(base,settings);
  const scoring=scoringValueMultiplier(base.pos,settings);
  let value=evidence*budgetScale*demand*scoring;
  const replacement=replacementRankForLeague(base.pos,settings);
  const rank=positionRankFor(base)||espnPositionRankFor(base)||999;
  if(rank>replacement)value=Math.min(value,budgetScale*1.25);
  return Math.max(1,Math.round(value));
}
function leagueValuationBreakdown(base,evidenceValue){
  const settings=leagueSettingsSnapshot();
  return {
    rawPlayerQuality:{providerRank:providerRankFor(base),espnPositionRank:espnPositionRankFor(base)},
    externalMarket:Math.max(0,Math.round(Number(evidenceValue)||0)),
    leagueDemand:Number(leagueDemandMultiplier(base,settings).toFixed(3)),
    replacementRank:replacementRankForLeague(base.pos,settings),
    budgetScale:Number((availableAuctionBudget(settings)/VALUATION_BASELINE.budget).toFixed(3)),
    scoringScale:Number(scoringValueMultiplier(base.pos,settings).toFixed(3)),
    finalLeagueValue:dynamicLeagueValue(base,evidenceValue)
  };
}
function leagueValuationFingerprint(){
  const s=leagueSettingsSnapshot(),r=s.roster;
  return [s.teams,s.budget,s.scoring,r.qb,r.rb,r.wr,r.te,r.flex,r.superflex,r.k,r.def,r.bench,s.keepers,s.keeperBudget].join('|');
}
