/* ---------- Cloakroom UI ---------- */
const $=id=>document.getElementById(id);
const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let scan=null,userChecks=new Map(),manual=[],columns=null,lastInput='',rFile=null,timer;
// the visit the Check in screen is filling, what it last disguised, and where the input came from
let openVisit=null,lastDisguised='',lastMasked='',source={kind:'text',name:''},pickedVisit=null;

if(TAURI&&/Mac/.test(navigator.userAgent))document.documentElement.classList.add('mac');

/* ---------- small helpers: modal, toast, files ---------- */
function ask(msg,okLabel){
  return new Promise(res=>{
    $('modalMsg').textContent=msg;$('modalYes').textContent=okLabel||'OK';$('modal').hidden=false;$('modalYes').focus();
    const done=v=>{$('modal').hidden=true;$('modalYes').onclick=$('modalNo').onclick=null;res(v);};
    $('modalYes').onclick=()=>done(true);$('modalNo').onclick=()=>done(false);
  });
}
let toastTimer;
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
async function saveFile(name,contents){
  if(TAURI){
    try{const ok=await invoke('save_text_file',{suggestedName:name,contents});if(ok)toast('Saved');}
    catch(e){toast('Could not save: '+e);}
    return;
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([contents],{type:'text/plain;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function readFile(f,cb){const r=new FileReader();r.onload=()=>cb(r.result,f.name);r.readAsText(f);}
function dropTarget(el,cb){
  el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('dragover');});
  el.addEventListener('dragleave',()=>el.classList.remove('dragover'));
  el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('dragover');const f=e.dataTransfer.files[0];if(f)readFile(f,cb);});
}
async function copyText(text,fallbackEl){
  if(!text)return;
  try{await navigator.clipboard.writeText(text);}catch(e){if(fallbackEl){fallbackEl.select();document.execCommand('copy');}}
  toast('Copied');
}
const copy=id=>copyText($(id).value,$(id));
const when=ts=>new Date(ts).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

/* ---------- the parade ---------- */
const stageIn=Parade.stage($('maskStage'),{left:'plain',right:'costume'});
const stageOut=Parade.stage($('restoreStage'),{left:'costume',right:'plain'});
addEventListener('resize',()=>{stageIn.relayout();stageOut.relayout();});

/* ---------- navigation ---------- */
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>{x.classList.toggle('on',x===b);if(x===b)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===b.dataset.tab));
  if(b.dataset.tab==='key')renderVault();
  if(b.dataset.tab==='restore')refreshVisits();
  stageIn.relayout();stageOut.relayout();
});

/* ---------- check in (mask) ---------- */
$('addType').innerHTML=TYPES.map(t=>`<option value="${t}">${TYPE_LABEL[t]}</option>`).join('');
// one person per detail that will get a ticket
function crowd(){
  if(!scan)return 0;
  let n=scan.findings.filter(isChecked).length;
  if(scan.table)n+=scan.columns.filter(c=>c.on).reduce((a,c)=>a+c.distinct,0);
  return n;
}
function closeVisit(){
  openVisit=null;lastDisguised='';lastMasked='';
  $('output').value='';$('visitInfo').textContent='';$('maskInfo').textContent='';$('maskWarn').innerHTML='';
  csvButtons(false);stageIn.clearRight();
}
function rescan(join){
  const text=$('input').value;
  if(text!==lastInput&&!parseTable(text))columns=null;
  if(parseTable(text)&&(!columns||text.split('\n')[0]!==lastInput.split('\n')[0]))columns=null;
  lastInput=text;
  // new text in the box means a new visit; an edit of the same text keeps the old one and its tickets
  if(openVisit&&lastDisguised){const a=lastDisguised.trim().slice(0,30),b=text.trim().slice(0,30);
    if(!text.trim()||(!text.includes(a)&&!lastDisguised.includes(b)))closeVisit();}
  if(!text.trim()){scan=null;source={kind:'text',name:''};$('findings').innerHTML='<div class="empty">Nothing yet.</div>';$('columns').innerHTML='';$('modeInfo').textContent='';stageIn.setLeft(0);return;}
  scan=collect(text,{manual,columns});
  columns=scan.columns;
  $('modeInfo').textContent=scan.table?`Table, ${scan.table.filter(r=>r.some(c=>c.trim())).length-1} rows by ${scan.table[0].length} columns`:'Text';
  renderColumns();renderFindings();
  if(!(openVisit&&text===lastDisguised&&!join))stageIn.setLeft(crowd(),{join});
}
function renderColumns(){
  if(!scan||!scan.table){$('columns').innerHTML='';return;}
  $('columns').innerHTML='<div class="find"><div class="grp">Columns</div>'+scan.columns.map(c=>
    `<label><input type="checkbox" data-col="${c.i}" ${c.on?'checked':''} ${c.type?'':'disabled'}>
     <span><b>${h(c.header)}</b> <span class="meta">${c.type?TYPE_LABEL[c.type]:'checked cell by cell'}</span></span>
     <span class="m">${c.distinct} values</span></label>`).join('')+'</div>';
  $('columns').querySelectorAll('input').forEach(i=>i.onchange=()=>{columns[+i.dataset.col].on=i.checked;rescan(true);});
}
function isChecked(f){return userChecks.has(f.key)?userChecks.get(f.key):f.checked;}
function renderFindings(){
  const sure=scan.findings.filter(f=>!f.maybe),maybe=scan.findings.filter(f=>f.maybe);
  const row=f=>`<label><input type="checkbox" data-k="${h(f.key)}" ${isChecked(f)?'checked':''}><span class="v">${h(f.value)}</span><span class="m">${h(f.label)}${f.count>1?', ×'+f.count:''}</span></label>`;
  let html='';
  TYPES.forEach(t=>{const g=sure.filter(f=>f.type===t);if(g.length)html+=`<div class="grp">${TYPE_LABEL[t]} (${g.length})</div>`+g.map(row).join('');});
  if(maybe.length)html+=`<details ${scan.table?'':'open'}><summary>Possible names (${maybe.length})</summary>${maybe.map(row).join('')}</details>`;
  if(!html)html='<div class="empty">Nothing found.</div>';
  $('findings').innerHTML=html;
  $('findings').querySelectorAll('input').forEach(i=>i.onchange=()=>{userChecks.set(i.dataset.k,i.checked);stageIn.setLeft(crowd(),{join:true});});
}
$('input').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(rescan,250);});
$('clearIn').onclick=()=>{$('input').value='';rescan();};
$('addBtn').onclick=()=>{const v=$('addVal').value.trim();if(!v)return;manual.push({value:v,type:$('addType').value});userChecks.delete(norm(v));$('addVal').value='';rescan(true);};
$('addVal').onkeydown=e=>{if(e.key==='Enter')$('addBtn').click();};

function parseCsv(s){const rows=[];let row=[],f='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'){if(s[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}if(f||row.length){row.push(f);rows.push(row);}return rows;}
const csvToTsv=s=>parseCsv(s).map(r=>r.map(x=>x.replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n');
const csvCell=v=>/[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
const tsvToCsv=s=>s.split('\n').map(r=>r.split('\t').map(csvCell).join(',')).join('\n');
const loadInput=(text,name)=>{closeVisit();$('input').value=/\.csv$/i.test(name)?csvToTsv(text):text;rescan();source={kind:/\.csv$/i.test(name)?'csv':'text',name};};
$('file').onchange=e=>{const f=e.target.files[0];if(f)readFile(f,loadInput);e.target.value='';};
dropTarget($('input'),loadInput);

function csvButtons(on){$('copyCsv').hidden=$('saveCsv').hidden=!on;}
const NOTE='(Note: placeholders in square brackets, like [PERSON_#] or [EMAIL_#], stand in for private details. Keep them exactly as written, brackets included, and don\'t guess what they stand for.)\n\n';
$('maskBtn').onclick=()=>{
  if(purgeExpired()&&openVisit&&!state.visits[openVisit])openVisit=null;
  rescan();if(!scan)return;
  if(!openVisit||!state.visits[openVisit])openVisit=newVisit(scan.table?(source.kind==='csv'?'csv':'table'):'text',source.name).id;
  const v=state.visits[openVisit],text=$('input').value;
  stageIn.setLeft(crowd());
  const keys=new Set(scan.findings.filter(isChecked).map(f=>f.key));
  const r=mask(text,scan,keys,v);
  lastDisguised=text;lastMasked=r.out;
  $('output').value=($('addNote').checked?NOTE:'')+r.out;
  const total=Object.values(r.stats).reduce((a,b)=>a+b,0);
  $('visitInfo').textContent=`visit ${v.n}`;
  $('maskInfo').textContent=total?`${total} ticket${total===1?'':'s'}`:'Nothing replaced';
  $('maskWarn').innerHTML=(r.skipped?`<div class="note">${r.skipped} unticked item${r.skipped>1?'s':''} still in your text.</div>`:'')
   +'<div class="note">Read it before sending. Context can still identify someone, and names Cloakroom has never seen can slip through.</div>';
  csvButtons(!!scan.table);
  stageIn.go();
  refreshStatus();refreshVisits();
};
$('copyOut').onclick=()=>copy('output');
$('copyCsv').onclick=()=>copyText(tsvToCsv(lastMasked));
$('saveCsv').onclick=()=>saveFile(source.name?source.name.replace(/(\.[^.]+)?$/,'-disguised.csv'):'disguised.csv',tsvToCsv(lastMasked));

/* ---------- pick up (restore) ---------- */
function refreshVisits(){
  const sel=$('rVisit'),keep=sel.value;
  sel.innerHTML='<option value="">Match visit automatically</option>'+visitList().map(v=>
    `<option value="${h(v.id)}">Visit ${v.n}, ${h(when(v.created))}, ${Object.keys(v.tokens).length} tickets</option>`).join('');
  sel.value=state.visits[keep]?keep:'';
}
function doRestore(){
  if(purgeExpired()){refreshStatus();refreshVisits();}
  const src=$('rin').value;if(!src.trim())return;
  const m=matchVisit(src),chosen=$('rVisit').value&&state.visits[$('rVisit').value];
  const v=chosen||m.best;let r;
  if(rFile&&rFile.csv){ // cell by cell, so a real detail containing a comma stays in one cell
    let n=0;const unk=new Set();
    const text=parseCsv(src).map(row=>row.map(c=>{const x=restore(c,v);n+=x.n;x.unknown.forEach(u=>unk.add(u));return csvCell(x.text);}).join(',')).join('\n');
    r={text,n,unknown:[...unk]};
  } else r=restore(src,v);
  pickedVisit=v?v.id:null;
  $('rout').value=r.text;$('saveR').disabled=!r.text;$('donePanel').style.display=v?'flex':'none';
  $('rInfo').textContent=v?`${r.n} ticket${r.n===1?'':'s'}, visit ${v.n}`:'No visit matches';
  const also=!chosen&&m.also.length?`<div class="note">This reply also fits visit ${m.also.map(x=>x.n).join(', ')}. Choose it above if that’s the one.</div>`:'';
  $('rWarn').innerHTML=(r.unknown.length?`<div class="note">No ticket on file, left as is: ${r.unknown.map(h).join(', ')}</div>`:(r.n?'<div class="ok">Every ticket matched.</div>':''))+also;
  stageOut.setLeft(m.tickets);
  stageOut.go({stay:r.unknown.length});
}
$('restoreBtn').onclick=doRestore;
$('rVisit').onchange=()=>{if($('rout').value)doRestore();};
$('rin').addEventListener('input',()=>{
  if(rFile){rFile=null;$('rFileInfo').textContent='';}
  clearTimeout(timer);timer=setTimeout(()=>stageOut.setLeft(matchVisit($('rin').value).tickets),250);
});
const loadReply=(text,name)=>{$('rin').value=text;rFile={name,csv:/\.csv$/i.test(name)};$('rFileInfo').textContent=name;stageOut.setLeft(matchVisit(text).tickets);doRestore();};
$('rfile').onchange=e=>{const f=e.target.files[0];if(f)readFile(f,loadReply);e.target.value='';};
dropTarget($('rin'),loadReply);
$('copyR').onclick=()=>copy('rout');
$('saveR').onclick=()=>{
  const name=rFile?rFile.name.replace(/(\.[^.]+)?$/,m=>'-restored'+(m||'.txt')):(/\t/.test($('rout').value)?'restored.tsv':'restored.txt');
  saveFile(name,$('rout').value);
};
function clearPickUp(){rFile=null;pickedVisit=null;$('rFileInfo').textContent='';$('saveR').disabled=true;$('rin').value='';$('rout').value='';$('rInfo').textContent='';$('rWarn').innerHTML='';$('donePanel').style.display='none';}
$('clearR').onclick=()=>{clearPickUp();stageOut.clear();};

/* ---------- watch lists ---------- */
function listCount(){const c=s=>s.split('\n').filter(l=>l.trim()).length;$('listInfo').textContent=`${c(state.people)} people, ${c(state.orgs)} organizations`;}
['people','orgs'].forEach(id=>$(id).addEventListener('input',()=>{state[id]=$(id).value;saveState();listCount();clearTimeout(timer);timer=setTimeout(rescan,400);}));

/* ---------- visits and tickets (key) ---------- */
function refreshStatus(){
  const nv=Object.keys(state.visits).length,nt=ticketCount();
  $('ticketCount').textContent=nv?`${nv} visit${nv===1?'':'s'}, ${nt} ticket${nt===1?'':'s'}`:'Nothing on file';
  $('encPill').classList.toggle('bad',!storageOK);
  $('encLabel').textContent=storageOK?(TAURI?'Encrypted on this computer':'Saved in this browser'):'Storage problem';
  $('storeWarn').innerHTML=storageOK?'':`<div class="note">Cloakroom couldn't read or save its tickets (${h(storageError)}). Erase all starts fresh.</div>`;
}
function renderVault(){
  const q=norm($('vq').value||'');let body='';
  for(const v of visitList()){
    const rows=Object.entries(v.tokens).filter(([t,e])=>!q||t.toLowerCase().includes(q)||norm(e.value).includes(q));
    if(q&&!rows.length)continue;
    body+=`<tbody><tr class="visit"><th colspan="2">Visit ${v.n}${v.name?', '+h(v.name):''}</th><td class="meta">${h(when(v.used||v.created))}</td><td><button type="button" class="x" data-v="${h(v.id)}" aria-label="Erase visit ${v.n}" title="Erase visit">✕</button></td></tr>`
      +rows.map(([t,e])=>`<tr><td class="t"><span class="chip">[${h(t)}]</span></td><td colspan="2">${h(e.value)}</td><td><button type="button" class="x" data-v="${h(v.id)}" data-t="${h(t)}" aria-label="Remove ${h(t)}" title="Remove">✕</button></td></tr>`).join('')+'</tbody>';
  }
  $('vault').innerHTML=body?'<thead><tr><th>Ticket</th><th>Real detail</th><th>Last used</th><th><span class="visually-hidden">Remove</span></th></tr></thead>'+body:'<tr><td class="meta">No visits yet.</td></tr>';
  $('vault').querySelectorAll('button').forEach(b=>b.onclick=async()=>{
    const v=state.visits[b.dataset.v];if(!v)return;
    if(b.dataset.t){
      const t=b.dataset.t;if(!await ask(`Remove [${t}] from visit ${v.n}? Replies that use it can no longer be unmasked.`,'Remove'))return;
      delete v.index[norm(v.tokens[t].value)];delete v.tokens[t];
    } else {
      if(!await ask(`Erase visit ${v.n} and its ${Object.keys(v.tokens).length} tickets? Its replies can no longer be unmasked.`,'Erase visit'))return;
      if(openVisit===v.id)closeVisit();
      delete state.visits[v.id];
    }
    saveState();renderVault();rescan();refreshVisits();
  });
  refreshStatus();
}
$('vq').oninput=renderVault;
$('exportBtn').onclick=()=>saveFile('cloakroom-key-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,1));
$('importFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;readFile(f,txt=>{try{
  const raw=JSON.parse(txt);if(!raw||!(raw.visits||raw.tokens))throw 0;
  const s=upgradeState(raw);
  // a visit already here (same start time and tickets) is skipped; the rest join under new numbers
  const sig=v=>v.created+':'+Object.keys(v.tokens).sort().join(',');
  const have=new Set(Object.values(state.visits).map(sig));let added=0;
  for(const v of Object.values(s.visits)){
    if(have.has(sig(v)))continue;
    const n=++state.visitSeq,id='v'+n+'-'+Date.now().toString(36);
    state.visits[id]=Object.assign({},v,{id,n});added++;
  }
  const merge=(a,b)=>[...new Set((a+'\n'+(b||'')).split('\n').map(x=>x.trim()).filter(Boolean))].join('\n');
  state.people=merge(state.people,s.people);state.orgs=merge(state.orgs,s.orgs);
  $('people').value=state.people;$('orgs').value=state.orgs;saveState();listCount();renderVault();refreshVisits();
  toast(added?`Imported ${added} visit${added===1?'':'s'}`:'Nothing new in that key');
}catch(err){toast('That file is not a Cloakroom key');}});};

async function eraseAll(lists){
  const keep={people:state.people,orgs:state.orgs,retentionDays:state.retentionDays};
  await wipeStorage();
  state=blankState();state.retentionDays=keep.retentionDays;
  if(!lists){state.people=keep.people;state.orgs=keep.orgs;}
  await flushState();
  ['input','addVal','vq'].forEach(id=>$(id).value='');
  manual=[];userChecks=new Map();columns=null;
  closeVisit();clearPickUp();
  $('people').value=state.people;$('orgs').value=state.orgs;
  try{await navigator.clipboard.writeText('');}catch(e){}
  listCount();renderVault();rescan();refreshVisits();
}
$('doneBtn').onclick=async()=>{
  if($('doneLists').checked)await eraseAll(true);
  else{
    if(pickedVisit){if(openVisit===pickedVisit)closeVisit();eraseVisit(pickedVisit);}
    clearPickUp();
    try{await navigator.clipboard.writeText('');}catch(e){}
    renderVault();refreshVisits();
  }
  stageOut.leave();
  $('rWarn').innerHTML='<div class="ok">Erased, clipboard included.</div>';toast($('doneLists').checked?'Everything erased':'Visit erased');
};
$('retention').onchange=()=>{state.retentionDays=+$('retention').value;purgeExpired();renderVault();refreshVisits();};
$('wipeBtn').onclick=async()=>{if(!await ask('Erase every visit and both watch lists? Replies you haven\'t unmasked yet can no longer be restored.','Erase all'))return;await eraseAll(true);stageIn.clear();stageOut.clear();toast('Everything erased');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').hidden)$('modalNo').click();});

/* ---------- start ---------- */
(async()=>{
  await initState();
  $('people').value=state.people;$('orgs').value=state.orgs;
  $('retention').value=String(state.retentionDays??3);
  purgeExpired();listCount();renderVault();refreshVisits();
  setInterval(()=>{if(purgeExpired()){renderVault();refreshVisits();}},36e5);
})();
