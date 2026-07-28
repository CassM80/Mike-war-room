// Sprint 24.6 — Market Coverage Audit.
// Grades the live provider against the league's actual draft depth while keeping
// fallback data distinct from genuinely fresh rankings.

function coverageRosterDepth(){
  const r=leagueConfig.roster||{};
  const teams=Math.max(1,Number(leagueConfig.teamCount||12));
  const perTeam=['qb','rb','wr','te','flex','k','def','bench'].reduce((n,k)=>n+Math.max(0,Number(r[k]||0)),0);
  const total=teams*perTeam;
  const statusOnly=teams*(Math.max(0,Number(r.k||0))+Math.max(0,Number(r.def||0)));
  return {teams,perTeam,total,skill:Math.max(1,total-statusOnly),statusOnly};
}

function coverageRankFor(p){
  return Number(p.provider_rank||p.search_rank||p.sleeper_rank||p.adp||0)||99999;
}

function coverageClassFor(p){
  if(Number(p.provider_rank||0)>0)return 'LIVE';
  const active=p.active!==false&&CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase());
  const fallback=Number(p.provider_market_price||p.market_price||0)>0||Number(adpFor(p)||0)>0||Number(marketSeedValue(p)||0)>0;
  return active&&fallback?'FALLBACK':'STALE';
}

function marketCoverageUniverse(){
  const relevant=new Set(['QB','RB','WR','TE']);
  return PLAYERS.filter(p=>relevant.has(p.pos)&&p.active!==false&&CURRENT_NFL_TEAMS.has(String(p.team||'').toUpperCase()))
    .sort((a,b)=>coverageRankFor(a)-coverageRankFor(b)||(Number(marketValueFor(b))||0)-(Number(marketValueFor(a))||0)||a.name.localeCompare(b.name));
}

function calculateMarketCoverage(){
  const depth=coverageRosterDepth(),universe=marketCoverageUniverse();
  const board=universe.slice(0,Math.max(250,depth.skill));
  const counts={LIVE:0,FALLBACK:0,STALE:0};
  const byPos={QB:{LIVE:0,FALLBACK:0,STALE:0},RB:{LIVE:0,FALLBACK:0,STALE:0},WR:{LIVE:0,FALLBACK:0,STALE:0},TE:{LIVE:0,FALLBACK:0,STALE:0}};
  board.forEach(p=>{const c=coverageClassFor(p);counts[c]++;byPos[p.pos][c]++;});
  const at=n=>{
    const rows=board.slice(0,Math.min(n,board.length));
    const covered=rows.filter(p=>coverageClassFor(p)!=='STALE').length;
    const live=rows.filter(p=>coverageClassFor(p)==='LIVE').length;
    return {n:rows.length,coveredPct:rows.length?Math.round(covered/rows.length*100):0,livePct:rows.length?Math.round(live/rows.length*100):0};
  };
  const expected=at(depth.skill),top100=at(100),top150=at(150),top200=at(200),top250=at(250);
  const review=board.map((p,i)=>({p,rank:i+1,kind:coverageClassFor(p)})).filter(x=>x.kind!=='LIVE').slice(0,12);
  let verdict='ADD PROVIDER B',tone='red';
  if(expected.coveredPct>=95&&top150.livePct>=85){verdict='DRAFT READY';tone='green';}
  else if(expected.coveredPct>=90&&top100.livePct>=85){verdict='WATCH DEPTH';tone='yellow';}
  return {depth,board,counts,byPos,expected,top100,top150,top200,top250,review,verdict,tone};
}

function renderMarketCoverageAudit(){
  const host=document.getElementById('marketCoverageAudit');if(!host)return null;
  const a=calculateMarketCoverage();
  const color={green:'var(--green)',yellow:'#ffcc4d',red:'var(--red)'}[a.tone];
  const positionRows=['QB','RB','WR','TE'].map(pos=>`<tr><th>${pos}</th><td>${a.byPos[pos].LIVE}</td><td>${a.byPos[pos].FALLBACK}</td><td>${a.byPos[pos].STALE}</td></tr>`).join('');
  const depthCard=(label,x)=>`<div><strong>${x.coveredPct}%</strong><span>${label}</span><small>${x.livePct}% live</small></div>`;
  const review=a.review.length?a.review.map(x=>`<li><b>#${x.rank} ${esc(x.p.name)}</b><span>${x.p.pos} • ${x.kind}</span></li>`).join(''):'<li><b>No relevant gaps found.</b><span>All audited players have live or fallback data.</span></li>';
  host.innerHTML=`<details class="market-coverage" open><summary><span>MARKET COVERAGE AUDIT</span><strong style="color:${color}">${a.expected.coveredPct}% — ${a.verdict}</strong></summary><div class="market-coverage-body"><p>${a.depth.teams} teams × ${a.depth.perTeam} roster spots = ${a.depth.total} selections. Ranking coverage is graded across ${a.depth.skill} QB/RB/WR/TE selections; ${a.depth.statusOnly} K/DEF slots are excluded.</p><div class="coverage-depth">${depthCard('TOP 100',a.top100)}${depthCard('TOP 150',a.top150)}${depthCard(`DRAFT DEPTH ${a.depth.skill}`,a.expected)}${depthCard('TOP 250',a.top250)}</div><div class="coverage-columns"><table><thead><tr><th>POS</th><th>LIVE</th><th>FALLBACK</th><th>STALE</th></tr></thead><tbody>${positionRows}</tbody></table><div><h4>PLAYERS TO REVIEW</h4><ul class="coverage-review">${review}</ul></div></div></div></details>`;
  return a;
}
