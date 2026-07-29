// Sprint 24.3 — auction roster, budget, market-state, and draft-state helpers.

function playerKey(name){ return normalizePlayerName(name).toLowerCase(); }

function numberedSlots(prefix,count){return Array.from({length:Math.max(0,Number(count||0))},(_,i)=>prefix+(Number(count)===1?'':i+1));}

function rosterSlots(){const r=leagueConfig.roster||{};return [...numberedSlots('QB',r.qb??1),...numberedSlots('RB',r.rb??2),...numberedSlots('WR',r.wr??2),...numberedSlots('TE',r.te??1),...numberedSlots('FLEX',r.flex??2),...numberedSlots('SF',r.superflex??0),...numberedSlots('K',r.k??1),...numberedSlots('DEF',r.def??1),...numberedSlots('BN',r.bench??7)];}

function rosterSize(){return rosterSlots().length;}

function spent(){ return state.sales.filter(s=>s.winner==="me").reduce((a,s)=>a+Number(s.price||0),0); }

function sold(name){ return state.sales.find(s=>s.player===name); }

function availableSlots(){ return rosterSlots().filter(s=>!state.roster[s]); }

function tierRemaining(pos,tierSet=["1A","1B","2"]){ return PLAYERS.filter(p=>p.pos===pos && tierSet.includes(String(p.tier)) && !sold(p.name)).length; }

function positionMarketStats(pos){
  const rows=state.sales.filter(s=>{const p=byName[s.player]; return p&&p.pos===pos&&Number(p.fairLow)>0&&Number(p.fairHigh)>0;});
  if(rows.length<2) return {status:"EARLY",infl:0,count:rows.length};
  const ratios=rows.map(s=>{const p=byName[s.player], expected=(Number(p.fairLow)+Number(p.fairHigh))/2; return Number(s.price)/expected-1;});
  const infl=ratios.reduce((a,b)=>a+b,0)/ratios.length;
  return {status:infl>.08?"HOT":infl<-.08?"CHEAP":"NORMAL",infl,count:rows.length};
}

function marketStats(){
  const m=state.sales.filter(s=>MARKET.has(s.player) && byName[s.player] && byName[s.player].fairLow>0);
  if(m.length<3) return {temp:"EARLY",trend:"STABLE",infl:0};
  const ratios=m.map(s=>Number(s.price)/((byName[s.player].fairLow+byName[s.player].fairHigh)/2)-1);
  const avg=ratios.reduce((a,b)=>a+b,0)/ratios.length;
  return {temp:avg>.10?"HOT":avg<-.10?"COLD":"NORMAL",trend:avg>.05?"HEATING":avg<-.05?"COOLING":"STABLE",infl:avg};
}

function phase(){
  const n=state.sales.length, ms=marketStats();
  const elite=PLAYERS.filter(p=>["1A","1B"].includes(String(p.tier))&&!sold(p.name)).length;
  if(n<8) return "OPENING";
  if(elite<=3&&n<60) return "TIER COLLAPSE";
  if(ms.temp==="COLD"&&n<70) return "VALUE WINDOW";
  if(availableSlots().length<=5||n>=75) return "END GAME";
  return "BUILDING";
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

function playerDraftStatus(name){const sale=saleForPlayer(name);if(!sale)return {label:"AVAILABLE",cls:"available"};return sale.winner==="me"?{label:"YOURS",cls:"yours"}:{label:"DRAFTED",cls:"drafted"};}

function freshDraftState(){ return {budget:Number(leagueConfig.budget||200),sales:[],roster:{},selected:null}; }

function applyFreshDraft(){ const fresh=freshDraftState(); state.budget=fresh.budget; state.sales=[]; state.roster={}; state.selected=null; save(); setSelected(null); renderAll(); updateResetSummary(); }

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
