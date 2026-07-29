// Sprint 28.0 — canonical player identity plus draft-relevant market-health diagnostics.
function buildCanonicalPlayerRegistry(){
  const registry=new Map(), aliases=new Map();
  for(const p of PLAYERS){
    if(!p.player_id)p.player_id=canonicalPlayerId(p,p.name);
    registry.set(p.player_id,p);
    aliases.set(playerMatchKey(p.name),p.player_id);
  }
  window.CANONICAL_PLAYER_REGISTRY=registry;
  window.CANONICAL_PLAYER_ALIASES=aliases;
  return registry;
}
function integrityDraftUniverse(){
  const relevant=new Set(['QB','RB','WR','TE']);
  const maxDepth=Math.max(Number(MARKET_COVERAGE_POLICY?.overallDepth||300),Number(coverageRosterDepth?.().skill||0));
  return PLAYERS.filter(p=>relevant.has(p.pos)&&p.active!==false&&CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase()))
    .sort((a,b)=>(adpFor(a)||99999)-(adpFor(b)||99999)||(positionRankFor(a)||999)-(positionRankFor(b)||999)||a.name.localeCompare(b.name))
    .slice(0,maxDepth);
}
function playerDataIntegrityReport(){
  const registry=buildCanonicalPlayerRegistry();
  const duplicateIds=[],duplicateNames=[],missingPrice=[],missingRank=[],missingIdentity=[],suspicious=[];
  const ids=new Map(),names=new Map();
  for(const p of PLAYERS){
    const id=p.player_id||""; const key=playerMatchKey(p.name);
    if(!id)missingIdentity.push(p.name);
    if(ids.has(id))duplicateIds.push(`${p.name} ↔ ${ids.get(id)}`); else ids.set(id,p.name);
    if(names.has(key))duplicateNames.push(`${p.name} ↔ ${names.get(key)}`); else names.set(key,p.name);
  }
  const draftUniverse=integrityDraftUniverse();
  const sources={CONSENSUS:0,BASELINE:0,MODELED:0,EDITED:0,UNPRICED:0};
  for(const p of draftUniverse){
    const price=consensusPriceFor(p),rank=adpFor(p),source=marketPriceSource(p).code;
    sources[source]=(sources[source]||0)+1;
    if(!price)missingPrice.push(p.name);
    if(!rank)missingRank.push(p.name);
    if(price>=20&&rank>=150)suspicious.push(`${p.name}: $${price}, market rank ${rank}`);
    if(price<=2&&rank>0&&rank<=60)suspicious.push(`${p.name}: $${price}, market rank ${rank}`);
  }
  const identityTotal=Math.max(1,PLAYERS.length);
  const coverageTotal=Math.max(1,draftUniverse.length);
  const identityPenalty=(missingIdentity.length+duplicateIds.length+duplicateNames.length)*5;
  const coveragePct=Math.round((coverageTotal-missingPrice.length)/coverageTotal*100);
  const rankPct=Math.round((coverageTotal-missingRank.length)/coverageTotal*100);
  const score=Math.max(0,Math.min(100,Math.round(coveragePct*.65+rankPct*.25+100*.10-(identityPenalty/identityTotal*100)-suspicious.length*.15)));
  return {score,total:PLAYERS.length,registrySize:registry.size,draftUniverseSize:draftUniverse.length,coveragePct,rankPct,sources,duplicateIds,duplicateNames,missingPrice,missingRank,missingIdentity,suspicious};
}
function renderPlayerIntegrity(){
  const scoreEl=document.getElementById('playerIntegrityScore'),summary=document.getElementById('playerIntegritySummary'),warnings=document.getElementById('playerIntegrityWarnings');
  if(!scoreEl||!summary||!warnings)return;
  const r=playerDataIntegrityReport();
  scoreEl.textContent=`${r.score}% • ${r.registrySize}/${r.total} canonical records`;
  scoreEl.className=r.score>=95?'integrity-good':r.score>=85?'integrity-warn':'integrity-bad';
  summary.textContent=`Top ${r.draftUniverseSize}: ${r.coveragePct}% priced • ${r.rankPct}% ranked • ${r.sources.CONSENSUS||0} verified consensus • ${(r.sources.BASELINE||0)+(r.sources.MODELED||0)} War Room baselines`;
  const groups=[
    ['DRAFT-RELEVANT PLAYERS WITHOUT A MARKET VALUE',r.missingPrice],
    ['DRAFT-RELEVANT PLAYERS WITHOUT A MARKET RANK',r.missingRank],
    ['DUPLICATE IDS',r.duplicateIds],
    ['DUPLICATE NAMES / ALIASES',r.duplicateNames],
    ['SUSPICIOUS PRICE-RANK CONFLICTS',r.suspicious]
  ];
  warnings.innerHTML=`<div class="integrity-source-note"><strong>PRICE SOURCE MIX</strong><p>${r.sources.CONSENSUS||0} verified consensus • ${r.sources.BASELINE||0} curated baseline • ${r.sources.MODELED||0} modeled baseline • ${r.sources.EDITED||0} edited • ${r.sources.UNPRICED||0} unpriced</p></div>`+groups.map(([title,items])=>`<div class="integrity-group"><strong>${title} (${items.length})</strong>${items.length?`<p>${items.slice(0,30).map(esc).join(' • ')}${items.length>30?' • …':''}</p>`:'<p>None.</p>'}</div>`).join('');
  window.PLAYER_DATA_INTEGRITY=r;
}
window.addEventListener('load',()=>setTimeout(renderPlayerIntegrity,300));
