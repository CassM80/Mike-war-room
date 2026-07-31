// Sprint 33.1.7 — Conversational Auction Coach reasoning.
// Preserves complete mock results plus league-aware K/DEF roster integrity.
(() => {
  const KEY = "warRoomMockStateV6";
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
  const AUCTION_CLOCK_MS = 3000;
  const AI_BID_DELAY_MIN = 650;
  const AI_BID_DELAY_MAX = 1250;
  let auctionClockTimer = null;
  let auctionBidTimer = null;
  let auctionDeadline = 0;
  let auctionRemaining = AUCTION_CLOCK_MS;
  let auctionPaused = false;
  let auctionToken = 0;

  function configuredRoster(){
    const source=leagueConfig?.roster||{};
    return {
      qb:Math.max(0,Number(source.qb??1)||0),
      rb:Math.max(0,Number(source.rb??2)||0),
      wr:Math.max(0,Number(source.wr??2)||0),
      te:Math.max(0,Number(source.te??1)||0),
      flex:Math.max(0,Number(source.flex??2)||0),
      superflex:Math.max(0,Number(source.superflex??0)||0),
      k:Math.max(0,Number(source.k??1)||0),
      def:Math.max(0,Number(source.def??1)||0),
      bench:Math.max(0,Number(source.bench??7)||0)
    };
  }
  function configuredRosterLimit(roster=configuredRoster()){
    return Object.values(roster).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);
  }
  function currentLeagueRules(){
    const roster=configuredRoster();
    return {
      teamCount:Math.max(2,Number(leagueConfig?.teamCount||12)),
      budget:Math.max(1,Number(leagueConfig?.budget||200)),
      roster,
      rosterLimit:configuredRosterLimit(roster)
    };
  }
  function mockRules(){return mock?.leagueRules||currentLeagueRules();}
  function loadMock(){
    try{
      const stored=JSON.parse(localStorage.getItem(KEY)||"null");
      if(!stored)return null;
      const fallback=currentLeagueRules();
      const limit=Math.max(1,Number(stored?.leagueRules?.rosterLimit)||fallback.rosterLimit);
      const corrupt=(stored.teams||[]).some(team=>(team.roster||[]).length>limit);
      if(corrupt){
        console.warn("Discarding an invalid mock draft that exceeded the configured roster limit.");
        localStorage.removeItem(KEY);
        return null;
      }
      if(!stored.leagueRules)stored.leagueRules=fallback;
      return stored;
    }catch(e){return null;}
  }
  function saveMock(){ localStorage.setItem(KEY,JSON.stringify(mock)); }
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  function teamName(i){return mock?.teams?.[i]?.name||`Team ${i+1}`;}
  function myIndex(){return Number(mock?.myTeamIndex??leagueConfig.myTeamIndex??0);}
  function totalSpots(){return Math.max(1,Number(mockRules().rosterLimit)||configuredRosterLimit());}
  function rosterFull(team){return !team||(team.roster||[]).length>=totalSpots();}
  function remainingRosterSpots(team){return Math.max(0,totalSpots()-(team?.roster||[]).length);}
  function playerMarket(p){return Math.max(1,Number(typeof consensusPriceFor==="function"?consensusPriceFor(p):0)||1);}
  function evaluation(p){return typeof getPersonalEvaluation==="function"?getPersonalEvaluation(p.name):null;}
  function personalRank(p){return Number(evaluation(p)?.rank||9999);}
  function conviction(p){return Number(evaluation(p)?.conviction||3);}
  function drafted(name){return !!mock?.sales?.some(s=>s.player===name);}
  function rosterCounts(team){const c={QB:0,RB:0,WR:0,TE:0,K:0,DEF:0};(team.roster||[]).forEach(x=>c[x.pos]=(c[x.pos]||0)+1);return c;}
  function minimumReserve(team){return Math.max(0,remainingRosterSpots(team)-1);}
  function legalMax(team){return rosterFull(team)?0:Math.max(0,Number(team?.budget||0)-minimumReserve(team));}
  function positionNeed(team,pos){
    const c=rosterCounts(team),r=mockRules().roster||{};
    const base={QB:Number(r.qb||1),RB:Number(r.rb||2),WR:Number(r.wr||2),TE:Number(r.te||1),K:Number(r.k||1),DEF:Number(r.def||1)};
    if((c[pos]||0)<(base[pos]||0))return 1.16;
    if(["RB","WR","TE"].includes(pos) && (c.RB+c.WR+c.TE)<(base.RB+base.WR+base.TE+Number(r.flex||0)))return 1.06;
    return .90;
  }
  function requiredBase(){
    const r=mockRules().roster||{};
    return {QB:Number(r.qb||0),RB:Number(r.rb||0),WR:Number(r.wr||0),TE:Number(r.te||0),K:Number(r.k||0),DEF:Number(r.def||0)};
  }
  function missingRequired(team,counts=rosterCounts(team)){
    const base=requiredBase();
    return Object.keys(base).reduce((sum,pos)=>sum+Math.max(0,base[pos]-(counts[pos]||0)),0);
  }
  function canRosterPlayer(team,p){
    if(!team||!p||rosterFull(team))return false;
    const counts=rosterCounts(team),base=requiredBase(),spots=remainingRosterSpots(team);
    if((p.pos==="K"||p.pos==="DEF") && (counts[p.pos]||0)>=(base[p.pos]||0))return false;
    const next={...counts,[p.pos]:(counts[p.pos]||0)+1};
    return missingRequired(team,next)<=spots-1;
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
    if(!canRosterPlayer(team,p))return 0;
    const pers=team.personality||PERSONALITIES[1],market=playerMarket(p);
    // Sprint 26.1 rule: League Value is always the price anchor. Rank never creates price.
    let pct=personalityAdjustment(pers,p)+needAdjustment(team,p.pos)+budgetAdjustment(team,p)+roomInflation();
    pct+=-.025+Math.random()*.05; // small player-specific opinion
    if(p.pos==="K"||p.pos==="DEF"){
      const required=(requiredBase()[p.pos]||0)>(rosterCounts(team)[p.pos]||0);
      pct=required&&remainingRosterSpots(team)<=missingRequired(team)+2?Math.max(pct,-.02):Math.min(pct,-.12);
    }
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
  function providerRank(p){ return providerRankFor(p)||9999; }
  function nominationRank(p){
    // Sprint 28.1: nomination prominence follows War Room auction-market rank.
    // Raw provider rank remains a secondary tiebreaker only.
    return marketRankFor(p)||9999;
  }
  function nominationTier(p){
    const raw=String(evaluation(p)?.tier||p.provider_tier||p.tier||"").toUpperCase().replace(/^TIER\s*/,"").trim();
    const weights={"1A":72,"1B":62,"1":58,"2":42,"3":25,"4":12,"5":4,"MARKET":38};
    return weights[raw]??0;
  }
  function nominationProminence(p){
    const rank=Math.max(1,nominationRank(p));
    // Rank and tier determine how visible a player is to nominators. League Value is deliberately absent.
    return (250/Math.sqrt(rank))+nominationTier(p);
  }
  function candidatePool(){
    return PLAYERS.filter(p=>["QB","RB","WR","TE","K","DEF"].includes(p.pos)&&!drafted(p.name))
      .sort((a,b)=>nominationRank(a)-nominationRank(b)||providerRank(a)-providerRank(b)||a.name.localeCompare(b.name));
  }
  function weightedChoice(items){
    const total=items.reduce((sum,x)=>sum+Math.max(.001,Number(x.score)||0),0);
    let roll=Math.random()*total;
    for(const item of items){roll-=Math.max(.001,Number(item.score)||0);if(roll<=0)return item.p;}
    return items[0]?.p||null;
  }
  function phaseCandidatePool(pool){
    const pickNo=(mock?.sales?.length||0)+1;
    const ranked=pool.filter(p=>nominationRank(p)<9999);
    if(!ranked.length)return pool.slice(0,80);

    // Hard realism guard: all public top-12 players must be nominated by pick 24.
    const elite=ranked.filter(p=>nominationRank(p)<=12);
    const slotsUntilDeadline=Math.max(1,25-pickNo);
    if(elite.length>=slotsUntilDeadline)return elite;

    // Early auctions overwhelmingly feature prominent players, with a little strategic variation.
    const roll=Math.random();
    let cutoff;
    if(pickNo<=12) cutoff=roll<.88?24:roll<.98?48:90;
    else if(pickNo<=30) cutoff=roll<.80?36:roll<.95?72:120;
    else if(pickNo<=60) cutoff=roll<.65?72:roll<.92?130:200;
    else cutoff=roll<.55?130:roll<.90?220:9999;
    const phase=ranked.filter(p=>nominationRank(p)<=cutoff);
    return phase.length?phase:ranked.slice(0,Math.min(40,ranked.length));
  }
  function pickNominee(teamIndex){
    const team=mock.teams[teamIndex],all=candidatePool().slice(0,240);
    if(!all.length)return null;
    let pool=phaseCandidatePool(all).filter(p=>canRosterPlayer(team,p));
    if(!pool.length)pool=all.filter(p=>canRosterPlayer(team,p));
    const scored=pool.map(p=>{
      const need=positionNeed(team,p.pos),pers=team.personality||PERSONALITIES[1],rank=nominationRank(p);
      let score=nominationProminence(p)*need;
      // Personalities shape choices only inside the rank-based phase pool. League Value is never consulted.
      if(pers.name==="Stars & Scrubs")score*=rank<=24?1.25:1.00;
      else if(pers.name==="RB Heavy")score*=p.pos==="RB"?1.18:.98;
      else if(pers.name==="WR Collector")score*=p.pos==="WR"?1.18:.98;
      else if(pers.name==="QB Homer")score*=p.pos==="QB"?1.30:.98;
      else if(pers.name==="Value Hunter")score*=rank>18&&rank<110?1.10:.98;
      if(pers.chaos)score*=.72+Math.random()*.70;
      score*=.92+Math.random()*.16;
      return {p,score};
    });
    return weightedChoice(scored);
  }
  function initTeams(){
    const rules=currentLeagueRules(),count=rules.teamCount,budget=rules.budget;
    return Array.from({length:count},(_,i)=>{
      const src=leagueConfig.teams?.[i];
      return {name:src?.teamName||src?.ownerName||`Team ${i+1}`,budget,roster:[],personality:i===Number(leagueConfig.myTeamIndex||0)?{name:"YOU",aggression:1}:PERSONALITIES[Math.floor(Math.random()*PERSONALITIES.length)]};
    });
  }
  function startMock(){
    clearAuctionRuntime();
    const leagueRules=currentLeagueRules();
    mock={active:true,complete:false,myTeamIndex:Number(leagueConfig.myTeamIndex||0),leagueRules,teams:initTeams(),sales:[],log:[],turn:Math.floor(Math.random()*leagueRules.teamCount),nomination:null,passed:[],roomStyle:"REALISTIC"};
    saveMock(); nextNomination();
  }
  function nextEligibleTurn(){
    const n=mock.teams.length;
    for(let step=0;step<n;step++){
      mock.turn=(mock.turn+1)%n;
      if(!rosterFull(mock.teams[mock.turn])&&legalMax(mock.teams[mock.turn])>=1)return mock.turn;
    }
    return myIndex();
  }
  function clearAuctionRuntime(){
    if(auctionClockTimer){clearInterval(auctionClockTimer);auctionClockTimer=null;}
    if(auctionBidTimer){clearTimeout(auctionBidTimer);auctionBidTimer=null;}
    auctionDeadline=0;
    auctionRemaining=AUCTION_CLOCK_MS;
    auctionPaused=false;
    auctionToken++;
    updateAuctionClockDisplay(AUCTION_CLOCK_MS);
  }
  function updateAuctionClockDisplay(ms=auctionRemaining){
    const el=q("mockClock"),card=q("mockClockCard"),bar=q("mockClockProgress");
    const safe=Math.max(0,Number(ms)||0),seconds=(safe/1000).toFixed(1);
    if(el)el.textContent=`${seconds}s`;
    if(card){
      card.classList.toggle("urgent",safe>0&&safe<=1000);
      card.classList.toggle("paused",auctionPaused);
    }
    if(bar)bar.style.width=`${Math.max(0,Math.min(100,(safe/AUCTION_CLOCK_MS)*100))}%`;
  }
  function eligibleAIChallengers(){
    const n=mock?.nomination;
    if(!n)return [];
    return mock.teams.map((t,i)=>({i,limit:Number(n.limits?.[i]||0)}))
      .filter(x=>x.i!==myIndex()&&x.i!==n.highBidder&&!rosterFull(mock.teams[x.i])&&x.limit>Number(n.currentBid||0)&&legalMax(mock.teams[x.i])>Number(n.currentBid||0))
      .sort((a,b)=>b.limit-a.limit);
  }
  function scheduleAIBid(token=auctionToken){
    if(auctionPaused||!mock?.nomination)return;
    if(auctionBidTimer){clearTimeout(auctionBidTimer);auctionBidTimer=null;}
    const challengers=eligibleAIChallengers();
    if(!challengers.length)return;
    const delay=Math.round(AI_BID_DELAY_MIN+Math.random()*(AI_BID_DELAY_MAX-AI_BID_DELAY_MIN));
    auctionBidTimer=setTimeout(()=>{
      auctionBidTimer=null;
      if(token!==auctionToken||auctionPaused||!mock?.nomination)return;
      const n=mock.nomination,available=eligibleAIChallengers();
      if(!available.length)return;
      const pool=available.slice(0,Math.min(3,available.length));
      const bidder=pool[Math.floor(Math.random()*pool.length)];
      const gap=Math.max(1,bidder.limit-Number(n.currentBid||0));
      const step=gap>=8&&Math.random()<.18?3:gap>=4&&Math.random()<.28?2:1;
      n.currentBid=Math.min(bidder.limit,Number(n.currentBid||0)+step);
      n.highBidder=bidder.i;
      saveMock();
      renderMock();
      startAuctionClock({fresh:true});
    },delay);
  }
  function finishAuctionClock(){
    const n=mock?.nomination;
    if(!n)return;
    const winner=Number(n.highBidder);
    const price=Number(n.currentBid||1);
    if(rosterFull(mock.teams[winner])||legalMax(mock.teams[winner])<price){
      console.error("Mock integrity prevented an ineligible auction winner.",{winner,price});
      mock.nomination=null;
      saveMock();renderMock();
      setTimeout(nextNomination,0);
      return;
    }
    awardSale(winner,price);
  }
  function tickAuctionClock(){
    if(auctionPaused||!mock?.nomination)return;
    auctionRemaining=Math.max(0,auctionDeadline-performance.now());
    updateAuctionClockDisplay(auctionRemaining);
    if(auctionRemaining<=0)finishAuctionClock();
  }
  function startAuctionClock({fresh=false}={}){
    if(!mock?.nomination)return;
    if(auctionClockTimer){clearInterval(auctionClockTimer);auctionClockTimer=null;}
    if(auctionBidTimer){clearTimeout(auctionBidTimer);auctionBidTimer=null;}
    auctionToken++;
    auctionPaused=false;
    auctionRemaining=fresh?AUCTION_CLOCK_MS:Math.max(250,auctionRemaining||AUCTION_CLOCK_MS);
    auctionDeadline=performance.now()+auctionRemaining;
    updateAuctionClockDisplay(auctionRemaining);
    const token=auctionToken;
    auctionClockTimer=setInterval(tickAuctionClock,80);
    scheduleAIBid(token);
  }
  function pauseAuctionClock(){
    if(!mock?.nomination||auctionPaused)return;
    auctionRemaining=Math.max(0,auctionDeadline-performance.now());
    auctionPaused=true;
    if(auctionClockTimer){clearInterval(auctionClockTimer);auctionClockTimer=null;}
    if(auctionBidTimer){clearTimeout(auctionBidTimer);auctionBidTimer=null;}
    updateAuctionClockDisplay(auctionRemaining);
  }
  function resumeAuctionClock(){
    if(!mock?.nomination||!auctionPaused)return;
    auctionPaused=false;
    startAuctionClock({fresh:false});
  }
  function beginNomination(nominator,p,{userChoice=false}={}){
    if(!p||rosterFull(mock?.teams?.[nominator])||legalMax(mock?.teams?.[nominator])<1)return;
    clearAuctionRuntime();
    // Every nomination is the nominating team's automatic $1 opening bid.
    const opening=1;
    mock.awaitingUserNomination=false;
    mock.lastResult=null;
    mock.nomination={player:p.name,nominator,currentBid:opening,highBidder:nominator,userPassed:false,limits:{}};
    mock.teams.forEach((t,i)=>mock.nomination.limits[i]=canRosterPlayer(t,p)?Math.max(i===nominator?1:0,teamLimit(t,p)):0);
    mock.nomination.expected=expectedSaleRange(p,mock.nomination.limits);
    saveMock();renderMock();
    setTimeout(()=>startAuctionClock({fresh:true}),0);
  }
  function nextNomination(){
    if(!mock?.active)return;
    if(candidatePool().length===0||mock.teams.every(rosterFull)){completeMock();return;}
    const nominator=nextEligibleTurn();
    if(nominator===myIndex()){
      mock.awaitingUserNomination=true;
      mock.nomination=null;
      saveMock();renderMock();
      setTimeout(()=>q("mockNomineeInput")?.focus(),0);
      return;
    }
    const p=pickNominee(nominator);
    if(!p){completeMock();return;}
    beginNomination(nominator,p);
  }
  function submitUserNomination(){
    if(!mock?.active||!mock.awaitingUserNomination)return;
    const input=q("mockNomineeInput"),error=q("mockNominationError");
    const requested=String(input?.value||"").trim().toLowerCase();
    const p=candidatePool().find(x=>x.name.toLowerCase()===requested);
    if(!p){
      if(error){error.textContent="Choose an available player from the list.";error.classList.remove("hidden");}
      input?.focus();return;
    }
    if(error)error.classList.add("hidden");
    if(input)input.value="";
    beginNomination(myIndex(),p,{userChoice:true});
  }
  function bid(amount){
    const n=mock?.nomination;if(!n||n.userPassed)return;
    const p=byName[n.player],team=mock.teams[myIndex()],max=userSafeMax(p),target=Math.max(n.currentBid+1,Math.round(amount));
    if(!canRosterPlayer(team,p)){alert(`You must preserve room for the required ${Object.entries(requiredBase()).filter(([pos,n])=>n>(rosterCounts(team)[pos]||0)).map(([pos])=>pos).join(" / ")} slot(s).`);return;}
    if(target>legalMax(team)){alert(`Your legal maximum bid is $${legalMax(team)}.`);return;}
    if(target>max&&!confirm(`This is $${target-max} above your Safe Max of $${max}. Bid anyway?`))return;
    n.currentBid=target;n.highBidder=myIndex();n.userPassed=false;saveMock();renderMock();startAuctionClock({fresh:true});
  }
  function pass(){
    const n=mock?.nomination;if(!n)return;
    n.userPassed=true;
    saveMock();renderMock();
    startAuctionClock({fresh:true});
  }
  function validateMockIntegrity(context="update"){
    const limit=totalSpots(),seen=new Set();
    for(const [index,team] of (mock?.teams||[]).entries()){
      if((team.roster||[]).length>limit)throw new Error(`${team.name||`Team ${index+1}`} exceeds league roster limit: ${(team.roster||[]).length}/${limit}`);
      const spots=remainingRosterSpots(team),reserve=Math.max(0,spots-1);
      if(Number(team.budget||0)<spots)throw new Error(`${team.name||`Team ${index+1}`} cannot reserve $1 for each remaining roster spot after ${context}.`);
      if(legalMax(team)!==(spots>0?Math.max(0,Number(team.budget||0)-reserve):0))throw new Error(`Invalid legal max for ${team.name||`Team ${index+1}`} after ${context}.`);
      for(const player of team.roster||[]){
        if(seen.has(player.name))throw new Error(`${player.name} is assigned to more than one mock roster.`);
        seen.add(player.name);
      }
    }
    return true;
  }
  function awardSale(teamIndex,price){
    const n=mock?.nomination;if(!n)return;
    clearAuctionRuntime();
    const p=byName[n.player],team=mock.teams[teamIndex];
    if(!p||!team||!canRosterPlayer(team,p)){
      console.error("Mock integrity blocked a sale to a full or invalid team.",{teamIndex,player:n.player});
      mock.nomination=null;saveMock();renderMock();setTimeout(nextNomination,0);return;
    }
    const max=legalMax(team);
    if(max<1){
      console.error("Mock integrity blocked a sale without a legal bid.",{teamIndex,player:n.player});
      mock.nomination=null;saveMock();renderMock();setTimeout(nextNomination,0);return;
    }
    price=Math.max(1,Math.min(Number(price),max));
    team.budget-=price;team.roster.push({name:p.name,pos:p.pos,price});
    const sale={player:p.name,pos:p.pos,teamIndex,team:team.name,price,market:playerMarket(p)};
    mock.sales.push(sale);mock.log.unshift(sale);mock.lastResult=sale;mock.nomination=null;
    try{validateMockIntegrity(`sale of ${p.name}`);}catch(error){console.error(error);alert(`Mock integrity error: ${error.message}`);completeMock();return;}
    saveMock();renderMock();
  }
  function completeMock(){
    clearAuctionRuntime();
    const incomplete=(mock?.teams||[]).find(team=>!rosterFull(team)||missingRequired(team)>0);
    if(incomplete&&candidatePool().some(p=>canRosterPlayer(incomplete,p))){mock.turn=Math.max(-1,(mock.teams||[]).indexOf(incomplete)-1);setTimeout(nextNomination,0);return;}
    mock.complete=true;mock.active=false;mock.awaitingUserNomination=false;mock.nomination=null;saveMock();renderMock();
  }
  function resetMock(){clearAuctionRuntime();if(!mock||confirm("Clear this mock draft? Your live War Room will not be affected.")){localStorage.removeItem(KEY);mock=null;renderMock();}}
  function gradeSummary(){
    const mine=mock?.sales?.filter(s=>s.teamIndex===myIndex())||[];
    const edge=mine.reduce((a,s)=>a+(s.market-s.price),0),myGuys=mine.filter(s=>conviction(byName[s.player])>=4).length;
    return `Mock complete • ${mine.length} players • ${edge>=0?"+":""}$${edge} vs market • ${myGuys} My Guys landed`;
  }

  function mockPositionStats(pos){
    const sales=(mock?.sales||[]).filter(s=>s.pos===pos&&Number(s.market)>0);
    if(!sales.length)return {count:0,infl:0,label:"EARLY"};
    const infl=sales.reduce((sum,s)=>sum+((Number(s.price)-Number(s.market))/Math.max(1,Number(s.market))),0)/sales.length;
    return {count:sales.length,infl,label:infl>.12?"HOT":infl<-.08?"COOL":"STABLE"};
  }
  function mockOverallStats(){
    const sales=(mock?.sales||[]).filter(s=>Number(s.market)>0);
    if(sales.length<3)return {infl:0,label:"EARLY",sub:"STABLE"};
    const infl=sales.reduce((sum,s)=>sum+((Number(s.price)-Number(s.market))/Math.max(1,Number(s.market))),0)/sales.length;
    return {infl,label:infl>.14?"HOT":infl<-.08?"COOL":"STEADY",sub:infl>.14?"HEATING":infl<-.08?"VALUE ROOM":"BALANCED"};
  }
  function mockDraftPhase(){
    const sales=mock?.sales?.length||0,total=Math.max(1,(mock?.teams?.length||Number(leagueConfig.teamCount||12))*totalSpots());
    const pct=sales/total;
    if(pct<.12)return "OPENING";
    if(pct<.30)return "BUILD";
    if(pct<.52)return "MIDGAME";
    if(pct<.76)return "VALUE";
    return "ENDGAME";
  }
  function mockStarterNeedLabel(team,p){
    const need=positionNeed(team,p.pos);
    if(need>=1.15)return `Open ${p.pos} starter`;
    if(need>=1.05)return `${p.pos} can fill FLEX`;
    return `${p.pos} depth / upside`;
  }
  function mockComparableCount(p){
    const market=playerMarket(p);
    return candidatePool().filter(x=>x.pos===p.pos&&x.name!==p.name&&Math.abs(playerMarket(x)-market)<=Math.max(2,market*.35)).length;
  }
  function mockBetterValueAlternatives(p,limit=2){
    if(!p)return [];
    const me=mock?.teams?.[myIndex()];
    if(!me)return [];
    const max=legalMax(me), currentMarket=playerMarket(p);
    return candidatePool()
      .filter(x=>x&&x.name!==p.name&&x.pos===p.pos)
      .map(x=>({
        p:x,
        market:playerMarket(x),
        safe:userSafeMax(x),
        score:mockRecommendationScore(x)
      }))
      .filter(x=>x.market<=max&&x.safe>=x.market&&x.market<=Math.max(currentMarket, max))
      .sort((a,b)=>(b.safe-b.market)-(a.safe-a.market)||b.score-a.score||a.market-b.market)
      .slice(0,limit)
      .map(x=>x.p.name);
  }
  function mockDemandSentence(p){
    const demand=mockDemandTier(p?.pos);
    if(!demand)return "";
    const likely=Number(demand.buyers||0),strong=Number(demand.strong||0);
    if(likely>=8)return `${likely} teams remain likely to bid on another ${p.pos}.`;
    if(likely>=4)return `${likely} teams still project as active ${p.pos} buyers.`;
    if(likely>0)return `Only ${likely} team${likely===1?"":"s"} still project${likely===1?"s":""} as likely ${p.pos} bidders.`;
    if(strong>0)return `${strong} strong ${p.pos} buyer${strong===1?" remains":"s remain"}.`;
    return `${p.pos} competition is nearly exhausted.`;
  }
  function mockCoachFor(p,n){
    if(!p||!n)return {call:"WAITING",tone:"",copy:"Start the next nomination to activate coaching.",reasons:[]};
    const me=mock.teams[myIndex()],safe=userSafeMax(p),market=playerMarket(p),bid=Number(n.currentBid||0),edge=safe-bid,posStats=mockPositionStats(p.pos),comps=mockComparableCount(p),youLead=n.highBidder===myIndex();
    const priceVsMarket=bid-market, alternatives=mockBetterValueAlternatives(p,2), demandLine=mockDemandSentence(p);
    let call,tone,copy;
    if(n.userPassed){
      call="GOOD DISCIPLINE";tone="pass";
      copy=`You passed on ${p.name} at $${bid}. Let the room finish the bidding.`;
    }
    else if(youLead){
      call="HOLD";tone="";
      copy=`You lead on ${p.name} at $${bid}. Let the auction clock run; your ceiling is $${safe}.`;
    }
    else if(bid>safe){
      call="PASS";tone="pass";
      const marketPhrase=priceVsMarket===0?"at League Value":priceVsMarket>0?`$${priceVsMarket} above League Value`:`$${Math.abs(priceVsMarket)} below League Value`;
      copy=`${p.name} is already ${marketPhrase}, and your ceiling is $${safe}.`;
    }
    else if(edge<=1){
      call="CAUTION";tone="caution";
      copy=`${p.name} is at $${bid}, leaving only $${Math.max(0,edge)} before your $${safe} ceiling.`;
    }
    else if(bid<=Math.max(1,market-2)){
      call="BID";tone="";
      copy=`${p.name} is $${market-bid} below League Value. One more bid is reasonable; stop at $${safe}.`;
    }
    else {
      call="BID";tone="";
      copy=`${p.name} remains inside your ceiling at $${bid}. You still have $${edge} of bidding room.`;
    }
    const reasons=[];
    if(demandLine)reasons.push(demandLine);
    if(alternatives.length){
      const names=alternatives.length===1?alternatives[0]:`${alternatives[0]} and ${alternatives[1]}`;
      reasons.push(`${names} project as better remaining values.`);
    }else{
      reasons.push(`${comps} comparable ${p.pos}${comps===1?" remains":"s remain"}.`);
    }
    if(posStats.count>=2){
      const pct=Math.round(posStats.infl*100);
      if(Math.abs(pct)<=2)reasons.push(`${p.pos}s are selling near League Value.`);
      else reasons.push(`${p.pos}s are selling ${Math.abs(pct)}% ${pct>0?"above":"below"} League Value.`);
    }else{
      reasons.push(`${mockStarterNeedLabel(me,p)}.`);
    }
    return {call,tone,copy,reasons:reasons.slice(0,3)};
  }
  function mockRecommendationScore(p){
    const me=mock.teams[myIndex()],market=playerMarket(p),safe=userSafeMax(p),need=positionNeed(me,p.pos),rank=Math.max(1,nominationRank(p)),ev=evaluation(p),spots=Math.max(1,totalSpots()-(me.roster||[]).length),budget=Number(me.budget||0),max=legalMax(me);
    if(max<1)return -9999;
    let score=120/Math.sqrt(rank)+market*.45;
    score+=(need-1)*85;
    score+=Math.max(-12,Math.min(18,(safe-market)*2.2));
    score+=(conviction(p)-3)*5;
    if(ev?.sleeper)score+=5;if(ev?.favorite||ev?.flag)score+=6;if(ev?.avoid)score-=80;
    if(market>max)score-=28+Math.min(30,(market-max)*2);
    if(market<=Math.max(5,budget/spots*1.25))score+=5;
    const ps=mockPositionStats(p.pos);if(ps.infl>.18)score-=5;if(ps.infl<-.05)score+=4;
    if(["RB","WR"].includes(p.pos)&&need<1.15)score+=3;
    if(["K","DEF"].includes(p.pos)&&spots>3)score-=35;
    return score;
  }
  function mockRecommendedPlayers(){
    if(!mock?.active&&!mock?.complete)return [];
    return candidatePool().slice(0,240).map(p=>({p,score:mockRecommendationScore(p)})).filter(x=>x.score>-100).sort((a,b)=>b.score-a.score||nominationRank(a.p)-nominationRank(b.p)).slice(0,5);
  }
  function mockTeamDemandScore(team,pos){
    const c=rosterCounts(team),r=mockRules().roster||{},marketRows=candidatePool().filter(p=>p.pos===pos).slice(0,6).map(playerMarket),market=Math.max(1,Math.round((marketRows.reduce((a,b)=>a+b,0)/Math.max(1,marketRows.length))||1));
    const direct=Number({QB:r.qb||1,RB:r.rb||2,WR:r.wr||2,TE:r.te||1}[pos]||0);
    const directGap=Math.max(0,direct-Number(c[pos]||0));
    const core=Number(c.RB||0)+Number(c.WR||0)+Number(c.TE||0),coreDirect=Number(r.rb||2)+Number(r.wr||2)+Number(r.te||1);
    const flexGap=["RB","WR","TE"].includes(pos)?Math.max(0,coreDirect+Number(r.flex||0)-core):0;
    const sfUsed=Math.max(0,Number(c.QB||0)-Number(r.qb||1))+Math.max(0,core-coreDirect-Number(r.flex||0));
    const sfGap=["QB","RB","WR","TE"].includes(pos)?Math.max(0,Number(r.superflex||0)-sfUsed):0;
    const spots=Math.max(0,totalSpots()-(team.roster||[]).length),max=legalMax(team),progress=(mock?.sales?.length||0)/Math.max(1,(mock?.teams?.length||12)*totalSpots());
    const benchWeight=progress<.1?.2:progress<.55?.55:progress<.82?.9:1;
    const benchTarget=pos==="RB"||pos==="WR"?Math.max(1,Math.round(Number(r.bench||7)*.28)):Math.max(0,Math.round(Number(r.bench||7)*.08));
    const benchGap=Math.max(0,benchTarget-Math.max(0,Number(c[pos]||0)-direct));
    let score=directGap*40+Math.min(1,flexGap)*18+Math.min(1,sfGap)*(pos==="QB"?25:12)+Math.min(2,benchGap)*7*benchWeight;
    const affordability=max/market;
    if(!spots||max<=0)score=0;else if(affordability<.55)score-=30;else if(affordability<.85)score-=16;else if(affordability>=1.75)score+=8;else if(affordability>=1.25)score+=4;
    return Math.max(0,Math.min(100,Math.round(score)));
  }
  function mockCompetitionFor(p){
    if(!mock||!p)return {label:"LIGHT",className:"light",count:0,strong:0,teams:[]};
    const market=playerMarket(p);
    const rows=mock.teams.map((team,index)=>{
      if(index===myIndex())return null;
      const demand=mockTeamDemandScore(team,p.pos),max=legalMax(team),pers=team.personality||{};
      const posBias=Number(pers[String(p.pos||"").toLowerCase()]||1);
      const affordability=max/Math.max(1,market);
      let probability=demand*.72+Math.max(0,Math.min(18,(affordability-1)*18))+(posBias-1)*55+(Number(pers.aggression||1)-1)*35;
      if(max<market*.65)probability-=34;else if(max<market*.9)probability-=16;
      if((team.roster||[]).length>=totalSpots())probability=0;
      probability=Math.max(0,Math.min(97,Math.round(probability)));
      return {index,name:team.name,probability,max,need:positionNeed(team,p.pos)>=1.15?"STARTER":positionNeed(team,p.pos)>=1.05?"FLEX":"DEPTH",personality:pers.name||"Balanced",likely:probability>=38,strong:probability>=64};
    }).filter(Boolean).sort((a,b)=>b.probability-a.probability||b.max-a.max);
    const likely=rows.filter(x=>x.likely),strong=rows.filter(x=>x.strong);
    const level=typeof competitionLabel==="function"?competitionLabel(likely.length,strong.length):{label:likely.length>=8?"HEAVY":likely.length>=5?"ACTIVE":likely.length>=3?"MODERATE":"LIGHT",className:likely.length>=8?"heavy":likely.length>=5?"active":likely.length>=3?"moderate":"light"};
    return {...level,count:likely.length,strong:strong.length,teams:rows.slice(0,3)};
  }
  function mockDemandTier(pos){
    const scores=(mock?.teams||[]).map((t,i)=>i===myIndex()?0:mockTeamDemandScore(t,pos));
    const likely=scores.filter(x=>x>=36),strong=scores.filter(x=>x>=58);
    const avg=likely.length?likely.reduce((a,b)=>a+b,0)/likely.length:0;
    const roomScore=Math.max(0,Math.min(100,avg*.72+(likely.length/Math.max(1,scores.length-1))*38));
    const base=typeof demandTierFromScore==="function"?demandTierFromScore(roomScore,likely.length):null;
    return {...(base||{label:"LOW",className:"low"}),score:Math.round(roomScore),buyers:likely.length,strong:strong.length};
  }
  function mockPricePresentation(stats){
    if(!stats.count)return {headline:"ESTABLISHING",detail:"No price trend yet",className:"neutral"};
    const pct=Math.round(stats.infl*100),amount=Math.abs(pct);
    if(amount<=2)return {headline:"NEAR VALUE",detail:"Market is balanced",className:"stable"};
    if(pct>0)return {headline:`+${amount}%`,detail:"Above League Value",className:stats.label==="HOT"?"hot":"stable"};
    return {headline:`-${amount}%`,detail:"Below League Value",className:stats.label==="COOL"?"cool":"stable"};
  }
  function mockRoomSignal(){
    if(!mock?.sales?.length)return "No sales yet. Establishing the room.";
    const stats=mockOverallStats(),positions=["QB","RB","WR","TE"].map(pos=>({pos,...mockPositionStats(pos)})).sort((a,b)=>b.infl-a.infl);
    const hot=positions[0],cool=positions[positions.length-1];
    if(stats.infl>.14)return `Room is ${Math.round(stats.infl*100)}% over League Value. Stay disciplined and attack isolated bargains.`;
    if(hot.count>=2&&hot.infl>.12)return `${hot.pos} is the hottest market at +${Math.round(hot.infl*100)}%. ${cool.pos} offers the better buying environment.`;
    if(stats.infl<-.08)return `Room is discounting players by ${Math.abs(Math.round(stats.infl*100))}%. Be willing to buy value early.`;
    return "Room is near League Value. Let roster fit and tier drops break ties.";
  }
  function mockReflection(s){
    if(!s)return {text:"",tone:""};
    const delta=Number(s.price)-Number(s.market),mine=s.teamIndex===myIndex();
    if(mine){
      if(delta<=-3)return {tone:"good",text:`Strong buy — you landed him $${Math.abs(delta)} below League Value.`};
      if(delta<=2)return {tone:"good",text:"Disciplined win — the price stayed within a fair range."};
      return {tone:"bad",text:`Aggressive win — you paid $${delta} above League Value. Protect the remaining budget.`};
    }
    if(delta>=8)return {tone:"good",text:`Good pass — the room paid $${delta} above League Value.`};
    if(delta<=-4)return {tone:"bad",text:`Missed value — he sold $${Math.abs(delta)} below League Value.`};
    return {tone:"",text:"Fair result — the sale landed close to League Value."};
  }
  function teamResult(team,index){
    const roster=team?.roster||[],spent=Number(mockRules().budget||200)-Number(team?.budget||0);
    const value=roster.reduce((sum,x)=>sum+playerMarket(byName[x.name]||x),0),net=value-spent;
    const order={QB:1,RB:2,WR:3,TE:4,K:5,DEF:6};
    const rows=roster.map(x=>{const market=playerMarket(byName[x.name]||x),edge=market-Number(x.price||0);return {...x,market,edge};}).sort((a,b)=>(order[a.pos]||99)-(order[b.pos]||99)||b.price-a.price);
    return {team,index,spent,value,net,rows,bargain:[...rows].sort((a,b)=>b.edge-a.edge)[0],overpay:[...rows].sort((a,b)=>a.edge-b.edge)[0]};
  }
  function renderLeagueResults(){
    const box=q("mockLeagueResults");if(!box)return;
    if(!mock?.complete){box.classList.add("hidden");box.innerHTML="";return;}
    const results=(mock.teams||[]).map(teamResult).sort((a,b)=>b.net-a.net);
    box.classList.remove("hidden");
    box.innerHTML=`<div class="mock-results-head"><div><h3>COMPLETE LEAGUE RESULTS</h3><p>Every roster, purchase price, and market edge from this mock.</p></div><span>${mock.sales.length} SALES</span></div><div class="mock-results-grid">${results.map((r,rank)=>`<article class="mock-result-team ${r.index===myIndex()?"you":""}"><header><div><b>#${rank+1} ${esc(r.team.name)}</b><small>${esc(r.team.personality?.name||"")}</small></div><strong class="${r.net>=0?"positive":"negative"}">${r.net>=0?"+":""}$${r.net}</strong></header><div class="mock-result-summary"><span>Spent <b>$${r.spent}</b></span><span>Value <b>$${r.value}</b></span><span>Left <b>$${r.team.budget}</b></span></div><div class="mock-result-roster">${r.rows.map(x=>`<div><button type="button" class="player-link" data-dossier-player="${esc(x.name)}"><b>${esc(x.name)}</b><small>${x.pos}</small></button><span>$${x.price}<small class="${x.edge>=0?"positive":"negative"}">${x.edge>=0?"+":""}$${x.edge}</small></span></div>`).join("")}</div><footer><span>Bargain: <b>${esc(r.bargain?.name||"—")}</b></span><span>Overpay: <b>${esc(r.overpay?.name||"—")}</b></span></footer></article>`).join("")}</div>`;
  }
  function renderMock(){
    if(!q("mockDraftView"))return;
    const active=!!mock,me=active?mock.teams[myIndex()]:null;
    const spotsLeft=active?Math.max(0,totalSpots()-(me.roster||[]).length):totalSpots();
    const budget=Number(me?.budget??leagueConfig.budget??200),overall=mockOverallStats();
    q("mockBudget").textContent=`$${budget}`;
    q("mockMaxBid").textContent=`$${active?legalMax(me):Math.max(0,budget-totalSpots()+1)}`;
    q("mockSpots").textContent=`${spotsLeft}`;
    q("mockAvg").textContent=`$${spotsLeft?(budget/spotsLeft).toFixed(2):"0.00"}`;
    q("mockTemp").textContent=overall.label;
    q("mockTempSub").textContent=overall.sub;
    q("mockPhase").textContent=mockDraftPhase();
    q("mockSalesCount").textContent=`${mock?.sales?.length||0} SALES`;
    q("mockStartBtn").textContent=active&&!mock.complete?"RESTART MOCK":"START MOCK";
    const awaitingNomination=!!mock?.awaitingUserNomination;
    q("mockEmpty").classList.toggle("hidden",(active&&!!mock.nomination)||awaitingNomination);
    q("mockUserNomination")?.classList.toggle("hidden",!awaitingNomination);
    q("mockLive").classList.toggle("hidden",!mock?.nomination);
    if(awaitingNomination){
      const options=q("mockNomineeOptions");
      if(options)options.innerHTML=candidatePool().map(p=>`<option value="${esc(p.name)}">${esc(p.pos)} • ${esc(p.team||"FA")} • League Value $${playerMarket(p)}</option>`).join("");
      q("mockNominationError")?.classList.add("hidden");
    }
    q("mockResult").classList.toggle("hidden",!mock?.lastResult&& !mock?.complete);
    if(!mock?.lastResult)q("mockResult").className=`mock-result ${mock?.complete?"":"hidden"}`;
    q("mockNextBtn").classList.toggle("hidden",!mock?.lastResult||mock?.complete);
    if(mock?.complete){q("mockResult").innerHTML=`<strong>MOCK COMPLETE</strong><span>${esc(gradeSummary())}</span>`;q("mockEmpty").textContent="Mock complete. Review your roster and draft log, or start another room.";}
    else if(mock?.lastResult){const s=mock.lastResult,reflection=mockReflection(s);q("mockResult").className=`mock-result ${reflection.tone||""}`;q("mockResult").innerHTML=`<strong>${esc(s.player)} SOLD</strong><span>${esc(s.team)} for $${s.price} • League Value $${s.market}<em class="mock-reflection">${esc(reflection.text)}</em></span>`;}
    if(mock?.nomination){
      const n=mock.nomination,p=byName[n.player],safe=userSafeMax(p),market=playerMarket(p),youLead=n.highBidder===myIndex();
      q("mockNominator").textContent=`${teamName(n.nominator)} NOMINATES`;
      q("mockPlayer").textContent=p.name;q("mockPlayerMeta").textContent=`${p.pos} • ${p.team||"FA"} • ${conviction(p)}★ ${convictionLabel(conviction(p))}`;
      const expected=n.expected||expectedSaleRange(p,n.limits);
      q("mockCurrentBid").textContent=`$${n.currentBid}`;q("mockHighBidder").textContent=teamName(n.highBidder);q("mockMarket").textContent=`$${market}`;q("mockExpected").textContent=`$${expected.low}–$${expected.high}`;q("mockSafeMax").textContent=`$${safe}`;
      updateAuctionClockDisplay(auctionRemaining);
      const coach=mockCoachFor(p,n);
      q("mockAdvice").textContent=coach.copy;
      q("mockCoachCall").textContent=coach.call;q("mockCoachCall").className=`mock-coach-call ${coach.tone||""}`;
      q("mockCoachCopy").textContent=coach.copy;
      q("mockCoachReasons").innerHTML=coach.reasons.map(x=>`<div>${esc(x)}</div>`).join("");
      const comp=mockCompetitionFor(p),compBox=q("mockCompetition");
      if(compBox)compBox.innerHTML=`<div class="mock-competition-head"><span>LIKELY BIDDERS</span><strong class="${comp.className}">${comp.label}</strong></div><div class="mock-competition-teams">${comp.teams.map((t,i)=>`<button type="button" class="team-scout-trigger" data-team-scout="mock" data-team-index="${t.index}" aria-label="Open scouting report for ${esc(t.name)}"><span><b>${i+1}</b>${esc(t.name)}<small>${esc(t.need)} • ${esc(t.personality)}</small></span><strong>${t.probability}%</strong></button>`).join("")||'<em>No clear rival bidder has emerged.</em>'}</div>`;
      q("mockBidOneBtn").disabled=!!n.userPassed||youLead;q("mockBidMaxBtn").disabled=!!n.userPassed||youLead||safe<=n.currentBid;q("mockPassBtn").disabled=!!n.userPassed||youLead;
    }else{
      updateAuctionClockDisplay(0);
      q("mockCoachCall").textContent=mock?.complete?"MOCK COMPLETE":"WAITING";q("mockCoachCall").className="mock-coach-call";
      q("mockCoachCopy").textContent=mock?.complete?"Review the room, roster, and draft log before your next run.":"Start or advance the mock to activate live coaching.";
      q("mockCoachReasons").innerHTML="";
      if(q("mockCompetition"))q("mockCompetition").innerHTML="";
    }
    const positionMarket=q("mockPositionMarket");
    if(positionMarket){
      const salesCount=mock?.sales?.length||0;
      positionMarket.innerHTML=["QB","RB","WR","TE"].map(pos=>{
        const demand=mockDemandTier(pos),price=mockPricePresentation(mockPositionStats(pos));
        const competition=salesCount<3
          ? `<em class="mock-demand-detail opening">Room still open</em>`
          : `<em class="mock-demand-detail"><b>${demand.buyers}</b> likely <span>•</span> <b>${demand.strong}</b> strong</em>`;
        return `<div class="mock-market-card">
          <span class="mock-market-pos">${pos}</span>
          <strong class="mock-demand ${demand.className}">${demand.label}</strong>
          ${competition}
          <span class="mock-price ${price.className}"><b>${price.headline}</b><em>${price.detail}</em></span>
        </div>`;
      }).join("");
    }
    q("mockRoomSignal").textContent=mockRoomSignal();
    const rec=q("mockRecommended"),recommended=mockRecommendedPlayers();
    rec.innerHTML=recommended.length?recommended.map((x,i)=>`<div class="mock-rec-row" data-player="${esc(x.p.name)}"><span class="mock-rec-rank">${i+1}</span><span class="mock-rec-name">${esc(x.p.name)}<small>${esc(mockStarterNeedLabel(me,x.p))}</small></span><span class="mock-rec-price">$${playerMarket(x.p)}</span></div>`).join(""):'<div class="mock-muted">Start the room to generate live recommendations.</div>';
    rec.querySelectorAll(".mock-rec-row").forEach(row=>row.addEventListener("click",()=>{const input=q("mockNomineeInput");if(input){input.value=row.dataset.player;} }));
    const roster=q("mockRoster");
    roster.innerHTML=me?.roster?.length?me.roster.map(x=>`<div><span>${esc(x.name)} <small>${x.pos}</small></span><strong>$${x.price}</strong></div>`).join(""):'<div class="mock-muted">Your roster is empty.</div>';
    const teams=q("mockTeams");
    teams.innerHTML=active?mock.teams.map((t,i)=>`<div class="mock-team ${i===myIndex()?"you":""}"><span>${esc(t.name)}<small>${esc(t.personality?.name||"")}</small></span><strong>$${t.budget}<small>${(t.roster||[]).length}/${totalSpots()}</small></strong></div>`).join(""):'<div class="mock-muted">The room appears when you start.</div>';
    const log=q("mockLog");log.innerHTML=mock?.log?.length?mock.log.map((s,i)=>`<div><b>${mock.sales.length-i}</b><button type="button" class="player-link mock-log-player" data-dossier-player="${esc(s.player)}"><span>${esc(s.player)}<small>${s.pos} • ${esc(s.team)}</small></span></button><strong>$${s.price}</strong></div>`).join(""):'<div class="mock-muted">No sales yet.</div>';
    renderLeagueResults();
  }
  function mockNeedLabel(team,pos){const score=mockTeamDemandScore(team,pos);return score>=70?'Very High':score>=52?'High':score>=34?'Moderate':score>=18?'Low':'Saturated';}
  window.openMockTeamScout=function(index){
    const team=mock?.teams?.[index];if(!team||typeof showTeamScout!=='function')return;
    const roster=(team.roster||[]).length?(team.roster||[]).map(x=>`<div class="team-scout-player"><span><b>${esc(x.name)}</b><small>${esc(x.pos)}</small></span><strong>$${Number(x.price||0)}</strong></div>`).join(''):'<div class="team-scout-empty">No players drafted yet.</div>';
    showTeamScout(`<div class="team-scout-kicker">MOCK ROOM SCOUTING</div><h2 id="teamScoutTitle">${esc(team.name)}</h2><div class="team-scout-owner">${esc(team.personality?.name||'Balanced')}</div><div class="team-scout-metrics"><div><span>BUDGET</span><strong>$${Number(team.budget||0)}</strong></div><div><span>MAX BID</span><strong>$${legalMax(team)}</strong></div><div><span>ROSTER</span><strong>${(team.roster||[]).length}/${totalSpots()}</strong></div></div><section><h3>ROSTER</h3><div class="team-scout-roster">${roster}</div></section><section><h3>POSITIONAL DEMAND</h3><div class="team-scout-needs">${['QB','RB','WR','TE'].map(pos=>`<div><span>${pos}</span><strong>${mockNeedLabel(team,pos)}</strong></div>`).join('')}</div></section><section><h3>DRAFT PERSONALITY</h3><div class="team-scout-personality">${esc(team.personality?.name||'Balanced')}</div></section>`);
  };

  function init(){
    q("mockStartBtn")?.addEventListener("click",()=>{if(mock?.active&&!confirm("Restart this mock draft?"))return;startMock();});
    q("mockResetBtn")?.addEventListener("click",resetMock);
    q("mockBidOneBtn")?.addEventListener("click",()=>bid((mock?.nomination?.currentBid||0)+1));
    q("mockBidMaxBtn")?.addEventListener("click",()=>{const p=byName[mock.nomination.player];bid(userSafeMax(p));});
    q("mockPassBtn")?.addEventListener("click",pass);
    q("mockNominateBtn")?.addEventListener("click",submitUserNomination);
    q("mockNomineeInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submitUserNomination();}});
    q("mockNextBtn")?.addEventListener("click",()=>{clearAuctionRuntime();mock.lastResult=null;nextNomination();});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)pauseAuctionClock();else resumeAuctionClock();});
    renderMock();
    if(mock?.nomination)setTimeout(()=>startAuctionClock({fresh:true}),0);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
