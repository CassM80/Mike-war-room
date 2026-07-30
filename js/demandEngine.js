// Sprint 33.0 — Demand Engine 2.0
// Estimates how likely each team is to compete for a position. Demand is not
// merely an empty starter count: FLEX, bench depth, budget, roster quality,
// draft phase, scarcity and tier cliffs all contribute.

const DEMAND_POSITIONS=['QB','RB','WR','TE'];

function demandClamp(value,min=0,max=100){return Math.max(min,Math.min(max,Number(value)||0));}
function demandRosterSettings(){return leagueConfig.roster||defaultLeagueConfig.roster||{};}
function demandDirectSlots(pos,r=demandRosterSettings()){
  return Number({QB:r.qb,RB:r.rb,WR:r.wr,TE:r.te}[pos]||0);
}
function demandFlexEligible(pos){return ['RB','WR','TE'].includes(pos);}
function demandSuperflexEligible(pos){return ['QB','RB','WR','TE'].includes(pos);}
function demandTeamBudget(teamIndex){return Math.max(0,Number(leagueConfig.budget||200)-teamSpent(teamIndex));}
function demandTeamSpotsLeft(teamIndex){return Math.max(0,rosterSize()-teamRosterCount(teamIndex));}
function demandTeamMaxBid(teamIndex){
  const budget=demandTeamBudget(teamIndex),spots=demandTeamSpotsLeft(teamIndex);
  return Math.max(0,budget-Math.max(0,spots-1));
}
function demandAvailableAtPosition(pos){
  return PLAYERS.filter(p=>p.pos===pos&&!sold(p.name)&&Number(p.fairLow||p.buyHigh||0)>0)
    .sort((a,b)=>{
      const av=typeof consensusPriceFor==='function'?Number(consensusPriceFor(a)||0):Number(a.buyHigh||a.fairHigh||0);
      const bv=typeof consensusPriceFor==='function'?Number(consensusPriceFor(b)||0):Number(b.buyHigh||b.fairHigh||0);
      return bv-av;
    });
}
function demandReferencePrice(pos){
  const rows=demandAvailableAtPosition(pos);
  if(!rows.length)return 1;
  const values=rows.slice(0,Math.min(6,rows.length)).map(p=>Math.max(1,typeof consensusPriceFor==='function'?Number(consensusPriceFor(p)||0):Math.round((Number(p.fairLow||0)+Number(p.fairHigh||0))/2)||Number(p.buyHigh||1)));
  return Math.max(1,Math.round(values.reduce((a,b)=>a+b,0)/values.length));
}
function demandTierCliff(pos){
  const rows=demandAvailableAtPosition(pos);
  if(rows.length<2)return {score:rows.length?20:0,remaining:rows.length,gap:0};
  const value=p=>Math.max(1,typeof consensusPriceFor==='function'?Number(consensusPriceFor(p)||0):Math.round((Number(p.fairLow||0)+Number(p.fairHigh||0))/2)||Number(p.buyHigh||1));
  const top=value(rows[0]);
  let next=top;
  for(let i=1;i<rows.length;i++){const v=value(rows[i]);if(v<top-.5){next=v;break;}}
  const gap=Math.max(0,top-next);
  const eliteRemaining=rows.filter(p=>['1A','1B','1','2'].includes(String(p.tier||p.provider_tier||'').toUpperCase().replace(/^TIER\s*/,''))).length;
  const scarcity=eliteRemaining<=2?18:eliteRemaining<=4?12:eliteRemaining<=7?7:2;
  return {score:demandClamp(scarcity+gap*1.8,0,24),remaining:eliteRemaining,gap};
}
function demandDraftPhaseFactor(){
  const total=Math.max(1,Number(leagueConfig.teamCount||12)*rosterSize());
  const share=(state.sales||[]).length/total;
  if(share<.10)return {name:'OPENING',bench:.20,starter:1.08};
  if(share<.55)return {name:'BUILD',bench:.55,starter:1.00};
  if(share<.82)return {name:'DEPTH',bench:.90,starter:.94};
  return {name:'END GAME',bench:1.00,starter:.86};
}
function demandRosterQuality(teamIndex,pos){
  const sales=teamSales(teamIndex).map(s=>({sale:s,player:byName[s.player]})).filter(x=>x.player?.pos===pos);
  if(!sales.length)return {score:0,average:0};
  const values=sales.map(x=>Math.max(1,typeof consensusPriceFor==='function'?Number(consensusPriceFor(x.player)||0):Number(x.sale.price||0)));
  const average=values.reduce((a,b)=>a+b,0)/values.length;
  const reference=demandReferencePrice(pos);
  // Weak existing rooms are more likely to seek an upgrade; strong rooms less so.
  return {score:demandClamp((reference-average)*.45,-8,8),average};
}
function teamDemandFor(teamIndex,pos,options={}){
  const r=demandRosterSettings(),c=teamPositionCounts(teamIndex),count=Number(c[pos]||0);
  const direct=demandDirectSlots(pos,r),directGap=Math.max(0,direct-count);
  const flexCapacity=Number(r.flex||0),sfCapacity=Number(r.superflex||0);
  const coreCount=Number(c.RB||0)+Number(c.WR||0)+Number(c.TE||0);
  const coreDirect=Number(r.rb||0)+Number(r.wr||0)+Number(r.te||0);
  const flexGap=demandFlexEligible(pos)?Math.max(0,coreDirect+flexCapacity-coreCount):0;
  const sfFilled=Math.max(0,Number(c.QB||0)-Number(r.qb||0))+Math.max(0,coreCount-coreDirect-flexCapacity);
  const sfGap=demandSuperflexEligible(pos)?Math.max(0,sfCapacity-sfFilled):0;
  const spotsLeft=demandTeamSpotsLeft(teamIndex),budget=demandTeamBudget(teamIndex),maxBid=demandTeamMaxBid(teamIndex);
  const reference=Math.max(1,Number(options.referencePrice||demandReferencePrice(pos)));
  const phaseInfo=options.phaseInfo||demandDraftPhaseFactor();
  const cliff=options.cliff||demandTierCliff(pos);
  const quality=demandRosterQuality(teamIndex,pos);
  const benchTarget=pos==='RB'||pos==='WR'?Math.max(1,Math.round(Number(r.bench||0)*.28)):Math.max(0,Math.round(Number(r.bench||0)*.08));
  const benchGap=Math.max(0,Math.min(benchTarget,rosterSize())-Math.max(0,count-direct));

  let score=0;
  score+=directGap*38*phaseInfo.starter;
  score+=Math.min(1,flexGap)*18;
  score+=Math.min(1,sfGap)*(pos==='QB'?25:12);
  score+=Math.min(2,benchGap)*7*phaseInfo.bench;
  score+=quality.score;
  score+=cliff.score*(directGap>0?1:flexGap>0?.72:.35);

  const affordability=maxBid/reference;
  if(maxBid<=0||spotsLeft<=0)score=0;
  else if(affordability<.55)score-=30;
  else if(affordability<.85)score-=16;
  else if(affordability<1.05)score-=5;
  else if(affordability>=1.75)score+=8;
  else if(affordability>=1.25)score+=4;

  const avgPerSpot=spotsLeft?budget/spotsLeft:0;
  if(avgPerSpot<2&&directGap===0)score-=12;
  if(teamRosterCount(teamIndex)>=rosterSize())score=0;
  score=demandClamp(score);

  let need='BENCH';
  if(directGap>0)need='STARTER';
  else if(flexGap>0)need='FLEX';
  else if(sfGap>0)need='SUPERFLEX';
  else if(spotsLeft<=0)need='FULL';

  const probability=Math.round(demandClamp(score+(score>=55?10:score>=35?4:-4),0,97));
  return {
    index:teamIndex,
    name:leagueConfig.teams?.[teamIndex]?.teamName||`Team ${teamIndex+1}`,
    pos,score:Math.round(score),probability,need,budget,maxBid,spotsLeft,
    directGap,flexGap,sfGap,benchGap,referencePrice:reference,
    likely:score>=36&&maxBid>=Math.max(1,reference*.72),
    strong:score>=58&&maxBid>=Math.max(1,reference*.90)
  };
}
function demandTierFromScore(score,likelyCount=0){
  if(likelyCount===0||score<12)return {label:'SATURATED',className:'saturated'};
  if(score>=68)return {label:'VERY HIGH',className:'very-high'};
  if(score>=50)return {label:'HIGH',className:'high'};
  if(score>=31)return {label:'MODERATE',className:'moderate'};
  return {label:'LOW',className:'low'};
}
function roomDemandFor(pos){
  ensureTeams();
  const referencePrice=demandReferencePrice(pos),phaseInfo=demandDraftPhaseFactor(),cliff=demandTierCliff(pos);
  const allTeams=(leagueConfig.teams||[]).map((_,i)=>teamDemandFor(i,pos,{referencePrice,phaseInfo,cliff}));
  const likelyTeams=allTeams.filter(t=>t.likely);
  const strongTeams=allTeams.filter(t=>t.strong);
  const average=allTeams.length?allTeams.reduce((sum,t)=>sum+t.score,0)/allTeams.length:0;
  const competitiveAverage=likelyTeams.length?likelyTeams.reduce((sum,t)=>sum+t.score,0)/likelyTeams.length:average;
  const roomScore=demandClamp(competitiveAverage*.72+(likelyTeams.length/Math.max(1,allTeams.length))*38+cliff.score*.35);
  const tier=demandTierFromScore(roomScore,likelyTeams.length);
  return {
    pos,score:Math.round(roomScore),label:tier.label,className:tier.className,
    count:likelyTeams.length,teams:likelyTeams,allTeams,strongTeams,strongCount:strongTeams.length,
    starterCount:allTeams.filter(t=>t.directGap>0&&t.likely).length,
    referencePrice,phase:phaseInfo.name,cliff,
    competition:likelyTeams.length>=7?'HEAVY':likelyTeams.length>=4?'ACTIVE':likelyTeams.length>=2?'LIGHT':'MINIMAL'
  };
}
function roomDemandSnapshot(){return Object.fromEntries(DEMAND_POSITIONS.map(pos=>[pos,roomDemandFor(pos)]));}
