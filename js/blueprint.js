// Sprint 25.0 — Dynamic Blueprint powered by live auction recommendations.

function blueprintCandidates(pos){
  return Object.values(personalEvaluations)
    .filter(ev=>(byName[ev.name]||{}).pos===pos&&normalizedConviction(ev.conviction)>=4&&!saleForPlayer(ev.name))
    .sort((a,b)=>{
      const score=x=>normalizedConviction(x.conviction)*100+Number(!!x.flagPlant)*35+Number(!!x.favorite)*20+Number(!!x.sleeper)*8-(Number(x.rank)||9999)*.1;
      return score(b)-score(a)||(Number(a.rank)||9999)-(Number(b.rank)||9999);
    });
}

function blueprintSlotCounts(){const r=leagueConfig.roster||{};return {QB:Number(r.qb||1),RB:Number(r.rb||2)+Math.ceil(Number(r.flex||0)/2),WR:Number(r.wr||2)+Math.floor(Number(r.flex||0)/2),TE:Number(r.te||1)};}

function blueprintTargetForSlot(pool,used){
  const primary=pool.find(ev=>!used.has(ev.name))||null;
  if(primary)used.add(primary.name);
  return primary;
}

function blueprintPivots(primary,pool,safeMax,usedNames){
  if(!primary)return {competitive:null,budget:null};
  const base=byName[primary.name],market=auctionObservedMarket(base);
  const remaining=pool.filter(ev=>ev.name!==primary.name&&!usedNames.has(ev.name)&&!saleForPlayer(ev.name));
  const competitive=remaining.slice().sort((a,b)=>{
    const aBase=byName[a.name],bBase=byName[b.name];
    const convictionGapA=Math.abs(normalizedConviction(a.conviction)-normalizedConviction(primary.conviction));
    const convictionGapB=Math.abs(normalizedConviction(b.conviction)-normalizedConviction(primary.conviction));
    const marketGapA=Math.abs(auctionObservedMarket(aBase)-market);
    const marketGapB=Math.abs(auctionObservedMarket(bBase)-market);
    return convictionGapA-convictionGapB||marketGapA-marketGapB||(Number(a.rank)||9999)-(Number(b.rank)||9999);
  })[0]||null;
  const budget=remaining.filter(ev=>auctionObservedMarket(byName[ev.name])<market).sort((a,b)=>{
    const aPrice=auctionObservedMarket(byName[a.name]),bPrice=auctionObservedMarket(byName[b.name]);
    const aFits=aPrice<=safeMax?0:1,bFits=bPrice<=safeMax?0:1;
    return aFits-bFits||Math.abs(aPrice-safeMax)-Math.abs(bPrice-safeMax)||normalizedConviction(b.conviction)-normalizedConviction(a.conviction)||(Number(a.rank)||9999)-(Number(b.rank)||9999);
  })[0]||null;
  return {competitive,budget};
}

function renderBlueprint(){
  const box=$("blueprintGallery");if(!box)return;
  const slots=blueprintSlotCounts(),positions=['QB','RB','WR','TE'];
  if(!Object.values(personalEvaluations).some(ev=>normalizedConviction(ev.conviction)>=4)){box.innerHTML='<div class="blueprint-empty">Add 4–5★ players in My Guys to generate your Blueprint.</div>';return;}

  const auctionBudget=Number(leagueConfig.budget||200),spentNow=spent(),remaining=Math.max(0,auctionBudget-spentNow);
  const mySales=(state.sales||[]).filter(s=>s.winner==='me');
  const ownedByPos={QB:[],RB:[],WR:[],TE:[]};
  mySales.forEach(s=>{const pos=byName[s.player]?.pos;if(ownedByPos[pos]&&ownedByPos[pos].length<slots[pos])ownedByPos[pos].push(s);});
  const blueprintTotal=positions.reduce((n,pos)=>n+slots[pos],0);
  const ownedBlueprint=positions.reduce((n,pos)=>n+ownedByPos[pos].length,0);
  const openBlueprint=Math.max(0,blueprintTotal-ownedBlueprint);
  const openRoster=Math.max(0,rosterSize()-mySales.length);
  const reserveSlots=Math.max(0,openRoster-openBlueprint);
  const reserve=Math.min(remaining,reserveSlots);
  const planPool=Math.max(0,remaining-reserve);

  const slotDefs=[];
  positions.forEach(pos=>{for(let i=0;i<slots[pos];i++)slotDefs.push({key:`${pos}${i+1}`,pos,index:i});});
  const used=new Set(mySales.map(s=>s.player));
  const selected=[];
  slotDefs.forEach(slot=>{
    const owned=ownedByPos[slot.pos][slot.index];
    if(owned){selected.push({slot,owned,ev:getPersonalEvaluation(owned.player)});return;}
    const ev=blueprintTargetForSlot(blueprintCandidates(slot.pos),used);
    selected.push({slot,owned:null,ev});
  });

  const openTargets=selected.filter(x=>!x.owned&&x.ev).map(x=>x.ev);
  const safeCaps=blueprintSafeCaps(openTargets,planPool);
  const capByName=new Map(openTargets.map((ev,i)=>[ev.name,safeCaps[i]]));
  const expectedOpen=openTargets.reduce((sum,ev)=>sum+auctionObservedMarket(byName[ev.name]),0);
  const projectedTotal=spentNow+reserve+expectedOpen;
  const overBudget=Math.max(0,projectedTotal-auctionBudget);
  const health=Math.max(0,Math.min(100,Math.round(100-(overBudget/Math.max(1,auctionBudget))*100)));
  const rendered={QB:[],RB:[],WR:[],TE:[]};
  const selectedNames=new Set(openTargets.map(ev=>ev.name));

  selected.forEach(item=>{
    const {slot,owned,ev}=item;
    if(owned){
      rendered[slot.pos].push(`<div class="blueprint-slot yours" data-blueprint-name="${esc(owned.player)}"><div class="slot-label"><span>${slot.key}</span><span>LOCKED</span></div><strong>${esc(owned.player)}</strong><div class="auction-price-grid"><span><small>PAID</small>${money(owned.price)}</span><span><small>STATUS</small>ROSTERED</span></div></div>`);return;
    }
    if(!ev){rendered[slot.pos].push(`<div class="blueprint-slot"><div class="slot-label"><span>${slot.key}</span><span>OPEN</span></div><strong>Target not set</strong><small>Add another 4–5★ ${slot.pos}</small></div>`);return;}
    const base=byName[ev.name],cap=capByName.get(ev.name)||1,rec=dynamicAuctionRecommendation(base,ev,{blueprintCap:cap});
    const pivots=blueprintPivots(ev,blueprintCandidates(slot.pos),rec.safeMax,selectedNames);
    const competitive=pivots.competitive?`${esc(pivots.competitive.name)} (${money(auctionObservedMarket(byName[pivots.competitive.name]))})`:'None identified';
    const budgetPivot=pivots.budget?`${esc(pivots.budget.name)} (${money(auctionObservedMarket(byName[pivots.budget.name]))})`:'No budget pivot identified';
    const warning=rec.gap>0;
    const statusText=warning?`NEED ${money(rec.gap)} DISCOUNT`:rec.cushion?`${money(rec.cushion)} CUSHION`:'MARKET READY';
    rendered[slot.pos].push(`<div class="blueprint-slot ${warning?'budget-warning':'market-ready'}" data-blueprint-name="${esc(ev.name)}"><div class="slot-label"><span>${slot.key}</span><span>${rec.status}</span></div><strong>${esc(ev.name)}</strong><div class="auction-price-grid"><span><small>LIVE MARKET</small>${money(rec.market)}</span><span><small>SAFE MAX NOW</small>${money(rec.safeMax)}</span></div><div class="auction-budget-status ${warning?'warning':'ready'}">${statusText}</div><div class="blueprint-pivots"><span><b>Competitive:</b> ${competitive}</span><span><b>Budget:</b> ${budgetPivot}</span></div></div>`);
  });

  const columns=positions.map(pos=>`<section class="blueprint-position"><h3>${pos} BLUEPRINT</h3>${rendered[pos].join('')}</section>`).join('');
  const planMessage=overBudget?`Current targets project ${money(overBudget)} over budget. Safe Max Now shows exactly where discounts or pivots are required.`:`Current targets fit the live budget with ${money(auctionBudget-projectedTotal)} projected room.`;
  box.innerHTML=`<div class="blueprint-head"><div><strong>YOUR DYNAMIC AUCTION BLUEPRINT</strong><div class="blueprint-subhead">${planMessage}</div></div><div class="blueprint-health"><strong>${health}%</strong><br>PLAN HEALTH</div></div><div class="blueprint-budget-strip"><div><strong>${money(spentNow)}</strong><span>LOCKED</span></div><div><strong>${money(expectedOpen)}</strong><span>LIVE CORE MARKET</span></div><div><strong>${money(reserve)}</strong><span>OTHER SPOTS RESERVE</span></div><div><strong>${money(projectedTotal)}</strong><span>PROJECTED / ${money(auctionBudget)}</span></div></div><div class="blueprint-grid">${columns}</div>`;
}

function savePositionDNA(){localStorage.setItem('warRoomPositionDNA2',JSON.stringify(positionDNA));}

function positionPool(pos){
  const limits={QB:80,RB:220,WR:280,TE:160};
  return PLAYERS.filter(p=>p.pos===pos&&p.active===true&&CURRENT_NFL_TEAMS.has(String(p.team||"").toUpperCase())&&(marketSeedValue(p)>0||adpFor(p)>0)&&(adpFor(p)<=limits[pos]||marketSeedValue(p)>0)).sort((a,b)=>marketSeedValue(b)-marketSeedValue(a)||(adpFor(a)||9999)-(adpFor(b)||9999)||a.name.localeCompare(b.name));
}

function dnaModule(pos){return positionDNA[pos]||(positionDNA[pos]={complete:false,philosophy:{},gut:{},prices:{},pairs:{},profile:null});}

function dnaQuestionsFor(pos){
 const pool=positionPool(pos); const top=pool.slice(0,8); const mid=pool.slice(8,18); const deep=pool.slice(18,32);
 const gut=[...top.slice(0,5),...mid.slice(0,3),...deep.slice(0,2)].filter(Boolean);
 const price=[top[0],top[2],mid[1],mid[5],deep[2]].filter(Boolean);
 const candidates=[...top.slice(0,6),...mid.slice(0,6)].filter(Boolean); const pairs=[];
 for(let i=0;i+1<candidates.length&&pairs.length<5;i+=2)pairs.push([candidates[i],candidates[i+1]]);
 return{gut,price,pairs};
}

function dnaPhilosophyQuestions(pos){
 const common=[
  {key:'investment',label:`How much draft capital do you want to invest at ${pos}?`,opts:[['LOW','Wait / bargain hunt'],['MEDIUM','Stay flexible'],['HIGH','Pay for an edge']]},
  {key:'risk',label:'What profile do you prefer?',opts:[['FLOOR','Reliable floor'],['BALANCED','Balanced'],['UPSIDE','Ceiling / breakout']]},
  {key:'depth',label:`How many ${pos}s do you normally want?`,opts:[['LEAN','Minimum needed'],['NORMAL','Normal depth'],['HEAVY','Extra depth']]},
  {key:'discipline',label:'How should War Room treat your hard stop?',opts:[['STRICT','Strict'],['CONTROLLED','Controlled'],['AGGRESSIVE','My Guys premium']]}
 ];
 if(pos==='QB')common.push({key:'style',label:'Preferred QB profile',opts:[['RUSH','Rushing upside'],['ANY','Best value'],['POCKET','Pocket passer']]});
 if(pos==='RB')common.push({key:'style',label:'Preferred RB profile',opts:[['WORKHORSE','Workhorse volume'],['ANY','Best value'],['RECEIVING','Receiving upside']]});
 if(pos==='WR')common.push({key:'style',label:'Preferred WR profile',opts:[['VOLUME','Target volume'],['ANY','Best value'],['SPIKE','Big-play ceiling']]});
 if(pos==='TE')common.push({key:'style',label:'Preferred TE approach',opts:[['ELITE','Elite edge'],['ANY','Best value'],['PUNT','Wait / punt']]});
 return common;
}

function leagueDNAFingerprint(){const r=leagueConfig.roster||defaultLeagueConfig.roster;return [leagueConfig.teamCount,leagueConfig.budget,leagueConfig.scoring,r.qb,r.rb,r.wr,r.te,r.flex,r.bench].join('|');}

function leagueDNAContext(){
 const r=leagueConfig.roster||defaultLeagueConfig.roster,teams=Number(leagueConfig.teamCount||12),budget=Number(leagueConfig.budget||200),flex=Number(r.flex||0);
 const demands={QB:Number(r.qb||1),RB:Number(r.rb||2)+flex*.45,WR:Number(r.wr||2)+flex*.45,TE:Number(r.te||1)+flex*.10};
 const baseline={QB:1,RB:2.9,WR:2.9,TE:1.2};
 const intensity={}; DNA_POSITIONS.forEach(pos=>intensity[pos]=Math.max(.55,Math.min(2.3,(demands[pos]/baseline[pos])*Math.pow(teams/12,.22))));
 const totalCore=Object.values(demands).reduce((a,b)=>a+b,0)||1;
 return {teams,budget,scoring:leagueConfig.scoring||'PPR',roster:r,rosterSize:rosterSize(),demands,intensity,totalCore,fingerprint:leagueDNAFingerprint(),twoQB:Number(r.qb||1)>=2};
}

function dnaInvestmentFactor(profile){return profile.investment==='HIGH'?1.14:profile.investment==='LOW'?.86:1;}

function suggestedPositionBudgets(){
 const ctx=leagueDNAContext(),profiles={}; DNA_POSITIONS.forEach(pos=>profiles[pos]=computePositionProfile(pos));
 const weights={};
 DNA_POSITIONS.forEach(pos=>{let w=ctx.demands[pos]*ctx.intensity[pos]*dnaInvestmentFactor(profiles[pos]);if(pos==='QB'&&!ctx.twoQB)w*=.48;if(pos==='QB'&&ctx.twoQB)w*=1.28;if(pos==='TE')w*=.72;if(ctx.scoring==='PPR'&&pos==='WR')w*=1.08;if(ctx.scoring==='PPR'&&pos==='TE')w*=1.04;if(ctx.scoring==='Standard'&&pos==='RB')w*=1.10;if(ctx.scoring==='Standard'&&pos==='WR')w*=.93;weights[pos]=w;});
 const reserve=Math.max(2,Number(ctx.roster.k||0)+Number(ctx.roster.def||0));
 const usable=Math.max(1,ctx.budget-reserve),sum=Object.values(weights).reduce((a,b)=>a+b,0)||1;
 const out={}; let assigned=0; DNA_POSITIONS.forEach((pos,i)=>{out[pos]=i===DNA_POSITIONS.length-1?usable-assigned:Math.round(usable*weights[pos]/sum);assigned+=out[pos];});out.RESERVE=reserve;return out;
}

function leaguePositionSummary(pos){
 const ctx=leagueDNAContext(),d=ctx.demands[pos],intensity=ctx.intensity[pos];
 let label=intensity>=1.35?'HIGH DEMAND':intensity<=.82?'LOW DEMAND':'NORMAL DEMAND';
 let reason=`${d.toFixed(d%1?1:0)} effective starter spots per team`;
 if(pos==='QB')reason=ctx.twoQB?`${ctx.roster.qb} starting QBs creates premium scarcity`:`${ctx.roster.qb} starting QB keeps replacement value available`;
 if(pos==='WR'&&Number(ctx.roster.wr||0)>=3)reason=`${ctx.roster.wr} starting WRs plus ${ctx.roster.flex||0} FLEX increases depth demand`;
 if(pos==='RB'&&Number(ctx.roster.flex||0)>=2)reason=`${ctx.roster.rb} starting RBs plus ${ctx.roster.flex} FLEX keeps RB demand elevated`;
 return {label,reason,intensity,context:ctx};
}

function leagueContextHTML(){const c=leagueDNAContext();return `<div class="dna-league-context"><div><strong>${c.teams} Teams</strong><span>LEAGUE SIZE</span></div><div><strong>${money(c.budget)}</strong><span>AUCTION BUDGET</span></div><div><strong>${c.scoring}</strong><span>SCORING</span></div><div><strong>${c.rosterSize} Spots</strong><span>ROSTER SIZE</span></div></div>`;}

function rebuildOverallDNARanks(){
 const auto=PLAYERS.map(p=>({p,ev:getPersonalEvaluation(p.name)})).filter(x=>x.ev&&String(x.ev.notes||'').startsWith('Position DNA:'));
 auto.sort((a,b)=>Number(b.ev.value||0)-Number(a.ev.value||0)||(adpFor(a.p)||9999)-(adpFor(b.p)||9999)||a.p.name.localeCompare(b.p.name));
 auto.forEach((x,i)=>{x.ev.rank=i+1;personalEvaluations[playerKey(x.p.name)]=x.ev;});
 return auto.length;
}

function openStrategySprints(){dnaLab={screen:'HOME',pos:null,stage:'HOME',index:0};$('strategySprintModal').classList.remove('hidden');$('sprintResult').textContent='';try{renderStrategySprint();}catch(err){console.error('Draft DNA Combine failed to open',err);$('sprintTitle').textContent='Draft DNA Combine';$('sprintQuestionArea').innerHTML='<div class="dna-summary-text">The Combine could not load. Refresh the player pool in Draft Prep, then reopen it.</div>';$('sprintResult').textContent=err?.message||'Unknown error';}}

function closeStrategySprints(){$('strategySprintModal').classList.add('hidden');}

function moduleProgress(pos){const m=dnaModule(pos),q=dnaQuestionsFor(pos);const rawDone=Object.keys(m.philosophy||{}).length+Object.keys(m.gut||{}).length+Object.keys(m.prices||{}).length+Object.keys(m.pairs||{}).length;const total=dnaPhilosophyQuestions(pos).length+q.gut.length+q.price.length+q.pairs.length;const done=Math.min(rawDone,total);const pct=total?Math.min(100,Math.round(done/total*100)):0;if(total&&rawDone>=total&&!m.questionnaireComplete){m.questionnaireComplete=true;savePositionDNA();}return{done,total,pct,rawDone};}

function renderDNAHome(){
 const completed=DNA_POSITIONS.filter(p=>{const m=dnaModule(p),pr=moduleProgress(p);return m.complete||m.questionnaireComplete||pr.pct===100;}).length;
 $('sprintTitle').textContent='Draft DNA Combine';
 $('sprintKicker').textContent='POSITION COMBINES';
 $('sprintProgressBar').style.width=(completed/4*100)+'%';
 const cards=DNA_POSITIONS.map(pos=>{
   const m=dnaModule(pos),pr=moduleProgress(pos),available=positionPool(pos).length,isComplete=!!(m.complete||m.questionnaireComplete||pr.pct===100);
   const status=!available?'PLAYER DATA NEEDED':isComplete?'COMBINE COMPLETE':pr.done?pr.pct+'% COMPLETE':'START COMBINE';
   const action=isComplete?'REVIEW':pr.done?'RESUME':'START';
   return `<button class="dna-module-card ${isComplete?'done':''}" data-dna-module="${pos}" ${available?'':'disabled'}><span class="dna-module-pos">${pos}</span><span class="dna-module-copy"><strong>${DNA_POSITION_LABELS[pos]}</strong><em>COMBINE</em><small>${status}</small></span><span class="dna-module-action">${action}</span><span class="dna-module-count"><b>${available}</b><small>PLAYERS</small></span><span class="dna-module-chevron">›</span><span class="dna-module-bar"><i style="width:${isComplete?100:pr.pct}%"></i></span></button>`;
 }).join('');
 $('sprintQuestionArea').innerHTML=`${leagueContextHTML()}<div class="sprint-help">Complete each position separately. Values, budgets, and rankings use the league settings above. Progress saves after every answer, and manual player edits remain protected.</div><div class="dna-module-grid">${cards}</div><div class="dna-home-summary"><strong>${completed} of 4 combines complete</strong><span>${completed===4?'All position combines are complete. Review any module or rebuild your league-aware boards.':'Choose any available position to start or resume.'}</span></div>`;
 $('sprintBackBtn').disabled=true;
 $('sprintNextBtn').textContent=completed===4?'REBUILD ALL POSITION BOARDS':'CLOSE';
}

function beginPositionDNA(pos){if(!positionPool(pos).length){$('sprintResult').textContent=`No current ${pos} players are loaded. Refresh the player pool in Draft Prep and try again.`;return;}dnaLab={screen:'MODULE',pos,stage:'PHILOSOPHY',index:0};renderStrategySprint();}

function dnaTotalSteps(pos){const q=dnaQuestionsFor(pos);return dnaPhilosophyQuestions(pos).length+q.gut.length+q.price.length+q.pairs.length+1;}

function dnaDoneSteps(){const {pos,stage,index}=dnaLab,q=dnaQuestionsFor(pos),ph=dnaPhilosophyQuestions(pos).length;if(stage==='PHILOSOPHY')return index;if(stage==='GUT')return ph+index;if(stage==='PRICE')return ph+q.gut.length+index;if(stage==='PAIR')return ph+q.gut.length+q.price.length+index;return dnaTotalSteps(pos);}

function setPositionProgress(){const {pos,stage,index}=dnaLab,q=dnaQuestionsFor(pos);let label='SUMMARY',current=1,total=1;if(stage==='PHILOSOPHY'){label='PHILOSOPHY';current=index+1;total=dnaPhilosophyQuestions(pos).length;}else if(stage==='GUT'){label='GUT CHECK';current=index+1;total=q.gut.length;}else if(stage==='PRICE'){label='PRICE CHECK';current=index+1;total=q.price.length;}else if(stage==='PAIR'){label='HEAD-TO-HEAD';current=index+1;total=q.pairs.length;}$('sprintKicker').textContent=`${pos} DNA · ${label} · ${current} OF ${total}`;$('sprintProgressBar').style.width=Math.max(4,current/Math.max(1,total)*100)+'%';}

function renderPositionPhilosophy(){const pos=dnaLab.pos,m=dnaModule(pos),questions=dnaPhilosophyQuestions(pos),q=questions[dnaLab.index];$('sprintTitle').textContent=`${pos} DNA · Philosophy`;$('sprintQuestionArea').innerHTML=`<div class="dna-step-counter">Question ${dnaLab.index+1} of ${questions.length}</div><div class="dna-card"><div class="dna-player dna-question-title">${q.label}</div><div class="dna-buttons dna-option-grid">${q.opts.map(o=>`<button data-pos-philosophy="${q.key}" data-value="${o[0]}" class="${m.philosophy[q.key]===o[0]?'selected':''}">${o[1]}</button>`).join('')}</div></div>`;$('sprintBackBtn').disabled=dnaLab.index===0;$('sprintNextBtn').textContent='SKIP';}

function renderPositionGut(){const pos=dnaLab.pos,m=dnaModule(pos),list=dnaQuestionsFor(pos).gut,p=list[dnaLab.index];$('sprintTitle').textContent=`${pos} DNA · Gut Check`;$('sprintQuestionArea').innerHTML=`<div class="dna-step-counter">Player ${dnaLab.index+1} of ${list.length}</div><div class="dna-card"><div class="dna-meta">${p.team||'FA'} • Market ${money(marketSeedValue(p))} • Rank ${adpFor(p)||'—'}</div><div class="dna-player">${p.name}</div><div class="sprint-help">Your immediate reaction?</div><div class="dna-buttons">${[['LOVE','LOVE'],['LIKE','LIKE'],['NEUTRAL','NEUTRAL'],['FADE','FADE'],['OUT','OUT']].map(o=>`<button data-pos-gut="${o[0]}" class="${m.gut[p.name]===o[0]?'selected':''}">${o[1]}</button>`).join('')}</div></div>`;$('sprintBackBtn').disabled=false;$('sprintNextBtn').textContent='SKIP';}

function renderPositionPrice(){const pos=dnaLab.pos,m=dnaModule(pos),list=dnaQuestionsFor(pos).price,p=list[dnaLab.index],price=marketSeedValue(p);$('sprintTitle').textContent=`${pos} DNA · Price Check`;$('sprintQuestionArea').innerHTML=`<div class="dna-step-counter">Price ${dnaLab.index+1} of ${list.length}</div><div class="dna-card"><div class="dna-meta">${p.team||'FA'} • ${pos}</div><div class="dna-player">${p.name} at ${money(price)}</div><div class="sprint-help">How aggressively would you buy?</div><div class="dna-buttons">${[['SMASH','SMASH'],['BUY','BUY'],['FAIR','FAIR'],['HIGH','TOO HIGH'],['PASS','PASS']].map(o=>`<button data-pos-price="${o[0]}" class="${m.prices[p.name]===o[0]?'selected':''}">${o[1]}</button>`).join('')}</div></div>`;$('sprintBackBtn').disabled=false;$('sprintNextBtn').textContent='SKIP';}

function renderPositionPair(){const pos=dnaLab.pos,m=dnaModule(pos),list=dnaQuestionsFor(pos).pairs,pair=list[dnaLab.index],key=pair.map(p=>p.name).sort().join('|');$('sprintTitle').textContent=`${pos} DNA · Head-to-Head`;$('sprintQuestionArea').innerHTML=`<div class="sprint-help">Who would you rather roster at a similar relative cost?</div><div class="dna-pair">${pair.map((p,i)=>`${i?'<div class="dna-vs">VS</div>':''}<button type="button" class="dna-choice ${m.pairs[key]===p.name?'selected':''}" data-pos-pair="${i}"><strong>${p.name}</strong><span>${p.team||'FA'} • ${money(marketSeedValue(p))}</span></button>`).join('')}</div>`;$('sprintBackBtn').disabled=false;$('sprintNextBtn').textContent=dnaLab.index===list.length-1?`FINISH ${pos} DNA`:'SKIP';}

function computePositionProfile(pos){const m=dnaModule(pos),gut=Object.values(m.gut),prices=Object.values(m.prices),ph=m.philosophy,league=leaguePositionSummary(pos);const score=(arr,map,base=50)=>Math.max(0,Math.min(100,Math.round(base+(arr.reduce((s,v)=>s+(map[v]||0),0)/(Math.max(1,arr.length))))));return{investment:ph.investment||'MEDIUM',risk:ph.risk||'BALANCED',depth:ph.depth||'NORMAL',discipline:ph.discipline||'CONTROLLED',style:ph.style||'ANY',enthusiasm:score(gut,{LOVE:35,LIKE:15,NEUTRAL:0,FADE:-18,OUT:-35}),priceAggression:score(prices,{SMASH:35,BUY:18,FAIR:0,HIGH:-20,PASS:-35}),confidence:Math.min(100,Math.round(moduleProgress(pos).pct)),leagueDemand:league.label,leagueReason:league.reason,leagueIntensity:league.intensity,leagueFingerprint:league.context.fingerprint};}

function positionAdjustment(pos,p,profile,m){let adj=0;adj+=profile.investment==='HIGH'?4:profile.investment==='LOW'?-4:0;adj+=({LOVE:10,LIKE:5,NEUTRAL:0,FADE:-6,OUT:-15}[m.gut[p.name]]||0);adj+=({SMASH:8,BUY:4,FAIR:0,HIGH:-5,PASS:-12}[m.prices[p.name]]||0);Object.entries(m.pairs).forEach(([key,winner])=>{if(winner===p.name)adj+=4;else if(key.split('|').includes(p.name))adj-=2;});const a=adpFor(p)||999;if(profile.risk==='UPSIDE'&&a>45&&a<180)adj+=3;if(profile.risk==='FLOOR'&&a<=70)adj+=3;const leagueDelta=(Number(profile.leagueIntensity||1)-1)*3;adj+=Math.max(-3,Math.min(4,leagueDelta));return adj;}

function positionCandidates(pos){const profile=computePositionProfile(pos),m=dnaModule(pos);return positionPool(pos).map(p=>({p,score:marketSeedValue(p)*2+(250-Math.min(250,adpFor(p)||250))*.06+positionAdjustment(pos,p,profile,m)*2})).sort((a,b)=>b.score-a.score).map(x=>x.p);}

function renderPositionResult(){const pos=dnaLab.pos,m=dnaModule(pos),profile=computePositionProfile(pos),targets=positionCandidates(pos).slice(0,pos==='QB'||pos==='TE'?5:10),budgets=suggestedPositionBudgets(),ctx=leagueDNAContext();m.profile=profile;m.questionnaireComplete=true;savePositionDNA();$('sprintTitle').textContent=`${pos} COMBINE COMPLETE`;$('sprintKicker').textContent=`${pos} DNA · COMPLETE`;$('sprintProgressBar').style.width='100%';$('sprintQuestionArea').innerHTML=`<div class="dna-complete-banner"><strong>✓ ${DNA_POSITION_LABELS[pos]} COMBINE COMPLETE</strong><span>Your answers are saved. Apply them now to build your league-aware personal board.</span></div>${leagueContextHTML()}<div class="dna-league-impact"><div class="dna-impact-card"><strong>${profile.leagueDemand}</strong><span>LEAGUE DEMAND</span><small>${profile.leagueReason}</small></div><div class="dna-impact-card"><strong>${money(budgets[pos])}</strong><span>SUGGESTED ${pos} BUDGET</span><small>Position-wide target, not a single-player limit.</small></div><div class="dna-impact-card"><strong>${profile.investment}</strong><span>YOUR PHILOSOPHY</span><small>${profile.discipline} price discipline • ${profile.risk} risk</small></div></div><div class="dna-profile">${dnaTraitHTML('Enthusiasm',profile.enthusiasm)}${dnaTraitHTML('Price Aggression',profile.priceAggression)}${dnaTraitHTML('Confidence',profile.confidence)}<div class="dna-trait"><strong>${profile.style}</strong><span>Player Style</span></div></div><h4 class="dna-target-heading">Your projected top ${pos} targets</h4><div class="dna-target-list">${targets.map((p,i)=>`<div><b>#${i+1}</b><span>${p.name}<small>${p.team||'FA'} • League Market ${money(marketSeedValue(p))}</small></span></div>`).join('')}</div><div class="dna-summary-text">Press the button below to generate ranks, tiers, values, hard stops and flags for this position.</div>`;$('sprintBackBtn').disabled=false;$('sprintNextBtn').textContent=`BUILD ${pos} BOARD & RETURN`;}

function buildPositionBoard(pos){activatePersonalization();const m=dnaModule(pos),profile=computePositionProfile(pos),players=positionCandidates(pos),ctx=leagueDNAContext(),positionBudgets=suggestedPositionBudgets(),limit=pos==='QB'||pos==='TE'?36:90,buffer=profile.discipline==='STRICT'?1:profile.discipline==='AGGRESSIVE'?5:3;let changed=0;players.slice(0,limit).forEach((p,i)=>{const old=getPersonalEvaluation(p.name);if(old&&!String(old.notes||'').startsWith('Position DNA:'))return;let value=Math.max(1,Math.round(marketSeedValue(p)+positionAdjustment(pos,p,profile,m)));const reaction=m.gut[p.name],price=m.prices[p.name],avoid=reaction==='OUT'||price==='PASS';if(avoid)value=Math.max(1,Math.round(value*.65));const tier=i<(pos==='QB'||pos==='TE'?4:8)?'1':i<(pos==='QB'||pos==='TE'?12:24)?'2':i<(pos==='QB'||pos==='TE'?24:48)?'3':'4';personalEvaluations[playerKey(p.name)]={name:p.name,conviction:avoid?1:(reaction==='LOVE'&&price==='SMASH'?5:reaction==='LOVE'||reaction==='LIKE'?4:reaction==='FADE'?2:3),rank:i+1,tier,value,hardStop:value+(avoid?1:buffer),favorite:!avoid&&(reaction==='LOVE'||i<3),flagPlant:!avoid&&(reaction==='LOVE'&&price==='SMASH'),sleeper:!avoid&&i>12&&(reaction==='LIKE'||profile.risk==='UPSIDE'),avoid,notes:`Position DNA: ${pos} • ${profile.leagueDemand.toLowerCase()} • ${reaction||'profile fit'}${price?' • '+price.toLowerCase():''} • ${ctx.teams}T ${ctx.scoring} ${money(ctx.budget)}`,updatedAt:new Date().toISOString()};changed++;});m.complete=true;m.profile={...profile,suggestedBudget:positionBudgets[pos],leagueFingerprint:ctx.fingerprint};savePositionDNA();rebuildOverallDNARanks();savePersonalEvaluations(true);renderPersonalBoard();renderBulkBoard();renderCore();return changed;}

function refreshViewsAfterDNA(){
 savePersonalEvaluations();
 renderPersonalBoard();
 renderBulkBoard();
 renderCore();
 renderAll();
 updateResetSummary();
 if(state.selected&&byName[state.selected])setSelected(byName[state.selected]);
 // iOS Safari can paint from the previous DOM snapshot after a modal action.
 // Two animation frames force the refreshed board to be committed before we continue.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
   renderPersonalBoard();
   renderBulkBoard();
   renderCore();
 }));
}

function persistAndVerifyPersonalEvaluations(){
 activatePersonalization();
 const payload=JSON.stringify(personalEvaluations||{});
 localStorage.setItem(PERSONAL_EVAL_KEY,payload);
 const saved=JSON.parse(localStorage.getItem(PERSONAL_EVAL_KEY)||'{}')||{};
 const expected=Object.keys(personalEvaluations||{}).length;
 const actual=Object.keys(saved).length;
 if(expected<1||actual!==expected)throw new Error(`Personal board save verification failed (${actual}/${expected}).`);
 personalEvaluations=saved;
 profileMode='owner';
 localStorage.setItem(PROFILE_MODE_KEY,'owner');
 return actual;
}

function applyPositionDNAAndRefresh(pos){
 activatePersonalization();
 const before=Object.keys(personalEvaluations||{}).length;
 const changed=buildPositionBoard(pos);
 if(changed<1)throw new Error(`No ${pos} evaluations were generated. Refresh the player pool and retry.`);
 const after=persistAndVerifyPersonalEvaluations();
 refreshViewsAfterDNA();
 const receipt={position:pos,changed,total:after,added:Math.max(0,after-before),appliedAt:new Date().toISOString()};
 localStorage.setItem('warRoomDNAApplyReceipt',JSON.stringify(receipt));
 return receipt;
}

function renderPositionApplied(){
 const pos=dnaLab.pos,receipt=dnaLab.receipt||{changed:0,total:Object.keys(personalEvaluations||{}).length};
 $('sprintTitle').textContent=`${pos} DNA APPLIED`;
 $('sprintKicker').textContent=`${pos} DNA · BOARD UPDATED`;
 $('sprintProgressBar').style.width='100%';
 $('sprintQuestionArea').innerHTML=`<div class="dna-complete-banner"><strong>✓ DRAFT DNA APPLIED SUCCESSFULLY</strong><span>${receipt.changed} ${pos} player evaluations were generated or refreshed.</span></div><div class="dna-league-impact"><div class="dna-impact-card"><strong>${receipt.changed}</strong><span>${pos} PLAYERS UPDATED</span><small>Ranks, tiers, values, hard stops and flags are now available.</small></div><div class="dna-impact-card"><strong>${receipt.total}</strong><span>TOTAL PERSONALIZED</span><small>Your current personal board is saved on this device.</small></div><div class="dna-impact-card"><strong>READY</strong><span>WAR ROOM STATUS</span><small>Draft Prep and live recommendations have been refreshed.</small></div></div>`;
 $('sprintResult').textContent=`${pos} board updated successfully • ${Object.keys(personalEvaluations).length} evaluations active.`;
 $('sprintBackBtn').disabled=true;
 $('sprintNextBtn').textContent='RETURN TO COMBINES';
}

function renderStrategySprint(){if(dnaLab.screen==='HOME'||dnaLab.stage==='HOME')return renderDNAHome();if(dnaLab.stage==='APPLIED')return renderPositionApplied();setPositionProgress();if(dnaLab.stage==='PHILOSOPHY')renderPositionPhilosophy();else if(dnaLab.stage==='GUT')renderPositionGut();else if(dnaLab.stage==='PRICE')renderPositionPrice();else if(dnaLab.stage==='PAIR')renderPositionPair();else renderPositionResult();}

function advancePositionDNA(){const pos=dnaLab.pos,q=dnaQuestionsFor(pos);if(dnaLab.stage==='PHILOSOPHY'){dnaLab.index++;if(dnaLab.index>=dnaPhilosophyQuestions(pos).length){dnaLab.stage='GUT';dnaLab.index=0;}}else if(dnaLab.stage==='GUT'){dnaLab.index++;if(dnaLab.index>=q.gut.length){dnaLab.stage='PRICE';dnaLab.index=0;}}else if(dnaLab.stage==='PRICE'){dnaLab.index++;if(dnaLab.index>=q.price.length){dnaLab.stage='PAIR';dnaLab.index=0;}}else if(dnaLab.stage==='PAIR'){dnaLab.index++;if(dnaLab.index>=q.pairs.length){const m=dnaModule(pos);m.questionnaireComplete=true;savePositionDNA();dnaLab.stage='RESULT';dnaLab.index=0;}}else if(dnaLab.stage==='RESULT'){
   try{dnaLab.receipt=applyPositionDNAAndRefresh(pos);dnaLab.stage='APPLIED';renderStrategySprint();}
   catch(err){console.error('Draft DNA apply failed',err);$('sprintResult').textContent=`Could not build ${pos} board: ${err.message||'unknown error'}`;}
   return;
 }else if(dnaLab.stage==='APPLIED'){dnaLab={screen:'HOME',pos:null,stage:'HOME',index:0};$('sprintResult').textContent='';renderStrategySprint();return;}savePositionDNA();renderStrategySprint();}

function backPositionDNA(){const pos=dnaLab.pos,q=dnaQuestionsFor(pos);if(dnaLab.stage==='PHILOSOPHY'){if(dnaLab.index>0)dnaLab.index--;else{dnaLab={screen:'HOME',pos:null,stage:'HOME',index:0};}}else if(dnaLab.stage==='GUT'){if(dnaLab.index>0)dnaLab.index--;else{dnaLab.stage='PHILOSOPHY';dnaLab.index=dnaPhilosophyQuestions(pos).length-1;}}else if(dnaLab.stage==='PRICE'){if(dnaLab.index>0)dnaLab.index--;else{dnaLab.stage='GUT';dnaLab.index=q.gut.length-1;}}else if(dnaLab.stage==='PAIR'){if(dnaLab.index>0)dnaLab.index--;else{dnaLab.stage='PRICE';dnaLab.index=q.price.length-1;}}else if(dnaLab.stage==='RESULT'){dnaLab.stage='PAIR';dnaLab.index=q.pairs.length-1;}else if(dnaLab.stage==='APPLIED'){dnaLab={screen:'HOME',pos:null,stage:'HOME',index:0};}renderStrategySprint();}

function recalculateDnaBoardForLeague(){let changed=0;DNA_POSITIONS.forEach(pos=>{if(dnaModule(pos).complete)changed+=buildPositionBoard(pos);});rebuildOverallDNARanks();savePersonalEvaluations();return changed;}
