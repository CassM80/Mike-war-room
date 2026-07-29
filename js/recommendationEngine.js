// Sprint 24.3 — market valuation, alerts, nomination, and recommendation logic.


function espnPositionRankFor(base){
  const list=(typeof ESPN_POSITIONAL_RANKINGS!=="undefined"?ESPN_POSITIONAL_RANKINGS[base?.pos]:null)||[];
  const key=playerMatchKey(base?.name);
  const index=list.findIndex(name=>playerMatchKey(name)===key);
  return index>=0?index+1:0;
}
function espnAuctionBaselineFor(base){
  const rank=espnPositionRankFor(base);
  const curve=(typeof ESPN_AUCTION_CURVES!=="undefined"?ESPN_AUCTION_CURVES[base?.pos]:null)||[];
  if(!rank)return 0;
  const raw=rank<=curve.length?Number(curve[rank-1]||0):(rank<=modeledCoverageDepth(base?.pos)?1:0);
  return Math.max(0,Math.round(raw));
}
function blendWithEspn(base,sourceValue,sourceCode){
  const espn=espnAuctionBaselineFor(base);
  if(!espn)return Math.max(0,Math.round(sourceValue||0));
  const source=Math.max(0,Number(sourceValue||0));
  const weights={CONSENSUS:.50,BASELINE:.30,MODELED:.20};
  const w=weights[sourceCode]??.35;
  const blended=Math.round(source*w+espn*(1-w));
  const cap=espn+(base?.pos==='QB'?4:6);
  return Math.max(1,Math.min(blended,cap));
}

// Sprint 28.3 — QB Market Calibration.
// In one-QB leagues, replacement value compresses the position sharply after
// the elite tier. User-edited prices bypass this layer and remain authoritative.
function isOneQuarterbackLeague(){
  const roster=leagueConfig?.roster||defaultLeagueConfig.roster||{};
  return Number(roster.qb||1)===1&&Number(roster.superflex||0)===0;
}
function calibrateQuarterbackValue(base,value){
  // Sprint 29.0 compatibility wrapper: all positional calibration now belongs
  // to the dynamic league engine rather than a Mike-specific QB rule.
  return dynamicLeagueValue(base,value);
}

function providerRankFor(base){
  const value=Number(base?.provider_rank||base?.adp||base?.sleeper_rank||base?.search_rank||0);
  return Number.isFinite(value)&&value>0?Math.round(value*10)/10:0;
}
function providerRankSource(base){
  if(Number(base?.provider_rank)>0)return "Provider overall rank";
  if(Number(base?.adp)>0)return "Dedicated ADP";
  if(Number(base?.sleeper_rank||base?.search_rank)>0)return "Sleeper search-rank fallback";
  return "Unavailable";
}
function rebuildMarketRankCache(){
  const ranks=new Map();
  for(const pos of ['QB','RB','WR','TE','K','DEF']){
    PLAYERS.filter(p=>p.pos===pos).sort((a,b)=>(providerRankFor(a)||99999)-(providerRankFor(b)||99999)||a.name.localeCompare(b.name)).forEach((p,i)=>ranks.set(playerKey(p.name),i+1));
  }
  marketRankCache={count:PLAYERS.length,ranks};
}
// Sprint 29.1 — trusted positional rank hierarchy.
// A provider overall/search rank is not sufficient evidence that an ESPN-unranked
// player belongs near the top of a position. This prevents prospects and stale
// records from being converted into elite auction values.
function derivedProviderPositionRankFor(base){
  if(marketRankCache.count!==PLAYERS.length)rebuildMarketRankCache();
  return marketRankCache.ranks.get(playerKey(base?.name))||999;
}
function positionRankFor(base){
  const espn=espnPositionRankFor(base);
  const providerPos=Number(base?.provider_pos_rank||0);
  if(espn>0&&providerPos>0)return Math.max(1,Math.round(espn*.65+providerPos*.35));
  if(espn>0)return espn;
  if(providerPos>0)return providerPos;
  const derived=derivedProviderPositionRankFor(base);
  const espnPool=(typeof ESPN_POSITIONAL_RANKINGS!=="undefined"?ESPN_POSITIONAL_RANKINGS[base?.pos]:null)||[];
  // When ESPN supplies a current positional pool but omits the player, place the
  // fallback after that trusted pool rather than allowing provider overall rank
  // to manufacture a top positional rank.
  if(espnPool.length)return Math.max(espnPool.length+1,derived);
  return derived;
}

function leagueMarketMultiplier(pos){
  // Kept for older modules. New valuations use dynamicLeagueValue after blending.
  const settings=leagueSettingsSnapshot();
  return availableAuctionBudget(settings)/VALUATION_BASELINE.budget;
}

function modeledCoverageDepth(pos){
  const policy=(typeof MARKET_COVERAGE_POLICY!=="undefined"?MARKET_COVERAGE_POLICY:null);
  const configured=Number(policy?.positionDepth?.[pos]||0);
  if(configured>0)return configured;
  return {QB:32,RB:88,WR:116,TE:48,K:12,DEF:12}[pos]||0;
}

function positionAwareMarketPrice(base){
  const curve=MARKET_CURVES[base?.pos]||[];
  const rank=positionRankFor(base);
  let value=rank<=curve.length?curve[rank-1]:0;
  // Sprint 28.0: extend honest $1 modeled coverage through the draft-relevant
  // positional pool. This is a baseline, not a claim of provider consensus.
  if(!value&&rank<=modeledCoverageDepth(base?.pos)) value=Number(MARKET_COVERAGE_POLICY?.minimumDraftableValue||1);
  return Math.max(0,Math.round(value));
}

const MARKET_OVERRIDE_KEY = "warRoomMarketOverridesV1";
let marketOverrides = {};
try { marketOverrides = JSON.parse(localStorage.getItem(MARKET_OVERRIDE_KEY)||"{}")||{}; } catch(e) { marketOverrides = {}; }

function normalizedConsensusKey(name){ return String(name||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function marketOverrideFor(base){ const v=Number(marketOverrides[playerKey(base?.name)]||0); return Number.isFinite(v)&&v>0?Math.round(v):0; }
function saveMarketOverride(base,value){
  if(!base) return;
  const key=playerKey(base.name), amount=Math.max(0,Math.round(Number(value)||0));
  if(amount) marketOverrides[key]=amount; else delete marketOverrides[key];
  localStorage.setItem(MARKET_OVERRIDE_KEY,JSON.stringify(marketOverrides));
  warRoomMarketRankCache={signature:"",ranks:new Map()};
}
function directConsensusFor(base){
  const raw=(typeof AUCTION_CONSENSUS_VALUES!=="undefined")?AUCTION_CONSENSUS_VALUES[normalizedConsensusKey(base?.name)]:0;
  return raw?Math.max(1,Math.round(raw)):0;
}
function baselineMarketFor(base){
  const direct=directConsensusFor(base);
  let value=0;
  if(direct) value=blendWithEspn(base,direct,"CONSENSUS");
  else {
    // Curated values remain useful, but ESPN positional context prevents stale personal
    // baselines from inflating a player far above the current public ranking tier.
    const low=Number(base?.fairLow||0), high=Number(base?.fairHigh||0);
    if(low||high){
      const curated=Math.max(1,Math.round(((low||high)+(high||low))/2));
      value=blendWithEspn(base,curated,"BASELINE");
    }else{
      const modeled=positionAwareMarketPrice(base);
      value=modeled?blendWithEspn(base,modeled,"MODELED"):espnAuctionBaselineFor(base);
    }
  }
  return calibrateQuarterbackValue(base,value);
}
function marketPriceSource(base){
  if(marketOverrideFor(base)) return {code:"EDITED",label:"Your edited market price"};
  const espn=espnPositionRankFor(base);
  const espnLabel=espn?` • ESPN ${base.pos}${espn} blend`:"";
  const leagueLabel=` • ${leagueSettingsSnapshot().teams}-team dynamic league value`;
  if(directConsensusFor(base)) return {code:"CONSENSUS",label:`${AUCTION_CONSENSUS_META.label} • ${AUCTION_CONSENSUS_META.updated}${espnLabel}${leagueLabel}`};
  if(Number(base?.fairLow||0)||Number(base?.fairHigh||0)) return {code:"BASELINE",label:`War Room curated baseline${espnLabel}${leagueLabel}`};
  if(positionAwareMarketPrice(base)>0||espnAuctionBaselineFor(base)>0) return {code:"MODELED",label:`${MARKET_COVERAGE_POLICY?.label||"War Room modeled baseline"}${espnLabel}${leagueLabel}`};
  return {code:"UNPRICED",label:"Outside modeled draft coverage"};
}
function consensusPriceFor(base){
  if(!base) return 0;
  return marketOverrideFor(base)||baselineMarketFor(base);
}

function warRoomRankSignature(){
  const r=leagueConfig?.roster||{};
  return [PLAYERS.length,leagueValuationFingerprint(),JSON.stringify(marketOverrides)].join('|');
}
function rebuildWarRoomMarketRankCache(){
  const ranks=new Map();
  const positionOrder={RB:1,WR:2,TE:3,QB:4};
  const rows=PLAYERS.filter(p=>['QB','RB','WR','TE'].includes(p.pos)&&p.active!==false&&CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase()))
    .sort((a,b)=>consensusPriceFor(b)-consensusPriceFor(a)
      ||(marketPriceSource(a).code==='CONSENSUS'?0:1)-(marketPriceSource(b).code==='CONSENSUS'?0:1)
      ||(espnPositionRankFor(a)||99999)-(espnPositionRankFor(b)||99999)
      ||(providerRankFor(a)||99999)-(providerRankFor(b)||99999)
      ||(positionOrder[a.pos]||9)-(positionOrder[b.pos]||9)
      ||a.name.localeCompare(b.name));
  rows.forEach((p,i)=>ranks.set(playerKey(p.name),i+1));
  warRoomMarketRankCache={signature:warRoomRankSignature(),ranks};
}
function marketRankFor(base){
  if(!base)return 0;
  const sig=warRoomRankSignature();
  if(warRoomMarketRankCache.signature!==sig)rebuildWarRoomMarketRankCache();
  return warRoomMarketRankCache.ranks.get(playerKey(base.name))||0;
}
function adpFor(base){ return providerRankFor(base); }
function marketRankSource(base){
  const provider=providerRankFor(base),espn=espnPositionRankFor(base);
  const refs=[espn?`ESPN ${base.pos}${espn}`:'',provider?`provider ${provider}`:''].filter(Boolean).join(' • ');
  return refs?`War Room blended auction rank • ${refs}`:'War Room blended auction rank';
}

function marketValueFor(base){
  if(!base) return 0;
  return consensusPriceFor(base);
}

function marketSeedValue(base){
  return marketValueFor(base);
}

function saleForPlayer(name){ return state.sales.find(s=>s.player===name) || null; }

function alerts(){
  const arr=[], ms=marketStats(), selected=selectedBase();
  if(selected&&!sold(selected.name)){
    const ps=positionMarketStats(selected.pos), left=tierRemaining(selected.pos,["1A","1B","2"]);
    if(ps.status==="HOT") arr.push({c:"red",t:`${selected.pos} MARKET HOT — ${Math.round(ps.infl*100)}% ABOVE EXPECTED`});
    if(ps.status==="CHEAP") arr.push({c:"green",t:`${selected.pos} BUY WINDOW — ${Math.abs(Math.round(ps.infl*100))}% BELOW EXPECTED`});
    if(left<=2&&left>0) arr.push({c:left===1?"red":"yellow",t:`TIER SCARCITY — ${left} TIER 2+ ${selected.pos}${left===1?"":"S"} LEFT`});
    const need=positionNeed(selected.pos);
    if(need==="STARTER") arr.push({c:"green",t:`ROSTER NEED — OPEN ${selected.pos} STARTER`});
  }
  if(ms.temp==="HOT") arr.push({c:"red",t:`ROOM ${Math.round(ms.infl*100)}% OVER MARKET — STAY DISCIPLINED`});
  else if(ms.temp==="COLD") arr.push({c:"green",t:"ROOM BELOW MARKET — VALUE WINDOW OPEN"});
  if(!Object.keys(state.roster).some(s=>s==="QB") && state.sales.filter(s=>byName[s.player]?.pos==="QB").length>=5) arr.push({c:"green",t:"QB RUN STARTED — YOUR WAITING PLAN STILL WORKS"});
  return arr.slice(0,3);
}


// Sprint 30.0 — Zero-Click Intelligence.
// These helpers derive actionable draft guidance entirely from saved league
// settings, the personal board, recorded sales, remaining roster slots and
// live market behavior. No current-bid entry is required.
function zeroClickCandidatePool(){
  return PLAYERS.filter(p=>
    !sold(p.name)&&p.active!==false&&
    ['QB','RB','WR','TE'].includes(p.pos)&&
    CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase())&&
    marketValueFor(p)>0&&positionNeed(p.pos)!=='FULL'
  );
}

function zeroClickPriorityScore(base){
  const rec=recommendationFor(base);
  const ev=getPersonalEvaluation(base.name)||{};
  const conviction=normalizedConviction(ev.conviction);
  const need=positionNeed(base.pos);
  let score=rec.score;
  if(need==='STARTER')score+=12;
  else if(need==='FLEX')score+=6;
  if(ev.flagPlant)score+=10;
  if(ev.favorite)score+=6;
  if(ev.sleeper)score+=3;
  if(ev.avoid||conviction===1)score-=40;
  score+=Math.max(0,conviction-3)*4;
  return score;
}

function automaticPivotsFor(base){
  if(!base)return {primary:null,secondary:null,budget:null};
  const selectedMarket=Math.max(1,marketValueFor(base));
  const candidates=zeroClickCandidatePool().filter(p=>p.name!==base.name&&p.pos===base.pos);
  const sorted=candidates.slice().sort((a,b)=>
    zeroClickPriorityScore(b)-zeroClickPriorityScore(a)||
    Math.abs(marketValueFor(a)-selectedMarket)-Math.abs(marketValueFor(b)-selectedMarket)||
    marketRankFor(a)-marketRankFor(b)
  );
  const primary=sorted.find(p=>marketValueFor(p)<=Math.ceil(selectedMarket*1.15))||sorted[0]||null;
  const secondary=sorted.find(p=>p!==primary&&marketValueFor(p)<=selectedMarket)||sorted.find(p=>p!==primary)||null;
  const budget=sorted
    .filter(p=>p!==primary&&p!==secondary&&marketValueFor(p)<=Math.max(1,Math.floor(selectedMarket*.70)))
    .sort((a,b)=>zeroClickPriorityScore(b)-zeroClickPriorityScore(a)||marketValueFor(b)-marketValueFor(a))[0]||null;
  return {primary,secondary,budget};
}

function zeroClickIntelligence(){
  const pool=zeroClickCandidatePool();
  if(!pool.length)return [];
  const best=pool.slice().sort((a,b)=>zeroClickPriorityScore(b)-zeroClickPriorityScore(a)||marketRankFor(a)-marketRankFor(b))[0];
  const open=availableSlots();
  const directNeeds=['QB','RB','WR','TE'].filter(pos=>positionNeed(pos)==='STARTER');
  let priorityPos=directNeeds[0]||(['RB','WR','TE'].find(pos=>positionNeed(pos)==='FLEX'))||best.pos;
  if(directNeeds.length>1){
    priorityPos=directNeeds.slice().sort((a,b)=>{
      const av=pool.filter(p=>p.pos===a).sort((x,y)=>marketValueFor(y)-marketValueFor(x));
      const bv=pool.filter(p=>p.pos===b).sort((x,y)=>marketValueFor(y)-marketValueFor(x));
      const aDrop=(marketValueFor(av[0])-marketValueFor(av[5]||av.at(-1)||av[0]));
      const bDrop=(marketValueFor(bv[0])-marketValueFor(bv[5]||bv.at(-1)||bv[0]));
      return bDrop-aDrop;
    })[0];
  }
  const priorityPlayer=pool.filter(p=>p.pos===priorityPos).sort((a,b)=>zeroClickPriorityScore(b)-zeroClickPriorityScore(a))[0]||best;
  const scarcity=['QB','RB','WR','TE'].map(pos=>{
    const top=pool.filter(p=>p.pos===pos).sort((a,b)=>marketValueFor(b)-marketValueFor(a));
    const meaningful=top.filter(p=>marketValueFor(p)>=Math.max(2,Math.round((top[0]&&marketValueFor(top[0])||1)*.28))).length;
    return {pos,meaningful,need:positionNeed(pos),player:top[0]};
  }).filter(x=>x.player&&x.need!=='FULL').sort((a,b)=>a.meaningful-b.meaningful)[0];
  const items=[
    {label:'BEST FIT NOW',player:best.name,detail:`${best.pos} • ${money(marketValueFor(best))} League Value • ${recommendationFor(best).fit}`,tone:'green'},
    {label:'ROSTER PRIORITY',player:priorityPlayer.name,detail:`${priorityPos} need • ${positionNeed(priorityPos)==='STARTER'?'starter still open':'best FLEX fit'}`,tone:'blue'}
  ];
  if(scarcity)items.push({label:'SCARCITY WATCH',player:scarcity.player.name,detail:`${scarcity.pos} • ${scarcity.meaningful} meaningful values remain`,tone:scarcity.meaningful<=4?'red':'yellow'});
  return items.slice(0,3);
}


// Sprint 30.3 — Recommended Now.
// Produces a live shortlist from current roster construction, legal buying power,
// personal preferences, positional scarcity, room demand and market conditions.
function dynamicTargetContext(){
  const remaining=Math.max(0,Number(leagueConfig.budget||200)-spent());
  const slots=availableSlots();
  const maxLegal=Math.max(0,remaining-Math.max(0,slots.length-1));
  return {remaining,slots,maxLegal,myTeamIndex:Number(leagueConfig.myTeamIndex||0)};
}

function dynamicTargetScore(base,live){
  const ctx=live?.ctx||dynamicTargetContext();
  const ev=getPersonalEvaluation(base.name)||{};
  const rec=recommendationFor(base);
  const conviction=normalizedConviction(ev.conviction);
  const leagueValue=Math.max(1,marketValueFor(base));
  const personalValue=Math.max(0,Number(ev.value||0));
  const hardStop=Math.max(0,Number(ev.hardStop||0));
  const need=positionNeed(base.pos);
  const demand=live?.demandByPos?.[base.pos]||roomDemandFor(base.pos);
  const affordableOpponents=demand.teams.filter(t=>t.index!==ctx.myTeamIndex&&t.budget>=leagueValue).length;
  let score=Number(rec.score||0);

  // Personal board is evidence, not a static ordering.
  if(Number(ev.rank)>0)score+=Math.max(2,18-Math.min(16,Number(ev.rank)*.7));
  score+=(conviction-3)*5;
  if(ev.flagPlant)score+=12;
  if(ev.favorite)score+=7;
  if(ev.sleeper)score+=4;
  if(ev.avoid||conviction===1)score-=100;
  if(personalValue>leagueValue)score+=Math.min(12,(personalValue-leagueValue)*1.5);

  // Current roster construction must be the strongest live signal.
  if(need==='STARTER')score+=18;
  else if(need==='FLEX'||need==='SUPERFLEX')score+=9;
  else if(need==='BENCH')score-=7;
  else score-=100;

  // Keep the list executable with the money actually left.
  if(leagueValue<=ctx.maxLegal)score+=7;
  else score-=Math.min(35,(leagueValue-ctx.maxLegal)*3);
  if(hardStop>0&&hardStop<=ctx.maxLegal)score+=4;
  if(ctx.remaining>0&&leagueValue/ctx.remaining>.55)score-=8;
  if(ctx.slots.length<=5&&leagueValue<=Math.max(3,ctx.remaining/Math.max(1,ctx.slots.length)))score+=5;

  // A contested position is more urgent, but a hot room still demands discipline.
  score+=Math.min(6,affordableOpponents);
  const ps=positionMarketStats(base.pos);
  if(ps.status==='CHEAP')score+=7;
  if(ps.status==='HOT')score-=5;
  const meaningful=Number(live?.meaningfulByPos?.[base.pos]||0);
  if(meaningful<=4&&need!=='BENCH')score+=8;
  else if(meaningful<=7&&need!=='BENCH')score+=4;

  return score;
}

function dynamicTargetReason(base,live){
  const ev=getPersonalEvaluation(base.name)||{};
  const ctx=live?.ctx||dynamicTargetContext();
  const leagueValue=Math.max(1,marketValueFor(base));
  const need=positionNeed(base.pos);
  const ps=positionMarketStats(base.pos);
  const demand=live?.demandByPos?.[base.pos]||roomDemandFor(base.pos);
  const opponents=demand.teams.filter(t=>t.index!==ctx.myTeamIndex&&t.budget>=leagueValue).length;
  const meaningful=Number(live?.meaningfulByPos?.[base.pos]||0);
  if(need==='STARTER')return `Open ${base.pos} starter • ${money(leagueValue)} League Value`;
  if((need==='FLEX'||need==='SUPERFLEX')&&meaningful<=6)return `${base.pos} scarcity • ${meaningful} meaningful options remain`;
  if(ps.status==='CHEAP')return `${base.pos} value window • room below expected`;
  if(Number(ev.value||0)>leagueValue)return `Personal edge +${money(Number(ev.value)-leagueValue)} • fits ${need.toLowerCase()}`;
  if(ev.flagPlant)return `Plant-the-flag target • ${money(leagueValue)} League Value`;
  if(ev.favorite||normalizedConviction(ev.conviction)>=4)return `Strong personal target • ${need.toLowerCase()} fit`;
  if(opponents>=5)return `${opponents} opponents active • demand remains high`;
  if(leagueValue>ctx.maxLegal)return `Discount only • legal max ${money(ctx.maxLegal)}`;
  return `${recommendationFor(base).fit} • ${money(leagueValue)} League Value`;
}

function dynamicTopTargets(limit=10){
  const ctx=dynamicTargetContext();
  const candidates=PLAYERS.filter(p=>
    !sold(p.name)&&p.active!==false&&['QB','RB','WR','TE'].includes(p.pos)&&
    CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase())&&marketValueFor(p)>0&&
    positionNeed(p.pos)!=='FULL'
  );
  const demandByPos=Object.fromEntries(['QB','RB','WR','TE'].map(pos=>[pos,roomDemandFor(pos)]));
  const meaningfulByPos={};
  ['QB','RB','WR','TE'].forEach(pos=>{
    const rows=candidates.filter(p=>p.pos===pos).sort((a,b)=>marketValueFor(b)-marketValueFor(a));
    const top=marketValueFor(rows[0]||{});
    meaningfulByPos[pos]=rows.filter(p=>marketValueFor(p)>=Math.max(2,top*.28)).length;
  });
  const live={ctx,demandByPos,meaningfulByPos};
  return candidates
    .map(p=>({player:effectivePlayer(p),score:dynamicTargetScore(p,live),reason:dynamicTargetReason(p,live),leagueValue:marketValueFor(p),ev:getPersonalEvaluation(p.name)||{}}))
    .filter(x=>x.score>-20 && !(x.ev.avoid||normalizedConviction(x.ev.conviction)===1))
    .sort((a,b)=>b.score-a.score||Number(a.leagueValue>ctx.maxLegal)-Number(b.leagueValue>ctx.maxLegal)||marketRankFor(a.player)-marketRankFor(b.player))
    .slice(0,Math.max(1,Number(limit||10)));
}

function nominationSuggestion(){
  if(profileMode==="clean" && !Object.keys(personalEvaluations).length) return {player:"—",reason:"Build your personal board in Scouting to activate nomination strategy."};
  const available=PLAYERS.filter(p=>!sold(p.name)&&p.tier!=="UNRANKED"&&Number(p.fairLow)>0);
  if(!available.length) return {player:"—",reason:"No ranked players remain."};
  const myIdx=Number(leagueConfig.myTeamIndex||0);
  const demandByPos=["QB","RB","WR","TE"].map(pos=>({pos,...roomDemandFor(pos),market:positionMarketStats(pos)}));
  const drain=demandByPos.sort((a,b)=>b.count-a.count||b.starterCount-a.starterCount||b.market.infl-a.market.infl)[0];
  let pool=available.filter(p=>p.pos===drain.pos);
  if(!pool.length)pool=available;
  pool.sort((a,b)=>{
    const ae=getPersonalEvaluation(a.name)||{},be=getPersonalEvaluation(b.name)||{};
    const aProtect=Number(!!ae.flagPlant)*5+Number(!!ae.favorite)*3+Number(!!ae.sleeper)*2+Number(ae.conviction>=4)*2;
    const bProtect=Number(!!be.flagPlant)*5+Number(!!be.favorite)*3+Number(!!be.sleeper)*2+Number(be.conviction>=4)*2;
    if(aProtect!==bProtect)return aProtect-bProtect;
    const affordableA=drain.teams.filter(t=>t.index!==myIdx&&t.budget>=marketValueFor(a)).length;
    const affordableB=drain.teams.filter(t=>t.index!==myIdx&&t.budget>=marketValueFor(b)).length;
    if(affordableA!==affordableB)return affordableB-affordableA;
    return Number(b.pressure||0)-Number(a.pressure||0);
  });
  const p=pool[0],d=roomDemandFor(p.pos),opponents=d.teams.filter(t=>t.index!==myIdx&&t.budget>=marketValueFor(p));
  if(opponents.length>=4)return {player:p.name,reason:`${opponents.length} opponents still need ${p.pos} and can afford his ${money(marketValueFor(p))} League Value. Use the nomination to drain budgets.`};
  if(d.starterCount>=2)return {player:p.name,reason:`${d.starterCount} teams still have an open starting ${p.pos} spot. Test that demand without exposing a protected target.`};
  const ps=positionMarketStats(p.pos);
  if(ps.status==="HOT")return {player:p.name,reason:`${p.pos}s are running hot. Put another ${p.pos} into the room and make competitors spend.`};
  if(ps.status==="CHEAP")return {player:p.name,reason:`${p.pos}s are cheap. Nominate one you are willing to buy if the discount holds.`};
  return {player:p.name,reason:`Low-protection nomination that tests the remaining ${p.pos} market.`};
}

function positionNeed(pos){
  const open=availableSlots();
  const direct={QB:["QB"],RB:["RB1","RB2"],WR:["WR1","WR2"],TE:["TE"],K:["K"],DEF:["DEF"]}[pos]||[];
  if(direct.some(slot=>open.includes(slot))) return "STARTER";
  if(["RB","WR","TE"].includes(pos) && ["FLEX1","FLEX2"].some(slot=>open.includes(slot))) return "FLEX";
  return open.some(slot=>slot.startsWith("BN"))?"BENCH":"FULL";
}

function recommendationFor(base){
  if(!base) return {score:0,fit:"—",confidence:"—",reasons:[]};
  const sale=sold(base.name);
  if(sale) return {score:0,fit:"SOLD",confidence:"FINAL",reasons:[`${teamLabelForSale(sale)} acquired him for ${money(sale.price)}`],sold:true};
  const p=effectivePlayer(base), ev=p.personalEvaluation, reasons=[];
  let score=45, confidence=40;
  if(p.tier!=="UNRANKED"){ score+=Math.max(0,14-Number(p.pressure||5)); confidence+=18; reasons.push(`Curated Tier ${p.tier} player`); }
  if(ev){
    confidence+=30;
    const myGuys=normalizedConviction(ev.conviction); score+=(myGuys-3)*10;
    if(ev.avoid||myGuys===1){score-=35; reasons.unshift("★ My Guys — Avoid");}
    else if(myGuys===5){score+=15; reasons.unshift("★★★★★ My Guys — Plant the Flag");}
    else if(myGuys===4){score+=8; reasons.unshift("★★★★☆ My Guys — Strong Target");}
    else if(myGuys===2){score-=8; reasons.unshift("★★☆☆☆ My Guys — Discount Only");}
    if(ev.sleeper){score+=8; reasons.push("Sleeper designation adds upside appeal");}
    const edge=playerEdge(base,ev); if(edge>=5){score+=8;reasons.push(`+${edge} personal market edge`);} else if(edge<=-5){score-=8;reasons.push(`${edge} personal market edge`);}
  }
  const demand=roomDemandFor(p.pos);
  const opponents=demand.teams.filter(t=>t.index!==Number(leagueConfig.myTeamIndex||0)&&t.budget>=Math.max(1,marketValueFor(p))).length;
  if(opponents>=6){score+=4;reasons.push(`${opponents} opponents still need ${p.pos} and can afford this tier`);}
  else if(opponents>=3){score+=2;reasons.push(`${opponents} opponents remain in the ${p.pos} market`);}
  const need=positionNeed(p.pos);
  if(need==="STARTER"){score+=16; reasons.push(`Fills an open ${p.pos} starting spot`);}
  else if(need==="FLEX"){score+=9; reasons.push("Fits an open FLEX spot");}
  else if(need==="BENCH"){score-=3; reasons.push("Starter need is already covered");}
  else {score-=25; reasons.push("No legal roster spot remains");}
  const remaining=Number(leagueConfig.budget||200)-spent(), left=availableSlots().length, maxLegal=Math.max(0,remaining-(left-1));
  const hard=Number(ev?.hardStop||p.overpay||0), value=Number(ev?.value||marketValueFor(p)||0);
  if(hard && hard<=maxLegal){score+=6; reasons.push(`Hard stop ${money(hard)} fits your legal max bid`);}
  if(hard && hard>maxLegal){score-=20; reasons.push(`Hard stop exceeds your legal max bid of ${money(maxLegal)}`);}
  if(value && remaining>0 && value/remaining>.45){score-=5; reasons.push("Would consume a large share of remaining budget");}
  if(p.pos==="QB"&&isOneQuarterbackLeague()&&need!=="FULL"){
    const qbMarket=marketValueFor(p);
    const qbPenalty=qbMarket>=13?6:qbMarket>=7?4:qbMarket>=3?2:0;
    if(qbPenalty){score-=qbPenalty; reasons.push("One-QB replacement value favors preserving RB/WR budget");}
  }
  const ms=marketStats(), ps=positionMarketStats(p.pos), scarce=tierRemaining(p.pos,["1A","1B","2"]);
  if(ps.status==="HOT"){score-=5; reasons.push(`${p.pos} market is ${Math.round(ps.infl*100)}% above expected`);}
  if(ps.status==="CHEAP"){score+=7; reasons.push(`${p.pos} buying window is ${Math.abs(Math.round(ps.infl*100))}% below expected`);}
  if(p.tier!=="UNRANKED"&&scarce===1){score+=10; reasons.push(`Last Tier 2+ ${p.pos} remaining`);}
  else if(p.tier!=="UNRANKED"&&scarce===2){score+=5; reasons.push(`Only 2 Tier 2+ ${p.pos}s remain`);}
  if(ms.temp==="HOT"){score-=3; reasons.push("Overall room is hot — stay disciplined");}
  if(ms.temp==="COLD"){score+=3; reasons.push("Overall room has entered a value window");}
  score=Math.max(0,Math.min(100,Math.round(score))); confidence=Math.max(25,Math.min(98,Math.round(confidence)));
  let fit=score>=85?"EXCELLENT FIT":score>=70?"STRONG FIT":score>=50?"SITUATIONAL":"POOR FIT";
  const dedup=[...new Set(reasons)].slice(0,3);
  return {score,fit,confidence:confidence>=80?"HIGH CONFIDENCE":confidence>=55?"MEDIUM CONFIDENCE":"LOW CONFIDENCE",reasons:dedup};
}
