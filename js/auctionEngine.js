// Sprint 25.0 — Dynamic auction pricing and live safe-bid logic.

function auctionClamp(value,min,max){return Math.max(min,Math.min(max,value));}

function auctionObservedMarket(base){
  const raw=Math.max(1,Number(marketValueFor(base)||0));
  const ps=positionMarketStats(base?.pos);
  const room=marketStats();
  const positionInfl=auctionClamp(Number(ps?.infl||0),-.20,.25);
  const roomInfl=auctionClamp(Number(room?.infl||0),-.12,.15);
  // Position results carry more weight than the overall room once enough sales exist.
  const positionWeight=Number(ps?.count||0)>=2?.75:0;
  const blended=positionInfl*positionWeight+roomInfl*(1-positionWeight);
  return Math.max(1,Math.round(raw*(1+blended)));
}

function auctionPersonalPremium(base,ev){
  if(!ev)return 0;
  const conviction=normalizedConviction(ev.conviction);
  let premium={1:-10,2:-5,3:0,4:3,5:7}[conviction]||0;
  if(ev.favorite)premium+=2;
  if(ev.flagPlant)premium+=3;
  if(ev.sleeper)premium+=1;
  if(ev.avoid)premium-=12;
  const need=positionNeed(base.pos);
  if(need==='STARTER')premium+=2;
  else if(need==='FLEX')premium+=1;
  else if(need==='FULL')premium-=6;
  const scarce=tierRemaining(base.pos,['1A','1B','2']);
  if(scarce===1)premium+=3;
  else if(scarce===2)premium+=2;
  return premium;
}

function dynamicAuctionRecommendation(base,ev,options={}){
  const budget=Number(leagueConfig.budget||200);
  const remaining=Math.max(0,budget-spent());
  const openCount=Math.max(0,availableSlots().length);
  const legalMax=Math.max(0,remaining-Math.max(0,openCount-1));
  const market=auctionObservedMarket(base);
  const premium=auctionPersonalPremium(base,ev);
  let strategicMax=Math.max(1,market+premium);

  // A saved hard stop can lower the recommendation, but never inflate it.
  const personalCap=Number(ev?.hardStop||0);
  if(personalCap>0)strategicMax=Math.min(strategicMax,personalCap);

  const blueprintCap=Number(options.blueprintCap);
  const safeMax=Math.max(0,Math.min(strategicMax,legalMax,Number.isFinite(blueprintCap)?blueprintCap:Infinity));
  const gap=market-safeMax;
  const cushion=safeMax-market;
  const status=gap>0?'DISCOUNT NEEDED':cushion>=5?'STRONG BUY WINDOW':'MARKET READY';

  return {
    market,
    strategicMax,
    safeMax,
    legalMax,
    personalCap,
    gap:Math.max(0,gap),
    cushion:Math.max(0,cushion),
    status,
    room:marketStats(),
    position:positionMarketStats(base?.pos)
  };
}

function blueprintSafeCaps(targets,planPool){
  const expected=targets.map(t=>t?auctionObservedMarket(byName[t.name]):0);
  return targets.map((target,index)=>{
    if(!target)return 0;
    const otherExpected=expected.reduce((sum,value,i)=>sum+(i===index?0:value),0);
    const otherMinimum=Math.max(0,targets.filter((t,i)=>t&&i!==index).length);
    return Math.max(1,Math.floor(planPool-Math.max(otherExpected,otherMinimum)));
  });
}
