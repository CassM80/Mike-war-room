// Sprint 24.3 — persistence, backup/import, league setup, and reset helpers.

function save(){ localStorage.setItem("warRoomState",JSON.stringify(state)); }

function downloadFile(filename,content,type="application/octet-stream"){
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),700);
}

function privateBackupPayload(){ return {format:"warroom-backup",version:3,exportedAt:new Date().toISOString(),profileMode,leagueConfig,state,personalEvaluations}; }

function saveWarRoomBackup(){ downloadFile(`war-room-backup-${new Date().toISOString().slice(0,10)}.warroom`,JSON.stringify(privateBackupPayload()),"application/x-warroom"); setResetStatus("Private War Room backup saved."); }

function shareLeague(){
  const safe={format:"warroom-league",version:1,exportedAt:new Date().toISOString(),leagueConfig:{...leagueConfig,teams:(leagueConfig.teams||[]).map(t=>({ownerName:t.ownerName||"",teamName:t.teamName||""}))}};
  downloadFile(`war-room-league-${new Date().toISOString().slice(0,10)}.warroom-league`,JSON.stringify(safe),"application/x-warroom-league"); setResetStatus("Share-safe league file saved — no rankings or notes included.");
}

function setResetStatus(msg){ const el=$("resetStatus"); if(el){el.textContent=msg; setTimeout(()=>{if(el.textContent===msg)el.textContent="";},2500);} }

function updateResetSummary(){ const el=$("resetSummary"); if(!el)return; el.textContent=`${leagueConfig.leagueName||"No league"} • ${state.sales.length} sales • ${Object.keys(personalEvaluations).length} personal evaluations • ${profileMode==="clean"?"Clean shared mode":"Owner starter board active"}`; }

function confirmTyped(message,word="RESET"){ if(!confirm(message))return false; return prompt(`Type ${word} to confirm:`)===word; }

function personalStorageKeys(){
  return Object.keys(localStorage).filter(key=>/personal|evaluation|draftdna|positiondna|dnaapply|strategy.?sprint|starter.?board|core.?target|ranking/i.test(key));
}

function clearPersonalizationInMemory(){
  window.__warRoomResetting=true;
  const removedKeys=personalStorageKeys();
  removedKeys.forEach(key=>localStorage.removeItem(key));
  localStorage.removeItem(PERSONAL_EVAL_KEY);
  localStorage.removeItem("warRoomPositionDNA2");
  localStorage.removeItem("warRoomDNALeagueProfile");
  localStorage.removeItem("warRoomDNAApplyReceipt");
  personalEvaluations={};
  positionDNA={};
  profileMode="clean";
  bulkSelected.clear();
  scoutingSelectedName=null;
  localStorage.setItem(PERSONAL_EVAL_KEY,"{}");
  localStorage.setItem("warRoomPositionDNA2","{}");
  localStorage.setItem(PROFILE_MODE_KEY,"clean");
  const body=$("bulkBoardBody"); if(body) body.innerHTML="";
  const core=$("coreTargets"); if(core) core.innerHTML='<div style="color:var(--muted);padding:12px">No personal targets yet. Complete Draft DNA or add targets in Draft Prep.</div>';
  renderPersonalBoard();
  renderBulkBoard();
  renderCore();
  setSelected(null);
  renderAll();
  updateResetSummary();
  window.__warRoomResetting=false;
  return removedKeys.length;
}

function clearPersonalBoard(){
  const removed=clearPersonalizationInMemory();
  setResetStatus(`Personal board cleared — 0 saved evaluations • ${removed} saved data keys removed.`);
  alert("Personal board cleared. Rankings, tiers, values, flags, notes and Draft DNA were removed.");
}

function importBackupObject(data){
  if(!data||typeof data!=="object"||!data.leagueConfig) throw new Error("Invalid War Room file.");
  if(data.format==="warroom-league"){
    localStorage.setItem("warRoomLeagueConfig",JSON.stringify(data.leagueConfig));
    localStorage.setItem("warRoomState",JSON.stringify(freshDraftState()));
    location.reload(); return;
  }
  if(!data.state) throw new Error("Invalid War Room backup.");
  localStorage.setItem("warRoomState",JSON.stringify(data.state));
  localStorage.setItem("warRoomLeagueConfig",JSON.stringify(data.leagueConfig));
  localStorage.setItem(PERSONAL_EVAL_KEY,JSON.stringify(data.personalEvaluations||{}));
  localStorage.setItem(PROFILE_MODE_KEY,data.profileMode||"owner");
  location.reload();
}

function saveLeagueConfig(){ localStorage.setItem("warRoomLeagueConfig",JSON.stringify(leagueConfig)); }

function ensureTeams(){
  const count=Number(leagueConfig.teamCount||12);
  const existing=Array.isArray(leagueConfig.teams)?leagueConfig.teams:[];
  leagueConfig.teams=Array.from({length:count},(_,i)=>({
    ownerName:existing[i]?.ownerName||"",
    teamName:existing[i]?.teamName||"Team "+(i+1)
  }));
  if(Number(leagueConfig.myTeamIndex)>=count) leagueConfig.myTeamIndex=0;
}

function collectTeamsFromEditor(){
  document.querySelectorAll("[data-team-owner]").forEach(el=>{ const i=Number(el.dataset.teamOwner); leagueConfig.teams[i].ownerName=el.value.trim(); });
  document.querySelectorAll("[data-team-name]").forEach(el=>{ const i=Number(el.dataset.teamName); leagueConfig.teams[i].teamName=el.value.trim()||("Team "+(i+1)); });
}
