// Sprint 27.0 — canonical player identity and visible data-integrity diagnostics.
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
function playerDataIntegrityReport(){
  const registry=buildCanonicalPlayerRegistry();
  const duplicateIds=[],duplicateNames=[],missingPrice=[],missingRank=[],missingIdentity=[],suspicious=[];
  const ids=new Map(),names=new Map();
  for(const p of PLAYERS){
    const id=p.player_id||""; const key=playerMatchKey(p.name);
    if(!id)missingIdentity.push(p.name);
    if(ids.has(id))duplicateIds.push(`${p.name} ↔ ${ids.get(id)}`); else ids.set(id,p.name);
    if(names.has(key))duplicateNames.push(`${p.name} ↔ ${names.get(key)}`); else names.set(key,p.name);
    if(!consensusPriceFor(p))missingPrice.push(p.name);
    if(!adpFor(p))missingRank.push(p.name);
    const price=consensusPriceFor(p),rank=adpFor(p);
    if(price>=20&&rank>=150)suspicious.push(`${p.name}: $${price}, market rank ${rank}`);
    if(price<=2&&rank>0&&rank<=60)suspicious.push(`${p.name}: $${price}, market rank ${rank}`);
  }
  const total=Math.max(1,PLAYERS.length);
  const critical=missingIdentity.length+duplicateIds.length+duplicateNames.length;
  const coveragePenalty=(missingPrice.length+missingRank.length)*.35;
  const score=Math.max(0,Math.round(100-((critical*3+coveragePenalty+suspicious.length)/total*100)));
  return {score,total,registrySize:registry.size,duplicateIds,duplicateNames,missingPrice,missingRank,missingIdentity,suspicious};
}
function renderPlayerIntegrity(){
  const scoreEl=document.getElementById('playerIntegrityScore'),summary=document.getElementById('playerIntegritySummary'),warnings=document.getElementById('playerIntegrityWarnings');
  if(!scoreEl||!summary||!warnings)return;
  const r=playerDataIntegrityReport();
  scoreEl.textContent=`${r.score}% • ${r.registrySize}/${r.total} canonical records`;
  scoreEl.className=r.score>=95?'integrity-good':r.score>=85?'integrity-warn':'integrity-bad';
  summary.textContent=`${r.missingPrice.length} missing prices • ${r.missingRank.length} missing market ranks • ${r.duplicateIds.length+r.duplicateNames.length} duplicate identities • ${r.suspicious.length} suspicious price/rank conflicts`;
  const groups=[['MISSING CONSENSUS $',r.missingPrice],['MISSING MARKET RANK',r.missingRank],['DUPLICATE IDS',r.duplicateIds],['DUPLICATE NAMES / ALIASES',r.duplicateNames],['SUSPICIOUS PRICE-RANK CONFLICTS',r.suspicious]];
  warnings.innerHTML=groups.map(([title,items])=>`<div class="integrity-group"><strong>${title} (${items.length})</strong>${items.length?`<p>${items.slice(0,30).map(esc).join(' • ')}${items.length>30?' • …':''}</p>`:'<p>None.</p>'}</div>`).join('');
  window.PLAYER_DATA_INTEGRITY=r;
}
window.addEventListener('load',()=>setTimeout(renderPlayerIntegrity,300));
