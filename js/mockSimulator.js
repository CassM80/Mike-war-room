// Sprint 26.0 — isolated auction mock simulator. Never writes to the live draft state.
(() => {
  const KEY = "warRoomMockStateV2";
  const PERSONALITIES = [
    {name:"Stars & Scrubs",aggression:1.16,rb:1.00,wr:1.00,qb:1.02,value:0.92},
    {name:"Balanced",aggression:1.00,rb:1.00,wr:1.00,qb:1.00,value:1.00},
    {name:"RB Heavy",aggression:1.06,rb:1.18,wr:.93,qb:.94,value:.98},
    {name:"WR Collector",aggression:1.06,rb:.92,wr:1.17,qb:.95,value:.98},
    {name:"QB Homer",aggression:1.04,rb:.98,wr:.98,qb:1.42,value:.96},
    {name:"Value Hunter",aggression:.91,rb:1.00,wr:1.00,qb:.94,value:1.10},
    {name:"Chaos Agent",aggression:1.08,rb:1.00,wr:1.00,qb:1.00,value:.94,chaos:true}
  ];
  const q=id=>document.getElementById(id);
  let mock = loadMock();

  function loadMock(){ try{return JSON.parse(localStorage.getItem(KEY)||"null");}catch(e){return null;} }
  function saveMock(){ localStorage.setItem(KEY,JSON.stringify(mock)); }
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  function teamName(i){return mock?.teams?.[i]?.name||`Team ${i+1}`;}
  function myIndex(){return Number(mock?.myTeamIndex??leagueConfig.myTeamIndex??0);}
  function totalSpots(){return typeof rosterSize==="function"?rosterSize():17;}
  function playerMarket(p){return Math.max(1,Number(typeof consensusPriceFor==="function"?consensusPriceFor(p):0)||1);}
  function evaluation(p){return typeof getPersonalEvaluation==="function"?getPersonalEvaluation(p.name):null;}
  function personalRank(p){return Number(evaluation(p)?.rank||9999);}
  function conviction(p){return Number(evaluation(p)?.conviction||3);}
  function drafted(name){return !!mock?.sales?.some(s=>s.player===name);}
  function rosterCounts(team){const c={QB:0,RB:0,WR:0,TE:0,K:0,DEF:0};(team.roster||[]).forEach(x=>c[x.pos]=(c[x.pos]||0)+1);return c;}
  function minimumReserve(team){return Math.max(0,totalSpots()-(team.roster||[]).length-1);}
  function legalMax(team){return Math.max(0,Number(team.budget||0)-minimumReserve(team));}
  function positionNeed(team,pos){
    const c=rosterCounts(team),r=leagueConfig.roster||{};
    const base={QB:Number(r.qb||1),RB:Number(r.rb||2),WR:Number(r.wr||2),TE:Number(r.te||1),K:Number(r.k||1),DEF:Number(r.def||1)};
    if((c[pos]||0)<(base[pos]||0))return 1.16;
    if(["RB","WR","TE"].includes(pos) && (c.RB+c.WR+c.TE)<(base.RB+base.WR+base.TE+Number(r.flex||0)))return 1.06;
    return .90;
  }
  function roomInflation(){
    const sales=(mock?.sales||[]).filter(s=>Number(s.market)>0);
    if(sales.length<3)return 0;
    const ratio=sales.reduce((sum,s)=>sum+(Number(s.price)-Number(s.market))/Number(s.market),0)/sales.length;
    return Math.max(-.06,Math.min(.06,ratio));
  }
  function personalityAdjustment(pers,p){
    const market=playerMarket(p),pos=p.pos;
    let low=-.04,high=.06;
    if(pers.name==="Stars & Scrubs") [low,high]=market>=25?[.04,.14]:[-.10,.02];
    else if(pers.name==="RB Heavy") [low,high]=pos==="RB"?[.03,.13]:[-.07,.04];
    else if(pers.name==="WR Collector") [low,high]=pos==="WR"?[.03,.13]:[-.07,.04];
    else if(pers.name==="QB Homer") [low,high]=pos==="QB"?[.05,.18]:[-.06,.04];
    else if(pers.name==="Value Hunter") [low,high]=[-.13,-.03];
    else if(pers.chaos) [low,high]=[-.15,.22];
    return low+Math.random()*(high-low);
  }
  function needAdjustment(team,pos){
    const need=positionNeed(team,pos);
    if(need>=1.15)return .05;
    if(need>=1.05)return .025;
    return -.055;
  }
  function budgetAdjustment(team,p){
    const spotsLeft=Math.max(1,totalSpots()-(team.roster||[]).length);
    const spendable=Math.max(0,Number(team.budget||0)-spotsLeft);
    const market=playerMarket(p);
    if(spendable<market)return -.08;
    const avg=spendable/spotsLeft;
    if(market>avg*2.5)return -.025;
    return 0;
  }
  function teamLimit(team,p){
    const pers=team.personality||PERSONALITIES[1],market=playerMarket(p);
    // Sprint 26.1 rule: Consensus $ is always the price anchor. Rank never creates price.
    let pct=personalityAdjustment(pers,p)+needAdjustment(team,p.pos)+budgetAdjustment(team,p)+roomInflation();
    pct+=-.025+Math.random()*.05; // small player-specific opinion
    if(p.pos==="K"||p.pos==="DEF")pct=Math.min(pct,.05);
    const floor=pers.chaos?.78:.82,cap=pers.chaos?1.28:1.20;
    const multiplier=Math.max(floor,Math.min(cap,1+pct));
    return Math.max(1,Math.min(legalMax(team),Math.round(market*multiplier)));
  }
  function expectedSaleRange(p,limits){
    const market=playerMarket(p);
    const ai=Object.entries(limits||{}).filter(([i])=>Number(i)!==myIndex()).map(([,v])=>Number(v)||0).filter(Boolean).sort((a,b)=>b-a);
    if(!ai.length)return {low:Math.max(1,Math.round(market*.88)),high:Math.max(1,Math.round(market*1.08))};
    // Sale prices are normally set by the second-highest willing bidder, not the wildest ceiling.
    const likely=ai[1]||ai[0],competitive=ai[2]||likely;
    return {low:Math.max(1,Math.min(likely,competitive)),high:Math.max(1,Math.min(ai[0],likely+3))};
  }
  function userSafeMax(p){
    const team=mock.teams[myIndex()],ev=evaluation(p),market=playerMarket(p);
    let preferred=Number(ev?.hardStop||ev?.value||0);
    if(!preferred) preferred=Math.round(market*(conviction(p)>=4?1.06:conviction(p)<=2?.82:.98));
    return Math.max(0,Math.min(legalMax(team),preferred));
  }
  function candidatePool(){
    return PLAYERS.filter(p=>["QB","RB","WR","TE","K","DEF"].includes(p.pos)&&!drafted(p.name))
      .sort((a,b)=>personalRank(a)-personalRank(b)||playerMarket(b)-playerMarket(a)||(Number(a.provider_rank||a.search_rank||9999)-Number(b.provider_rank||b.search_rank||9999)));
  }
  function pickNominee(teamIndex){
    const team=mock.teams[teamIndex],pool=candidatePool().slice(0,180);
    if(!pool.length)return null;
    const scored=pool.map(p=>{
      const market=playerMarket(p),need=positionNeed(team,p.pos),pers=team.personality||PERSONALITIES[1];
      let score=market*need;
      if(pers.name==="Value Hunter")score=(120-market)*need;
      if(pers.name==="Stars & Scrubs")score=market>25?market*1.35:market*.6;
      if(pers.chaos)score*=.35+Math.random()*1.8;
      score*=.8+Math.random()*.4;
      return {p,score};
    }).sort((a,b)=>b.score-a.score);
    return scored[0].p;
  }
  function initTeams(){
    const count=Number(leagueConfig.teamCount||12),budget=Number(leagueConfig.budget||200);
    return Array.from({length:count},(_,i)=>{
      const src=leagueConfig.teams?.[i];
      return {name:src?.teamName||src?.ownerName||`Team ${i+1}`,budget,roster:[],personality:i===Number(leagueConfig.myTeamIndex||0)?{name:"YOU",aggression:1}:PERSONALITIES[Math.floor(Math.random()*PERSONALITIES.length)]};
    });
  }
  function startMock(){
    mock={active:true,complete:false,myTeamIndex:Number(leagueConfig.myTeamIndex||0),teams:initTeams(),sales:[],log:[],turn:Math.floor(Math.random()*Number(leagueConfig.teamCount||12)),nomination:null,passed:[],roomStyle:"REALISTIC"};
    saveMock(); nextNomination();
  }
  function nextEligibleTurn(){
    const n=mock.teams.length;
    for(let step=0;step<n;step++){
      mock.turn=(mock.turn+1)%n;
      if((mock.teams[mock.turn].roster||[]).length<totalSpots())return mock.turn;
    }
    return myIndex();
  }
  function nextNomination(){
    if(!mock?.active)return;
    if(candidatePool().length===0||mock.teams.every(t=>(t.roster||[]).length>=totalSpots())){completeMock();return;}
    const nominator=nextEligibleTurn(),p=pickNominee(nominator);
    if(!p){completeMock();return;}
    const opening=Math.max(1,Math.min(5,Math.round(playerMarket(p)*(.04+Math.random()*.06))));
    mock.nomination={player:p.name,nominator,currentBid:opening,highBidder:nominator,userPassed:false,limits:{}};
    mock.teams.forEach((t,i)=>mock.nomination.limits[i]=teamLimit(t,p));
    mock.nomination.expected=expectedSaleRange(p,mock.nomination.limits);
    primeAIBidding(); saveMock(); renderMock();
  }
  function primeAIBidding(){
    const n=mock.nomination,p=byName[n.player],user=myIndex();
    const bidders=mock.teams.map((t,i)=>({i,limit:Number(n.limits[i]||0)})).filter(x=>x.i!==user&&x.limit>=n.currentBid).sort((a,b)=>b.limit-a.limit);
    if(!bidders.length)return;
    const leader=bidders[0],market=playerMarket(p),pause=Math.min(leader.limit,Math.max(n.currentBid,Math.round(market*(.72+Math.random()*.12))));
    n.currentBid=Math.max(n.currentBid,pause);n.highBidder=leader.i;
  }
  function aiRespondToUser(){
    const n=mock.nomination,user=myIndex();
    const challengers=mock.teams.map((t,i)=>({i,limit:Number(n.limits[i]||0)})).filter(x=>x.i!==user&&x.limit>n.currentBid).sort((a,b)=>b.limit-a.limit);
    if(!challengers.length){awardSale(user,n.currentBid);return;}
    const c=challengers[0];
    n.currentBid=Math.min(c.limit,n.currentBid+Math.max(1,Math.min(4,Math.ceil((c.limit-n.currentBid)*.35))));
    n.highBidder=c.i;saveMock();renderMock();
  }
  function bid(amount){
    const n=mock?.nomination;if(!n||n.userPassed)return;
    const p=byName[n.player],team=mock.teams[myIndex()],max=userSafeMax(p),target=Math.max(n.currentBid+1,Math.round(amount));
    if(target>legalMax(team)){alert(`Your legal maximum bid is $${legalMax(team)}.`);return;}
    if(target>max&&!confirm(`This is $${target-max} above your Safe Max of $${max}. Bid anyway?`))return;
    n.currentBid=target;n.highBidder=myIndex();saveMock();renderMock();setTimeout(aiRespondToUser,260);
  }
  function pass(){
    const n=mock?.nomination;if(!n)return;n.userPassed=true;
    const contenders=mock.teams.map((t,i)=>({i,limit:Number(n.limits[i]||0)})).filter(x=>x.i!==myIndex()&&x.limit>=n.currentBid).sort((a,b)=>b.limit-a.limit);
    if(!contenders.length){awardSale(n.highBidder,n.currentBid);return;}
    const winner=contenders[0],second=contenders[1]?.limit||n.currentBid;
    awardSale(winner.i,Math.max(n.currentBid,Math.min(winner.limit,second+1)));
  }
  function awardSale(teamIndex,price){
    const n=mock.nomination,p=byName[n.player],team=mock.teams[teamIndex];
    price=Math.max(1,Math.min(Number(price),legalMax(team)));
    team.budget-=price;team.roster.push({name:p.name,pos:p.pos,price});
    const sale={player:p.name,pos:p.pos,teamIndex,team:team.name,price,market:playerMarket(p)};
    mock.sales.push(sale);mock.log.unshift(sale);mock.lastResult=sale;mock.nomination=null;saveMock();renderMock();
  }
  function completeMock(){mock.complete=true;mock.active=false;mock.nomination=null;saveMock();renderMock();}
  function resetMock(){if(!mock||confirm("Clear this mock draft? Your live War Room will not be affected.")){localStorage.removeItem(KEY);mock=null;renderMock();}}
  function gradeSummary(){
    const mine=mock?.sales?.filter(s=>s.teamIndex===myIndex())||[];
    const edge=mine.reduce((a,s)=>a+(s.market-s.price),0),myGuys=mine.filter(s=>conviction(byName[s.player])>=4).length;
    return `Mock complete • ${mine.length} players • ${edge>=0?"+":""}$${edge} vs market • ${myGuys} My Guys landed`;
  }
  function renderMock(){
    if(!q("mockDraftView"))return;
    const active=!!mock,me=active?mock.teams[myIndex()]:null;
    q("mockBudget").textContent=`$${me?.budget??leagueConfig.budget??200}`;
    q("mockSpots").textContent=active?`${Math.max(0,totalSpots()-(me.roster||[]).length)}`:`${totalSpots()}`;
    q("mockSalesCount").textContent=String(mock?.sales?.length||0);
    q("mockStartBtn").textContent=active&&!mock.complete?"RESTART MOCK":"START MOCK";
    q("mockEmpty").classList.toggle("hidden",active&&!!mock.nomination);
    q("mockLive").classList.toggle("hidden",!mock?.nomination);
    q("mockResult").classList.toggle("hidden",!mock?.lastResult&& !mock?.complete);
    q("mockNextBtn").classList.toggle("hidden",!mock?.lastResult||mock?.complete);
    if(mock?.complete){q("mockResult").innerHTML=`<strong>MOCK COMPLETE</strong><span>${esc(gradeSummary())}</span>`;q("mockEmpty").textContent="Mock complete. Review your roster and draft log, or start another room.";}
    else if(mock?.lastResult){const s=mock.lastResult;q("mockResult").innerHTML=`<strong>${esc(s.player)} SOLD</strong><span>${esc(s.team)} for $${s.price} • Market $${s.market}</span>`;}
    if(mock?.nomination){
      const n=mock.nomination,p=byName[n.player],safe=userSafeMax(p),market=playerMarket(p),youLead=n.highBidder===myIndex();
      q("mockNominator").textContent=`${teamName(n.nominator)} NOMINATES`;
      q("mockPlayer").textContent=p.name;q("mockPlayerMeta").textContent=`${p.pos} • ${p.team||"FA"} • ${conviction(p)}★ ${convictionLabel(conviction(p))}`;
      const expected=n.expected||expectedSaleRange(p,n.limits);
      q("mockCurrentBid").textContent=`$${n.currentBid}`;q("mockHighBidder").textContent=teamName(n.highBidder);q("mockMarket").textContent=`$${market}`;q("mockExpected").textContent=`$${expected.low}–$${expected.high}`;q("mockSafeMax").textContent=`$${safe}`;
      q("mockAdvice").textContent=n.userPassed?"You passed. Finishing the computer bidding…":youLead?"You have the high bid. The room is deciding whether to continue.":n.currentBid<safe?`Still inside your Safe Max. ${safe-n.currentBid} dollars of room remains.`:`At or above your Safe Max. Passing protects the rest of your roster.`;
      q("mockBidOneBtn").disabled=!!n.userPassed;q("mockBidMaxBtn").disabled=!!n.userPassed||safe<=n.currentBid;q("mockPassBtn").disabled=!!n.userPassed;
    }
    const roster=q("mockRoster");
    roster.innerHTML=me?.roster?.length?me.roster.map(x=>`<div><span>${esc(x.name)} <small>${x.pos}</small></span><strong>$${x.price}</strong></div>`).join(""):'<div class="mock-muted">Your roster is empty.</div>';
    const teams=q("mockTeams");
    teams.innerHTML=active?mock.teams.map((t,i)=>`<div class="mock-team ${i===myIndex()?"you":""}"><span>${esc(t.name)}<small>${esc(t.personality?.name||"")}</small></span><strong>$${t.budget}<small>${(t.roster||[]).length}/${totalSpots()}</small></strong></div>`).join(""):'<div class="mock-muted">The room appears when you start.</div>';
    const log=q("mockLog");log.innerHTML=mock?.log?.length?mock.log.map((s,i)=>`<div><b>${mock.sales.length-i}</b><span>${esc(s.player)}<small>${s.pos} • ${esc(s.team)}</small></span><strong>$${s.price}</strong></div>`).join(""):'<div class="mock-muted">No sales yet.</div>';
  }
  function init(){
    q("mockStartBtn")?.addEventListener("click",()=>{if(mock?.active&&!confirm("Restart this mock draft?"))return;startMock();});
    q("mockResetBtn")?.addEventListener("click",resetMock);
    q("mockBidOneBtn")?.addEventListener("click",()=>bid((mock?.nomination?.currentBid||0)+1));
    q("mockBidMaxBtn")?.addEventListener("click",()=>{const p=byName[mock.nomination.player];bid(userSafeMax(p));});
    q("mockPassBtn")?.addEventListener("click",pass);
    q("mockNextBtn")?.addEventListener("click",()=>{mock.lastResult=null;nextNomination();});
    renderMock();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
