// Sprint 24.3 — application state, event wiring, and startup.
let PLAYERS = [...CURATED_PLAYERS];
let byName = Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
const PLAYER_CACHE_KEY = "warRoomFullPlayerCacheV3ActiveOnly";
const PLAYER_CACHE_TIME_KEY = "warRoomFullPlayerCacheTimeV2";
const PLAYER_CACHE_MAX_AGE = 24*60*60*1000;
const MARKET_SYNC_CACHE_KEY = "warRoomMarketSyncV1";
const MARKET_SYNC_TIME_KEY = "warRoomMarketSyncTimeV1";
const NFL_DEFENSES = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"].map(team=>({pos:"DEF",name:team+" Defense",team,tier:"UNRANKED",pressure:1,action:"WATCH",buyLow:0,buyHigh:0,fairLow:0,fairHigh:0,overpay:0,pivots:"",budgetPivot:"No personal valuation yet — use your judgment and record the sale.",audit:"MARKET",notes:"Complete player database"}));



const CURRENT_NFL_TEAMS = new Set(["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"]);
const PLAYER_POOL_AUDIT = {accepted:0,excluded:0,reasons:{}};










async function loadCompletePlayerUniverse(force=false){
  let cached=[];
  try{ cached=JSON.parse(localStorage.getItem(PLAYER_CACHE_KEY)||"[]"); }catch(e){}
  if(Array.isArray(cached) && cached.length) mergePlayerUniverse(cached);
  else renderPlayerDataStatus(`${PLAYERS.length} curated players • expanding database…`);
  const cacheTime=Number(localStorage.getItem(PLAYER_CACHE_TIME_KEY)||0);
  if(!force && cached.length && Date.now()-cacheTime<PLAYER_CACHE_MAX_AGE) return;
  try{
    const response=await fetch("https://api.sleeper.app/v1/players/nfl",{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    resetPlayerPoolAudit();
    const rows=Object.entries(data||{}).map(([player_id,p])=>({...p,player_id})).filter(isActiveNFLPlayer).map(p=>({player_id:p.player_id,full_name:p.full_name,first_name:p.first_name,last_name:p.last_name,position:p.position,team:p.team,active:p.active,status:p.status,injury_status:p.injury_status,practice_participation:p.practice_participation,search_rank:p.search_rank,adp:p.adp,depth_chart_position:p.depth_chart_position,depth_chart_order:p.depth_chart_order,fantasy_positions:p.fantasy_positions,birth_date:p.birth_date,years_exp:p.years_exp}));
    localStorage.setItem(PLAYER_CACHE_KEY,JSON.stringify(rows));
    localStorage.setItem(PLAYER_CACHE_TIME_KEY,String(Date.now()));
    mergePlayerUniverse(rows);
  }catch(error){
    renderPlayerDataStatus(`${PLAYERS.length} searchable players • offline/cache mode`);
    console.warn("Player database refresh failed",error);
  }
}
async function rebuildConsensusRankings(){
  const status=document.getElementById("consensusStatus");
  const btn=document.getElementById("rebuildConsensusBtn");
  if(btn){btn.disabled=true;btn.textContent="REFRESHING…";}
  if(status){status.textContent="Refreshing rankings without changing auction prices…";status.style.color="var(--muted)";}
  try{
    await syncMarketData(true);
    renderBulkBoard();renderPersonalBoard();renderCore();
    if(status){status.textContent="League Values refreshed • external market evidence and your edited values preserved";status.style.color="var(--green)";}
  }catch(error){
    console.error("Ranking refresh failed",error);
    if(status){status.textContent=`Ranking refresh failed: ${error?.message||"Unknown error"}`;status.style.color="var(--red)";}
  }finally{
    if(btn){btn.disabled=false;btn.textContent="REFRESH MARKET DATA";}
  }
}

const PERSONAL_EVAL_KEY = "warRoomPersonalEvaluations";
const RESET_INTENT_KEY = "warRoomResetIntent";
(function applyPendingResetBeforeHydration(){
  const intent=sessionStorage.getItem(RESET_INTENT_KEY);
  if(!intent) return;
  window.__warRoomResetting=true;
  if(intent==="full"){
    Object.keys(localStorage).forEach(key=>{ if(key.startsWith("warRoom")) localStorage.removeItem(key); });
  }else if(intent==="personal"){
    [PERSONAL_EVAL_KEY,"warRoomPositionDNA2","warRoomDNALeagueProfile","warRoomDNAApplyReceipt"].forEach(key=>localStorage.removeItem(key));
  }
  localStorage.setItem("warRoomProfileMode","clean");
  sessionStorage.removeItem(RESET_INTENT_KEY);
  window.__warRoomResetting=false;
})();
let personalEvaluations = {};
try { personalEvaluations = JSON.parse(localStorage.getItem(PERSONAL_EVAL_KEY) || "{}") || {}; } catch(e) { personalEvaluations = {}; }
try { normalizeGeneratedPersonalValues(); } catch(e) { console.warn("Personal valuation migration skipped",e); }
let scoutingSelectedName = null;
const PROFILE_MODE_KEY = "warRoomProfileMode";
let profileMode = localStorage.getItem(PROFILE_MODE_KEY);
if(!profileMode){
  const existingUser = !!(localStorage.getItem("warRoomState") || localStorage.getItem("warRoomLeagueConfig") || Object.keys(personalEvaluations).length);
  profileMode = existingUser ? "owner" : "clean";
  localStorage.setItem(PROFILE_MODE_KEY,profileMode);
}

















const MARKET_CURVES={
  QB:[28,23,19,16,14,12,10,9,8,7,6,5,4,3,3,2,2,2,1,1,1,1,1,1],
  RB:[65,61,57,53,49,45,42,39,36,33,30,28,26,24,22,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,5,4,4,3,3,2,2,1,1],
  WR:[67,63,59,55,51,47,44,41,38,35,32,30,28,26,24,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,5,4,4,3,3,2,2,1,1],
  TE:[38,31,25,20,16,13,10,8,7,6,5,4,3,3,2,2,1,1,1,1],
  K:[1,1,1,1,1,1,1,1,1,1,1,1],
  DEF:[2,2,2,1,1,1,1,1,1,1,1,1]
};
let marketRankCache={count:-1,ranks:new Map()};
let warRoomMarketRankCache={signature:"",ranks:new Map()};







// Draft DNA uses the same position-aware market baseline as Scouting and War Room.
// Keeping this as a named helper prevents the Combine from breaking when pricing logic changes.





const CORE = ["A.J. Brown", "CeeDee Lamb", "Omarion Hampton", "Kenneth Walker III", "Brock Bowers", "Jaxon Smith-Njigba", "Alec Pierce"];
const MARKET = new Set(["Ja'Marr Chase", "Justin Jefferson", "Puka Nacua", "Amon-Ra St. Brown", "Malik Nabers", "Marvin Harrison Jr.", "Garrett Wilson", "Drake London", "Ladd McConkey", "Rome Odunze", "DJ Moore", "Xavier Worthy", "Jordan Addison", "Courtland Sutton", "Bijan Robinson", "Jahmyr Gibbs", "Saquon Barkley", "Christian McCaffrey", "Jonathan Taylor", "James Cook", "Josh Jacobs", "Breece Hall", "Kyren Williams", "Alvin Kamara", "Joe Mixon", "Josh Allen", "Lamar Jackson", "Jalen Hurts", "Patrick Mahomes", "Trey McBride", "George Kittle", "Sam LaPorta", "Travis Kelce"]);



const state = JSON.parse(localStorage.getItem("warRoomState") || "null") || {
  budget:200, sales:[], roster:{}, selected:null
};
const defaultLeagueConfig = {leagueName:"", teamCount:12, budget:200, scoring:"PPR", keepers:0, keeperBudget:0, myTeamIndex:0, roster:{qb:1,rb:2,wr:2,te:1,flex:2,superflex:0,k:1,def:1,bench:7}, teams:[]};
let leagueConfig = {...defaultLeagueConfig, ...(JSON.parse(localStorage.getItem("warRoomLeagueConfig") || "null") || {})}; leagueConfig.roster={...defaultLeagueConfig.roster,...(leagueConfig.roster||{})};
const $ = id=>document.getElementById(id);
const money=n=>"$"+Math.round(Number(n||0));























$("playerSearch").addEventListener("input",e=>{
  const q=e.target.value.toLowerCase().trim(), box=$("suggestions");
  if(!q){ box.style.display="none"; return; }
  const matches=PLAYERS.filter(p=>playerMatchKey(p.name).includes(q)).sort((a,b)=>Number(!!sold(a.name))-Number(!!sold(b.name))).slice(0,8);
  box.innerHTML=matches.map(raw=>{const p=effectivePlayer(raw),sale=sold(p.name); return `<div class="suggestion ${sale?"sold-result":""}" data-name="${p.name}"><strong>${p.name}</strong>${sale?`<span class="sold-chip">SOLD ${money(sale.price)}</span>`:""} <span style="color:var(--muted)">• ${p.pos}${p.team?" • "+p.team:""}${p.tier!=="UNRANKED"?" • T"+p.tier+" • P"+p.pressure:" • FULL DATABASE"}</span></div>`}).join("");
  box.style.display=matches.length?"block":"none";
});
$("suggestions").addEventListener("click",e=>{
  const el=e.target.closest(".suggestion"); if(!el)return; setSelected(byName[el.dataset.name]); $("suggestions").style.display="none";
});
$("recordPlayer").addEventListener("input",e=>{ const p=byName[e.target.value]; if(p) setSelected(p); });
$("recordPlayer").addEventListener("change",e=>{ const p=byName[e.target.value]; if(p) setSelected(p); });

$("readyBtn").addEventListener("click",()=>{
  const player=$("recordPlayer").value, winnerValue=$("winner").value, price=Number($("finalPrice").value);
  if(!player) return alert("Select the completed nomination.");
  if(!winnerValue.startsWith("team:")) return alert("Select the team that won the player.");
  if(price<1) return alert("Enter the final price.");
  if(sold(player)) return alert("That player is already recorded.");
  const winnerTeamIndex=Number(winnerValue.split(":")[1]);
  const myIdx=Number(leagueConfig.myTeamIndex||0), isMine=winnerTeamIndex===myIdx;
  const slot=isMine?autoRosterSlot(player):"";
  if(isMine && !slot) return alert("No eligible roster spot remains for this player.");
  const team=leagueConfig.teams?.[winnerTeamIndex]||{};
  state.sales.push({player,winner:isMine?"me":"other",winnerTeamIndex,winnerName:team.teamName||`Team ${winnerTeamIndex+1}`,price,slot});
  if(isMine) state.roster[slot]={player,price};
  invalidateDraftPerformanceCaches();
  $("finalPrice").value=0; $("winner").value="";
  setSelected(null,true); save(); renderAll(); updateResetSummary();
  const btn=$("readyBtn"); btn.innerHTML="✓ READY<small>NEXT NOMINATION</small>";
  setTimeout(()=>{ btn.innerHTML="RECORD & NEXT<small>SAVE SALE • CLEAR SCREEN</small>"; $("playerSearch").focus(); },700);
});



let myGuysTierFilter=0;







$("scoutingBoardTab")?.addEventListener('click',()=>showScoutingPanel('BOARD'));$("myGuysTab")?.addEventListener('click',()=>showScoutingPanel('MY'));$("blueprintTab")?.addEventListener('click',()=>showScoutingPanel('BLUE'));
$("myGuysGallery")?.addEventListener('click',e=>{const filter=e.target.closest('[data-my-guys-filter]');if(filter){const level=Number(filter.dataset.myGuysFilter);myGuysTierFilter=myGuysTierFilter===level?0:level;renderMyGuysGallery();return;}const why=e.target.closest('[data-why-toggle]');if(why){e.preventDefault();e.stopPropagation();why.closest('.my-guy-card')?.classList.toggle('why-open');return;}const card=e.target.closest('[data-my-guy-name]');if(card)openPlayerInWarRoom(card.dataset.myGuyName);});
$("blueprintGallery")?.addEventListener('click',e=>{const card=e.target.closest('[data-blueprint-name]');if(card)openPlayerInWarRoom(card.dataset.blueprintName);});
$("scoutingSearch").addEventListener("input",e=>{
  const q=e.target.value.toLowerCase().trim(), box=$("scoutingSuggestions");
  if(!q){box.style.display="none";return;}
  const matches=PLAYERS.filter(p=>playerMatchKey(p.name).includes(q)).slice(0,12);
  box.innerHTML=matches.map(p=>`<div class="scouting-result" data-scout-name="${p.name.replace(/"/g,"&quot;")}"><strong>${p.name}</strong> <span style="color:var(--muted)">• ${p.pos}${p.team?" • "+p.team:""}</span></div>`).join("");
  box.style.display=matches.length?"block":"none";
});
$("scoutingSuggestions").addEventListener("click",e=>{const row=e.target.closest(".scouting-result");if(row)selectScoutingPlayer(row.dataset.scoutName);});
$("personalBoardList").addEventListener("click",e=>{const row=e.target.closest(".personal-row");if(row)selectScoutingPlayer(row.dataset.personalName);});
$("evalConviction")?.addEventListener("click",e=>{const btn=e.target.closest("[data-conviction]");if(btn)renderConvictionPicker(Number(btn.dataset.conviction));});
$("saveEvaluationBtn").addEventListener("click",()=>{
  if(!scoutingSelectedName) return alert("Select a player first.");
  const value=Math.max(0,Number($("evalValue").value||0));
  const hard=Math.max(0,Number($("evalHardStop").value||0));
  if(value && hard && hard<value) return alert("Hard Stop cannot be below Your Value.");
  const myGuys=normalizedConviction($("evalConviction")?.dataset.value||3); const ev={name:scoutingSelectedName,conviction:myGuys,rank:Math.max(0,Number($("evalRank").value||0)),value,hardStop:hard,tier:$("evalTier").value.trim(),favorite:false,flagPlant:$("evalFlagPlant").checked||myGuys===5,sleeper:$("evalSleeper").checked,avoid:$("evalAvoid").checked||myGuys===1,notes:$("evalNotes").value.trim(),updatedAt:new Date().toISOString()};
  activatePersonalization(); personalEvaluations[playerKey(scoutingSelectedName)]=ev; savePersonalEvaluations(true); renderPersonalBoard(); renderBulkBoard(); selectScoutingPlayer(scoutingSelectedName);
  if(state.selected===scoutingSelectedName) setSelected(byName[scoutingSelectedName]);
  $("evaluationSavedNote").textContent="Personal evaluation saved."; setTimeout(()=>$("evaluationSavedNote").textContent="",1800);
});
$("clearEvaluationBtn").addEventListener("click",()=>{
  if(!scoutingSelectedName||!getPersonalEvaluation(scoutingSelectedName)) return;
  if(!confirm(`Clear your personal evaluation for ${scoutingSelectedName}?`)) return;
  delete personalEvaluations[playerKey(scoutingSelectedName)]; savePersonalEvaluations(); renderPersonalBoard(); renderBulkBoard(); selectScoutingPlayer(scoutingSelectedName);
  if(state.selected===scoutingSelectedName) setSelected(byName[scoutingSelectedName]);
});



/* Upgrade 20: Position-by-position, current-player-driven Draft DNA Lab */
const DNA_POSITIONS=['QB','RB','WR','TE'];
const DNA_POSITION_LABELS={QB:'Quarterback',RB:'Running Back',WR:'Wide Receiver',TE:'Tight End'};
let positionDNA=JSON.parse(localStorage.getItem('warRoomPositionDNA2')||'{}')||{};
let dnaLab={screen:'HOME',pos:null,stage:'HOME',index:0};





































$('startBoardSprintsBtn')?.addEventListener('click',openStrategySprints);
$('closeSprintsBtn')?.addEventListener('click',closeStrategySprints);
$('strategySprintModal')?.addEventListener('click',e=>{if(e.target.id==='strategySprintModal')return closeStrategySprints();const mod=e.target.closest('[data-dna-module]');if(mod)return beginPositionDNA(mod.dataset.dnaModule);if(!dnaLab.pos)return;const m=dnaModule(dnaLab.pos);const ph=e.target.closest('[data-pos-philosophy]');if(ph){m.philosophy[ph.dataset.posPhilosophy]=ph.dataset.value;savePositionDNA();return advancePositionDNA();}const gut=e.target.closest('[data-pos-gut]');if(gut){const p=dnaQuestionsFor(dnaLab.pos).gut[dnaLab.index];m.gut[p.name]=gut.dataset.posGut;savePositionDNA();return advancePositionDNA();}const price=e.target.closest('[data-pos-price]');if(price){const p=dnaQuestionsFor(dnaLab.pos).price[dnaLab.index];m.prices[p.name]=price.dataset.posPrice;savePositionDNA();return advancePositionDNA();}const pair=e.target.closest('[data-pos-pair]');if(pair){const ps=dnaQuestionsFor(dnaLab.pos).pairs[dnaLab.index],key=ps.map(p=>p.name).sort().join('|');m.pairs[key]=ps[Number(pair.dataset.posPair)].name;savePositionDNA();return advancePositionDNA();}});
$('sprintBackBtn')?.addEventListener('click',()=>dnaLab.pos?backPositionDNA():closeStrategySprints());
$('sprintNextBtn')?.addEventListener('click',()=>{if(!dnaLab.pos){if(DNA_POSITIONS.every(p=>dnaModule(p).complete)){try{activatePersonalization();let changed=0;DNA_POSITIONS.forEach(p=>changed+=buildPositionBoard(p));const total=persistAndVerifyPersonalEvaluations();refreshViewsAfterDNA();$('sprintResult').textContent=`All four position boards rebuilt • ${changed} updates • ${total} total evaluations.`;}catch(err){$('sprintResult').textContent=`Board rebuild failed: ${err.message||'unknown error'}`;}}else closeStrategySprints();}else advancePositionDNA();});

let bulkSelected=new Set();




$("bulkBoardBody")?.addEventListener("click",e=>{const star=e.target.closest("[data-my-guys]");if(!star)return;const tr=star.closest("tr[data-bulk-player]"),cell=star.closest(".bulk-my-guys");cell.dataset.score=star.dataset.myGuys;const ev=getPersonalEvaluation(tr.dataset.bulkPlayer)||{};ev.conviction=normalizedConviction(star.dataset.myGuys);ev.favorite=false;ev.flagPlant=ev.conviction===5||!!ev.flagPlant;ev.avoid=ev.conviction===1||!!ev.avoid;personalEvaluations[playerKey(tr.dataset.bulkPlayer)]={name:tr.dataset.bulkPlayer,...ev,updatedAt:new Date().toISOString()};savePersonalEvaluations();renderPersonalBoard();renderCore();renderBulkBoard();});
["bulkSearch","bulkPosition","bulkBoardFilter","bulkSort"].forEach(id=>$(id)?.addEventListener(id==="bulkSearch"?"input":"change",renderBulkBoard));
$("bulkBoardBody")?.addEventListener("change",e=>{const tr=e.target.closest("tr[data-bulk-player]");if(!tr)return;if(e.target.classList.contains("bulk-select")){const key=playerKey(tr.dataset.bulkPlayer);e.target.checked?bulkSelected.add(key):bulkSelected.delete(key);renderBulkBoard();return;}saveBulkRow(tr);});
$("bulkBoardBody")?.addEventListener("blur",e=>{const tr=e.target.closest("tr[data-bulk-player]");if(tr&&!e.target.classList.contains("bulk-select"))saveBulkRow(tr);},true);
$("bulkSelectAll")?.addEventListener("change",e=>{bulkFilteredPlayers().forEach(p=>e.target.checked?bulkSelected.add(playerKey(p.name)):bulkSelected.delete(playerKey(p.name)));renderBulkBoard();});
$("clearBulkSelectionBtn")?.addEventListener("click",()=>{bulkSelected.clear();renderBulkBoard();});
$("applyBulkBtn")?.addEventListener("click",()=>{
  if(!bulkSelected.size)return alert("Select at least one player.");
  const selected=PLAYERS.filter(p=>bulkSelected.has(playerKey(p.name)));
  const start=Number($("bulkStartRank").value||0),tier=$("bulkTier").value.trim(),value=$("bulkValue").value,stop=$("bulkHardStop").value,conviction=$("bulkConviction").value,flag=$("bulkFlagAction").value;
  selected.forEach((p,i)=>{const ev={name:p.name,...(getPersonalEvaluation(p.name)||{})};if(start)ev.rank=start+i;if(tier)ev.tier=tier;if(value!=="")ev.value=Math.max(0,Number(value));if(stop!=="")ev.hardStop=Math.max(0,Number(stop));if(conviction!=="")ev.conviction=normalizedConviction(conviction);if(flag){const [field,on]=flag.split(":");ev[field]=on==="on";}ev.updatedAt=new Date().toISOString();personalEvaluations[playerKey(p.name)]=ev;});
  savePersonalEvaluations();renderPersonalBoard();renderCore();renderBulkBoard();$("bulkSaveState").textContent=`Updated ${selected.length} players`;
});



















async function fullCleanReset(){
  window.__warRoomResetting=true;
  personalEvaluations={};
  positionDNA={};
  bulkSelected.clear();
  localStorage.clear();
  sessionStorage.clear();
  try{
    if("caches" in window){const names=await caches.keys();await Promise.all(names.map(name=>caches.delete(name)));}
    if(navigator.serviceWorker){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}
  }catch(e){console.warn("Reset cache cleanup",e);}
  localStorage.setItem(PROFILE_MODE_KEY,"clean");
  localStorage.setItem(PERSONAL_EVAL_KEY,"{}");
  const url=new URL(location.href);
  url.searchParams.set("factoryReset",Date.now().toString());
  location.replace(url.toString());
}








document.querySelectorAll(".nav-tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav-tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".app-view").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); $(btn.dataset.view).classList.add("active");
  if(btn.dataset.view==="warRoomView") setTimeout(setAppHeight,20);
  if(btn.dataset.view==="headquartersView") renderPersonalBoard();
  if(btn.dataset.view==="debriefView") updateResetSummary();
}));
$("teamCountInput").addEventListener("change",()=>{
  collectTeamsFromEditor(); leagueConfig.teamCount=Number($("teamCountInput").value); ensureTeams(); renderTeamsEditor();
});
$("saveLeagueBtn").addEventListener("click",()=>{
  collectTeamsFromEditor();
  leagueConfig.leagueName=$("leagueNameInput").value.trim();
  leagueConfig.teamCount=Number($("teamCountInput").value||12);
  leagueConfig.budget=Math.max(1,Number($("leagueBudgetInput").value||200));
  leagueConfig.scoring=$("scoringInput").value;
  leagueConfig.roster={qb:Number($("qbSlotsInput").value),rb:Number($("rbSlotsInput").value),wr:Number($("wrSlotsInput").value),te:Number($("teSlotsInput").value),flex:Number($("flexSlotsInput").value),superflex:Number($("superflexSlotsInput").value),k:Number($("kSlotsInput").value),def:Number($("defSlotsInput").value),bench:Number($("benchSlotsInput").value)};
  leagueConfig.keepers=Number($("keeperCountInput").value||0); leagueConfig.keeperBudget=Math.max(0,Number($("keeperBudgetInput").value||0));
  leagueConfig.myTeamIndex=Number($("myTeamInput").value||0);
  ensureTeams(); invalidateLeagueValueCache(); invalidateDraftPerformanceCaches(); saveLeagueConfig(); renderWinnerOptions(); if(!state.sales.length)state.budget=leagueConfig.budget; const dnaUpdated=recalculateDnaBoardForLeague(); renderLeagueSetup(); renderAll();
  $("leagueSavedNote").textContent=dnaUpdated?`League saved • ${dnaUpdated} DNA player values recalculated.`:"League setup saved."; setTimeout(()=>$("leagueSavedNote").textContent="",1800);
});
$("saveTeamsBtn").addEventListener("click",()=>{
  collectTeamsFromEditor(); leagueConfig.myTeamIndex=Number($("myTeamInput").value||0); invalidateDraftPerformanceCaches(); saveLeagueConfig(); renderLeagueSetup(); renderWinnerOptions();
  $("teamsSavedNote").textContent="Teams saved."; setTimeout(()=>$("teamsSavedNote").textContent="",1800);
});
$("myTeamInput").addEventListener("change",()=>{ leagueConfig.myTeamIndex=Number($("myTeamInput").value||0); renderTeamsEditor(); });
$("saveBackupBtn").addEventListener("click",saveWarRoomBackup);
$("draftReportBtn").addEventListener("click",draftReport);
$("personalBoardReportBtn").addEventListener("click",personalBoardReport);
$("shareLeagueBtn").addEventListener("click",shareLeague);
$("importBackupBtn").addEventListener("click",()=>$("importBackupFile").click());
$("importBackupFile").addEventListener("change",async e=>{const f=e.target.files[0]; if(!f)return; try{importBackupObject(JSON.parse(await f.text()));}catch(err){alert(err.message||"Could not import backup.");} e.target.value="";});
$("newDraftBtn").addEventListener("click",()=>{if(confirm("Clear all sales, rosters and live-draft intelligence while keeping this league and personal board?")){applyFreshDraft();setResetStatus("New draft ready.");}});
$("newLeagueBtn").addEventListener("click",()=>{if(!confirm("Start a new league while keeping your personal board?"))return; applyFreshDraft(); leagueConfig={...defaultLeagueConfig,teams:[]}; ensureTeams(); saveLeagueConfig(); renderLeagueSetup(); renderAll(); updateResetSummary(); setResetStatus("New league ready.");});
$("clearBoardBtn").addEventListener("click",()=>{
  if(!confirm("Clear every personal ranking, tier, value, hard stop, flag, note and Draft DNA result in this browser?")) return;
  clearPersonalBoard();
});
$("shareSafeResetBtn").addEventListener("click",()=>{
  if(!confirm("This will erase the league, draft, personal board and Draft DNA from this browser. Continue?")) return;
  fullCleanReset();
});
renderTeamCountOptions(); renderLeagueSetup(); renderWinnerOptions(); renderPersonalBoard(); renderBulkBoard(); updateResetSummary();

let lastClockMinute='';setInterval(()=>{const now=new Date(),key=`${now.getHours()}:${now.getMinutes()}`;if(key!==lastClockMinute){lastClockMinute=key;$("clock").textContent=now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}},1000);
fillSelects(); renderAll(); renderRecommendation(null); if(state.selected && byName[state.selected]) setSelected(byName[state.selected]);
document.getElementById("refreshPlayerPoolBtn")?.addEventListener("click",async()=>{
  const btn=document.getElementById("refreshPlayerPoolBtn");
  if(btn){btn.disabled=true;btn.textContent="REFRESHING…";}
  localStorage.removeItem(PLAYER_CACHE_TIME_KEY);
  await loadCompletePlayerUniverse(true);
  if(btn){btn.disabled=false;btn.textContent="REFRESH PLAYER POOL";}
});
document.getElementById("marketSyncBtn")?.addEventListener("click",()=>syncMarketData({force:true}));
document.getElementById("rebuildConsensusBtn")?.addEventListener("click",rebuildConsensusRankings);
const rebuiltAt=Number(localStorage.getItem("warRoomConsensusRebuiltAt")||0);
if(rebuiltAt&&document.getElementById("consensusStatus")) document.getElementById("consensusStatus").textContent=`League Value baseline last rebuilt ${new Date(rebuiltAt).toLocaleString()}`;
loadCompletePlayerUniverse().then(()=>{hydrateMarketSyncCache();renderMarketCoverageAudit();renderPlayerIntegrity();});

// Sprint 29.0 — Headquarters valuation preview.
// Changes recalculate the board immediately; SAVE LEAGUE persists them.
const valuationSettingIds=["teamCountInput","leagueBudgetInput","scoringInput","qbSlotsInput","rbSlotsInput","wrSlotsInput","teSlotsInput","flexSlotsInput","superflexSlotsInput","kSlotsInput","defSlotsInput","benchSlotsInput","keeperCountInput","keeperBudgetInput"];
let valuationPreviewTimer=0;
function previewLeagueValuationFromHeadquarters(){
  leagueConfig.teamCount=Math.max(2,Number($("teamCountInput").value||12));
  leagueConfig.budget=Math.max(1,Number($("leagueBudgetInput").value||200));
  leagueConfig.scoring=$("scoringInput").value||"PPR";
  leagueConfig.roster={qb:Number($("qbSlotsInput").value),rb:Number($("rbSlotsInput").value),wr:Number($("wrSlotsInput").value),te:Number($("teSlotsInput").value),flex:Number($("flexSlotsInput").value),superflex:Number($("superflexSlotsInput").value),k:Number($("kSlotsInput").value),def:Number($("defSlotsInput").value),bench:Number($("benchSlotsInput").value)};
  leagueConfig.keepers=Number($("keeperCountInput").value||0);
  leagueConfig.keeperBudget=Math.max(0,Number($("keeperBudgetInput").value||0));
  invalidateLeagueValueCache();
  invalidateDraftPerformanceCaches();
  clearTimeout(valuationPreviewTimer);
  valuationPreviewTimer=setTimeout(()=>{
    $("summaryTeams").textContent=leagueConfig.teamCount;
    $("summaryBudget").textContent=money(leagueConfig.budget);
    $("summaryScoring").textContent=leagueConfig.scoring;
    $("summaryRoster").textContent=rosterSize();
    $("navLeagueStatus").textContent=(leagueConfig.leagueName||"Unnamed League")+" • "+leagueConfig.teamCount+" teams • "+money(leagueConfig.budget);
    renderAll(); renderPersonalBoard(); renderBulkBoard(); renderCore();
    $("leagueSavedNote").textContent="Live valuation preview — save to keep these settings.";
  },100);
}
valuationSettingIds.forEach(id=>$(id)?.addEventListener(id.includes("Budget")?"input":"change",previewLeagueValuationFromHeadquarters));

// Sprint 32.4 — Dossier Everywhere.
// Any player reference opens the dossier, highlights the active player everywhere,
// and can surface a fast scouting preview without changing draft state.
let dossierPreviewEl=null;
let dossierPreviewTimer=0;
let dossierPreviewTarget=null;
let suppressNextDossierClick=false;

function dossierQuickPreviewData(name){
  const base=byName[name];
  if(!base)return null;
  const p=effectivePlayer(base);
  const ev=getPersonalEvaluation(name)||{};
  const leagueValue=Math.max(1,Math.round(marketValueFor(base)||0));
  const myValue=Math.max(0,Math.round(Number(ev.value||p?.personalValue||0)));
  const conviction=normalizedConviction(ev.conviction);
  const soldSale=sold(name);
  const action=soldSale?`SOLD • ${money(soldSale.price)}`:(p?.action==="ATTACK"?"ATTACK":p?.action==="VALUE"?"VALUE ONLY":p?.action==="PASS"?"PASS UNLESS DISCOUNT":p?.action==="AVOID"?"AVOID":"WATCH");
  return {name,pos:base.pos||"",team:base.team||"FA",leagueValue,myValue,conviction,action,sold:!!soldSale};
}

function ensureDossierQuickPreview(){
  if(dossierPreviewEl)return dossierPreviewEl;
  dossierPreviewEl=document.createElement("div");
  dossierPreviewEl.id="dossierQuickPreview";
  dossierPreviewEl.className="dossier-quick-preview";
  dossierPreviewEl.setAttribute("role","tooltip");
  dossierPreviewEl.setAttribute("aria-hidden","true");
  document.body.appendChild(dossierPreviewEl);
  return dossierPreviewEl;
}

function positionDossierQuickPreview(target){
  const el=ensureDossierQuickPreview();
  const r=target.getBoundingClientRect();
  const pad=10;
  const width=Math.min(290,window.innerWidth-pad*2);
  el.style.width=width+"px";
  let left=Math.min(window.innerWidth-width-pad,Math.max(pad,r.left+r.width/2-width/2));
  let top=r.top-el.offsetHeight-10;
  if(top<pad)top=Math.min(window.innerHeight-el.offsetHeight-pad,r.bottom+10);
  el.style.left=Math.round(left)+"px";
  el.style.top=Math.round(Math.max(pad,top))+"px";
}

function showDossierQuickPreview(target,immediate=false){
  clearTimeout(dossierPreviewTimer);
  const name=target?.dataset?.dossierPlayer;
  const data=name&&dossierQuickPreviewData(name);
  if(!data)return;
  const open=()=>{
    dossierPreviewTarget=target;
    const el=ensureDossierQuickPreview();
    const stars="★".repeat(data.conviction)+"☆".repeat(Math.max(0,5-data.conviction));
    el.innerHTML=`<div class="dossier-preview-head"><strong>${esc(data.name)}</strong><span>${esc(data.pos)} • ${esc(data.team)}</span></div><div class="dossier-preview-grid"><div><span>LEAGUE VALUE</span><b>${money(data.leagueValue)}</b></div><div><span>YOUR VALUE</span><b>${data.myValue?money(data.myValue):"—"}</b></div></div><div class="dossier-preview-foot ${data.sold?"sold":""}"><strong>${esc(data.action)}</strong><span aria-label="${data.conviction} of 5 conviction">${stars}</span></div><small>Tap to open full dossier</small>`;
    el.classList.add("visible");
    el.setAttribute("aria-hidden","false");
    requestAnimationFrame(()=>positionDossierQuickPreview(target));
  };
  if(immediate)open(); else dossierPreviewTimer=setTimeout(open,260);
}

function hideDossierQuickPreview(){
  clearTimeout(dossierPreviewTimer);
  dossierPreviewTarget=null;
  if(!dossierPreviewEl)return;
  dossierPreviewEl.classList.remove("visible");
  dossierPreviewEl.setAttribute("aria-hidden","true");
}

function updateDossierSelectionHighlights(name){
  document.querySelectorAll("[data-dossier-player].current-dossier-player").forEach(el=>el.classList.remove("current-dossier-player"));
  if(!name)return;
  document.querySelectorAll("[data-dossier-player]").forEach(el=>{
    if(el.dataset.dossierPlayer===name)el.classList.add("current-dossier-player");
  });
}

document.addEventListener("click",e=>{
  const target=e.target.closest("[data-dossier-player]");
  if(!target)return;
  if(suppressNextDossierClick){suppressNextDossierClick=false;e.preventDefault();return;}
  const name=target.dataset.dossierPlayer;
  if(!name||!byName[name])return;
  e.preventDefault();
  hideDossierQuickPreview();
  openPlayerInWarRoom(name);
  if(window.matchMedia("(max-width: 900px)").matches){
    document.getElementById("warDossierPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  }
});

document.addEventListener("pointerover",e=>{
  if(e.pointerType&&e.pointerType!=="mouse")return;
  const target=e.target.closest("[data-dossier-player]");
  if(target)showDossierQuickPreview(target);
});
document.addEventListener("pointerout",e=>{
  if(!dossierPreviewTarget)return;
  const next=e.relatedTarget;
  if(dossierPreviewTarget.contains(next)||dossierPreviewEl?.contains(next))return;
  hideDossierQuickPreview();
});
document.addEventListener("focusin",e=>{const target=e.target.closest?.("[data-dossier-player]");if(target)showDossierQuickPreview(target,true);});
document.addEventListener("focusout",e=>{if(!dossierPreviewEl?.contains(e.relatedTarget))hideDossierQuickPreview();});

let dossierLongPressTimer=0;
document.addEventListener("touchstart",e=>{
  const target=e.target.closest("[data-dossier-player]");
  if(!target)return;
  clearTimeout(dossierLongPressTimer);
  dossierLongPressTimer=setTimeout(()=>{showDossierQuickPreview(target,true);suppressNextDossierClick=true;},480);
},{passive:true});
document.addEventListener("touchend",()=>clearTimeout(dossierLongPressTimer),{passive:true});
document.addEventListener("touchmove",()=>clearTimeout(dossierLongPressTimer),{passive:true});
window.addEventListener("resize",()=>{if(dossierPreviewTarget)positionDossierQuickPreview(dossierPreviewTarget);});
window.addEventListener("scroll",hideDossierQuickPreview,true);


// Sprint 33.1.4 — interactive Likely Bidders team scouting.
document.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-team-scout]');
  if(trigger){
    const index=Number(trigger.dataset.teamIndex);
    if(trigger.dataset.teamScout==='mock'&&typeof window.openMockTeamScout==='function')window.openMockTeamScout(index);
    else if(typeof openLiveTeamScout==='function')openLiveTeamScout(index);
  }
  if(e.target.id==='teamScoutClose'||e.target.id==='teamScoutBackdrop')closeTeamScout();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTeamScout();});
