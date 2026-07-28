// Sprint 24.3 — rendering, selection, reports, and general UI helpers.

function renderCommand(){
  const leagueBudget=Number(leagueConfig.budget||200); const s=spent(), remaining=leagueBudget-s, left=rosterSize()-Object.keys(state.roster).length;
  $("budget").textContent=money(remaining); $("budgetSub").textContent="OF "+money(leagueBudget);
  $("maxBid").textContent=money(Math.max(0,remaining-(left-1)));
  $("playersLeft").textContent=left;
  $("avg").textContent="$"+(left?remaining/left:0).toFixed(2);
  const ms=marketStats();
  $("market").textContent=ms.temp;
  $("marketTrend").textContent=ms.trend;
  $("phase").textContent=phase();
  $("nomCount").textContent=state.sales.length+" NOMINATIONS";
  $("totalSpent").textContent=money(s);
}

function renderRoster(){
  $("roster").innerHTML=rosterSlots().map(slot=>{
    const entry=state.roster[slot];
    return `<div class="roster-row"><span class="slot">${slot}</span><span>${entry?entry.player:"—"}</span><span class="cost">${entry?money(entry.price):"—"}</span></div>`;
  }).join("");
}

function renderCore(){
  const targets=Object.values(personalEvaluations||{})
    .filter(ev=>{
      if(!ev||!ev.name||ev.avoid||normalizedConviction(ev.conviction)<=1)return false;
      return Number(ev.rank)>0||normalizedConviction(ev.conviction)>=4||ev.flagPlant||ev.favorite||ev.sleeper||Number(ev.value)>0;
    })
    .map(ev=>({
      ev,
      player:effectivePlayer(byName[ev.name]||{name:ev.name,pos:"",tier:"UNRANKED"}),
      personalRank:Number(ev.rank)||0,
      conviction:normalizedConviction(ev.conviction),
      consensus:consensusPriceFor(byName[ev.name]||{name:ev.name})||0
    }))
    .sort((a,b)=>{
      const aRanked=a.personalRank>0,bRanked=b.personalRank>0;
      if(aRanked!==bRanked)return aRanked?-1:1;
      if(aRanked&&a.personalRank!==b.personalRank)return a.personalRank-b.personalRank;
      if(a.conviction!==b.conviction)return b.conviction-a.conviction;
      const aPriority=Number(!!a.ev.flagPlant)*3+Number(!!a.ev.favorite)*2+Number(!!a.ev.sleeper);
      const bPriority=Number(!!b.ev.flagPlant)*3+Number(!!b.ev.favorite)*2+Number(!!b.ev.sleeper);
      if(aPriority!==bPriority)return bPriority-aPriority;
      if(a.consensus!==b.consensus)return b.consensus-a.consensus;
      return (a.ev.name||"").localeCompare(b.ev.name||"");
    })
    .slice(0,10);
  if(!targets.length){ $("coreTargets").innerHTML='<div style="color:var(--muted);padding:12px">No personal targets yet. Rank players or set My Guys in Draft Prep.</div>'; return; }
  $("coreTargets").innerHTML=targets.map(({ev,player:p,personalRank})=>{
    const sale=sold(ev.name); const cls=sale?(sale.winner==="me"?"mine":"other"):"";
    const rankLabel=personalRank?`#${personalRank}`:"MY GUY";
    const posLabel=`${p.pos||""}${p.tier!=="UNRANKED"&&p.tier?" T"+p.tier:""}`;
    return `<div class="core-row"><span class="status-dot ${cls}"></span><span>${esc(ev.name)}</span><span style="text-align:right;color:${p.pos==="RB"?"var(--green)":p.pos==="TE"?"var(--orange)":"var(--blue)"}">${rankLabel}${posLabel?" • "+posLabel:""}</span></div>`;
  }).join("");
}

function selectedBase(){ return state.selected?byName[state.selected]:null; }

function renderMarketPulse(){
  $("marketPulse").innerHTML=["QB","RB","WR","TE"].map(pos=>{const x=positionMarketStats(pos), cls=x.status==="HOT"?"hot":x.status==="CHEAP"?"cold":x.status==="NORMAL"?"normal":"early"; const label=x.status==="HOT"?`+${Math.round(x.infl*100)}%`:x.status==="CHEAP"?`${Math.round(x.infl*100)}%`:x.status; return `<div class="market-chip ${cls}"><span>${pos}</span><strong>${label}</strong></div>`;}).join("");
}

function renderNominationSuggestion(){ const n=nominationSuggestion(); $("nominationPlayer").textContent=n.player; $("nominationReason").textContent=n.reason; }

function renderAlerts(){
  renderMarketPulse(); renderNominationSuggestion();
  const a=alerts();
  $("alerts").innerHTML=(a.length?a:[{c:"green",t:"SYSTEM READY — WAITING FOR NOMINATION"}]).map(x=>`<div class="alert ${x.c}">${x.t}</div>`).join("");
}

function renderRecommendation(base){
  const r=recommendationFor(base), box=$("recommendationEngine");
  box.classList.remove("poor","situational","sold");
  if(r.sold) box.classList.add("sold"); else if(r.fit==="POOR FIT") box.classList.add("poor"); else if(r.fit==="SITUATIONAL") box.classList.add("situational");
  $("recommendationFit").textContent=r.fit;
  $("recommendationScore").textContent=r.score?`${r.score}/100`:(r.sold?"FINAL":"—");
  $("recommendationConfidence").textContent=r.confidence;
  $("recommendationReasons").innerHTML=(r.reasons.length?r.reasons:["Select a player to generate personalized guidance"]).map((x,i)=>`<div class="recommendation-reason ${/avoid|exceeds|large share|No legal|hot/i.test(x)?"warning":""}">${x}</div>`).join("");
}

function setSelected(p){
  p=effectivePlayer(p);
  const existingSale=p?sold(p.name):null;
  state.selected=p? p.name:null; save();
  $("warDossierPanel").classList.toggle("sold-player",!!existingSale);
  $("readyBtn").disabled=!!existingSale;
  $("playerSearch").value=p?p.name:"";
  $("recordPlayer").value=p?p.name:"";
  if(!p){
    $("waiting").classList.remove("hidden"); $("liveDecision").classList.add("hidden"); $("playerHead").classList.add("hidden");
    $("primaryPivot").textContent="—"; $("secondaryPivot").textContent="—"; $("budgetPivot").textContent="—"; renderWarDossier(null); renderRecommendation(null); renderAlerts(); return;
  }
  $("waiting").classList.add("hidden"); $("liveDecision").classList.remove("hidden"); $("playerHead").classList.remove("hidden");
  const ev=p.personalEvaluation;
  $("playerName").innerHTML=p.name+(ev?'<span class="personal-badge">YOUR BOARD</span>':'');
  $("playerPos").textContent=p.pos+(p.team?" • "+p.team:"");
  $("playerTier").textContent=p.tier==="UNRANKED"?"NOT YET RANKED":"TIER "+p.tier;
  $("playerPressure").textContent=ev?evaluationTags(ev).join(" • ")||"PERSONAL VALUE":(p.tier==="UNRANKED"?"FULL DATABASE":"PRESSURE: "+p.pressure);
  $("commandText").textContent=existingSale?"SOLD":(p.action==="ATTACK"?"ATTACK":p.action==="VALUE"?"VALUE ONLY":p.action==="PASS"?"PASS UNLESS DISCOUNT":p.action==="WATCH"?"NO PERSONAL GRADE":"AVOID");
  $("buyRange").textContent=p.buyLow?`$${p.buyLow} – $${p.buyHigh}`:"—";
  $("fairRange").textContent=p.fairLow?`$${p.fairLow} – $${p.fairHigh}`:"—";
  $("stopRange").textContent=p.overpay?`$${p.overpay}+`:"PASS";
  const ps=(p.pivots||"").split("→").map(x=>x.trim()).filter(Boolean);
  $("primaryPivot").textContent=ps[0]||"—"; $("secondaryPivot").textContent=ps[1]||"—"; $("budgetPivot").textContent=p.budgetPivot||"—";
  renderWarDossier(byName[p.name]||p);
  renderRecommendation(byName[p.name]||p);
  renderAlerts();
}

function fillSelects(){
  $("recordPlayerList").innerHTML=PLAYERS.map(p=>`<option value="${p.name}">${p.pos} • ${p.team||"FA"}</option>`).join("");
}

function renderAll(){ renderCommand(); renderRoster(); renderCore(); renderAlerts(); renderMyGuysGallery(); renderBlueprint(); }

function showScoutingPanel(panel){const board=panel==='BOARD',my=panel==='MY',blue=panel==='BLUE';$("scoutingMainLayout").classList.toggle('hidden',!board);$("myGuysGallery").classList.toggle('hidden',!my);$("blueprintGallery").classList.toggle('hidden',!blue);$("scoutingBoardTab").classList.toggle('active',board);$("myGuysTab").classList.toggle('active',my);$("blueprintTab").classList.toggle('active',blue);if(my)renderMyGuysGallery();if(blue)renderBlueprint();}

function openPlayerInWarRoom(name){const p=byName[name];if(!p)return;setSelected(p);document.querySelectorAll('.nav-tab').forEach(x=>x.classList.toggle('active',x.dataset.view==='warRoomView'));document.querySelectorAll('.app-view').forEach(x=>x.classList.toggle('active',x.id==='warRoomView'));setTimeout(setAppHeight,20);}

function esc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function printableShell(title,subtitle,body){
  const w=window.open("","_blank"); if(!w){alert("Please allow pop-ups so War Room can open the printable report.");return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body{font-family:Arial,sans-serif;color:#111;margin:38px;line-height:1.4}h1{margin:0;font-size:30px}h2{margin-top:28px;border-bottom:2px solid #111;padding-bottom:6px}h3{margin:18px 0 5px}.sub{color:#555;margin:4px 0 22px}.meta{display:flex;gap:28px;flex-wrap:wrap;margin:16px 0}.metric{border:1px solid #bbb;border-radius:8px;padding:10px 14px;min-width:115px}.metric strong{display:block;font-size:20px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px 6px;font-size:13px}th{background:#f3f3f3}.tag{display:inline-block;border:1px solid #777;border-radius:999px;padding:2px 7px;margin:2px;font-size:11px}.note{color:#444}.good{color:#137333;font-weight:700}.bad{color:#b3261e;font-weight:700}.neutral{color:#555;font-weight:700}.grade{font-size:32px;line-height:1}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.bar{height:10px;background:#e6e6e6;border-radius:999px;overflow:hidden}.bar>span{display:block;height:100%;background:#111}.team-card{break-inside:avoid;border:1px solid #bbb;border-radius:10px;padding:12px;margin:12px 0}.team-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.small{font-size:12px;color:#666}.actions{position:fixed;right:20px;top:20px}@media(max-width:800px){.grid2{grid-template-columns:1fr}}@media print{.actions{display:none}body{margin:18mm}.team-card{break-inside:avoid}}
  
</style></head><body><button class="actions" onclick="window.print()">PRINT / SAVE PDF</button><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div>${body}</body></html>`);
  w.document.close(); w.focus();
}

function draftReport(){
  const myIdx=Number(leagueConfig.myTeamIndex||0), myTeam=leagueConfig.teams?.[myIdx]?.teamName||"Your Team";
  const mySales=state.sales.filter(s=>s.winner==="me"||Number(s.winnerTeamIndex)===myIdx);
  const spentAmt=mySales.reduce((a,s)=>a+Number(s.price||0),0), remaining=Math.max(0,Number(leagueConfig.budget||200)-spentAmt);
  const rosterRows=Object.entries(state.roster||{}).map(([slot,r])=>`<tr><td>${esc(slot)}</td><td>${esc(r.player)}</td><td>${esc(byName[r.player]?.pos||"")}</td><td>$${Number(r.price||0)}</td></tr>`).join("")||'<tr><td colspan="4">No players recorded for your team.</td></tr>';
  const saleRows=(state.sales||[]).map((s,i)=>{const base=byName[s.player], mv=reportMarketValue(base), diff=mv?mv-Number(s.price||0):null;return `<tr><td>${i+1}</td><td>${esc(s.player)}</td><td>${esc(base?.pos||"")}</td><td>${esc(teamLabelForSale(s))}</td><td>$${Number(s.price||0)}</td><td class="${diff===null?'neutral':diff>0?'good':diff<0?'bad':'neutral'}">${diff===null?'—':(diff>0?'+':'')+'$'+diff}</td></tr>`}).join("")||'<tr><td colspan="6">No sales recorded.</td></tr>';

  const valuedMy=mySales.map(s=>{const base=byName[s.player], market=reportMarketValue(base);return {...s,base,market,diff:market?market-Number(s.price||0):null};}).filter(x=>x.diff!==null);
  const best=[...valuedMy].sort((a,b)=>b.diff-a.diff)[0]||null;
  const over=[...valuedMy].sort((a,b)=>a.diff-b.diff)[0]||null;
  const positionSpend={QB:0,RB:0,WR:0,TE:0,K:0,DEF:0};
  mySales.forEach(s=>{const pos=byName[s.player]?.pos||""; if(positionSpend[pos]!==undefined) positionSpend[pos]+=Number(s.price||0);});
  const posRows=Object.entries(positionSpend).filter(([,v])=>v>0).map(([pos,v])=>`<tr><td>${pos}</td><td>$${v}</td><td>${spentAmt?Math.round(v/spentAmt*100):0}%</td></tr>`).join("")||'<tr><td colspan="3">No position spending yet.</td></tr>';

  const inflRows=["QB","RB","WR","TE"].map(pos=>{const sales=state.sales.filter(s=>byName[s.player]?.pos===pos).map(s=>{const m=reportMarketValue(byName[s.player]);return m?Number(s.price||0)/m-1:null}).filter(v=>v!==null);const avg=sales.length?sales.reduce((a,b)=>a+b,0)/sales.length:0;const pct=Math.round(avg*100);return `<tr><td>${pos}</td><td>${sales.length}</td><td class="${pct>5?'bad':pct<-5?'good':'neutral'}">${sales.length?(pct>0?'+':'')+pct+'%':'Not enough data'}</td><td>${sales.length?(pct>8?'Hot':pct<-8?'Cheap':'Normal'):'—'}</td></tr>`}).join("");

  let philosophyPoints=0, philosophyPossible=0;
  mySales.forEach(s=>{const ev=getPersonalEvaluation(s.player), price=Number(s.price||0); if(!ev)return; philosophyPossible+=10; if(ev.avoid) philosophyPoints-=10; else {philosophyPoints+=4; if(ev.flagPlant||ev.favorite||ev.sleeper) philosophyPoints+=3; const cap=Number(ev.hardStop||ev.value||0); if(cap) philosophyPoints+=price<=cap?3:-3;}});
  const philosophyScore=philosophyPossible?Math.max(0,Math.min(100,Math.round((philosophyPoints/philosophyPossible)*100))):null;
  const valueDelta=valuedMy.reduce((a,x)=>a+x.diff,0);
  const startersFilled=rosterSlots().filter(x=>!x.startsWith("BN")&&!x.startsWith("K")&&!x.startsWith("DEF")&&state.roster?.[x]).length;
  let numericGrade=72 + Math.max(-15,Math.min(15,valueDelta)) + startersFilled*2;
  if(remaining<0) numericGrade-=30;
  if(philosophyScore!==null) numericGrade+=(philosophyScore-70)*.12;
  numericGrade=Math.max(40,Math.min(99,Math.round(numericGrade)));
  const letter=numericGrade>=93?'A':numericGrade>=90?'A-':numericGrade>=87?'B+':numericGrade>=83?'B':numericGrade>=80?'B-':numericGrade>=77?'C+':numericGrade>=73?'C':numericGrade>=70?'C-':numericGrade>=65?'D':'F';

  const teamGroups=(leagueConfig.teams||[]).map((t,i)=>{const rows=state.sales.filter(s=>Number(s.winnerTeamIndex)===i || (s.winner==="me"&&i===myIdx));const total=rows.reduce((a,s)=>a+Number(s.price||0),0);const roster=rows.map(s=>`<tr><td>${esc(byName[s.player]?.pos||"")}</td><td>${esc(s.player)}</td><td>$${Number(s.price||0)}</td></tr>`).join("")||'<tr><td colspan="3">No players recorded.</td></tr>';return `<div class="team-card"><div class="team-head"><div><strong>${esc(t.teamName||`Team ${i+1}`)}</strong><div class="small">${esc(t.ownerName||"")}</div></div><div><strong>$${total}</strong><div class="small">spent • $${Math.max(0,Number(leagueConfig.budget||200)-total)} left</div></div></div><table><thead><tr><th>Pos</th><th>Player</th><th>Price</th></tr></thead><tbody>${roster}</tbody></table></div>`}).join("");

  const highlights=`<div class="grid2"><div class="team-card"><h3>Best Value</h3>${best?`<strong>${esc(best.player)}</strong><div class="good">$${best.price} paid • $${best.market} market • +$${best.diff} value</div>`:'<div class="small">No market-comparable purchases yet.</div>'}</div><div class="team-card"><h3>Biggest Overpay</h3>${over?`<strong>${esc(over.player)}</strong><div class="${over.diff<0?'bad':'good'}">$${over.price} paid • $${over.market} market • ${over.diff>0?'+':''}$${over.diff}</div>`:'<div class="small">No market-comparable purchases yet.</div>'}</div></div>`;

  printableShell(`${leagueConfig.leagueName||"War Room"} — Draft Report`,`${leagueConfig.teamCount||12} teams • $${leagueConfig.budget||200} budget • ${leagueConfig.scoring||"PPR"}`,
  `<div class="meta"><div class="metric"><strong>${esc(myTeam)}</strong>Your Team</div><div class="metric"><strong>$${spentAmt}</strong>Spent</div><div class="metric"><strong>$${remaining}</strong>Remaining</div><div class="metric"><strong>${state.sales.length}</strong>Total Sales</div><div class="metric"><strong class="grade">${letter}</strong>Draft Grade (${numericGrade})</div><div class="metric"><strong>${philosophyScore===null?'—':philosophyScore+'%'}</strong>Philosophy Score</div></div>${highlights}<h2>Your Roster</h2><table><thead><tr><th>Slot</th><th>Player</th><th>Pos</th><th>Price</th></tr></thead><tbody>${rosterRows}</tbody></table><div class="grid2"><div><h2>Position Spending</h2><table><thead><tr><th>Position</th><th>Spent</th><th>Share</th></tr></thead><tbody>${posRows}</tbody></table></div><div><h2>Market Inflation</h2><table><thead><tr><th>Position</th><th>Sales</th><th>Vs Market</th><th>Trend</th></tr></thead><tbody>${inflRows}</tbody></table></div></div><h2>Complete Draft Log</h2><table><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Winner</th><th>Price</th><th>Value +/-</th></tr></thead><tbody>${saleRows}</tbody></table><h2>Team-by-Team Rosters</h2>${teamGroups}`);
  setResetStatus("Enhanced draft report opened. Choose Print / Save PDF.");
}

function renderTeamCountOptions(){
  $("teamCountInput").innerHTML=Array.from({length:13},(_,i)=>i+4).map(n=>`<option value="${n}">${n}</option>`).join("");
  const optionRange=(max,min=0)=>Array.from({length:max-min+1},(_,i)=>i+min).map(n=>`<option value="${n}">${n}</option>`).join("");
  $("qbSlotsInput").innerHTML=optionRange(3); $("rbSlotsInput").innerHTML=optionRange(5); $("wrSlotsInput").innerHTML=optionRange(5); $("teSlotsInput").innerHTML=optionRange(3); $("flexSlotsInput").innerHTML=optionRange(5); $("kSlotsInput").innerHTML=optionRange(2); $("defSlotsInput").innerHTML=optionRange(2); $("benchSlotsInput").innerHTML=optionRange(15);
}

function renderMyTeamOptions(){
  $("myTeamInput").innerHTML=leagueConfig.teams.map((t,i)=>`<option value="${i}">${t.teamName||("Team "+(i+1))}</option>`).join("");
  $("myTeamInput").value=String(leagueConfig.myTeamIndex||0);
}

function renderTeamsEditor(){
  ensureTeams();
  $("teamsList").innerHTML=leagueConfig.teams.map((t,i)=>`<div class="team-row">
    <div class="team-number">${i+1}</div>
    <input data-team-owner="${i}" placeholder="Owner name" value="${String(t.ownerName||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">
    <input data-team-name="${i}" placeholder="Team name" value="${String(t.teamName||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">
    <div class="my-team-pill">${i===Number(leagueConfig.myTeamIndex)?"YOUR TEAM":""}</div>
  </div>`).join("");
  renderMyTeamOptions();
}

function renderLeagueSetup(){
  ensureTeams();
  $("leagueNameInput").value=leagueConfig.leagueName||"";
  $("teamCountInput").value=String(leagueConfig.teamCount||12);
  $("leagueBudgetInput").value=String(leagueConfig.budget||200);
  $("scoringInput").value=leagueConfig.scoring||"PPR";
  const r=leagueConfig.roster||defaultLeagueConfig.roster; $("qbSlotsInput").value=r.qb; $("rbSlotsInput").value=r.rb; $("wrSlotsInput").value=r.wr; $("teSlotsInput").value=r.te; $("flexSlotsInput").value=r.flex; $("kSlotsInput").value=r.k; $("defSlotsInput").value=r.def; $("benchSlotsInput").value=r.bench;
  renderTeamsEditor();
  $("summaryTeams").textContent=leagueConfig.teamCount;
  $("summaryBudget").textContent=money(leagueConfig.budget);
  $("summaryScoring").textContent=leagueConfig.scoring;
  $("summaryRoster").textContent=rosterSize();
  $("navLeagueStatus").textContent=(leagueConfig.leagueName||"Unnamed League")+" • "+leagueConfig.teamCount+" teams • "+money(leagueConfig.budget);
}

// Viewport sizing and mobile/orientation wiring.
function setAppHeight() {
  const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const nav = document.querySelector(".top-nav");
  const h = Math.max(420, viewportH - (nav ? nav.offsetHeight : 0));
  document.documentElement.style.setProperty("--app-height", h + "px");
  const app = document.getElementById("app");
  if (app) app.style.height = h + "px";
}
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", () => setTimeout(setAppHeight, 200));
if (window.visualViewport) window.visualViewport.addEventListener("resize", setAppHeight);
window.addEventListener("load", setAppHeight);
