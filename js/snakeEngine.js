// Sprint 35.1.1 — Snake Draft Market Integrity.
// AI selections are anchored to league-adjusted expected draft position, then
// modified only modestly by roster fit, team tendencies, and controlled variance.
// Snake state remains isolated from auction state while sharing league settings,
// player intelligence, and the user's Draft Prep board.
const SNAKE_STATE_KEY="warRoomSnakeDraftStateV3";
let snakeDraftState=(()=>{
  try{
    const v3=JSON.parse(localStorage.getItem(SNAKE_STATE_KEY)||"null");
    if(v3)return {...v3,picks:Array.isArray(v3.picks)?v3.picks:[]};
    const v2=JSON.parse(localStorage.getItem("warRoomSnakeDraftStateV2")||"null");
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
function snakeExpectedDraftPick(base,market,provider){
  const teams=snakeTeamCount(),rules=snakeRosterRules(),total=snakeRoundCount()*teams;
  const trusted=[];
  if(Number(market)>0)trusted.push({rank:Number(market),weight:.72});
  if(Number(provider)>0)trusted.push({rank:Number(provider),weight:.28});
  let expected=trusted.length?trusted.reduce((sum,x)=>sum+x.rank*x.weight,0)/trusted.reduce((sum,x)=>sum+x.weight,0):total*.72;
  const posRank=typeof positionRankFor==="function"?Number(positionRankFor(base)||0):0;
  if(base.pos==="QB"){
    if(rules.SUPERFLEX>0||rules.QB>=2){expected-=Math.max(10,34-Math.min(24,posRank*1.7));}
    else expected+=Math.max(0,Math.min(18,(posRank||18)-3)*.8);
  }
  if(base.pos==="TE"&&posRank>0&&posRank<=3)expected-=Math.max(2,8-posRank*2);
  if(base.pos==="WR"&&String(leagueConfig.scoring||"PPR").toUpperCase()==="PPR")expected-=2;
  if(base.pos==="RB"&&String(leagueConfig.scoring||"PPR").toUpperCase()==="STANDARD")expected-=2;
  if(base.pos==="K"||base.pos==="DEF")expected=Math.max(expected,total-Math.max(teams*3,30));
  return Math.max(1,Math.min(total,Math.round(expected)));
}
function snakeDraftWindow(expectedPick){
  const teams=snakeTeamCount();
  if(expectedPick<=teams)return {early:Math.max(1,expectedPick-4),late:expectedPick+5};
  if(expectedPick<=teams*3)return {early:Math.max(1,expectedPick-7),late:expectedPick+9};
  if(expectedPick<=teams*6)return {early:Math.max(1,expectedPick-12),late:expectedPick+15};
  return {early:Math.max(1,expectedPick-20),late:expectedPick+24};
}
function snakeLeagueRankRows(){
  const positions=snakeEligiblePositions();
  const rows=PLAYERS.filter(p=>positions.includes(p.pos)&&p.active!==false&&(p.pos==="DEF"||p.pos==="K"||CURRENT_NFL_TEAMS.has(String(p.team||"").toUpperCase())));
  const scoring=String(leagueConfig.scoring||"PPR").toUpperCase(),rules=snakeRosterRules(),teams=snakeTeamCount();
  const demandWeight={QB:rules.QB+rules.SUPERFLEX*.75,RB:rules.RB+rules.FLEX*.52,WR:rules.WR+rules.FLEX*.48,TE:rules.TE+rules.FLEX*.12,K:rules.K,DEF:rules.DEF};
  return rows.map(base=>{
    const market=marketRankFor(base)||providerRankFor(base)||9999;
    const provider=providerRankFor(base)||market;
    const personal=snakePersonalRank(base)||market;
    const expectedPick=snakeExpectedDraftPick(base,market,provider);
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
    return {base,rankScore,expectedPick,draftWindow:snakeDraftWindow(expectedPick),marketRank:market,providerRank:provider};
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
function snakeHash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;}
function snakeAiProfile(slot){
  const profiles=[
    {name:"Balanced",bias:{}},
    {name:"RB Heavy",bias:{RB:5,WR:-1}},
    {name:"WR Collector",bias:{WR:5,RB:-1}},
    {name:"Value Hunter",bias:{}},
    {name:"QB Patient",bias:{QB:-4,RB:1,WR:1}},
    {name:"Upside",bias:{RB:2,WR:2,TE:1}}
  ];
  return profiles[(Math.max(1,Number(slot))-1)%profiles.length];
}
function snakeRequiredOpenPositions(slot){
  const rules=snakeRosterRules(),counts=snakeRosterCounts(slot),open=[];
  for(const pos of ["QB","RB","WR","TE","K","DEF"]){for(let i=counts[pos]||0;i<(rules[pos]||0);i++)open.push(pos);}
  return open;
}
function snakeAiPositionAllowed(base,current,slot){
  const rules=snakeRosterRules(),counts=snakeRosterCounts(slot),round=current?.round||1,totalRounds=snakeRoundCount();
  const picksMade=snakePicksForSlot(slot).length,picksRemaining=Math.max(0,totalRounds-picksMade);
  const requiredOpen=snakeRequiredOpenPositions(slot);
  if(requiredOpen.length>=picksRemaining&&requiredOpen.length>0&&!requiredOpen.includes(base.pos))return false;
  if((base.pos==="K"||base.pos==="DEF")){
    if((rules[base.pos]||0)<=0||(counts[base.pos]||0)>=(rules[base.pos]||0))return false;
    if(round<Math.max(8,totalRounds-3)&&requiredOpen.length<picksRemaining)return false;
  }
  if(base.pos==="QB"&&rules.SUPERFLEX===0&&rules.QB<=1&&(counts.QB||0)>=1&&round<10)return false;
  if(base.pos==="TE"&&(counts.TE||0)>=Math.max(1,rules.TE||1)&&round<10)return false;
  return true;
}
function snakeAiRosterModifier(base,current,slot){
  const fit=snakeRosterFit(base,slot),round=current?.round||1;
  let mod=0;
  if(fit.pressure.direct>0)mod=round<=4?7:11;
  else if(fit.pressure.flex>0)mod=round<=5?3:7;
  else if(["RB","WR"].includes(base.pos))mod=round>=7?3:1;
  if(fit.label.startsWith("Wait on"))mod-=30;
  const counts=snakeRosterCounts(slot),rules=snakeRosterRules();
  if((counts[base.pos]||0)>=(rules[base.pos]||0)+3)mod-=8;
  return Math.max(-30,Math.min(12,mod));
}
function snakeAiCandidate(base,current,rankMap,available,slot){
  const row=rankMap.get(playerKey(base.name));if(!row||!snakeAiPositionAllowed(base,current,slot))return null;
  const overall=current?.overall||1,late=overall-row.expectedPick,window=row.draftWindow;
  let score=420-row.expectedPick*1.35;
  if(late>0)score+=Math.min(190,late*5.5+Math.max(0,overall-window.late)*8);
  else score-=Math.min(150,Math.abs(late)*2.8+Math.max(0,window.early-overall)*5);
  const rosterMod=snakeAiRosterModifier(base,current,slot);
  const profile=snakeAiProfile(slot),personality=Math.max(-5,Math.min(5,Number(profile.bias[base.pos]||0)));
  const tier=snakeTierInfo(base,rankMap,available);if(tier.cliff)score+=4;
  const varianceScale=row.expectedPick<=snakeTeamCount()?1.4:row.expectedPick<=snakeTeamCount()*4?3:6;
  const variance=(snakeHash(`${base.name}|${slot}|${overall}`)-.5)*varianceScale*2;
  score+=rosterMod+personality+variance;
  return {base,row,score,late,rosterMod,personality,profile,tier};
}
function snakeAiSelectPlayer(current,order){
  const available=snakeAvailablePlayers(),rankMap=snakeLeagueRankMap(),slot=current?.slot||1;
  const candidates=available.map(p=>snakeAiCandidate(p,current,rankMap,available,slot)).filter(Boolean).sort((a,b)=>b.score-a.score||a.row.expectedPick-b.row.expectedPick);
  return candidates[0]||null;
}
function snakeAuditData(){
  const rankMap=snakeLeagueRankMap(),picks=(snakeDraftState.picks||[]).filter(p=>p.player),rows=picks.map(p=>{const row=rankMap.get(playerKey(p.player));const expected=Number(p.expectedPick||row?.expectedPick||p.overall);return {...p,expected,deviation:Number(p.overall)-expected};});
  const abs=rows.map(r=>Math.abs(r.deviation)),avg=abs.length?abs.reduce((a,b)=>a+b,0)/abs.length:0;
  const largestFall=rows.slice().sort((a,b)=>b.deviation-a.deviation)[0]||null;
  const largestReach=rows.slice().sort((a,b)=>a.deviation-b.deviation)[0]||null;
  const warnings=[];
  rows.forEach(r=>{if(r.expected<=12&&r.overall>36)warnings.push(`${r.player} fell from ${r.expected} to ${r.overall}`);if(r.pos==="TE"&&r.expected<=36&&r.overall>72)warnings.push(`${r.player} fell beyond Round 6`);if((r.pos==="K"||r.pos==="DEF")&&r.round<8)warnings.push(`${r.player} was drafted too early`);});
  return {rows,avg,largestFall,largestReach,warnings,health:Math.max(0,Math.round(100-avg*2.2))};
}
function renderSnakeMarketAudit(){
  const el=document.getElementById("snakeMarketAudit");if(!el)return;
  const audit=snakeAuditData(),count=audit.rows.length;
  if(count<snakeTeamCount()){el.innerHTML='<div class="snake-empty">Market audit activates after the first round.</div>';return;}
  const fall=audit.largestFall,reach=audit.largestReach;
  el.innerHTML=`<div class="snake-audit-summary"><div><span>MARKET HEALTH</span><strong>${audit.health}/100</strong><small>${audit.avg.toFixed(1)} average pick deviation</small></div><div><span>LARGEST FALL</span><strong>${fall?esc(fall.player):'—'}</strong><small>${fall?`Expected ${fall.expected} • Pick ${fall.overall}`:'—'}</small></div><div><span>LARGEST REACH</span><strong>${reach?esc(reach.player):'—'}</strong><small>${reach?`Expected ${reach.expected} • Pick ${reach.overall}`:'—'}</small></div></div>${audit.warnings.length?`<div class="snake-audit-warnings"><strong>INTEGRITY FLAGS</strong>${audit.warnings.slice(0,5).map(w=>`<span>${esc(w)}</span>`).join('')}</div>`:'<div class="snake-audit-good">No major market-integrity violations detected.</div>'}`;
}

const SNAKE_SELECTOR_KEY="warRoomSnakeSelectorPositionV1";
function snakeSelectorCategories(){
  const rules=snakeRosterRules();
  const categories=[{value:"ALL",label:"All"},{value:"QB",label:"QB"},{value:"RB",label:"RB"},{value:"WR",label:"WR"},{value:"TE",label:"TE"},{value:"FLEX",label:"FLEX"}];
  if(rules.SUPERFLEX>0)categories.push({value:"SUPERFLEX",label:"SUPERFLEX"});
  if(rules.DEF>0)categories.push({value:"DEF",label:"DEF"});
  if(rules.K>0)categories.push({value:"K",label:"K"});
  return categories;
}
function snakePlayerMatchesCategory(player,category){
  if(category==="ALL")return true;
  if(category==="FLEX")return ["RB","WR","TE"].includes(player.pos);
  if(category==="SUPERFLEX")return ["QB","RB","WR","TE"].includes(player.pos);
  return player.pos===category;
}
function snakeSelectedCategory(){
  const allowed=snakeSelectorCategories().map(x=>x.value);
  const saved=localStorage.getItem(SNAKE_SELECTOR_KEY)||"ALL";
  return allowed.includes(saved)?saved:"ALL";
}
function populateSnakePlayerSelector(preferredPlayer=""){
  const posSelect=document.getElementById("snakePositionSelect"),playerSelect=document.getElementById("snakePlayerSelect");
  if(!posSelect||!playerSelect)return;
  const categories=snakeSelectorCategories(),current=categories.some(x=>x.value===posSelect.value)?posSelect.value:snakeSelectedCategory();
  posSelect.innerHTML=categories.map(x=>`<option value="${x.value}">${x.label}</option>`).join("");
  posSelect.value=current;
  const rankMap=snakeLeagueRankMap();
  const rows=snakeAvailablePlayers().filter(p=>snakePlayerMatchesCategory(p,current)).map(p=>({p,row:rankMap.get(playerKey(p.name))})).sort((a,b)=>Number(a.row?.expectedPick||9999)-Number(b.row?.expectedPick||9999)||a.p.name.localeCompare(b.p.name));
  playerSelect.innerHTML=`<option value="">Choose player…</option>`+rows.map(({p,row})=>`<option value="${esc(p.name)}">${esc(p.name)} — ${p.pos} • ADP ${Math.round(Number(row?.expectedPick||9999))}</option>`).join("");
  const exact=rows.find(x=>playerKey(x.p.name)===playerKey(preferredPlayer));
  playerSelect.value=exact?exact.p.name:"";
}
function selectSnakePlayer(playerName){
  const player=snakeAvailablePlayers().find(p=>playerKey(p.name)===playerKey(playerName));if(!player)return;
  const posSelect=document.getElementById("snakePositionSelect");
  if(posSelect){posSelect.value=player.pos;localStorage.setItem(SNAKE_SELECTOR_KEY,player.pos);}
  populateSnakePlayerSelector(player.name);
  document.getElementById("snakePlayerSelect")?.focus();
}

function renderSnakeRecommendations(current,order){
  const box=document.getElementById("snakeRecommendations"),demandBox=document.getElementById("snakeBetweenPickDemand"),playerSelect=document.getElementById("snakePlayerSelect"),positionSelect=document.getElementById("snakePositionSelect"),record=document.getElementById("snakeRecordPickBtn");if(!box)return;
  populateSnakePlayerSelector(playerSelect?.value||"");
  const recommendations=snakeRecommendations(current,order,6,current?.slot||snakeDraftPosition());
  const isYours=current?.slot===snakeDraftPosition();
  if(playerSelect)playerSelect.disabled=!current;
  if(positionSelect)positionSelect.disabled=!current;
  if(record)record.disabled=!current;
  if(!current){box.innerHTML='<div class="snake-empty">Draft complete.</div>';if(demandBox)demandBox.innerHTML="";return;}
  const lead=recommendations[0];
  box.innerHTML=recommendations.map((r,i)=>`<button type="button" class="snake-rec-row ${i===0?'lead':''}" data-snake-player="${esc(r.base.name)}"><span class="snake-rec-rank">${i+1}</span><span class="snake-rec-player"><strong>${esc(r.base.name)}</strong><small>${esc(r.base.pos)} • League Rank ${r.leagueRank} • ${r.bpa>=0?'+':''}${r.bpa} pick value</small><em>${esc(r.explanation)}</em></span><span class="snake-rec-fit">${esc(r.fit.label)}</span></button>`).join("");
  box.querySelectorAll("[data-snake-player]").forEach(btn=>btn.addEventListener("click",()=>selectSnakePlayer(btn.dataset.snakePlayer)));
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
  const marketRow=snakeLeagueRankMap().get(playerKey(base.name));
  snakeDraftState.picks.push({overall:current.overall,round:current.round,pickInRound:current.pickInRound,slot:current.slot,player:base.name,pos:base.pos,team:base.team||"",expectedPick:Number(marketRow?.expectedPick||current.overall),marketDeviation:current.overall-Number(marketRow?.expectedPick||current.overall),recordedAt:Date.now(),auto});
  snakeDraftState.completedPicks++;
  saveSnakeDraftState();
  const select=document.getElementById("snakePlayerSelect");if(select)select.value="";
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
  renderSnakeMarketAudit();
  saveSnakeDraftState();
}
document.getElementById("snakeRecordPickBtn")?.addEventListener("click",()=>snakeRecordPick(document.getElementById("snakePlayerSelect")?.value||""));
document.getElementById("snakePositionSelect")?.addEventListener("change",e=>{localStorage.setItem(SNAKE_SELECTOR_KEY,e.currentTarget.value);populateSnakePlayerSelector();});
document.getElementById("snakePlayerSelect")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();snakeRecordPick(e.currentTarget.value);}});
document.getElementById("snakeAdvanceBtn")?.addEventListener("click",()=>{const order=snakePickOrder(),current=order[snakeDraftState.completedPicks];if(!current)return;const pick=snakeAiSelectPlayer(current,order);if(pick)snakeRecordPick(pick.base.name,true);});
document.getElementById("snakeResetBtn")?.addEventListener("click",()=>{snakeDraftState={completedPicks:0,picks:[]};saveSnakeDraftState();renderSnakeDraftFoundation();});
updateDraftFormatUI();
renderSnakeDraftFoundation();
