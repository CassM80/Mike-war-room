// Sprint 35.0 — Snake Draft Foundation.
// Snake state is isolated from auction state and only reads shared league/player settings.
const SNAKE_STATE_KEY="warRoomSnakeDraftStateV1";
let snakeDraftState=(()=>{try{return JSON.parse(localStorage.getItem(SNAKE_STATE_KEY)||"null")||{completedPicks:0,picks:[]};}catch(e){return {completedPicks:0,picks:[]};}})();
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
  const el=document.getElementById("draftPositionInput"); if(!el)return;
  const teams=Math.max(2,Number(document.getElementById("teamCountInput")?.value||leagueConfig.teamCount||12));
  const selected=Math.min(teams,Math.max(1,Number(leagueConfig.draftPosition||1)));
  el.innerHTML=Array.from({length:teams},(_,i)=>`<option value="${i+1}">Pick ${i+1}</option>`).join("");
  el.value=String(selected); leagueConfig.draftPosition=selected;
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
  const myIdx=Number(leagueConfig.myTeamIndex||0), mySlot=snakeDraftPosition();
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
function renderSnakeDraftFoundation(){
  if(!document.getElementById("snakeOrderBoard"))return;
  const order=snakePickOrder(), total=order.length;
  document.documentElement.style.setProperty("--snake-teams",String(snakeTeamCount()));
  snakeDraftState.completedPicks=Math.min(Math.max(0,Number(snakeDraftState.completedPicks||0)),total);
  const current=order[snakeDraftState.completedPicks]||null;
  const yourRemaining=snakeYourPicks(order).filter(p=>p.overall>snakeDraftState.completedPicks);
  const nextYours=yourRemaining[0]||null;
  const picksAway=nextYours?Math.max(0,nextYours.overall-(current?.overall||total+1)):0;
  const rounds=snakeRoundCount(), teams=snakeTeamCount();
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
  const call=document.getElementById("snakeCall"),copy=document.getElementById("snakeCopy");
  if(!current){call.textContent="SNAKE DRAFT COMPLETE";copy.textContent=`All ${total} league-aware selections have been tracked independently from the auction room.`;}
  else if(current.slot===snakeDraftPosition()){call.textContent="YOU ARE ON THE CLOCK";copy.textContent=`Pick ${snakePickLabel(current)} is yours. The recommendation and availability engines arrive in Sprint 35.1.`;}
  else{call.textContent=`${snakeTeamLabel(current).toUpperCase()} IS ON THE CLOCK`;copy.textContent=`Your next selection is ${snakePickLabel(nextYours)}, ${picksAway} pick${picksAway===1?"":"s"} away.`;}
  const near=order.slice(Math.max(0,snakeDraftState.completedPicks-2),Math.min(total,snakeDraftState.completedPicks+7));
  document.getElementById("snakeTurnStrip").innerHTML=near.map(p=>`<div class="snake-turn-chip ${p.overall===current?.overall?"current":""} ${p.slot===snakeDraftPosition()?"mine":""}"><strong>${snakePickLabel(p)}</strong><span>${p.slot===snakeDraftPosition()?"YOU":`T${p.slot}`}</span></div>`).join("")||'<div class="snake-empty">Draft complete.</div>';
  document.getElementById("snakeYourPicks").innerHTML=snakeYourPicks(order).map(p=>`<div class="snake-pick-map ${p.overall<=snakeDraftState.completedPicks?"complete":""} ${p.overall===nextYours?.overall?"next":""}"><strong>${snakePickLabel(p)}</strong><span>Overall ${p.overall}</span></div>`).join("");
  const rows=[];
  for(let round=1;round<=rounds;round++){
    const picks=order.filter(p=>p.round===round);
    rows.push(`<div class="snake-order-round"><div class="snake-round-label">ROUND ${round}</div><div class="snake-round-picks">${picks.map(p=>`<div class="snake-order-pick ${p.slot===snakeDraftPosition()?"mine":""} ${p.overall<=snakeDraftState.completedPicks?"complete":""} ${p.overall===current?.overall?"current":""}"><span>${snakePickLabel(p)}</span><small>${p.slot===snakeDraftPosition()?"YOU":`T${p.slot}`}</small></div>`).join("")}</div></div>`);
  }
  document.getElementById("snakeOrderBoard").innerHTML=rows.join("");
  const advance=document.getElementById("snakeAdvanceBtn"); if(advance){advance.disabled=!current;advance.textContent=current?"ADVANCE TEST PICK":"DRAFT COMPLETE";}
  saveSnakeDraftState();
}
document.getElementById("snakeAdvanceBtn")?.addEventListener("click",()=>{const total=snakePickOrder().length;if(snakeDraftState.completedPicks<total){snakeDraftState.picks.push({overall:snakeDraftState.completedPicks+1,recordedAt:Date.now()});snakeDraftState.completedPicks++;saveSnakeDraftState();renderSnakeDraftFoundation();}});
document.getElementById("snakeResetBtn")?.addEventListener("click",()=>{snakeDraftState={completedPicks:0,picks:[]};saveSnakeDraftState();renderSnakeDraftFoundation();});
updateDraftFormatUI();
renderSnakeDraftFoundation();
