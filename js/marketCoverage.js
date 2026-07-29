// Sprint 28.1 — Market Coverage Expansion.
// Audits live ranks and all market-value sources across the actual draftable pool.

function coverageRosterDepth(){
  const r=leagueConfig.roster||{};
  const teams=Math.max(1,Number(leagueConfig.teamCount||12));
  const perTeam=['qb','rb','wr','te','flex','k','def','bench'].reduce((n,k)=>n+Math.max(0,Number(r[k]||0)),0);
  const total=teams*perTeam;
  const statusOnly=teams*(Math.max(0,Number(r.k||0))+Math.max(0,Number(r.def||0)));
  return {teams,perTeam,total,skill:Math.max(1,total-statusOnly),statusOnly};
}
function coverageRankFor(p){return marketRankFor(p)||99999;}
function coverageClassFor(p){
  if(Number(p.provider_rank||0)>0)return 'LIVE';
  const active=p.active!==false&&CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase());
  const fallback=Number(providerRankFor(p)||0)>0;
  return active&&fallback?'FALLBACK':'STALE';
}
function marketCoverageUniverse(){
  const relevant=new Set(['QB','RB','WR','TE']);
  return PLAYERS.filter(p=>relevant.has(p.pos)&&p.active!==false&&CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase()))
    .sort((a,b)=>coverageRankFor(a)-coverageRankFor(b)||(Number(marketValueFor(b))||0)-(Number(marketValueFor(a))||0)||a.name.localeCompare(b.name));
}
function calculateMarketCoverage(){
  const depth=coverageRosterDepth(),universe=marketCoverageUniverse();
  const target=Math.max(Number(MARKET_COVERAGE_POLICY?.overallDepth||300),depth.skill);
  const board=universe.slice(0,target);
  const counts={LIVE:0,FALLBACK:0,STALE:0};
  const priceSources={CONSENSUS:0,BASELINE:0,MODELED:0,EDITED:0,UNPRICED:0};
  const byPos={QB:{LIVE:0,FALLBACK:0,STALE:0},RB:{LIVE:0,FALLBACK:0,STALE:0},WR:{LIVE:0,FALLBACK:0,STALE:0},TE:{LIVE:0,FALLBACK:0,STALE:0}};
  board.forEach(p=>{const c=coverageClassFor(p);counts[c]++;byPos[p.pos][c]++;const src=marketPriceSource(p).code;priceSources[src]=(priceSources[src]||0)+1;});
  const at=n=>{
    const rows=board.slice(0,Math.min(n,board.length));
    const ranked=rows.filter(p=>coverageClassFor(p)!=='STALE').length;
    const live=rows.filter(p=>coverageClassFor(p)==='LIVE').length;
    const priced=rows.filter(p=>marketValueFor(p)>0).length;
    return {n:rows.length,rankedPct:rows.length?Math.round(ranked/rows.length*100):0,livePct:rows.length?Math.round(live/rows.length*100):0,pricedPct:rows.length?Math.round(priced/rows.length*100):0};
  };
  const expected=at(depth.skill),top100=at(100),top150=at(150),top200=at(200),top300=at(300);
  const review=board.map((p,i)=>({p,rank:i+1,rankKind:coverageClassFor(p),priceKind:marketPriceSource(p).code})).filter(x=>x.rankKind==='STALE'||x.priceKind==='UNPRICED').slice(0,12);
  let verdict='NEEDS REVIEW',tone='red';
  if(top300.pricedPct>=98&&expected.rankedPct>=90){verdict='DRAFT READY';tone='green';}
  else if(top300.pricedPct>=95&&expected.rankedPct>=80){verdict='USABLE — WATCH RANKS';tone='yellow';}
  return {depth,target,board,counts,priceSources,byPos,expected,top100,top150,top200,top300,review,verdict,tone};
}
function renderMarketCoverageAudit(){
  const host=document.getElementById('marketCoverageAudit');if(!host)return null;
  const a=calculateMarketCoverage();
  const color={green:'var(--green)',yellow:'#ffcc4d',red:'var(--red)'}[a.tone];
  const positionRows=['QB','RB','WR','TE'].map(pos=>`<tr><th>${pos}</th><td>${a.byPos[pos].LIVE}</td><td>${a.byPos[pos].FALLBACK}</td><td>${a.byPos[pos].STALE}</td></tr>`).join('');
  const depthCard=(label,x)=>`<div><strong>${x.pricedPct}%</strong><span>${label} PRICED</span><small>${x.rankedPct}% ranked • ${x.livePct}% live</small></div>`;
  const review=a.review.length?a.review.map(x=>`<li><b>#${x.rank} ${esc(x.p.name)}</b><span>${x.p.pos} • War Room #${marketRankFor(x.p)||"—"} • ${x.rankKind} provider coverage • ${x.priceKind} price</span></li>`).join(''):'<li><b>No draft-relevant gaps found.</b><span>Every audited player has a market value and a War Room rank.</span></li>';
  const modeled=(a.priceSources.BASELINE||0)+(a.priceSources.MODELED||0);
  host.innerHTML=`<details class="market-coverage" open><summary><span>MARKET COVERAGE AUDIT</span><strong style="color:${color}">${a.top300.pricedPct}% PRICED — ${a.verdict}</strong></summary><div class="market-coverage-body"><p>${a.depth.teams} teams × ${a.depth.perTeam} roster spots = ${a.depth.total} selections. The audit checks the top ${a.target} QB/RB/WR/TE players; ${a.depth.statusOnly} K/DEF slots are excluded.</p><p><strong>Price sources:</strong> ${a.priceSources.CONSENSUS||0} verified consensus • ${modeled} War Room baseline • ${a.priceSources.EDITED||0} edited • ${a.priceSources.UNPRICED||0} unpriced. Modeled values are labeled and never presented as outside-provider consensus.</p><div class="coverage-depth">${depthCard('TOP 100',a.top100)}${depthCard('TOP 150',a.top150)}${depthCard(`DRAFT DEPTH ${a.depth.skill}`,a.expected)}${depthCard('TOP 300',a.top300)}</div><div class="coverage-columns"><table><thead><tr><th>POS</th><th>LIVE</th><th>FALLBACK</th><th>STALE</th></tr></thead><tbody>${positionRows}</tbody></table><div><h4>PLAYERS TO REVIEW</h4><ul class="coverage-review">${review}</ul></div></div></div></details>`;
  return a;
}
