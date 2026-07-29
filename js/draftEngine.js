// Sprint 24.3 — auction roster, budget, market-state, and draft-state helpers.

function playerKey(name){ return normalizePlayerName(name).toLowerCase(); }

function numberedSlots(prefix,count){return Array.from({length:Math.max(0,Number(count||0))},(_,i)=>prefix+(Number(count)===1?'':i+1));}

function rosterSlots(){const r=leagueConfig.roster||{};return [...numberedSlots('QB',r.qb??1),...numberedSlots('RB',r.rb??2),...numberedSlots('WR',r.wr??2),...numberedSlots('TE',r.te??1),...numberedSlots('FLEX',r.flex??2),...numberedSlots('SF',r.superflex??0),...numberedSlots('K',r.k??1),...numberedSlots('DEF',r.def??1),...numberedSlots('BN',r.bench??7)];}

function rosterSize(){return rosterSlots().length;}

function saleTeamIndex(sale){
  if(sale?.winnerTeamIndex!==undefined && Number.isFinite(Number(sale.winnerTeamIndex)))return Number(sale.winnerTeamIndex);
  if(sale?.winner==="me")return Number(leagueConfig.myTeamIndex||0);
  return -1;
}

// Sprint 31.1 — one cached draft snapshot replaces repeated full sales/team scans.
let draftPerformanceRevision=1;
let draftSnapshotCache=null;
function invalidateDraftPerformanceCaches(){
  draftPerformanceRevision++;
  draftSnapshotCache=null;
  if(typeof dynamicTargetCache!=="undefined")dynamicTargetCache={revision:0,limit:0,rows:[]};
  if(typeof zeroClickCache!=="undefined")zeroClickCache={revision:0,items:[]};
}
function buildDraftSnapshot(){
  const teamCount=Math.max(2,Number(leagueConfig.teamCount||12));
  const teams=Array.from({length:teamCount},(_,index)=>({index,sales:[],spent:0,count:0,counts:{QB:0,RB:0,WR:0,TE:0,K:0,DEF:0}}));
  const soldMap=new Map();
  const positionSales={QB:[],RB:[],WR:[],TE:[],K:[],DEF:[]};
  for(const sale of (state.sales||[])){
    soldMap.set(sale.player,sale);
    const idx=saleTeamIndex(sale);
    const base=byName[sale.player];
    if(idx>=0&&idx<teams.length){
      const t=teams[idx]; t.sales.push(sale); t.spent+=Number(sale.price||0); t.count++;
      if(base&&t.counts[base.pos]!==undefined)t.counts[base.pos]++;
    }
    if(base&&positionSales[base.pos])positionSales[base.pos].push(sale);
  }
  const slots=rosterSlots();
  const available=slots.filter(slot=>!state.roster[slot]);
  const positionMarket={};
  for(const pos of Object.keys(positionSales)){
    const rows=positionSales[pos].filter(s=>{const x=byName[s.player];return x&&Number(x.fairLow)>0&&Number(x.fairHigh)>0;});
    if(rows.length<2){positionMarket[pos]={status:'EARLY',infl:0,count:rows.length};continue;}
    const ratios=rows.map(s=>{const x=byName[s.player],expected=(Number(x.fairLow)+Number(x.fairHigh))/2;return Number(s.price)/expected-1;});
    const infl=ratios.reduce((a,b)=>a+b,0)/ratios.length;
    positionMarket[pos]={status:infl>.08?'HOT':infl<-.08?'CHEAP':'NORMAL',infl,count:rows.length};
  }
  const marketRows=(state.sales||[]).filter(s=>MARKET.has(s.player)&&byName[s.player]&&byName[s.player].fairLow>0);
  let overallMarket={temp:'EARLY',trend:'STABLE',infl:0};
  if(marketRows.length>=3){
    const ratios=marketRows.map(s=>Number(s.price)/((byName[s.player].fairLow+byName[s.player].fairHigh)/2)-1);
    const avg=ratios.reduce((a,b)=>a+b,0)/ratios.length;
    overallMarket={temp:avg>.10?'HOT':avg<-.10?'COLD':'NORMAL',trend:avg>.05?'HEATING':avg<-.05?'COOLING':'STABLE',infl:avg};
  }
  const tierCounts=new Map();
  for(const base of PLAYERS){
    if(soldMap.has(base.name))continue;
    const key=`${base.pos}|${String(base.tier)}`;
    tierCounts.set(key,(tierCounts.get(key)||0)+1);
  }
  return {revision:draftPerformanceRevision,teams,soldMap,positionSales,slots,available,positionMarket,overallMarket,tierCounts};
}
function draftSnapshot(){
  if(!draftSnapshotCache||draftSnapshotCache.revision!==draftPerformanceRevision)draftSnapshotCache=buildDraftSnapshot();
  return draftSnapshotCache;
}
function teamSales(teamIndex){return draftSnapshot().teams[Number(teamIndex)]?.sales||[];}
function teamSpent(teamIndex){return draftSnapshot().teams[Number(teamIndex)]?.spent||0;}
function teamRemainingBudget(teamIndex){return Math.max(0,Number(leagueConfig.budget||200)-teamSpent(teamIndex));}
function teamPositionCounts(teamIndex){return draftSnapshot().teams[Number(teamIndex)]?.counts||{QB:0,RB:0,WR:0,TE:0,K:0,DEF:0};}
function teamRosterCount(teamIndex){return draftSnapshot().teams[Number(teamIndex)]?.count||0;}
function teamPositionNeed(teamIndex,pos){
  const r=leagueConfig.roster||defaultLeagueConfig.roster, c=teamPositionCounts(teamIndex);
  const direct={QB:Number(r.qb||0),RB:Number(r.rb||0),WR:Number(r.wr||0),TE:Number(r.te||0),K:Number(r.k||0),DEF:Number(r.def||0)}[pos]||0;
  if((c[pos]||0)<direct)return 'STARTER';
  const flexUsed=Math.max(0,(c.RB-r.rb)+(c.WR-r.wr)+(c.TE-r.te));
  if(['RB','WR','TE'].includes(pos)&&flexUsed<Number(r.flex||0))return 'FLEX';
  const sfUsed=Math.max(0,(c.QB-r.qb))+Math.max(0,flexUsed-Number(r.flex||0));
  if(['QB','RB','WR','TE'].includes(pos)&&sfUsed<Number(r.superflex||0))return 'SUPERFLEX';
  return teamRosterCount(teamIndex)<rosterSize()?'BENCH':'FULL';
}
function roomDemandFor(pos){
  ensureTeams();
  const snap=draftSnapshot();
  const teams=(leagueConfig.teams||[]).map((t,i)=>({index:i,name:t.teamName||`Team ${i+1}`,need:teamPositionNeed(i,pos),budget:Math.max(0,Number(leagueConfig.budget||200)-(snap.teams[i]?.spent||0))}));
  const active=teams.filter(t=>['STARTER','FLEX','SUPERFLEX'].includes(t.need));
  return {count:active.length,teams:active,starterCount:active.filter(t=>t.need==='STARTER').length};
}
function spent(){return teamSpent(Number(leagueConfig.myTeamIndex||0));}
function sold(name){return draftSnapshot().soldMap.get(name)||null;}
function availableSlots(){return draftSnapshot().available.slice();}
function tierRemaining(pos,tierSet=['1A','1B','2']){const snap=draftSnapshot();return tierSet.reduce((n,t)=>n+(snap.tierCounts.get(`${pos}|${String(t)}`)||0),0);}
function positionMarketStats(pos){return draftSnapshot().positionMarket[pos]||{status:'EARLY',infl:0,count:0};}
function marketStats(){return draftSnapshot().overallMarket;}
function phase(){
  const n=state.sales.length,ms=marketStats();
  const elite=['QB','RB','WR','TE'].reduce((sum,pos)=>sum+tierRemaining(pos,['1A','1B']),0);
  if(n<8)return 'OPENING';
  if(elite<=3&&n<60)return 'TIER COLLAPSE';
  if(ms.temp==='COLD'&&n<70)return 'VALUE WINDOW';
  if(availableSlots().length<=5||n>=75)return 'END GAME';
  return 'BUILDING';
}

function autoRosterSlot(playerName){
  const player=byName[playerName];
  if(!player) return null;
  const open=availableSlots();
  const direct=rosterSlots().filter(slot=>slot.startsWith(player.pos));
  const directSlot=direct.find(slot=>open.includes(slot));
  if(directSlot) return directSlot;
  if(["RB","WR","TE"].includes(player.pos)){
    const flexSlot=rosterSlots().filter(slot=>slot.startsWith("FLEX")).find(slot=>open.includes(slot));
    if(flexSlot) return flexSlot;
  }
  if(["QB","RB","WR","TE"].includes(player.pos)){
    const sfSlot=rosterSlots().filter(slot=>slot.startsWith("SF")).find(slot=>open.includes(slot));
    if(sfSlot) return sfSlot;
  }
  return open.find(slot=>slot.startsWith("BN"))||null;
}

function playerDraftStatus(name){const sale=saleForPlayer(name);if(!sale)return {label:"AVAILABLE",cls:"available"};return saleTeamIndex(sale)===Number(leagueConfig.myTeamIndex||0)?{label:"YOURS",cls:"yours"}:{label:"DRAFTED",cls:"drafted"};}

function freshDraftState(){ return {budget:Number(leagueConfig.budget||200),sales:[],roster:{},selected:null}; }

function applyFreshDraft(){ const fresh=freshDraftState(); state.budget=fresh.budget; state.sales=[]; state.roster={}; state.selected=null; invalidateDraftPerformanceCaches(); save(); setSelected(null,true); renderAll(); updateResetSummary(); }

function teamLabelForSale(sale){
  if(sale.winnerTeamIndex!==undefined && leagueConfig.teams?.[Number(sale.winnerTeamIndex)]) return leagueConfig.teams[Number(sale.winnerTeamIndex)].teamName||`Team ${Number(sale.winnerTeamIndex)+1}`;
  if(sale.winner==="me") return leagueConfig.teams?.[Number(leagueConfig.myTeamIndex||0)]?.teamName||"Your Team";
  return sale.winnerName||"Other Team";
}

function reportMarketValue(base){
  if(!base) return 0;
  if(Number(base.fairLow||0)>0 && Number(base.fairHigh||0)>0) return Math.round((Number(base.fairLow)+Number(base.fairHigh))/2);
  if(Number(base.buyHigh||0)>0) return Number(base.buyHigh);
  return 0;
}
