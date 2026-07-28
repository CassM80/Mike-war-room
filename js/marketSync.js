// Sprint 24.5 — free/public market-data sync with cached fallback.
// Providers are intentionally isolated so any source can be swapped without changing War Room logic.

const MARKET_PROVIDERS = {
  rankings: {
    id: "gng-pigskin",
    label: "Pigskin AI",
    attribution: "thegng.us",
    url(profile){ return `https://www.thegng.us/api/rankings.json?profile=${encodeURIComponent(profile)}&pos=overall&limit=150`; }
  },
  playerStatus: { id: "sleeper", label: "Sleeper" }
};

function marketScoringProfile(){
  const scoring=String(leagueConfig?.scoring||"PPR").toLowerCase();
  if(scoring.includes("half")) return "half_ppr";
  if(scoring.includes("standard")||scoring.includes("non")) return "standard";
  return "ppr";
}

function withTimeout(ms=10000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  return {signal:controller.signal,done:()=>clearTimeout(timer)};
}

async function fetchJson(url,ms=10000){
  const t=withTimeout(ms);
  try{
    const response=await fetch(url,{cache:"no-store",signal:t.signal,headers:{Accept:"application/json"}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }finally{ t.done(); }
}

function extractRankingRows(payload){
  if(Array.isArray(payload)) return payload;
  if(!payload||typeof payload!=="object") return [];
  const candidates=[payload.rankings,payload.players,payload.data,payload.results,payload.items,payload.board];
  for(const item of candidates){
    if(Array.isArray(item)) return item;
    if(item&&Array.isArray(item.rankings)) return item.rankings;
    if(item&&Array.isArray(item.players)) return item.players;
  }
  return [];
}

function field(row,names){
  for(const name of names){
    const value=row?.[name];
    if(value!==undefined&&value!==null&&value!=="") return value;
  }
  return null;
}

function parsePosRank(value,pos){
  if(typeof value==="string"){
    const m=value.match(/(\d+(?:\.\d+)?)/); if(m) return Number(m[1]);
  }
  const n=Number(value||0); return Number.isFinite(n)&&n>0?n:0;
}

function normalizeRankingRow(row,index){
  const name=normalizePlayerName(field(row,["name","player_name","player","full_name","playerName"])||"");
  const pos=String(field(row,["position","pos","player_position"])||"").toUpperCase();
  if(!name||!["QB","RB","WR","TE"].includes(pos)) return null;
  const rank=Number(field(row,["rank","overall_rank","overallRank","ecr","consensus_rank"])||index+1)||index+1;
  const posRank=parsePosRank(field(row,["position_rank","pos_rank","positionRank","posRank","rank_pos"]),pos);
  const tier=String(field(row,["tier","rank_tier","group"])||"").replace(/^tier\s*/i,"").trim();
  const score=Number(field(row,["score","rating","model_score","value_score"])||0)||0;
  const projectedPpg=Number(field(row,["projected_ppg","projectedPpg","projection_ppg","ppg","proj_ppg"])||0)||0;
  const projectedPoints=Number(field(row,["projected_points","projection","projectedPoints","proj_points"])||0)||0;
  const rankChange=Number(field(row,["rank_change","rankChange","change","overnight_change","delta"])||0)||0;
  const team=String(field(row,["team","nfl_team","team_abbr"])||"").toUpperCase();
  return {name,pos,team,rank,posRank,tier,score,projectedPpg,projectedPoints,rankChange};
}

function derivePositionRanks(rows){
  const counters={QB:0,RB:0,WR:0,TE:0};
  return rows.sort((a,b)=>a.rank-b.rank).map(row=>{
    counters[row.pos]=(counters[row.pos]||0)+1;
    return {...row,posRank:row.posRank||counters[row.pos]};
  });
}

function applyRankingSnapshot(rows,{fromCache=false}={}){
  const oldByKey=new Map(PLAYERS.map(p=>[playerMatchKey(p.name),{
    rank:Number(p.provider_rank||0),tier:String(p.provider_tier||"")
  }]));
  let matched=0,rankMoves=0,valueMoves=0,tierMoves=0;
  for(const row of derivePositionRanks(rows.filter(Boolean))){
    const base=PLAYERS.find(p=>playerMatchKey(p.name)===playerMatchKey(row.name));
    if(!base) continue;
    const old=oldByKey.get(playerMatchKey(base.name))||{};
    base.provider_source=MARKET_PROVIDERS.rankings.label;
    base.provider_rank=row.rank;
    base.provider_pos_rank=row.posRank;
    base.provider_tier=row.tier||"";
    base.provider_score=row.score||0;
    base.projected_ppg=row.projectedPpg||0;
    base.projected_points=row.projectedPoints||0;
    base.provider_rank_change=row.rankChange||0;
    if(row.team&&CURRENT_NFL_TEAMS.has(row.team)) base.team=row.team;
    // Rankings, tiers and projections may refresh. Auction dollars remain on the
    // verified consensus/baseline layer and are never overwritten by rank sync.
    base.audit=fromCache?"CACHED RANKINGS":"LIVE RANKINGS";
    matched++;
    if(old.rank&&Math.abs(old.rank-row.rank)>=2) rankMoves++;
    // Intentionally no dollar-value movement: rank sync cannot alter Market $.
    if(old.tier&&row.tier&&old.tier!==row.tier) tierMoves++;
  }
  marketRankCache={count:-1,ranks:new Map()};
  byName=Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
  return {matched,rankMoves,valueMoves,tierMoves};
}

function sleeperTrendMap(rows){
  const m=new Map();
  (Array.isArray(rows)?rows:[]).forEach(x=>m.set(String(x.player_id||""),Number(x.count||0)));
  return m;
}

function applySleeperTrends(addRows,dropRows){
  const adds=sleeperTrendMap(addRows),drops=sleeperTrendMap(dropRows);
  let changed=0;
  for(const p of PLAYERS){
    const id=String(p.sleeper_id||""); if(!id) continue;
    const up=adds.get(id)||0, down=drops.get(id)||0;
    if(up||down){p.trending_adds=up;p.trending_drops=down;p.trend_signal=up>down?"UP":down>up?"DOWN":"FLAT";changed++;}
  }
  return changed;
}

function marketSnapshotFromRows(rows){
  return rows.map(r=>({name:r.name,pos:r.pos,team:r.team,rank:r.rank,posRank:r.posRank,tier:r.tier,score:r.score,projectedPpg:r.projectedPpg,projectedPoints:r.projectedPoints,rankChange:r.rankChange}));
}

function saveMarketSyncCache(rows,meta={}){
  const payload={version:1,savedAt:Date.now(),profile:marketScoringProfile(),provider:MARKET_PROVIDERS.rankings.label,rows:marketSnapshotFromRows(derivePositionRanks(rows.filter(Boolean))),meta};
  localStorage.setItem(MARKET_SYNC_CACHE_KEY,JSON.stringify(payload));
  localStorage.setItem(MARKET_SYNC_TIME_KEY,String(payload.savedAt));
  return payload;
}

function readMarketSyncCache(){
  try{return JSON.parse(localStorage.getItem(MARKET_SYNC_CACHE_KEY)||"null");}catch(e){return null;}
}

function renderMarketSyncStatus(message,tone="muted"){
  const el=document.getElementById("marketSyncStatus"); if(!el)return;
  const colors={green:"var(--green)",yellow:"#ffcc4d",red:"var(--red)",muted:"var(--muted)"};
  el.style.color=colors[tone]||colors.muted;
  el.textContent=message;
}

function hydrateMarketSyncCache(){
  const cached=readMarketSyncCache();
  if(!cached?.rows?.length){renderMarketSyncStatus("MARKET DATA: bundled baseline • personal evaluations protected");return false;}
  applyRankingSnapshot(cached.rows,{fromCache:true});
  renderBulkBoard();renderPersonalBoard();renderCore();renderBlueprint();renderAll();renderMarketCoverageAudit();
  renderMarketSyncStatus(`MARKET DATA: ${cached.provider||"cached provider"} • ${new Date(cached.savedAt).toLocaleString()} • ${cached.rows.length} rankings • personal evaluations protected`,"green");
  return true;
}

async function syncMarketData({force=false}={}){
  const btn=document.getElementById("marketSyncBtn");
  if(btn){btn.disabled=true;btn.textContent="SYNCING…";}
  renderMarketSyncStatus("MARKET SYNC: checking Sleeper player status, trends and fresh rankings…","yellow");
  const beforePersonal=JSON.stringify(personalEvaluations);
  let sleeperOk=false,rankingsOk=false,trendCount=0,stats={matched:0,rankMoves:0,valueMoves:0,tierMoves:0};
  const errors=[];
  try{
    try{await loadCompletePlayerUniverse(true);sleeperOk=true;}catch(error){errors.push(`Sleeper players: ${error?.message||error}`);}
    try{
      const [adds,drops]=await Promise.all([
        fetchJson("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=100",8000),
        fetchJson("https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=24&limit=100",8000)
      ]);
      trendCount=applySleeperTrends(adds,drops);
    }catch(error){errors.push(`Sleeper trends: ${error?.message||error}`);}
    let rankingRows=[];
    try{
      const payload=await fetchJson(MARKET_PROVIDERS.rankings.url(marketScoringProfile()),10000);
      rankingRows=extractRankingRows(payload).map(normalizeRankingRow).filter(Boolean);
      if(rankingRows.length<40) throw new Error(`only ${rankingRows.length} usable rows`);
      stats=applyRankingSnapshot(rankingRows);
      saveMarketSyncCache(rankingRows,{trendCount});
      rankingsOk=true;
    }catch(error){
      errors.push(`${MARKET_PROVIDERS.rankings.label}: ${error?.message||error}`);
      const cached=readMarketSyncCache();
      if(cached?.rows?.length){stats=applyRankingSnapshot(cached.rows,{fromCache:true});}
    }
    // Personal DNA is user-owned and never changes during market sync.
    if(JSON.stringify(personalEvaluations)!==beforePersonal){
      console.error("Market sync attempted to alter personal evaluations; restoring protected snapshot.");
      personalEvaluations=JSON.parse(beforePersonal||"{}");
      savePersonalEvaluations(true);
    }
    PLAYERS.sort((a,b)=>(Number(a.provider_rank)||99999)-(Number(b.provider_rank)||99999)||(adpFor(a)||99999)-(adpFor(b)||99999)||a.name.localeCompare(b.name));
    byName=Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
    renderBulkBoard();renderPersonalBoard();renderCore();renderBlueprint();renderAll();renderMarketCoverageAudit();
    const now=Date.now();
    const source=rankingsOk?MARKET_PROVIDERS.rankings.label:"cached rankings";
    const summary=`MARKET SYNC: ${new Date(now).toLocaleString()} • ${stats.matched} ranked • ${stats.rankMoves} rank moves • ${stats.valueMoves} values moved $3+ • ${trendCount} trending • ${source} + Sleeper • PERSONAL DNA PRESERVED`;
    renderMarketSyncStatus(summary,rankingsOk&&sleeperOk?"green":"yellow");
    localStorage.setItem("warRoomMarketSyncSummary",summary);
    localStorage.setItem("warRoomMarketSyncLastAttempt",String(now));
    if(errors.length) console.warn("Market sync completed with fallbacks",errors);
    return {ok:rankingsOk||sleeperOk,rankingsOk,sleeperOk,trendCount,stats,errors};
  }catch(error){
    console.error("Market sync failed",error);
    const cached=hydrateMarketSyncCache();
    renderMarketSyncStatus(cached?`MARKET SYNC OFFLINE: using last successful snapshot • ${error?.message||"network unavailable"}`:`MARKET SYNC FAILED: ${error?.message||"network unavailable"}`,cached?"yellow":"red");
    return {ok:false,error};
  }finally{
    if(btn){btn.disabled=false;btn.textContent="SYNC MARKET DATA";}
  }
}
