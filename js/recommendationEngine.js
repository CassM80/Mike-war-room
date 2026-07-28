// Sprint 24.3 — market valuation, alerts, nomination, and recommendation logic.

function rebuildMarketRankCache(){
  const ranks=new Map();
  for(const pos of ['QB','RB','WR','TE','K','DEF']){
    PLAYERS.filter(p=>p.pos===pos).sort((a,b)=>(adpFor(a)||99999)-(adpFor(b)||99999)||a.name.localeCompare(b.name)).forEach((p,i)=>ranks.set(playerKey(p.name),i+1));
  }
  marketRankCache={count:PLAYERS.length,ranks};
}

function positionRankFor(base){const provider=Number(base?.provider_pos_rank||0);if(provider>0)return provider;if(marketRankCache.count!==PLAYERS.length)rebuildMarketRankCache();return marketRankCache.ranks.get(playerKey(base.name))||999;}

function leagueMarketMultiplier(pos){
  const r=leagueConfig.roster||defaultLeagueConfig.roster;
  const teams=Number(leagueConfig.teamCount||12),budget=Number(leagueConfig.budget||200);
  let m=(budget/200)*Math.pow(teams/12,.30)*Math.pow(Math.max(10,rosterSize())/17,.10);
  const flexShare=Number(r.flex||0)/3;
  if(pos==='QB') m*=Number(r.qb||1)>=2?1.85:Math.pow(Math.max(.75,Number(r.qb||1)),.35);
  if(pos==='RB') m*=Math.pow((Number(r.rb||2)+flexShare)/2.67,.30);
  if(pos==='WR') m*=Math.pow((Number(r.wr||2)+flexShare)/2.67,.30);
  if(pos==='TE') m*=Math.pow(Math.max(.7,Number(r.te||1)+Number(r.flex||0)*.12),.28);
  if(leagueConfig.scoring==='PPR'&&['WR','TE'].includes(pos))m*=1.04;
  if(leagueConfig.scoring==='Standard'&&pos==='RB')m*=1.05;
  if(leagueConfig.scoring==='Standard'&&['WR','TE'].includes(pos))m*=.94;
  return m;
}

function positionAwareMarketPrice(base){
  const curve=MARKET_CURVES[base?.pos]||[];
  const rank=positionRankFor(base);
  let value=rank<=curve.length?curve[rank-1]:0;
  if(!value&&rank<=Math.max(24,Math.round((leagueConfig.teamCount||12)*2.2))) value=1;
  value*=leagueMarketMultiplier(base.pos);
  // Prevent 1-QB values from being distorted into elite-RB/WR territory.
  if(base.pos==='QB'&&Number((leagueConfig.roster||{}).qb||1)===1)value=Math.min(value,Math.round(32*(Number(leagueConfig.budget||200)/200)));
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
}
function directConsensusFor(base){
  const raw=(typeof AUCTION_CONSENSUS_VALUES!=="undefined")?AUCTION_CONSENSUS_VALUES[normalizedConsensusKey(base?.name)]:0;
  const multiplier=(Number(leagueConfig?.budget||200)/200)*Math.pow(Number(leagueConfig?.teamCount||12)/12,.30);
  return raw?Math.max(1,Math.round(raw*multiplier)):0;
}
function baselineMarketFor(base){
  const direct=directConsensusFor(base);
  if(direct) return direct;
  // Curated fair ranges are a stable fallback; ranking-derived prices are always labeled estimates.
  const low=Number(base?.fairLow||0), high=Number(base?.fairHigh||0);
  if(low||high) return Math.max(1,Math.round(((low||high)+(high||low))/2));
  return positionAwareMarketPrice(base);
}
function marketPriceSource(base){
  if(marketOverrideFor(base)) return {code:"EDITED",label:"Your edited market price"};
  if(directConsensusFor(base)) return {code:"CONSENSUS",label:`${AUCTION_CONSENSUS_META.label} • ${AUCTION_CONSENSUS_META.updated}`};
  if(Number(base?.fairLow||0)||Number(base?.fairHigh||0)) return {code:"BASELINE",label:"War Room stable baseline"};
  return {code:"ESTIMATE",label:"Rank-derived estimate"};
}
function consensusPriceFor(base){
  if(!base) return 0;
  return marketOverrideFor(base)||baselineMarketFor(base);
}

function adpFor(base){
  const value=Number(base?.adp||base?.search_rank||0);
  return Number.isFinite(value)&&value>0?Math.round(value*10)/10:0;
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

function nominationSuggestion(){
  if(profileMode==="clean" && !Object.keys(personalEvaluations).length) return {player:"—",reason:"Build your personal board in Scouting to activate nomination strategy."};
  const available=PLAYERS.filter(p=>!sold(p.name)&&p.tier!=="UNRANKED"&&Number(p.fairLow)>0);
  if(!available.length) return {player:"—",reason:"No ranked players remain."};
  const hot=["QB","RB","WR","TE"].map(pos=>({pos,...positionMarketStats(pos)})).sort((a,b)=>b.infl-a.infl)[0];
  let pool=available.filter(p=>p.pos===hot.pos);
  if(!pool.length) pool=available;
  pool.sort((a,b)=>{
    const ae=getPersonalEvaluation(a.name)||{}, be=getPersonalEvaluation(b.name)||{};
    const aKeep=Number(!!ae.flagPlant)*3+Number(!!ae.favorite)*2+Number(!!ae.sleeper);
    const bKeep=Number(!!be.flagPlant)*3+Number(!!be.favorite)*2+Number(!!be.sleeper);
    if(aKeep!==bKeep) return aKeep-bKeep;
    return Number(b.pressure||0)-Number(a.pressure||0);
  });
  const p=pool[0], ps=positionMarketStats(p.pos);
  if(state.sales.length<2) return {player:p.name,reason:`Early nomination: test the room on a Tier ${p.tier} ${p.pos}.`};
  if(ps.status==="HOT") return {player:p.name,reason:`${p.pos}s are running hot. Put another premium ${p.pos} into the room and drain budgets.`};
  if(ps.status==="CHEAP") return {player:p.name,reason:`${p.pos}s are cheap. Nominate one you are willing to buy if the discount holds.`};
  return {player:p.name,reason:`High-pressure Tier ${p.tier} player who can reveal the room's current appetite.`};
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
  if(sale) return {score:0,fit:"SOLD",confidence:"FINAL",reasons:[`${sale.winner==="me"?"Your team":"Another team"} acquired him for ${money(sale.price)}`],sold:true};
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
