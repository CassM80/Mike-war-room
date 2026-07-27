// Sprint 24.3 — personalization, My Guys, dossier, and board helpers.

function activatePersonalization(){
  // A cleared board is only a starting state. The first new manual edit or DNA build
  // must be allowed to create a fresh board immediately.
  window.__warRoomResetting=false;
  sessionStorage.removeItem(RESET_INTENT_KEY);
  profileMode="owner";
  localStorage.setItem(PROFILE_MODE_KEY,profileMode);
}

function savePersonalEvaluations(force=false){
  if(window.__warRoomResetting&&!force)return false;
  if(Object.keys(personalEvaluations||{}).length){
      profileMode="owner";
    localStorage.setItem(PROFILE_MODE_KEY,profileMode);
  }
  localStorage.setItem(PERSONAL_EVAL_KEY,JSON.stringify(personalEvaluations));
  return true;
}

function getPersonalEvaluation(name){ return personalEvaluations[playerKey(name)] || null; }

function normalizedConviction(value){const n=Number(value);return Number.isFinite(n)&&n>=1&&n<=5?Math.round(n):3;}

function convictionLabel(score){return ({1:"Avoid",2:"Discount Only",3:"Neutral",4:"Strong Target",5:"Plant the Flag"})[normalizedConviction(score)];}

function convictionStars(score){const n=normalizedConviction(score);return "★".repeat(n)+"☆".repeat(5-n);}

function convictionBadge(score){const n=normalizedConviction(score);return `<span class="my-guys-badge level-${n}" title="${convictionLabel(n)}">${convictionStars(n)} ${convictionLabel(n)}</span>`;}

function myGuysStarsHTML(score,cls=""){const n=normalizedConviction(score);return `<span class="my-guys-stars ${cls}" role="radiogroup" aria-label="My Guys score">${[1,2,3,4,5].map(i=>`<button type="button" class="my-guys-star ${i<=n?'filled':''}" data-my-guys="${i}" data-level="${n}" title="${i}★ — ${convictionLabel(i)}" aria-label="${i} stars">★</button>`).join('')}</span>`;}

function playerEdge(base,ev=getPersonalEvaluation(base?.name)){const your=Number(ev?.value||0),market=Number(base?consensusPriceFor(base):0);return your&&market?Math.round(your-market):0;}

function edgeHTML(edge){const cls=edge>0?"edge-positive":edge<0?"edge-negative":"edge-neutral";return `<span class="${cls}" title="Your Value minus Market Value">${edge>0?"+":""}${edge||0}</span>`;}

function renderConvictionPicker(score=3){const n=normalizedConviction(score),box=$("evalConviction");if(!box)return;box.dataset.value=String(n);box.innerHTML=[1,2,3,4,5].map(i=>`<button type="button" class="conviction-star ${i<=n?'active':''}" data-conviction="${i}" role="radio" aria-checked="${i===n}" title="${i} stars — ${convictionLabel(i)}">★</button>`).join('')+`<span class="conviction-copy">${n}★ · ${convictionLabel(n)}</span>`;}

function neutralPlayer(base){ return {...base,tier:"UNRANKED",pressure:1,action:"WATCH",buyLow:0,buyHigh:0,fairLow:0,fairHigh:0,overpay:0,pivots:"",budgetPivot:"Build your personal board in Draft Prep.",audit:"MARKET",notes:""}; }

function effectivePlayer(base){
  if(!base) return null;
  const ev=getPersonalEvaluation(base.name);
  if(!ev) return profileMode==="clean" ? neutralPlayer(base) : base;
  const value=Math.max(0,Number(ev.value||0));
  const hard=Math.max(value,Number(ev.hardStop||0));
  let action=base.action;
  const conviction=normalizedConviction(ev.conviction);
  if(ev.avoid||conviction===1) action="AVOID";
  else if(ev.flagPlant||conviction===5) action="ATTACK";
  else if(ev.favorite||ev.sleeper||conviction===4) action="VALUE";
  return {...base,
    tier:ev.tier||base.tier,
    action,
    buyLow:value?Math.max(1,value-2):base.buyLow,
    buyHigh:value||base.buyHigh,
    fairLow:value?value+1:base.fairLow,
    fairHigh:hard||base.fairHigh,
    overpay:hard?hard+1:base.overpay,
    personalEvaluation:{...ev,conviction},
    notes:ev.notes||base.notes
  };
}

function evaluationTags(ev){
  if(!ev) return [];
  return [[ev.flagPlant,"FLAG PLANT"],[ev.favorite,"FAVORITE"],[ev.sleeper,"SLEEPER"],[ev.avoid,"AVOID"]].filter(x=>x[0]).map(x=>x[1]);
}

function dossierHTML(base){
  if(!base) return '<div class="dossier-notes">Select a player to open the dossier.</div>';
  const ev=getPersonalEvaluation(base.name);
  const sale=saleForPlayer(base.name);
  const tags=evaluationTags(ev);
  const market=marketValueFor(base);
  const status=sale?`${sale.winner==="me"?"YOUR TEAM":"SOLD"} • ${money(sale.price)}`:"UNSOLD";
  const statusClass=sale?'sold':'unsold';
  return `<div class="player-dossier-title"><div><strong>${base.name}</strong><small>${base.pos}${base.team?" • "+base.team:""}</small>${tags.length?`<div class="dossier-tags">${tags.map(t=>`<span class="dossier-tag ${t==="AVOID"?"avoid":""}">${t}</span>`).join("")}</div>`:""}</div><span class="dossier-status ${statusClass}">${status}</span></div>
  <div class="dossier-sections">
    <div class="dossier-section"><h4>YOUR BOARD</h4>
      <div class="dossier-stat"><span>Your Value</span><strong>${ev&&ev.value?money(ev.value):"Not set"}</strong></div>
      <div class="dossier-stat"><span>Hard Stop</span><strong>${ev&&ev.hardStop?money(ev.hardStop):"Not set"}</strong></div>
      <div class="dossier-stat"><span>Personal Tier</span><strong>${ev&&ev.tier?ev.tier:"Not set"}</strong></div>
      <div class="dossier-my-guys">${ev?convictionBadge(ev.conviction):convictionBadge(3)} ${ev&&ev.value&&market?`<span class="edge-chip ${playerEdge(base,ev)>0?'edge-positive':playerEdge(base,ev)<0?'edge-negative':'edge-neutral'}">EDGE ${playerEdge(base,ev)>0?'+':''}${playerEdge(base,ev)}</span>`:''}</div>
    </div>
    <div class="dossier-section"><h4>MARKET REFERENCE</h4>
      <div class="dossier-stat"><span>Market Value</span><strong>${market?money(market):"Not available"}</strong></div>
      <div class="dossier-stat"><span>Market Tier</span><strong>${base.tier&&base.tier!=="UNRANKED"?base.tier:"Unranked"}</strong></div>
      <div class="dossier-stat"><span>War Room Grade</span><strong>${base.action||"WATCH"}</strong></div>
    </div>
  </div>
  <div class="dossier-notes"><strong style="color:var(--green)">NOTES</strong><br>${ev&&ev.notes?ev.notes:(base.notes||"No notes saved yet.")}</div>`;
}

function renderScoutingDossier(base){ const el=$("scoutingDossierPreview"); if(el) el.innerHTML=dossierHTML(base); }

function renderWarDossier(base){
  const ev=base?getPersonalEvaluation(base.name):null, sale=base?saleForPlayer(base.name):null, market=marketValueFor(base);
  $("warYourValue").textContent=ev&&ev.value?money(ev.value):"—";
  $("warHardStop").textContent=ev&&ev.hardStop?money(ev.hardStop):"—";
  $("warMarketValue").textContent=market?money(market):"—";
  $("warSaleStatus").textContent=sale?`${sale.winner==="me"?"YOURS":"SOLD"} ${money(sale.price)}`:"UNSOLD";
  $("warDossierNotes").textContent=(ev&&ev.notes)||(base&&base.notes)||"";
}

function selectScoutingPlayer(name){
  const base=byName[name]; if(!base) return;
  scoutingSelectedName=name;
  const ev=getPersonalEvaluation(name)||{};
  $("scoutingSearch").value=name;
  $("scoutingSuggestions").style.display="none";
  renderScoutingDossier(base);
  $("scoutingEditorEmpty").classList.add("hidden"); $("scoutingEditorFields").classList.remove("hidden");
  $("evalRank").value=ev.rank??""; $("evalValue").value=ev.value??""; $("evalHardStop").value=ev.hardStop??""; $("evalTier").value=ev.tier??"";
  renderConvictionPicker(ev.conviction??3);
  $("evalFlagPlant").checked=!!ev.flagPlant; $("evalSleeper").checked=!!ev.sleeper; $("evalAvoid").checked=!!ev.avoid; $("evalNotes").value=ev.notes||"";
}

function renderPersonalBoard(){
  const rows=Object.values(personalEvaluations).sort((a,b)=>((Number(a.rank)||9999)-(Number(b.rank)||9999))||(a.name||'').localeCompare(b.name||'')).slice(0,75);
  const box=$('personalBoardList');if(!box)return;
  if(!rows.length){box.innerHTML='<div class="personal-empty">No personal evaluations saved yet.</div>';renderMyGuysGallery();return;}
  box.innerHTML=`<div class="personal-board-head conviction-head"><span>#</span><span>PLAYER</span><span>TIER</span><span>VALUE</span><span>STOP</span><span>MY GUYS</span><span>EDGE</span></div>`+rows.map(ev=>{const p=byName[ev.name]||{};const tags=evaluationTags(ev);return `<div class="personal-row with-conviction" data-personal-name="${String(ev.name).replace(/"/g,'&quot;')}"><div class="personal-rank">${ev.rank?'#'+ev.rank:'—'}</div><div class="personal-name"><strong>${ev.name}</strong><small>${p.pos||''}${p.team?' • '+p.team:''}</small></div><div class="personal-tier">${ev.tier||'—'}</div><div class="personal-money">${ev.value?money(ev.value):'—'}</div><div class="personal-money">${ev.hardStop?money(ev.hardStop):'—'}</div><div>${convictionBadge(ev.conviction)}</div><div class="bulk-edge">${edgeHTML(playerEdge(p,ev))}</div>${tags.length?`<div class="personal-tags">${tags.join(' · ')}</div>`:''}</div>`;}).join('');
  renderMyGuysGallery();
}

function whyItems(ev,base){const raw=String(ev?.notes||base?.notes||"").split(/[\n•;]+/).map(x=>x.trim()).filter(Boolean);const items=raw.slice(0,4);if(!items.length){const edge=playerEdge(base,ev);items.push(convictionLabel(ev?.conviction||3));if(edge)items.push(`${edge>0?'+':''}${edge} Edge vs market`);if(ev?.tier)items.push(`Personal tier ${ev.tier}`);if(ev?.hardStop)items.push(`Disciplined stop at ${money(ev.hardStop)}`);}return items.slice(0,4);}

function renderMyGuysGallery(){
  const box=$("myGuysGallery");if(!box)return;const all=Object.values(personalEvaluations),counts={1:0,2:0,3:0,4:0,5:0};all.forEach(ev=>counts[normalizedConviction(ev.conviction)]++);const core=all.filter(ev=>normalizedConviction(ev.conviction)>=4),positionCounts={QB:0,RB:0,WR:0,TE:0};core.forEach(ev=>{const pos=(byName[ev.name]||{}).pos;if(positionCounts[pos]!==undefined)positionCounts[pos]++;});const coverageMax=Math.max(1,...Object.values(positionCounts));
  const summary=`<div class="my-guys-dashboard"><div class="my-guys-summary">${[5,4,3,2,1].map(level=>`<button type="button" class="my-guys-summary-btn level-${level} ${myGuysTierFilter===level?'active':''}" data-my-guys-filter="${level}"><span class="summary-stars">${convictionStars(level)}</span><span class="summary-count">${counts[level]}</span><span class="summary-label">${convictionLabel(level)}</span></button>`).join('')}</div><div class="my-guys-coverage"><div class="my-guys-coverage-head"><span>POSITION COVERAGE</span><small>4–5★ TARGETS</small></div><div class="my-guys-coverage-grid">${['QB','RB','WR','TE'].map(pos=>`<div class="coverage-item"><div class="coverage-line"><span>${pos}</span><span>${positionCounts[pos]}</span></div><div class="coverage-track"><div class="coverage-fill" style="width:${Math.round(positionCounts[pos]/coverageMax*100)}%"></div></div></div>`).join('')}</div></div></div>`;
  const groups=[5,4,3,2,1].filter(level=>!myGuysTierFilter||level===myGuysTierFilter).map(level=>({level,rows:all.filter(ev=>normalizedConviction(ev.conviction)===level).sort((a,b)=>(Number(a.rank)||9999)-(Number(b.rank)||9999))})).filter(g=>g.rows.length);if(!all.length){box.innerHTML=summary+'<div class="personal-empty">Rate players in My Guys to build this view.</div>';return;}if(!groups.length){box.innerHTML=summary+'<div class="my-guys-empty-filter">No players are currently rated in this tier.</div>';return;}
  box.innerHTML=summary+groups.map(g=>`<section class="my-guys-tier level-${g.level}"><div class="my-guys-tier-head"><span>${convictionStars(g.level)} ${convictionLabel(g.level)}</span><span>${g.rows.length} PLAYER${g.rows.length===1?'':'S'}</span></div><div class="my-guys-tier-list">${g.rows.map(ev=>{const p=byName[ev.name]||{},edge=playerEdge(p,ev),status=playerDraftStatus(ev.name),why=whyItems(ev,p);return `<div class="my-guy-card level-${g.level}" data-my-guy-name="${esc(ev.name)}"><span class="my-guy-status ${status.cls}">${status.label}</span><strong>${esc(ev.name)}</strong><small>${esc(p.pos||'')}${p.team?' • '+esc(p.team):''}</small><div class="my-guy-money"><span><small>YOUR VALUE</small>${ev.value?money(ev.value):'—'}</span><span><small>MAX BID</small>${ev.hardStop?money(ev.hardStop):'—'}</span><span class="${edge>0?'edge-positive':edge<0?'edge-negative':'edge-neutral'}"><small>EDGE</small>${edge>0?'+':''}${edge}</span></div><div class="my-guy-why"><button type="button" class="why-toggle" data-why-toggle>WHY?</button><div class="why-drawer"><ul>${why.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div></div>`}).join('')}</div></section>`).join('');
}

function bulkFilteredPlayers(){
  const q=($("bulkSearch")?.value||"").toLowerCase().trim();
  const pos=$("bulkPosition")?.value||"ALL";
  const filter=$("bulkBoardFilter")?.value||"ALL";
  const sort=$("bulkSort")?.value||"NAME";
  let rows=PLAYERS.filter(p=>(!q||playerMatchKey(p.name).includes(q))&&(pos==="ALL"||p.pos===pos));
  rows=rows.filter(p=>{const ev=getPersonalEvaluation(p.name);if(filter==="PERSONALIZED")return !!ev;if(filter==="UNRANKED")return !ev;if(filter==="TARGETS")return !!(ev&&(normalizedConviction(ev.conviction)!==3||ev.flagPlant||ev.sleeper||ev.avoid));if(filter==="HIGH_CONVICTION")return !!ev&&normalizedConviction(ev.conviction)>=4;if(filter==="LOW_CONVICTION")return !!ev&&normalizedConviction(ev.conviction)<=2;return true;});
  rows.sort((a,b)=>{const ea=getPersonalEvaluation(a.name)||{},eb=getPersonalEvaluation(b.name)||{};if(sort==="RANK")return (Number(ea.rank)||9999)-(Number(eb.rank)||9999)||a.name.localeCompare(b.name);if(sort==="POSITION")return a.pos.localeCompare(b.pos)||a.name.localeCompare(b.name);if(sort==="VALUE")return (Number(eb.value)||0)-(Number(ea.value)||0)||a.name.localeCompare(b.name);if(sort==="CONVICTION")return normalizedConviction(eb.conviction)-normalizedConviction(ea.conviction)||(Number(ea.rank)||9999)-(Number(eb.rank)||9999)||a.name.localeCompare(b.name);if(sort==="CONSENSUS_PRICE")return consensusPriceFor(b)-consensusPriceFor(a)||a.name.localeCompare(b.name);if(sort==="ADP")return (adpFor(a)||99999)-(adpFor(b)||99999)||a.name.localeCompare(b.name);return a.name.localeCompare(b.name);});
  return rows.slice(0,500);
}

function renderBulkBoard(){
  const body=$("bulkBoardBody"); if(!body)return;
  const rows=bulkFilteredPlayers();
  body.innerHTML=rows.map(p=>{const ev=getPersonalEvaluation(p.name)||{};const key=playerKey(p.name);const ck=bulkSelected.has(key)?"checked":"";return `<tr data-bulk-player="${esc(p.name)}"><td class="bulk-check"><input class="bulk-select" type="checkbox" ${ck}></td><td class="bulk-player"><strong>${esc(p.name)}</strong><span>${esc(p.pos)}${p.team?" • "+esc(p.team):""}</span></td><td><strong>${consensusPriceFor(p)?money(consensusPriceFor(p)):"—"}</strong></td><td><strong>${adpFor(p)||"—"}</strong></td><td><input class="bulk-rank" type="number" min="1" value="${ev.rank||""}"></td><td><input class="bulk-tier" type="text" value="${esc(ev.tier||"")}"></td><td><input class="bulk-value" type="number" min="0" value="${ev.value||""}"></td><td><input class="bulk-stop" type="number" min="0" value="${ev.hardStop||""}"></td><td class="bulk-my-guys" data-score="${normalizedConviction(ev.conviction)}">${myGuysStarsHTML(ev.conviction,"bulk-stars")}</td><td class="bulk-edge">${edgeHTML(playerEdge(p,ev))}</td><td class="bulk-flag"><input class="bulk-flagplant" type="checkbox" ${ev.flagPlant?"checked":""}></td><td class="bulk-flag"><input class="bulk-sleeper" type="checkbox" ${ev.sleeper?"checked":""}></td><td class="bulk-flag"><input class="bulk-avoid" type="checkbox" ${ev.avoid?"checked":""}></td><td><input class="bulk-notes" type="text" style="width:220px" value="${esc(ev.notes||"")}" placeholder="Quick note"></td></tr>`}).join("");
  $("bulkCount").textContent=`${rows.length} players shown • ${bulkSelected.size} selected`;
  $("bulkSelectAll").checked=rows.length>0&&rows.every(p=>bulkSelected.has(playerKey(p.name)));
}

function saveBulkRow(tr){
  if(window.__warRoomResetting)return;
  const name=tr.dataset.bulkPlayer, old=getPersonalEvaluation(name)||{};
  const ev={name,conviction:normalizedConviction(tr.querySelector('.bulk-my-guys')?.dataset.score||3),rank:Math.max(0,Number(tr.querySelector('.bulk-rank').value||0)),tier:tr.querySelector('.bulk-tier').value.trim(),value:Math.max(0,Number(tr.querySelector('.bulk-value').value||0)),hardStop:Math.max(0,Number(tr.querySelector('.bulk-stop').value||0)),favorite:false,flagPlant:tr.querySelector('.bulk-flagplant').checked,sleeper:tr.querySelector('.bulk-sleeper').checked,avoid:tr.querySelector('.bulk-avoid').checked,notes:tr.querySelector('.bulk-notes').value.trim(),updatedAt:new Date().toISOString()};
  if(ev.value&&ev.hardStop&&ev.hardStop<ev.value){tr.querySelector('.bulk-stop').value=old.hardStop||"";return alert(`Hard Stop cannot be below Your Value for ${name}.`);}
  const meaningful=ev.rank||ev.tier||ev.value||ev.hardStop||ev.conviction!==3||normalizedConviction(ev.conviction)!==3||ev.flagPlant||ev.sleeper||ev.avoid||ev.notes;
  if(meaningful)personalEvaluations[playerKey(name)]=ev;else delete personalEvaluations[playerKey(name)];
  savePersonalEvaluations(); renderPersonalBoard(); renderCore();
  $("bulkSaveState").textContent="Saved"; clearTimeout(window.bulkSaveTimer); window.bulkSaveTimer=setTimeout(()=>$("bulkSaveState").textContent="",900);
}

function personalBoardReport(){
  const rows=Object.values(personalEvaluations||{}).sort((a,b)=>(a.tier||"99").localeCompare(b.tier||"99")||(a.name||"").localeCompare(b.name||""));
  const bodyRows=rows.map(ev=>{const tags=evaluationTags(ev).map(t=>`<span class="tag">${esc(t)}</span>`).join("");return `<tr><td><strong>${esc(ev.name)}</strong><div>${tags}</div></td><td>${esc(byName[ev.name]?.pos||"")}</td><td>${ev.value?"$"+Number(ev.value):"—"}</td><td>${ev.hardStop?"$"+Number(ev.hardStop):"—"}</td><td>${esc(ev.tier||"—")}</td><td class="note">${esc(ev.notes||"")}</td></tr>`}).join("")||'<tr><td colspan="6">No personal evaluations saved.</td></tr>';
  printableShell(`${leagueConfig.leagueName||"War Room"} — Personal Board`,`Private scouting board • ${rows.length} evaluated players`, `<table><thead><tr><th>Player</th><th>Pos</th><th>Your Value</th><th>Hard Stop</th><th>Tier</th><th>My Guys</th><th>Edge</th><th>Notes</th></tr></thead><tbody>${bodyRows}</tbody></table>`);
  setResetStatus("Personal board opened. Choose Print / Save PDF.");
}
