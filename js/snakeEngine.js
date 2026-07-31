// Sprint 35.1 — Snake Recommendation Engine.
// Snake state remains isolated from auction state while sharing league settings,
// player intelligence, and the user's Draft Prep board.
const SNAKE_STATE_KEY="warRoomSnakeDraftStateV2";
let snakeDraftState=(()=>{
  try{
    const v2=JSON.parse(localStorage.getItem(SNAKE_STATE_KEY)||"null");
    if(v2)return {...v2,picks:Array.isArray(v2.picks)?v2.picks:[]};
    const old=JSON.parse(localStorage.getItem("warRoomSnakeDraftStateV1")||"null");
    return old?{completedPicks:Number(old.completedPicks||0),picks:Array.isArray(old.picks)?old.picks:[]}:{completedPicks:0,picks:[]};
  }catch(e){return {completedPicks:0,picks:[]};}
})();
function saveSnakeDraftState(){localStorage.setItem(SNAKE_STATE_KEY,JSON.stringify(snakeDraftState));}
function snakeTeamCount(){return Math.max(2,Number(leagueConfig.teamCount||12));}
function snakeRoundCount(){return Math.max(1,typeof rosterSize==="function"?rosterSize():17);}
function snakeDraftPosition(){return Math.min(snakeTeamCount(),Math.max(1,Number(leagueConfig.draftPosition||1)));}
function snakePickOrder(rounds=snakeRoundCount(),teams=snakeTeamCount()){
  const order=[];
  for(let round=1;round<=rounds;round++){
    const forward=round%2===1;
    for(let offset=0;offset<teams;offset++){
      const slot=forward?offset+1:teams-offset;
      order.push({overall:order.length+1,round,pickInRound:offset+1,slot,teamIndex:slot-1,direction:forward?"Forward":"Reverse"});
    }
  }
  return order;
}
function snakePickLabel(pick){return pick?`${pick.round}.${String(pick.pickInRound).padStart(2,"0")}`:"COMPLETE";}
function snakeYourPicks(order=snakePickOrder()){const pos=snakeDraftPosition();return order.filter(p=>p.slot===pos);}
function renderDraftPositionOptions(){
  const el=document.getElementById("draftPositionInput");if(!el)return;
  const teams=Math.max(2,Number(document.getElementById("teamCountInput")?.value||leagueConfig.teamCount||12));
  const selected=Math.min(teams,Math.max(1,Number(leagueConfig.draftPosition||1)));
  el.innerHTML=Array.from({length:teams},(_,i)=>`<option value="${i+1}">Pick ${i+1}</option>`).join("");
  el.value=String(selected);leagueConfig.draftPosition=selected;
}
function updateDraftFormatUI(){
  const snake=(leagueConfig.draftFormat||"auction")==="snake";
  document.querySelectorAll(".snake-setting").forEach(el=>el.classList.toggle("hidden",!snake));
  document.querySelectorAll(".auction-setting").forEach(el=>el.classList.toggle("hidden",snake));
  document.querySelectorAll(".snake-only").forEach(el=>el.classList.toggle("hidden",!snake));
  const mockTab=document.querySelector('[data-view="mockDraftView"]');
  const warTab=document.querySelector('[data-view="warRoomView"]');
  if(mockTab)mockTab.textContent=snake?"AUCTION MOCK":"MOCK DRAFT";
  if(warTab)warTab.textContent=snake?"AUCTION ROOM":"WAR ROOM";
  if(document.getElementById("summaryFormat"))document.getElementById("summaryFormat").textContent=snake?"SNAKE":"AUCTION";
  if(document.getElementById("summaryBudget"))document.getElementById("summaryBudget").textContent=snake?`PICK ${snakeDraftPosition()}`:money(leagueConfig.budget);
  if(document.getElementById("summaryBudgetLabel"))document.getElementById("summaryBudgetLabel").textContent=snake?"YOUR SLOT":"PER TEAM";
  if(snake)renderSnakeDraftFoundation();
}
function snakeTeamForSlot(slot){
  const myIdx=Number(leagueConfig.myTeamIndex||0),mySlot=snakeDraftPosition();
  if(slot===mySlot)return {index:myIdx,...(leagueConfig.teams?.[myIdx]||{})};
  const others=(leagueConfig.teams||[]).map((team,index)=>({index,...team})).filter(team=>team.index!==myIdx);
  const otherSlotIndex=slot<mySlot?slot-1:slot-2;
  return others[otherSlotIndex]||{index:-1,teamName:`Team ${slot}`};
}
function snakeTeamLabel(pick){
  if(!pick)return "Draft complete";
  const team=snakeTeamForSlot(pick.slot);
  return (team.teamName||`Team ${pick.slot}`)+(pick.slot===snakeDraftPosition()?" • YOUR PICK":"");
}
function snakeRosterRules(){
  const r=leagueConfig.roster||{};
  return {QB:Number(r.qb||0),RB:Number(r.rb||0),WR:Number(r.wr||0),TE:Number(r.te||0),FLEX:Number(r.flex||0),SUPERFLEX:Number(r.superflex||0),K:Number(r.k||0),DEF:Number(r.def||0),BENCH:Number(r.bench||0)};
}
function snakeDraftedKeys(){return new Set((snakeDraftState.picks||[]).map(p=>playerKey(p.player||"")));}
function snakePicksForSlot(slot){return (snakeDraftState.picks||[]).filter(p=>Number(p.slot)===Number(slot)&&p.player);}
function snakeRosterCounts(slot){
  const c={QB:0,RB:0,WR:0,TE:0,K:0,DEF:0};
  snakePicksForSlot(slot).forEach(p=>{const pos=p.pos||byName[p.player]?.pos;if(c[pos]!==undefined)c[pos]++;});
  return c;
}
function snakeEligiblePositions(){
  const r=snakeRosterRules(),positions=["QB","RB","WR","TE"];
  if(r.K>0)positions.push("K");if(r.DEF>0)positions.push("DEF");return positions;
}
function snakeAvailablePlayers(){
  const drafted=snakeDraftedKeys(),eligible=new Set(snakeEligiblePositions());
  return PLAYERS.filter(p=>eligible.has(p.pos)&&!drafted.has(playerKey(p.name))&&p.active!==false&&(p.pos==="DEF"||p.pos==="K"||CURRENT_NFL_TEAMS.has(String(p.team||"").toUpperCase())));
}
function snakePersonalRank(base){const ev=getPersonalEvaluation(base.name)||{};return Number(ev.rank||0);}
function snakeConviction(base){const ev=getPersonalEvaluation(base.name)||{};return typeof normalizedConviction==="function"?normalizedConviction(ev.conviction):Number(ev.conviction||3);}
function snakeLeagueRankRows(){
  const positions=snakeEligiblePositions();
  const rows=PLAYERS.filter(p=>positions.includes(p.pos)&&p.active!==false&&(p.pos==="DEF"||p.pos==="K"||CURRENT_NFL_TEAMS.has(String(p.team||"").toUpperCase())));
  const scoring=String(leagueConfig.scoring||"PPR").toUpperCase(),rules=snakeRosterRules(),teams=snakeTeamCount();
  const demandWeight={QB:rules.QB+rules.SUPERFLEX*.75,RB:rules.RB+rules.FLEX*.52,WR:rules.WR+rules.FLEX*.48,TE:rules.TE+rules.FLEX*.12,K:rules.K,DEF:rules.DEF};
  return rows.map(base=>{
    const market=marketRankFor(base)||providerRankFor(base)||9999;
    const provider=providerRankFor(base)||market;
    const personal=snakePersonalRank(base)||market;
    let rankScore=market*.58+provider*.22+personal*.20;
    const conviction=snakeConviction(base),ev=getPersonalEvaluation(base.name)||{};
    rankScore-=({1:-7,2:-3,3:0,4:4,5:8}[conviction]||0);
    if(ev.flagPlant)rankScore-=4;if(ev.sleeper)rankScore-=2;if(ev.avoid)rankScore+=18;
    const relative=demandWeight[base.pos]||0;
    if(base.pos==="WR"&&scoring==="PPR")rankScore-=Math.min(5,relative*1.2);
    if(base.pos==="RB"&&scoring==="STANDARD")rankScore-=Math.min(4,relative);
    if(base.pos==="QB"&&rules.SUPERFLEX>0)rankScore-=16;
    if(teams>=14)rankScore-=Math.min(4,relative);if(teams<=10)rankScore+=Math.max(0,3-relative);
    if(base.pos==="K"||base.pos==="DEF")rankScore+=Math.max(100,rows.length*.35);
    return {base,rankScore};
  }).sort((a,b)=>a.rankScore-b.rankScore||a.base.name.localeCompare(b.base.name)).map((row,i)=>({...row,leagueRank:i+1}));
}
function snakeLeagueRankMap(){return new Map(snakeLeagueRankRows().map(r=>[playerKey(r.base.name),r]));}
function snakeStarterPressure(pos,counts,rules){
  const direct=Math.max(0,(rules[pos]||0)-(counts[pos]||0));
  let flex=0;
  if(["RB","WR","TE"].includes(pos)){
    const flexUsed=Math.max(0,(counts.RB-rules.RB)) + Math.max(0,(counts.WR-rules.WR)) + Math.max(0,(counts.TE-rules.TE));
    flex=Math.max(0,rules.FLEX-flexUsed);
  }
  if(pos==="QB"){
    const sfUsed=Math.max(0,counts.QB-rules.QB);
    flex=Math.max(0,rules.SUPERFLEX-sfUsed);
  }
  return {direct,flex};
}
function snakeRosterFit(base,slot){
  const rules=snakeRosterRules(),counts=snakeRosterCounts(slot),pressure=snakeStarterPressure(base.pos,counts,rules),total=snakePicksForSlot(slot).length,round=total+1;
  let score=0,label="Bench depth";
  if(pressure.direct>0){score+=34;label=`Open ${base.pos} starter`;}
  else if(pressure.flex>0){score+=20;label=base.pos==="QB"?"Superflex fit":"FLEX fit";}
  else if(["RB","WR"].includes(base.pos)){score+=Math.max(3,13-round*.35);label="Depth and upside";}
  else if(base.pos==="TE"&&counts.TE===0){score+=15;label="TE starter fit";}
  else if(base.pos==="QB"&&counts.QB===0){score+=15;label="QB starter fit";}
  else if(base.pos==="K"||base.pos==="DEF"){
    const required=rules[base.pos]||0;
    if((counts[base.pos]||0)<required&&total>=Math.max(0,snakeRoundCount()-rules.BENCH-2)){score+=18;label=`Required ${base.pos} slot`;}
    else{score-=45;label=`Wait on ${base.pos}`;}
  }
  if((counts[base.pos]||0)>=(rules[base.pos]||0)+Math.max(2,Math.ceil(rules.BENCH/2)))score-=18;
  return {score,label,pressure};
}
function snakeTierInfo(base,rankMap,available){
  const row=rankMap.get(playerKey(base.name)),same=available.map(p=>rankMap.get(playerKey(p.name))).filter(r=>r&&r.base.pos===base.pos).sort((a,b)=>a.leagueRank-b.leagueRank);
  const idx=same.findIndex(r=>r.base.name===base.name),next=same[idx+1],gap=next?next.leagueRank-row.leagueRank:20;
  const ev=getPersonalEvaluation(base.name)||{},nextEv=next?getPersonalEvaluation(next.base.name)||{}:{};
  const personalCliff=ev.tier&&nextEv.tier&&String(ev.tier)!==String(nextEv.tier);
  const cliff=personalCliff||gap>=7;
  return {cliff,gap,next:next?.base||null,label:cliff?"Tier ends here":gap>=4?"Small tier drop":"Tier has depth"};
}
function snakeTeamsBeforeNext(current,order){
  if(!current)return [];
  const next=snakeYourPicks(order).find(p=>p.overall>current.overall);
  return next?order.filter(p=>p.overall>current.overall&&p.overall<next.overall):[];
}
function snakeBetweenPickDemand(pos,current,order){
  const turns=snakeTeamsBeforeNext(current,order),rules=snakeRosterRules();let strong=0,active=0;
  turns.forEach(turn=>{const counts=snakeRosterCounts(turn.slot),pressure=snakeStarterPressure(pos,counts,rules);if(pressure.direct>0){strong++;active++;}else if(pressure.flex>0||(["RB","WR"].includes(pos)&&(counts[pos]||0)<3))active++;});
  return {turns:turns.length,strong,active,level:strong>=4?"VERY HIGH":strong>=2||active>=5?"HIGH":active>=2?"MODERATE":"LOW"};
}
function snakeRecommendationFor(base,current,order,rankMap,available,slot=snakeDraftPosition()){
  const row=rankMap.get(playerKey(base.name));if(!row)return null;
  const currentOverall=current?.overall||snakeDraftState.completedPicks+1,fit=snakeRosterFit(base,slot),tier=snakeTierInfo(base,rankMap,available),demand=snakeBetweenPickDemand(base.pos,current,order);
  const bpa=Math.round(currentOverall-row.leagueRank),conviction=snakeConviction(base),ev=getPersonalEvaluation(base.name)||{};
  let score=100-row.leagueRank*.78+fit.score+(bpa>0?Math.min(22,bpa*.7):Math.max(-18,bpa*.35))+(tier.cliff?12:0)+demand.strong*2.5+demand.active*.7+(conviction-3)*5;
  if(ev.flagPlant)score+=8;if(ev.sleeper)score+=4;if(ev.avoid)score-=45;
  const reasons=[];
  if(bpa>=8)reasons.push(`${bpa} picks of BPA value`);else if(bpa>=2)reasons.push(`Positive value at this pick`);else if(bpa<-10)reasons.push(`Reach versus league-adjusted rank`);else reasons.push(`Fair value for this selection`);
  reasons.push(fit.label);
  if(tier.cliff)reasons.push(`${base.pos} tier cliff after this player`);else if(demand.strong>=2)reasons.push(`${demand.strong} teams before your next pick have strong ${base.pos} demand`);else reasons.push(`${tier.label}`);
  const explanation=tier.cliff&&demand.active>0?`Draft now: his tier is closing and ${demand.active} team${demand.active===1?"":"s"} before your next pick could target ${base.pos}.`:
    bpa>=5?`Strong best-player-available value with ${fit.label.toLowerCase()}.`:
    `${fit.label}. ${demand.level.toLowerCase()} ${base.pos} demand before your next turn.`;
  return {base,score,leagueRank:row.leagueRank,bpa,fit,tier,demand,reasons,explanation};
}
function snakeRecommendations(current,order,limit=6,slot=snakeDraftPosition()){
  const available=snakeAvailablePlayers(),rankMap=snakeLeagueRankMap();
  return available.map(p=>snakeRecommendationFor(p,current,order,rankMap,available,slot)).filter(Boolean).sort((a,b)=>b.score-a.score||a.leagueRank-b.leagueRank).slice(0,limit);
}
function renderSnakeRecommendations(current,order){
  const box=document.getElementById("snakeRecommendations"),demandBox=document.getElementById("snakeBetweenPickDemand"),input=document.getElementById("snakePlayerInput"),list=document.getElementById("snakePlayerOptions"),record=document.getElementById("snakeRecordPickBtn");if(!box)return;
  const available=snakeAvailablePlayers();
  if(list)list.innerHTML=available.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.name)}">${esc(p.pos)} • ${esc(p.team||"")}</option>`).join("");
  const recommendations=snakeRecommendations(current,order,6,current?.slot||snakeDraftPosition());
  const isYours=current?.slot===snakeDraftPosition();
  if(input){input.disabled=!current;input.placeholder=current?`Record ${snakeTeamLabel(current).replace(" • YOUR PICK","")}'s pick…`:"Draft complete";}
  if(record)record.disabled=!current;
  if(!current){box.innerHTML='<div class="snake-empty">Draft complete.</div>';if(demandBox)demandBox.innerHTML="";return;}
  const lead=recommendations[0];
  box.innerHTML=recommendations.map((r,i)=>`<button type="button" class="snake-rec-row ${i===0?'lead':''}" data-snake-player="${esc(r.base.name)}"><span class="snake-rec-rank">${i+1}</span><span class="snake-rec-player"><strong>${esc(r.base.name)}</strong><small>${esc(r.base.pos)} • League Rank ${r.leagueRank} • ${r.bpa>=0?'+':''}${r.bpa} pick value</small><em>${esc(r.explanation)}</em></span><span class="snake-rec-fit">${esc(r.fit.label)}</span></button>`).join("");
  box.querySelectorAll("[data-snake-player]").forEach(btn=>btn.addEventListener("click",()=>{if(input){input.value=btn.dataset.snakePlayer;input.focus();}}));
  const positions=["QB","RB","WR","TE"].filter(pos=>snakeAvailablePlayers().some(p=>p.pos===pos));
  if(demandBox){demandBox.innerHTML=`<div class="snake-demand-head"><strong>BETWEEN-PICKS DEMAND</strong><span>${snakeTeamsBeforeNext(current,order).length} selections before your next turn</span></div><div class="snake-demand-grid">${positions.map(pos=>{const d=snakeBetweenPickDemand(pos,current,order);return `<div class="snake-demand-card"><strong>${pos}</strong><span class="${d.level.toLowerCase().replace(' ','-')}">${d.level}</span><small>${d.strong} strong • ${d.active} active</small></div>`;}).join("")}</div>`;}
  const call=document.getElementById("snakeCall"),copy=document.getElementById("snakeCopy");
  if(lead&&isYours){call.textContent=`DRAFT ${lead.base.name.toUpperCase()}`;copy.textContent=lead.explanation;}
  else if(lead){call.textContent=`${snakeTeamLabel(current).toUpperCase()} IS ON THE CLOCK`;copy.textContent=`Best fit for this team: ${lead.base.name}. Your board will update after the pick.`;}
}
function snakeRecordPick(playerName,auto=false){
  const order=snakePickOrder(),current=order[snakeDraftState.completedPicks]||null,err=document.getElementById("snakeRecError");if(!current)return false;
  const base=snakeAvailablePlayers().find(p=>playerKey(p.name)===playerKey(playerName));
  if(!base){if(err){err.textContent="Choose an available player from the database.";err.classList.remove("hidden");}return false;}
  if(err)err.classList.add("hidden");
  snakeDraftState.picks.push({overall:current.overall,round:current.round,pickInRound:current.pickInRound,slot:current.slot,player:base.name,pos:base.pos,team:base.team||"",recordedAt:Date.now(),auto});
  snakeDraftState.completedPicks++;
  saveSnakeDraftState();
  const input=document.getElementById("snakePlayerInput");if(input)input.value="";
  renderSnakeDraftFoundation();return true;
}
function renderSnakeDraftFoundation(){
  if(!document.getElementById("snakeOrderBoard"))return;
  const order=snakePickOrder(),total=order.length;
  document.documentElement.style.setProperty("--snake-teams",String(snakeTeamCount()));
  snakeDraftState.picks=(snakeDraftState.picks||[]).filter((p,i,a)=>p&&p.overall<=total&&(!p.player||a.findIndex(x=>playerKey(x.player||"")===playerKey(p.player||""))===i));
  snakeDraftState.completedPicks=Math.min(Math.max(0,Number(snakeDraftState.completedPicks||snakeDraftState.picks.length||0)),total);
  const current=order[snakeDraftState.completedPicks]||null;
  const yourRemaining=snakeYourPicks(order).filter(p=>p.overall>snakeDraftState.completedPicks);
  const nextYours=yourRemaining[0]||null;
  const picksAway=nextYours?Math.max(0,nextYours.overall-(current?.overall||total+1)):0;
  const rounds=snakeRoundCount(),teams=snakeTeamCount();
  document.getElementById("snakeCurrentPick").textContent=snakePickLabel(current);
  document.getElementById("snakeCurrentTeam").textContent=snakeTeamLabel(current);
  document.getElementById("snakeNextPick").textContent=snakePickLabel(nextYours);
  document.getElementById("snakeNextPickOverall").textContent=nextYours?`Overall ${nextYours.overall}`:"Draft complete";
  document.getElementById("snakePicksAway").textContent=nextYours?String(picksAway):"0";
  document.getElementById("snakeTurnStatus").textContent=!current?"DRAFT COMPLETE":current.slot===snakeDraftPosition()?"ON THE CLOCK":`${picksAway} selections away`;
  document.getElementById("snakeDraftSlot").textContent=`${snakeDraftPosition()} / ${teams}`;
  document.getElementById("snakeDirection").textContent=current?`Round ${current.round} • ${current.direction}`:"Draft complete";
  document.getElementById("snakeRounds").textContent=String(rounds);
  document.getElementById("snakeTotalPicks").textContent=`${total} total picks`;
  const near=order.slice(Math.max(0,snakeDraftState.completedPicks-2),Math.min(total,snakeDraftState.completedPicks+7));
  document.getElementById("snakeTurnStrip").innerHTML=near.map(p=>{const rec=snakeDraftState.picks.find(x=>x.overall===p.overall);return `<div class="snake-turn-chip ${p.overall===current?.overall?"current":""} ${p.slot===snakeDraftPosition()?"mine":""}"><strong>${snakePickLabel(p)}</strong><span>${rec?esc(rec.player.split(' ').pop()):p.slot===snakeDraftPosition()?"YOU":`T${p.slot}`}</span></div>`;}).join("")||'<div class="snake-empty">Draft complete.</div>';
  document.getElementById("snakeYourPicks").innerHTML=snakeYourPicks(order).map(p=>{const rec=snakeDraftState.picks.find(x=>x.overall===p.overall);return `<div class="snake-pick-map ${p.overall<=snakeDraftState.completedPicks?"complete":""} ${p.overall===nextYours?.overall?"next":""}"><strong>${snakePickLabel(p)}</strong><span>${rec?esc(rec.player):`Overall ${p.overall}`}</span></div>`;}).join("");
  const rows=[];
  for(let round=1;round<=rounds;round++){
    const picks=order.filter(p=>p.round===round);
    rows.push(`<div class="snake-order-round"><div class="snake-round-label">ROUND ${round}</div><div class="snake-round-picks">${picks.map(p=>{const rec=snakeDraftState.picks.find(x=>x.overall===p.overall);return `<div class="snake-order-pick ${p.slot===snakeDraftPosition()?"mine":""} ${p.overall<=snakeDraftState.completedPicks?"complete":""} ${p.overall===current?.overall?"current":""}" title="${rec?esc(rec.player):esc(snakeTeamLabel(p))}"><span>${snakePickLabel(p)}</span><small>${rec?esc(rec.player.split(' ').pop()):p.slot===snakeDraftPosition()?"YOU":`T${p.slot}`}</small></div>`;}).join("")}</div></div>`);
  }
  document.getElementById("snakeOrderBoard").innerHTML=rows.join("");
  const advance=document.getElementById("snakeAdvanceBtn");if(advance){advance.disabled=!current;advance.textContent=current?"AUTO-DRAFT TEST PICK":"DRAFT COMPLETE";}
  renderSnakeRecommendations(current,order);
  saveSnakeDraftState();
}
document.getElementById("snakeRecordPickBtn")?.addEventListener("click",()=>snakeRecordPick(document.getElementById("snakePlayerInput")?.value||""));
document.getElementById("snakePlayerInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();snakeRecordPick(e.currentTarget.value);}});
document.getElementById("snakeAdvanceBtn")?.addEventListener("click",()=>{const order=snakePickOrder(),current=order[snakeDraftState.completedPicks];if(!current)return;const rec=snakeRecommendations(current,order,1,current.slot)[0];if(rec)snakeRecordPick(rec.base.name,true);});
document.getElementById("snakeResetBtn")?.addEventListener("click",()=>{snakeDraftState={completedPicks:0,picks:[]};saveSnakeDraftState();renderSnakeDraftFoundation();});
updateDraftFormatUI();
renderSnakeDraftFoundation();
