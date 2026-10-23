/* ---------- Cloakroom UI ---------- */
const $=id=>document.getElementById(id);
const h=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let scan=null,userChecks=new Map(),manual=[],columns=null,lastInput='',rFile=null,timer;

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
async function copy(id){
  const t=$(id);if(!t.value)return;
  try{await navigator.clipboard.writeText(t.value);}catch(e){t.select();document.execCommand('copy');}
  toast('Copied');
}

/* ---------- navigation ---------- */
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>{x.classList.toggle('on',x===b);if(x===b)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===b.dataset.tab));
  if(b.dataset.tab==='key')renderVault();
});

/* ---------- check in (mask) ---------- */
$('addType').innerHTML=TYPES.map(t=>`<option value="${t}">${TYPE_LABEL[t]}</option>`).join('');
function rescan(){
  const text=$('input').value;
  if(text!==lastInput&&!parseTable(text))columns=null;
  if(parseTable(text)&&(!columns||text.split('\n')[0]!==lastInput.split('\n')[0]))columns=null;
  lastInput=text;
  if(!text.trim()){scan=null;$('findings').innerHTML='<div class="empty">Nothing yet.</div>';$('columns').innerHTML='';$('modeInfo').textContent='';return;}
  scan=collect(text,{manual,columns});
  columns=scan.columns;
  $('modeInfo').textContent=scan.table?`Table, ${scan.table.filter(r=>r.some(c=>c.trim())).length-1} rows by ${scan.table[0].length} columns`:'Text';
  renderColumns();renderFindings();
}
function renderColumns(){
  if(!scan||!scan.table){$('columns').innerHTML='';return;}
  $('columns').innerHTML='<div class="find"><div class="grp">Columns</div>'+scan.columns.map(c=>
    `<label><input type="checkbox" data-col="${c.i}" ${c.on?'checked':''} ${c.type?'':'disabled'}>
     <span><b>${h(c.header)}</b> <span class="meta">${c.type?TYPE_LABEL[c.type]:'checked cell by cell'}</span></span>
     <span class="m">${c.distinct} values</span></label>`).join('')+'</div>';
  $('columns').querySelectorAll('input').forEach(i=>i.onchange=()=>{columns[+i.dataset.col].on=i.checked;rescan();});
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
  $('findings').querySelectorAll('input').forEach(i=>i.onchange=()=>userChecks.set(i.dataset.k,i.checked));
}
$('input').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(rescan,250);});
$('clearIn').onclick=()=>{$('input').value='';$('output').value='';$('maskInfo').textContent='';$('maskWarn').innerHTML='';rescan();};
$('addBtn').onclick=()=>{const v=$('addVal').value.trim();if(!v)return;manual.push({value:v,type:$('addType').value});userChecks.delete(norm(v));$('addVal').value='';rescan();};
$('addVal').onkeydown=e=>{if(e.key==='Enter')$('addBtn').click();};

function parseCsv(s){const rows=[];let row=[],f='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'){if(s[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}if(f||row.length){row.push(f);rows.push(row);}return rows;}
const csvToTsv=s=>parseCsv(s).map(r=>r.map(x=>x.replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n');
const csvCell=v=>/[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
const loadInput=(text,name)=>{$('input').value=/\.csv$/i.test(name)?csvToTsv(text):text;rescan();};
$('file').onchange=e=>{const f=e.target.files[0];if(f)readFile(f,loadInput);e.target.value='';};
dropTarget($('input'),loadInput);

const NOTE='(Note: placeholders in square brackets, like [PERSON_#] or [EMAIL_#], stand in for private details. Keep them exactly as written, brackets included, and don\'t guess what they stand for.)\n\n';
$('maskBtn').onclick=()=>{
  purgeExpired();
  rescan();if(!scan)return;
  const keys=new Set(scan.findings.filter(isChecked).map(f=>f.key));
  const r=mask($('input').value,scan,keys);
  $('output').value=($('addNote').checked?NOTE:'')+r.out;
  const total=Object.values(r.stats).reduce((a,b)=>a+b,0);
  $('maskInfo').textContent=total?`${total} ticket${total===1?'':'s'}`:'Nothing replaced';
  $('maskWarn').innerHTML=(r.skipped?`<div class="note">${r.skipped} unticked item${r.skipped>1?'s':''} still in your text.</div>`:'')
   +'<div class="note">Read it before sending. Context can still identify someone, and names Cloakroom has never seen can slip through.</div>';
  refreshStatus();
};
$('copyOut').onclick=()=>copy('output');

/* ---------- pick up (restore) ---------- */
function doRestore(){
  if(purgeExpired())refreshStatus();
  const src=$('rin').value;let r;
  if(rFile&&rFile.csv){ // cell by cell, so a real detail containing a comma stays in one cell
    let n=0;const unk=new Set();
    const text=parseCsv(src).map(row=>row.map(c=>{const x=restore(c);n+=x.n;x.unknown.forEach(u=>unk.add(u));return csvCell(x.text);}).join(',')).join('\n');
    r={text,n,unknown:[...unk]};
  } else r=restore(src);
  $('rout').value=r.text;$('saveR').disabled=!r.text;$('donePanel').style.display=r.text?'flex':'none';
  $('rInfo').textContent=`${r.n} ticket${r.n===1?'':'s'} picked up`;
  $('rWarn').innerHTML=r.unknown.length?`<div class="note">No ticket on file, left as is: ${r.unknown.map(h).join(', ')}</div>`:(r.n?'<div class="ok">Every ticket matched.</div>':'');
}
$('restoreBtn').onclick=doRestore;
$('rin').addEventListener('input',()=>{if(rFile){rFile=null;$('rFileInfo').textContent='';}});
const loadReply=(text,name)=>{$('rin').value=text;rFile={name,csv:/\.csv$/i.test(name)};$('rFileInfo').textContent=name;doRestore();};
$('rfile').onchange=e=>{const f=e.target.files[0];if(f)readFile(f,loadReply);e.target.value='';};
dropTarget($('rin'),loadReply);
$('copyR').onclick=()=>copy('rout');
$('saveR').onclick=()=>{
  const name=rFile?rFile.name.replace(/(\.[^.]+)?$/,m=>'-restored'+(m||'.txt')):(/\t/.test($('rout').value)?'restored.tsv':'restored.txt');
  saveFile(name,$('rout').value);
};
$('clearR').onclick=()=>{rFile=null;$('rFileInfo').textContent='';$('saveR').disabled=true;$('rin').value='';$('rout').value='';$('rInfo').textContent='';$('rWarn').innerHTML='';$('donePanel').style.display='none';};

/* ---------- watch lists ---------- */
function listCount(){const c=s=>s.split('\n').filter(l=>l.trim()).length;$('listInfo').textContent=`${c(state.people)} people, ${c(state.orgs)} organizations`;}
['people','orgs'].forEach(id=>$(id).addEventListener('input',()=>{state[id]=$(id).value;saveState();listCount();clearTimeout(timer);timer=setTimeout(rescan,400);}));

/* ---------- tickets (key) ---------- */
function refreshStatus(){
  const n=Object.keys(state.tokens).length;
  $('ticketCount').textContent=n?`${n} ticket${n===1?'':'s'} on file`:'No tickets on file';
  $('encPill').classList.toggle('bad',!storageOK);
  $('encLabel').textContent=storageOK?(TAURI?'Encrypted on this computer':'Saved in this browser'):'Storage problem';
  $('storeWarn').innerHTML=storageOK?'':`<div class="note">Cloakroom couldn't read or save its tickets (${h(storageError)}). Erase all starts fresh.</div>`;
}
function renderVault(){
  const q=norm($('vq').value||'');
  const rows=Object.entries(state.tokens).filter(([t,v])=>!q||t.toLowerCase().includes(q)||norm(v.value).includes(q));
  $('vault').innerHTML=rows.length?'<tr><th>Ticket</th><th>Real detail</th><th>Last used</th><th><span class="visually-hidden">Remove</span></th></tr>'+rows.map(([t,v])=>`<tr><td class="t"><span class="chip">[${h(t)}]</span></td><td>${h(v.value)}</td><td class="meta">${v.ts?new Date(v.ts).toLocaleDateString():''}</td><td><button type="button" class="x" data-t="${h(t)}" aria-label="Remove ${h(t)}" title="Remove">✕</button></td></tr>`).join(''):'<tr><td class="meta">No tickets yet.</td></tr>';
  $('vault').querySelectorAll('button').forEach(b=>b.onclick=async()=>{const t=b.dataset.t;if(!await ask(`Remove [${t}]? Replies that use it can no longer be picked up.`,'Remove'))return;delete state.index[norm(state.tokens[t].value)];delete state.tokens[t];saveState();renderVault();rescan();refreshStatus();});
  refreshStatus();
}
$('vq').oninput=renderVault;
$('exportBtn').onclick=()=>saveFile('cloakroom-key-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,1));
$('importFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;readFile(f,txt=>{try{const s=JSON.parse(txt);if(!s.tokens)throw 0;
  for(const [t,v] of Object.entries(s.tokens)){if(!state.tokens[t]&&!state.index[norm(v.value)]){state.tokens[t]=Object.assign({ts:Date.now()},v);state.index[norm(v.value)]=t;}}
  for(const [k,n] of Object.entries(s.counters||{}))state.counters[k]=Math.max(state.counters[k]||0,n);
  const merge=(a,b)=>[...new Set((a+'\n'+(b||'')).split('\n').map(x=>x.trim()).filter(Boolean))].join('\n');
  state.people=merge(state.people,s.people);state.orgs=merge(state.orgs,s.orgs);
  $('people').value=state.people;$('orgs').value=state.orgs;saveState();listCount();renderVault();toast('Key imported and merged');
}catch(err){toast('That file is not a Cloakroom key');}});};

async function eraseAll(lists){
  const keep={people:state.people,orgs:state.orgs,retentionDays:state.retentionDays};
  await wipeStorage();
  state=blankState();state.retentionDays=keep.retentionDays;
  if(!lists){state.people=keep.people;state.orgs=keep.orgs;}
  await flushState();
  ['input','output','rin','rout','addVal','vq'].forEach(id=>$(id).value='');
  manual=[];userChecks=new Map();columns=null;rFile=null;
  ['maskInfo','rInfo','rFileInfo','modeInfo'].forEach(id=>$(id).textContent='');
  ['maskWarn','rWarn'].forEach(id=>$(id).innerHTML='');
  $('saveR').disabled=true;$('donePanel').style.display='none';
  $('people').value=state.people;$('orgs').value=state.orgs;
  try{await navigator.clipboard.writeText('');}catch(e){}
  listCount();renderVault();rescan();
}
$('doneBtn').onclick=async()=>{await eraseAll($('doneLists').checked);$('rWarn').innerHTML='<div class="ok">Erased, clipboard included.</div>';toast('Everything erased');};
$('retention').onchange=()=>{state.retentionDays=+$('retention').value;purgeExpired();renderVault();};
$('wipeBtn').onclick=async()=>{if(!await ask('Erase every ticket and both watch lists? Replies you haven\'t picked up yet can no longer be restored.','Erase all'))return;await eraseAll(true);toast('Everything erased');};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').hidden)$('modalNo').click();});

/* ---------- start ---------- */
(async()=>{
  await initState();
  $('people').value=state.people;$('orgs').value=state.orgs;
  $('retention').value=String(state.retentionDays??3);
  purgeExpired();listCount();renderVault();
  setInterval(()=>{if(purgeExpired())renderVault();},36e5);
})();
