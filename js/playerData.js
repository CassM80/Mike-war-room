// Sprint 24.3 — player-universe loading, normalization, and audit helpers.

function playerMatchKey(name){return String(name||"").normalize("NFKD").replace(/[’‘`]/g,"'").replace(/[^a-zA-Z0-9]+/g," ").trim().toLowerCase();}

function normalizePlayerName(name){
  const cleaned=String(name||"").trim().replace(/[’‘`]/g,"'").replace(/\s+/g," ");
  const key=playerMatchKey(cleaned);
  if(["jamarr chase","jamar chase","ja marr chase"].includes(key)) return "Ja'Marr Chase";
  if(["aj brown","a j brown"].includes(key)) return "A.J. Brown";
  return cleaned;
}

function recordPlayerExclusion(reason){
  PLAYER_POOL_AUDIT.excluded++;
  PLAYER_POOL_AUDIT.reasons[reason]=(PLAYER_POOL_AUDIT.reasons[reason]||0)+1;
  return false;
}

function resetPlayerPoolAudit(){PLAYER_POOL_AUDIT.accepted=0;PLAYER_POOL_AUDIT.excluded=0;PLAYER_POOL_AUDIT.reasons={};}

function normalizedPlayerStatus(raw){return String(raw?.status||raw?.injury_status||"").trim().toLowerCase();}

function playerAge(raw){
  const birth=Date.parse(raw?.birth_date||"");
  return Number.isFinite(birth)?Math.floor((Date.now()-birth)/(365.2425*24*60*60*1000)):0;
}

function isActiveNFLPlayer(raw){
  if(!raw || raw.active!==true) return recordPlayerExclusion("not marked active");
  if(!["QB","RB","WR","TE","K"].includes(raw.position)) return recordPlayerExclusion("unsupported position");
  const name=normalizePlayerName(raw.full_name || [raw.first_name,raw.last_name].filter(Boolean).join(" "));
  if(!name) return recordPlayerExclusion("missing name");
  const team=String(raw.team||"").toUpperCase();
  if(!CURRENT_NFL_TEAMS.has(team)) return recordPlayerExclusion("not on current NFL team");
  const status=normalizedPlayerStatus(raw);
  if(/retir|inactive|deleted|historical|deceased/.test(status)) return recordPlayerExclusion("retired/inactive status");
  const age=playerAge(raw);
  if(raw.position!=="K" && age>=45) return recordPlayerExclusion("age sanity check");
  if(raw.position!=="K" && Number(raw.years_exp||0)>22) return recordPlayerExclusion("experience sanity check");
  const fantasyPositions=Array.isArray(raw.fantasy_positions)?raw.fantasy_positions:[];
  if(fantasyPositions.length && !fantasyPositions.includes(raw.position)) return recordPlayerExclusion("not fantasy-position eligible");
  const searchRank=Number(raw.search_rank||raw.adp||0);
  const hasRosterSignal=Boolean(raw.depth_chart_position)||Number(raw.depth_chart_order)>0||Number.isFinite(searchRank)&&searchRank>0&&searchRank<10000;
  if(!hasRosterSignal) return recordPlayerExclusion("no current roster signal");
  PLAYER_POOL_AUDIT.accepted++;
  return true;
}

function genericPlayer(raw){
  const name=normalizePlayerName(raw.full_name || [raw.first_name,raw.last_name].filter(Boolean).join(" "));
  return {
    pos: raw.position || "FLEX",
    name,
    team: raw.team || "FA",
    active: true,
    status: raw.status || "Active",
    tier: "UNRANKED",
    pressure: 1,
    action: "WATCH",
    buyLow: 0,buyHigh: 0,fairLow: 0,fairHigh: 0,overpay: 0,
    pivots: "",
    budgetPivot: "No personal valuation yet — use your judgment and record the sale.",
    audit: "MARKET",
    notes: "Complete player database",
    adp: Number(raw.adp || raw.search_rank || 0) || 0
  };
}

function mergePlayerUniverse(rows){
  resetPlayerPoolAudit();
  const activeRows=(rows||[]).filter(isActiveNFLPlayer);
  const sourceMap=new Map(activeRows.map(raw=>[playerMatchKey(normalizePlayerName(raw.full_name || [raw.first_name,raw.last_name].filter(Boolean).join(" "))),raw]));
  const curatedMap=new Map(CURATED_PLAYERS.map(p=>[playerMatchKey(p.name),p]));
  const hasLivePool=activeRows.length>0;
  const activeCurated=CURATED_PLAYERS.filter(p=>!hasLivePool || sourceMap.has(playerMatchKey(p.name))).map(p=>{
    const raw=sourceMap.get(playerMatchKey(p.name));
    return {...p,active:true,status:raw?.status||"Active",team:raw?.team||p.team||"FA",adp:Number(raw?.adp||raw?.search_rank||p.adp||0)||0};
  });
  const merged=[...activeCurated,...NFL_DEFENSES.map(p=>({...p,active:true,status:"Active"}))];
  const seen=new Set(merged.map(p=>playerMatchKey(p.name)));
  for(const raw of activeRows){
    const fallback=genericPlayer(raw);
    if(!fallback.name) continue;
    const key=playerMatchKey(fallback.name);
    if(seen.has(key)) continue;
    const curated=curatedMap.get(key);
    merged.push(curated?{...curated,active:true,status:raw.status||"Active",team:raw.team||curated.team||"FA",adp:Number(raw.adp||raw.search_rank||curated.adp||0)||0}:fallback);
    seen.add(key);
  }
  if(!merged.some(p=>playerMatchKey(p.name)===playerMatchKey("Ja'Marr Chase"))){merged.push({pos:"WR",name:"Ja'Marr Chase",team:"CIN",active:true,status:"Active",tier:"UNRANKED",pressure:1,action:"WATCH",buyLow:0,buyHigh:0,fairLow:0,fairHigh:0,overpay:0,pivots:"",budgetPivot:"Live market data pending.",audit:"MARKET",notes:"Verified player-pool fallback",adp:2,market_price:62});}
  merged.sort((a,b)=>{
    const ac=curatedMap.has(playerMatchKey(a.name)), bc=curatedMap.has(playerMatchKey(b.name));
    if(ac!==bc) return ac?-1:1;
    return a.name.localeCompare(b.name);
  });
  PLAYERS=merged;
  byName=Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
  fillSelects();
  renderPlayerDataStatus(); renderPlayerPoolAudit();
  renderPersonalBoard(); renderBulkBoard();
}

function auditPlayerPool(){const required=["Ja'Marr Chase","Bijan Robinson","Jahmyr Gibbs","CeeDee Lamb","Justin Jefferson","Puka Nacua","Amon-Ra St. Brown","Josh Allen","Brock Bowers","Trey McBride"];const missing=required.filter(n=>!PLAYERS.some(p=>playerMatchKey(p.name)===playerMatchKey(n)));const counts={QB:0,RB:0,WR:0,TE:0,DEF:0};PLAYERS.forEach(p=>{if(counts[p.pos]!=null)counts[p.pos]++;});return {missing,counts,verified:PLAYERS.length>=500&&counts.DEF===32&&missing.length===0};}

function renderPlayerPoolAudit(){
  const el=document.getElementById("playerPoolAudit"); if(!el)return;
  const a=auditPlayerPool();
  const topReasons=Object.entries(PLAYER_POOL_AUDIT.reasons).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,v])=>`${v} ${k}`).join(" • ");
  const base=a.verified?`PLAYER POOL VERIFIED • ${PLAYERS.length} total • ${a.counts.QB} QB • ${a.counts.RB} RB • ${a.counts.WR} WR • ${a.counts.TE} TE • 32 DEF`:`PLAYER POOL CHECK • ${PLAYERS.length} total${a.missing.length?" • missing: "+a.missing.join(", "):""}`;
  el.textContent=`${base} • ${PLAYER_POOL_AUDIT.excluded} records excluded${topReasons?" • "+topReasons:""}`;
  el.style.color=a.verified?"var(--green)":"#ffcc4d";
}

function renderPlayerDataStatus(message){
  const el=document.getElementById("playerDataStatus");
  if(!el) return;
  const cachedAt=Number(localStorage.getItem(PLAYER_CACHE_TIME_KEY)||0);
  const stamp=cachedAt?new Date(cachedAt).toLocaleString():"bundled list";
  el.textContent=message || `${PLAYERS.length} searchable players • updated ${stamp}`;
}
