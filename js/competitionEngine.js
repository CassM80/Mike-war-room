// Sprint 33.1 — Competition Predictor
// Converts Demand Engine 2.0 into player-specific bidding forecasts.

function competitionClamp(value,min=0,max=99){return Math.max(min,Math.min(max,Number(value)||0));}
function competitionPlayerValue(player){
  if(!player)return 1;
  if(typeof marketValueFor==='function')return Math.max(1,Number(marketValueFor(player)||0));
  if(typeof consensusPriceFor==='function')return Math.max(1,Number(consensusPriceFor(player)||0));
  return Math.max(1,Math.round((Number(player.fairLow||0)+Number(player.fairHigh||0))/2)||Number(player.buyHigh||1));
}
function competitionLabel(count,strongCount){
  if(strongCount>=5||count>=8)return {label:'HEAVY',className:'heavy'};
  if(strongCount>=3||count>=6)return {label:'ACTIVE',className:'active'};
  if(strongCount>=1||count>=3)return {label:'MODERATE',className:'moderate'};
  return {label:'LIGHT',className:'light'};
}
function competitionForPlayer(player,options={}){
  if(!player||!['QB','RB','WR','TE'].includes(player.pos))return {label:'MINIMAL',className:'light',count:0,strongCount:0,teams:[],summary:'Limited competition expected.'};
  ensureTeams();
  const value=Math.max(1,Number(options.value||competitionPlayerValue(player)));
  const myIndex=Number(leagueConfig.myTeamIndex||0);
  const teams=(leagueConfig.teams||[]).map((team,index)=>{
    const demand=teamDemandFor(index,player.pos,{referencePrice:value});
    const affordability=demand.maxBid/value;
    let probability=demand.probability;
    if(affordability<.65)probability-=36;
    else if(affordability<.9)probability-=18;
    else if(affordability>=1.6)probability+=8;
    else if(affordability>=1.2)probability+=4;
    if(demand.need==='STARTER')probability+=7;
    else if(demand.need==='FLEX'||demand.need==='SUPERFLEX')probability+=3;
    if(index===myIndex&&!options.includeUser)probability=0;
    probability=Math.round(competitionClamp(probability,0,97));
    return {...demand,index,name:team.teamName||`Team ${index+1}`,probability,value,
      likely:probability>=38&&demand.maxBid>=Math.max(1,value*.72),
      strong:probability>=64&&demand.maxBid>=Math.max(1,value*.92)};
  }).filter(t=>t.probability>0).sort((a,b)=>b.probability-a.probability||b.maxBid-a.maxBid);
  const likely=teams.filter(t=>t.likely),strong=teams.filter(t=>t.strong),level=competitionLabel(likely.length,strong.length);
  const top=teams.slice(0,3);
  const summary=likely.length===0?'No clear rival bidder has emerged.':likely.length===1?`${top[0].name} is the primary threat.`:`${likely.length} teams are positioned to compete.`;
  return {player:player.name,pos:player.pos,value,label:level.label,className:level.className,count:likely.length,strongCount:strong.length,teams:top,allTeams:teams,summary};
}
