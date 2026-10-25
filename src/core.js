/* ---------- storage & key ---------- */
const STORE='privacyMask.v1';
const TYPES=['PERSON','ORG','EMAIL','PHONE','ADDRESS','POSTAL','LOCATION','SIN','CARD','DOB','ID','CREDENTIAL','SECRET','IP','OTHER'];
const TYPE_LABEL={PERSON:'People',ORG:'Organizations',EMAIL:'Emails',PHONE:'Phone numbers',ADDRESS:'Street addresses',POSTAL:'Postal codes',LOCATION:'Places',SIN:'SINs',CARD:'Card numbers',DOB:'Birth dates',ID:'IDs / account numbers',CREDENTIAL:'Passwords / usernames',SECRET:'API keys / tokens',IP:'IP addresses',OTHER:'Other'};
function blankState(){return{tokens:{},index:{},counters:{},people:'',orgs:'',retentionDays:3};}
/* Storage: in the desktop app the state is encrypted on disk by Rust (key in Keychain / Credential Manager).
   Opened as a plain web page (for testing) it falls back to localStorage. */
const TAURI=window.__TAURI__||null;
const invoke=(cmd,args)=>TAURI.core.invoke(cmd,args);
let state=blankState();
let storageOK=true,storageError='';
async function initState(){
  try{
    const raw=TAURI?await invoke('load_state'):localStorage.getItem(STORE);
    const s=JSON.parse(raw||'null');
    if(s&&s.tokens)state=Object.assign(blankState(),s);
    storageOK=true;
  }catch(e){storageOK=false;storageError=String(e);console.error(e);}
}
let saveTimer=null;
function saveState(){clearTimeout(saveTimer);saveTimer=setTimeout(flushState,150);}
async function flushState(){
  clearTimeout(saveTimer);
  const json=JSON.stringify(state);
  try{if(TAURI)await invoke('save_state',{json});else localStorage.setItem(STORE,json);storageOK=true;}
  catch(e){storageOK=false;storageError=String(e);console.error(e);}
}
/* Erase everything on disk. In the app this also destroys the encryption key, so any old copy
   of the file (for example in a backup) can no longer be read. */
async function wipeStorage(){
  try{if(TAURI)await invoke('wipe_state');else localStorage.removeItem(STORE);}catch(e){console.error(e);}
}
/* Auto-erase: drop tickets not used for state.retentionDays days */
function purgeExpired(){
  const days=+state.retentionDays||0;if(!days)return 0;
  const cutoff=Date.now()-days*864e5;let n=0;
  for(const [t,e] of Object.entries(state.tokens)){
    if(!e.ts)e.ts=Date.now(); // tickets from before auto-erase existed start their clock now
    if(e.ts<cutoff){delete state.index[norm(e.value)];delete state.tokens[t];n++;}
  }
  if(!Object.keys(state.tokens).length)state.counters={};
  if(n)saveState();
  return n;
}
const norm=v=>String(v).trim().replace(/\s+/g,' ').toLowerCase();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const flex=s=>esc(s.trim()).replace(/\s+/g,'\\s+');
const B0='(?<![A-Za-z0-9À-ÿ])', B1='(?![A-Za-z0-9À-ÿ])';

function luhn(v){const d=v.replace(/\D/g,'');let s=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(alt){n*=2;if(n>9)n-=9;}s+=n;alt=!alt;}return s%10===0;}

function tokenFor(value,type,forced){
  const k=norm(value);
  if(state.index[k]){const e=state.tokens[state.index[k]];if(e)e.ts=Date.now();return state.index[k];}
  let t=forced;
  if(!t||state.tokens[t]){
    do{state.counters[type]=(state.counters[type]||0)+1;t=type+'_'+state.counters[type];}while(state.tokens[t]);
  }
  state.tokens[t]={value:String(value).trim().replace(/\s+/g,' '),type,ts:Date.now()};
  state.index[k]=t;
  return t;
}
function assign(f){
  if(f.variantOf){const base=tokenFor(f.variantOf,'PERSON');return tokenFor(f.value,'PERSON',base+'_'+f.suffix);}
  return tokenFor(f.value,f.type);
}

/* ---------- detectors ---------- */
const STOP=new Set(('The A An This That These Those Our We I It Its If In On At For And But Or So Please Thanks Thank Hi Hello Hey Dear Best Regards Kind Warm Cheers Sincerely Yes No Note Re Fw Fwd Subject From To Cc Bcc Sent Date Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Mr Mrs Ms Mx Dr Prof My Your Their His Her As Also When Where What Why How Who With Without Once After Before During Next Last Each Every All Some Any New Here There Team Board Council Committee Annual Report Q1 Q2 Q3 Q4 Yesterday Today Tomorrow Tonight Then Now Later Soon Maybe Perhaps Sorry Unfortunately Hopefully Meanwhile However Still Just Only Even Okay Ok Great Sure Good Morning Afternoon Evening Happy Congratulations Welcome Attached Following Regarding').split(' '));

const FIRSTNAMES=new Set(('James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Mark Donald Steven Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Frank Patrick Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Douglas Zachary Peter Kyle Ethan Walter Noah Jeremy Christian Keith Roger Terry Gerald Harold Sean Austin Carl Arthur Lawrence Dylan Jesse Jordan Bryan Billy Joe Bruce Gabriel Logan Albert Willie Alan Juan Wayne Elijah Randy Roy Vincent Ralph Eugene Russell Bobby Mason Philip Louis Ian Colin Graham Neil Stuart Simon Martin Trevor Derek Craig Darren Marc Luc Pierre Jean Francois Mohammed Ahmed Ali Omar Raj Amit Arjun Wei Jun Kai Tim Tom Rob Mike Dave Dan Matt Tony Steve Andy Josh Ken Ben Sam Greg Alex Pat Ray Nick Chris Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Lisa Nancy Betty Margaret Sandra Ashley Kimberly Emily Donna Michelle Carol Amanda Dorothy Melissa Deborah Stephanie Stefanie Rebecca Sharon Laura Cynthia Kathleen Amy Angela Shirley Anna Brenda Pamela Emma Nicole Helen Samantha Katherine Christine Debra Rachel Carolyn Janet Catherine Maria Heather Diane Ruth Julie Olivia Joyce Virginia Victoria Kelly Lauren Christina Joan Evelyn Judith Megan Andrea Cheryl Hannah Jacqueline Martha Gloria Teresa Ann Anne Sara Madison Frances Kathryn Janice Jean Abigail Alice Judy Sophia Grace Denise Amber Doris Marilyn Danielle Beverly Isabella Theresa Diana Natalie Brittany Charlotte Marie Kayla Alexis Lori Melanie Holly Dawn Cristina Doramy Haley Hailey Julia Claire Leah Chloe Zoe Fiona Jane Jill Kate Katie Liz Beth Jen Jenn Sue Kim Meg Nadia Priya Aisha Fatima Mei Ling Yuki Sophie Isabelle Genevieve Chantal Nathalie Sylvie Josee').split(' '));
const ORGWORDS=new Set(('Foundation Society Association Inc Ltd Corp Corporation Centre Center Council Fund Trust Charity Church Hospital Hospice Institute University College School Club Network Alliance Coalition Federation Agency Services Mission Shelter League Group Partners Canada Canadian Ontario Manitoba Alberta Columbia Quebec Scotia Brunswick Saskatchewan').split(' '));
const NOUNS=new Set(('Policy Policies Plan Strategy Program Programs Standard Standards Review Reports Meeting Agenda Minutes Budget Investment Investments Governance Framework Guidelines Handbook Tool Toolkit Committee Panel Decision Accreditation Session Workshop Webinar Event Project Update Summary Draft Section Appendix Table Chapter Page Form').split(' '));
const NAMEWORD="[A-Z][a-zà-ÿ'’-]+";

/* More first names, from many backgrounds. Only used as a hint: a lone capitalized word in this list is ticked. */
('Luca Liam Mia Ava Zoe Zoey Sofia Sophia Isabella Camila Valentina Mateo Diego Carlos Miguel Santiago Lucas Marco Giulia Giovanni Matteo Francesca Andre Andrei Dmitri Dmitry Olga Ivan Anya Natalia Nikolai Sven Lars Ingrid Astrid Priya Aisha Fatima Mohammad Muhammad Yusuf Hassan Hussein Ibrahim Khalid Tariq Jamal Malik Layla Leila Noor Hana Sana Zainab Imran Rahul Anil Sunita Deepa Meera Anjali Vikram Sanjay Harpreet Gurpreet Jasdeep Simran Manpreet Rajesh Suresh Ravi Kavita Neha Pooja Ananya Aarav Ming Mei Ling Xin Yan Hui Jin Hyun Soo Min Jiho Seo Yuki Hiro Kenji Haruto Akira Sakura Aiko Kofi Kwame Amara Chidi Ngozi Thandi Sipho Oluwaseun Chinedu Adebayo Nia Imani Aroha Tane Wiremu Kiri Anika Elena Elsa Greta Katya Sasha Mikhail Pavel Tomas Jakub Piotr Marek Kasia Eva Lena Mila Nora Lea Leo Theo Max Finn Oscar Oliver Jacob Elijah Mason Ethan Lucy Chloe Ella Grace Hazel Ivy Ruby Stella Violet Willow Aurora Penelope Layla Riley Avery Quinn Harper Blake Cameron Morgan Taylor Casey Jamie Drew Robin Dana Jordan Alexis Sasha Kim Lee Jay Sean Shawn Shane Tristan Evan Owen Caleb Isaac Eli Hugo Felix Jules Remy Antoine Mathieu Etienne Amelie Camille Chantal Genevieve Josee Mireille Sylvie Nathalie Isabelle Marie Celine Lucie Manon').split(' ').forEach(n=>FIRSTNAMES.add(n));
/* The big lists live in names.js (generated by tools/build-names.js). Ambiguous names are also everyday words (Will, May). */
const SURNAMES=new Set(),AMBIGUOUS=new Set();
if(typeof NAME_DATA!=='undefined'){
  NAME_DATA.first.split(' ').forEach(n=>FIRSTNAMES.add(n));
  NAME_DATA.last.split(' ').forEach(n=>SURNAMES.add(n));
  NAME_DATA.ambiguous.split(' ').forEach(n=>AMBIGUOUS.add(n));
}
const knownName=w=>FIRSTNAMES.has(w)||SURNAMES.has(w);
const PLACES=new Set(('Toronto Ottawa Montreal Montréal Vancouver Calgary Edmonton Winnipeg Halifax Moncton Regina Saskatoon Hamilton Kitchener Waterloo Mississauga Brampton Surrey Burnaby Victoria Fredericton Charlottetown Yukon Nunavut Labrador Newfoundland Nova Canada Canadian America American British England English French France Germany China India Mexico Europe Africa Asia Atlantic Pacific Arctic Indigenous First Nations Inuit Metis Métis').split(' '));
const BRANDS=new Set('Zoom Google Microsoft Excel Word Outlook Gmail Slack Teams Salesforce Coda Claude Anthropic Windows Mac Apple Linux Facebook Instagram LinkedIn Twitter Dropbox Docs Sheets Drive Chrome Safari Notion Asana Linear GitHub Python Java'.split(' '));
/* A word like this right before a capitalized word says a person is coming: "teammate Tim", "this is Luca". */
const ROLE_BEFORE=/(?:\b(?:teammate|team-mate|colleague|coworker|co-worker|friend|neighbou?r|boss|manager|director|supervisor|mentor|client|donor|applicant|volunteer|participant|attendee|member|patient|student|teacher|coach|captain|sister|brother|mom|mum|dad|mother|father|wife|husband|spouse|partner|son|daughter|cousin|uncle|aunt|named|called|contact|cc|this is|i['’]m|i am|my name is|spoke (?:to|with)|ask for)|\bname is)\s+$/i;
const DETECTORS=[
  {type:'SECRET',label:'API key or token',re:/\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g},
  {type:'CREDENTIAL',label:'After "password/username:"',re:/\b(?:password|passwd|pwd|passcode|pin|username|user ?name|user ?id|login)\s*[:=]\s*(\S+)/gid,group:1},
  {type:'EMAIL',label:'Email pattern',re:/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g},
  {type:'CARD',label:'Card number (checksum)',re:/\b\d(?:[ -]?\d){12,18}\b/g,check:luhn},
  {type:'SIN',label:'SIN (checksum)',re:/\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,check:luhn},
  {type:'PHONE',label:'Phone pattern',re:/(?:\+?1[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b(?:\s?(?:x|ext\.?)\s?\d{1,5})?/gi},
  {type:'POSTAL',label:'Postal code',re:/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi},
  {type:'ADDRESS',label:'Street address',re:/\b\d{1,6}[A-Za-z]?\s+(?:[A-Z][A-Za-z'.-]*\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Crescent|Cres|Court|Ct|Way|Place|Pl|Trail|Terrace|Parkway|Pkwy|Circle|Highway|Hwy|Square|Sq|Rue|Chemin)\b\.?(?:\s+(?:N|S|E|W|North|South|East|West)\b)?(?:,?\s*(?:Unit|Suite|Apt|#)\s*[\w-]+)?/g},
  {type:'IP',label:'IP address',re:/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g},
  {type:'DOB',label:'Birth date',re:/\b(?:DOB|D\.O\.B\.?|date of birth|birthdate|born(?: on)?)\s*[:-]?\s*([A-Za-z0-9,\/ .-]{4,20}?\d{2,4})\b/gid,group:1},
  {type:'PERSON',label:'Name after a greeting or title',re:new RegExp("\\b(?:Hi|Hello|Hey|Dear|Thanks|Thank you|Cheers|Regards|Sincerely|Mr\\.?|Mrs\\.?|Ms\\.?|Mx\\.?|Dr\\.?|Prof\\.?)(?:,|\\s)\\s*("+NAMEWORD+"(?: +"+NAMEWORD+"){0,2})","gd"),group:1,names:true},
  {type:'PERSON',label:'Possible name',re:new RegExp(NAMEWORD+"(?: +"+NAMEWORD+"){1,2}","g"),names:true,maybe:true},
];

/* trim stop-words off a name-ish match; returns [value,offset] or null */
function cleanName(v){
  const words=v.split(/([ \t]+)/);let start=0,off=0;
  while(start<words.length&&(words[start].trim()===''||STOP.has(words[start]))){off+=words[start].length;start++;}
  const rest=words.slice(start).join('');
  const ws=rest.split(/[ \t]+/).filter(Boolean);
  if(!ws.length||ws.some(w=>STOP.has(w)))return null;
  return [rest.trimEnd(),off,ws.length];
}

/* Single capitalized words: the guesses a pair-of-words rule cannot make. Plain text only; tables use their column rules. */
function sentenceStart(text,i){
  let j=i-1;
  while(j>=0){const ch=text[j];if(ch==='\n')return true;if(/[ \t"“‘'(\[*_>\-•–—]/.test(ch)){j--;continue;}break;}
  return j<0||/[.!?:]/.test(text[j]);
}
function headingLine(text,i){
  const a=text.lastIndexOf('\n',i-1)+1,b=text.indexOf('\n',i),line=text.slice(a,b<0?text.length:b);
  const ws=line.match(/[A-Za-z][A-Za-z'’-]*/g)||[];
  return ws.length>=3&&ws.filter(w=>/^[A-Z][a-z]/.test(w)).length/ws.length>0.6;
}
function lonelyNames(text,hit,add){
  const re=/(?:[A-Z]['’])?[A-Z][a-zà-ÿ]+(?:-[A-Z][a-zà-ÿ]+)?/g;let m;
  while((m=re.exec(text))){
    const w=m[0],s=m.index,e=s+w.length;
    if(w.length<3||hit(s,e))continue;
    if(/[A-Za-zà-ÿ]/.test(text[s-1]||''))continue;
    if(STOP.has(w)||ORGWORDS.has(w)||NOUNS.has(w)||PLACES.has(w)||BRANDS.has(w))continue;
    if(headingLine(text,s))continue;
    // inside a capitalized phrase ("the Strategic Plan"): the pair rule already judged it
    const prev=/([A-Za-zà-ÿ'’-]+)[ \t]+$/.exec(text.slice(Math.max(0,s-40),s));
    if(prev&&/^[A-Z]/.test(prev[1])&&!STOP.has(prev[1])&&!sentenceStart(text,s-prev[0].length))continue;
    if(/^[ \t]+[A-Z][a-zà-ÿ]/.test(text.slice(e,e+4)))continue;
    const start=sentenceStart(text,s),known=knownName(w),amb=AMBIGUOUS.has(w);
    const role=ROLE_BEFORE.test(text.slice(Math.max(0,s-30),s));
    const poss=/^['’]s\b/.test(text.slice(e,e+3));
    if(role)add(w,'PERSON','Name after a clue word',true,s,e,null);
    else if(poss)add(w,'PERSON','Name with ’s',true,s,e,null);
    else if(known&&!start)add(w,'PERSON',FIRSTNAMES.has(w)?'Known first name':'Known surname',true,s,e,{maybe:true});
    else if(known&&!amb)add(w,'PERSON','Possible name (known name)',false,s,e,{maybe:true});
    else if(!start)add(w,'PERSON','Capitalized mid-sentence',false,s,e,{maybe:true});
  }
}

/* ---------- tables ---------- */
function parseTable(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2||!lines[0].includes('\t'))return null;
  if(lines.filter(l=>l.includes('\t')).length/lines.length<0.6)return null;
  return text.split(/\r?\n/).map(l=>l.split('\t'));
}
const COLUMN_RULES=[
  [/e-?mail/i,'EMAIL'],[/phone|mobile|cell|fax|\btel\b/i,'PHONE'],[/postal|zip/i,'POSTAL'],[/address|street|addr\b/i,'ADDRESS'],
  [/\bsin\b|social insurance/i,'SIN'],[/birth|\bdob\b/i,'DOB'],[/card\s*(no|num|#)|credit\s*card/i,'CARD'],[/date\b|\byear\b/i,null],[/password|username|login/i,'CREDENTIAL'],
  [/\bid\b|member\s*(no|num|#)|account\s*(id|no|num|number|#)|record\s*id/i,'ID'],
  [/name|contact|donor|attendee|registrant|applicant|employee|reviewer|person|recipient|signatory|^to$|^from$/i,'PERSON'],
  [/city|town|municipality/i,'LOCATION',false],[/organi[sz]ation|company|charity|employer|\borg\b|account/i,'ORG',false],
];
function analyzeColumns(rows){
  const head=rows[0]||[];const body=rows.slice(1).filter(r=>r.some(c=>c.trim()));
  return head.map((h,i)=>{
    let type=null,on=true,ruled=false;
    for(const [re,t,def] of COLUMN_RULES){if(re.test(h)){type=t;on=t!==null&&def!==false;ruled=true;break;}}
    // "Organization Name" etc. should be ORG not PERSON
    if(type==='PERSON'&&/organi[sz]ation|company|charity|employer|account|org\b/i.test(h)){type='ORG';on=false;}
    const vals=body.map(r=>(r[i]||'').trim()).filter(Boolean);
    if(!ruled&&vals.length){
      const share=re=>vals.filter(v=>re.test(v)).length/vals.length;
      if(share(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i)>=.5)type='EMAIL';
      else if(share(/^[+\d().\s-]{10,}$/)>=.5)type='PHONE';
      else if(share(/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i)>=.5)type='POSTAL';
    }
    return {i,header:h.trim()||('Column '+(i+1)),type,on:!!type&&on,distinct:new Set(vals.map(norm)).size,sample:vals.slice(0,2)};
  });
}

/* ---------- scanning ---------- */
function collect(text,opts){
  opts=opts||{};
  const found=new Map(),claimed=[];
  const hit=(s,e)=>claimed.some(([a,b])=>s<b&&e>a);
  const table=parseTable(text);
  const columns=table?(opts.columns||analyzeColumns(table)):null;
  let scanText=text;
  if(table){ // blank out masked columns so we don't double-report them
    scanText=table.map((r,ri)=>r.map((c,ci)=>ri>0&&columns[ci]&&columns[ci].on?' '.repeat(c.length):c).join('\t')).join('\n');
  }
  function add(value,type,label,checked,s,e,extra){
    value=String(value).trim().replace(/\s+/g,' ');
    if(value.length<2||/^\[[A-Z]+_\d+(?:_[A-Z]+)?\]$/.test(value))return;
    if(s!=null){if(hit(s,e))return;claimed.push([s,e]);}
    const k=norm(value),f=found.get(k);
    if(f){f.count++;if(checked&&!f.checked){f.checked=true;f.label=label;}return;}
    found.set(k,Object.assign({key:k,value,type,label,checked,count:1},extra||{}));
  }
  function scanTerm(term,type,label,checked,extra,cs){
    if(!term||term.trim().length<2)return;
    const re=new RegExp(B0+flex(term)+B1,cs?'g':'gi');let m;
    while((m=re.exec(scanText)))add(m[0],type,label,checked,m.index,m.index+m[0].length,extra);
  }
  // 1. manual additions
  (opts.manual||[]).forEach(x=>scanTerm(x.value,x.type,'Added by you',true));
  // 2. watch lists
  const lines=s=>(s||'').split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>=2);
  lines(state.orgs).forEach(o=>scanTerm(o,'ORG','Watch list',true));
  const people=lines(state.people);
  people.forEach(p=>scanTerm(p,'PERSON','Watch list',true));
  people.forEach(p=>{const w=p.split(/\s+/);if(w.length<2)return;
    const first=w[0],last=w[w.length-1];
    if(first.length>=3)scanTerm(first,'PERSON','Watch list (first name)',true,{variantOf:p,suffix:'FIRST'},true);
    if(last.length>=3)scanTerm(last,'PERSON','Watch list (last name)',true,{variantOf:p,suffix:'LAST'},true);});
  // 3. anything masked before (keeps placeholders consistent across sessions)
  Object.entries(state.tokens).forEach(([k,t])=>{if(t.value.length<3)return;
    // a first or last name on its own is matched with its capitals, so "jane" inside jane@x.com is left for the email rule
    const v=/^(.+)_(FIRST|LAST)$/.exec(k),base=v&&state.tokens[v[1]];
    scanTerm(t.value,t.type,'Masked before',true,base?{variantOf:base.value,suffix:v[2]}:null,!!base);});
  // 4. column values that also show up elsewhere (e.g. a name repeated in a Notes column)
  if(table)columns.forEach(c=>{if(!c.on)return;const seen=new Set();
    table.slice(1).forEach(r=>{const v=(r[c.i]||'').trim();if(v.length>=4&&/[A-Za-z]/.test(v)&&!seen.has(norm(v))){seen.add(norm(v));scanTerm(v,c.type,'Also in column "'+c.header+'"',true);}});});
  // 5. pattern detectors
  for(const d of DETECTORS){
    d.re.lastIndex=0;let m;
    while((m=d.re.exec(scanText))){
      let v=d.group?m[d.group]:m[0],s=d.group?m.indices[d.group][0]:m.index;
      if(!v)continue;
      if(d.check&&!d.check(v))continue;
      if(d.maybe&&table&&s<text.indexOf('\n'))continue;
      if(d.maybe&&!table&&headingLine(scanText,s)){const w0=v.trim().split(/\s+/)[0];if(!FIRSTNAMES.has(w0)||AMBIGUOUS.has(w0))continue;}
      if(d.names){const c=cleanName(v);if(!c)continue;if(d.maybe&&c[2]<2)continue;v=c[0];s+=c[1];}
      if(d.maybe){
        const ws=v.split(' ');
        if(ws.some(w=>NOUNS.has(w)))continue;               // "Investment Policy" etc.
        if(ws.some(w=>ORGWORDS.has(w))){add(v,'ORG','Possible organization',false,s,s+v.length,{maybe:true});continue;}
        const w0=ws[0],wl=ws[ws.length-1];
        const firstOk=FIRSTNAMES.has(w0)&&(!AMBIGUOUS.has(w0)||SURNAMES.has(wl));
        const lastOk=SURNAMES.has(wl)&&!AMBIGUOUS.has(wl)&&!AMBIGUOUS.has(w0);
        add(v,'PERSON',firstOk?'Possible name (known first name)':lastOk?'Possible name (known surname)':'Possible name',(firstOk||lastOk)&&!table,s,s+v.length,{maybe:true});
        continue;
      }
      add(v,d.type,d.label,true,s,s+v.length,null);
    }
  }
  if(!table){
    // a first or last name seen alone after the full name ("Jane" after "Jane Morrison") gets the same family of tickets
    [...found.values()].filter(f=>f.type==='PERSON'&&f.checked&&!f.variantOf&&/ /.test(f.value)).forEach(f=>{
      const w=f.value.split(' ');
      if(w[0].length>=3&&!STOP.has(w[0]))scanTerm(w[0],'PERSON','Part of a name above',true,{variantOf:f.value,suffix:'FIRST'},true);
      if(w[w.length-1].length>=3&&!STOP.has(w[w.length-1]))scanTerm(w[w.length-1],'PERSON','Part of a name above',true,{variantOf:f.value,suffix:'LAST'},true);
    });
    lonelyNames(scanText,hit,add);
  }
  return {findings:[...found.values()],table,columns};
}

/* ---------- masking ---------- */
function makeReplacer(items,stats){
  const map=new Map();items.forEach(f=>map.set(f.key,assign(f)));
  const build=(list,flags)=>list.length?new RegExp(B0+'(?:'+list.sort((a,b)=>b.value.length-a.value.length).map(f=>flex(f.value)).join('|')+')'+B1,flags):null;
  const ci=build(items.filter(f=>!f.variantOf),'gi'),cs=build(items.filter(f=>f.variantOf),'g');
  const sub=m=>{const t=map.get(norm(m));if(!t)return m;stats[state.tokens[t].type]=(stats[state.tokens[t].type]||0)+1;return '['+t+']';};
  return s=>{if(ci)s=s.replace(ci,sub);if(cs)s=s.replace(cs,sub);return s;};
}
function mask(text,scan,checkedKeys){
  const stats={};
  const items=scan.findings.filter(f=>checkedKeys.has(f.key));
  const rep=makeReplacer(items,stats);
  let out;
  if(scan.table){
    out=scan.table.map((r,ri)=>r.map((c,ci)=>{
      const col=scan.columns[ci];
      if(ri>0&&col&&col.on&&c.trim()){const t=tokenFor(c,col.type);stats[col.type]=(stats[col.type]||0)+1;return '['+t+']';}
      return rep(c);
    }).join('\t')).join('\n');
  } else out=rep(text);
  saveState();
  return {out,stats,skipped:scan.findings.filter(f=>!checkedKeys.has(f.key)&&!f.maybe).length};
}

/* ---------- restoring ---------- */
function restore(text){
  const toks=Object.keys(state.tokens).sort((a,b)=>b.length-a.length);
  let n=0;
  if(toks.length){
    const alt=toks.map(esc).join('|');
    const re=new RegExp('\\\\?\\[\\s*('+alt+')\\s*\\\\?\\]|(?<![A-Za-z0-9_])('+alt+')(?![A-Za-z0-9_])','g');
    text=text.replace(re,(m,a,b)=>{n++;return state.tokens[a||b].value;});
  }
  const unknown=[...new Set((text.match(/\[[A-Z]+_\d+(?:_[A-Z]+)?\]/g)||[]))];
  return {text,n,unknown};
}
