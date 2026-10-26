/* ---------- the parade: little people for the details being hidden ----------
   A stage has three parts: a zone on the left, the cloakroom booth in the middle and a zone on the right.
   On Check in the left holds people in their own clothes and the right holds them in disguise; Pick up is the mirror.
   Purely decorative (aria-hidden): every count it shows is also written out in the panes below. */
const Parade=(()=>{
  const SVG='http://www.w3.org/2000/svg';
  const MAX=12;                      // people drawn per side; the rest show as "+N"
  const SPEED=560;                   // px per second when walking
  const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait=ms=>new Promise(r=>setTimeout(r,still()?0:ms));
  let seed=0;

  const HAIR=[
    'M9 12c0-6 4-8 7-8s7 2 7 8c-2-3-4-4-7-4s-5 1-7 4Z',                        // short
    'M8 14c0-7 4-10 8-10s8 3 8 10l-1 6c-1-5-3-9-7-9s-6 4-7 9Z',                 // long
    'M9 11c0-5 3-7 7-7s7 2 7 7c-1-1-3-2-7-2s-6 1-7 2Z M14 4a3 3 0 1 1 4 0Z',     // bun
    'M9 12c1-5 3-7 7-7s6 2 7 7c-3-2-5-2-7-2s-4 0-7 2Z',                         // crop
    'M8 13c0-6 3-9 8-9s8 3 8 9c-1-2-2-3-3-3l-5-1-5 1c-1 0-2 1-3 3Z',             // curls
  ];
  const HATS=[
    {cls:'hat-top',d:'M10 6h12v-6h-12Z M7 7h18v2H7Z'},                           // top hat
    {cls:'hat-party',d:'M16-6 22 6H10Z'},                                        // party cone
    {cls:'hat-crown',d:'M9 6 10-1l3 4 3-6 3 6 3-4 1 7Z'},                       // crown
    {cls:'hat-feather',d:'M8 6c0-2 3-3 8-3s8 1 8 3Z M20 4c2-5 5-8 8-9-1 4-4 8-8 9Z'}, // headband with plume
    {cls:'hat-beret',d:'M7 7c0-4 5-6 10-6s9 2 8 5c-2 1-10 2-18 1Z'},             // beret
  ];

  function el(name,attrs,parent){const e=document.createElementNS(SVG,name);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}

  /* One person. Same seed, same person: the one who walks in is recognisably the one who walks out. */
  function person(s,costumed){
    const wrap=document.createElement('div');wrap.className='walker'+(costumed?' costumed':'');
    const svg=el('svg',{viewBox:'-2 -8 36 66',width:'34',height:'62'},null);
    const skin='skin-'+(s%5+1),cloth=costumed?'fancy-'+(s%4+1):'cloth-'+(s%6+1),hair='hair-'+(s%4+1);
    if(costumed&&s%3===0)el('path',{d:'M9 23 4 50h24l-5-27Z',class:'cape'},svg);       // cape, behind
    const legs=el('g',{class:'legs'},svg);
    el('path',{d:'M13 40v14',class:'leg l'},legs);el('path',{d:'M19 40v14',class:'leg r'},legs);
    el('path',{d:'M10 26 6 37M22 26l4 11',class:'arms '+skin},svg);
    el('rect',{x:9,y:21,width:14,height:21,rx:6,class:'body '+cloth},svg);
    el('circle',{cx:16,cy:13,r:7,class:'head '+skin},svg);
    el('path',{d:HAIR[s%HAIR.length],class:'hair '+hair},svg);
    if(costumed){
      el('path',{d:'M8.5 12c2-1.6 4.6-1.8 7.5-.6 2.9-1.2 5.5-1 7.5.6 0 2.6-1.4 4-3.2 4-1.4 0-2.4-.8-4.3-.8s-2.9.8-4.3.8c-1.8 0-3.2-1.4-3.2-4Z',class:'mask'},svg);
      el('circle',{cx:13,cy:13,r:1,class:'eye'},svg);el('circle',{cx:19,cy:13,r:1,class:'eye'},svg);
      const hat=HATS[s%HATS.length];el('path',{d:hat.d,class:'hat '+hat.cls},svg);
      if(s%2)el('path',{d:'M13 22l3 2 3-2v4l-3-2-3 2Z',class:'bow'},svg);
    } else {
      el('circle',{cx:13.5,cy:13,r:1,class:'eye'},svg);el('circle',{cx:18.5,cy:13,r:1,class:'eye'},svg);
    }
    wrap.appendChild(svg);
    return wrap;
  }

  function stage(root,{left,right}){
    root.innerHTML='';
    const zl=document.createElement('div');zl.className='zone '+(left==='costume'?'party':'street');
    const booth=document.createElement('div');booth.className='booth';
    booth.innerHTML='<svg viewBox="0 0 120 84" aria-hidden="true"><ellipse class="booth-ground" cx="60" cy="82.5" rx="56" ry="2"/><rect class="booth-wall" x="12" y="30" width="96" height="52" rx="2"/><rect class="booth-window" x="18" y="40" width="22" height="20" rx="2"/><path class="booth-rail" d="M19 43.5h20"/><path class="coat k1" d="M22 44h4l1 3v9h-6v-9Z"/><path class="coat k2" d="M28 44h4l1 3v10h-6v-10Z"/><path class="coat k3" d="M34 44h4l1 3v8h-6v-8Z"/><rect class="booth-window" x="80" y="40" width="22" height="20" rx="2"/><path class="booth-hook" d="M91 41v3"/><path class="booth-mask" d="M84.5 47c2-1.3 4.3-1.4 6.5-.4 2.2-1 4.5-.9 6.5.4 0 2.6-1.4 3.8-3 3.8-1.3 0-2.1-.8-3.5-.8s-2.2.8-3.5.8c-1.6 0-3-1.2-3-3.8Z"/><path class="booth-door" d="M47 82V57a13 13 0 0 1 26 0v25Z"/><g class="booth-leaf"><path d="M47 82V57a13 13 0 0 1 26 0v25Z"/><circle class="booth-knob" cx="69" cy="70" r="1.3"/></g><path class="booth-step" d="M43 82h34"/><path class="awa" d="M6 22h9l-1 8h-8Z"/><path class="awb" d="M15 22h9l-1 8h-8Z"/><path class="awa" d="M24 22h9l-1 8h-8Z"/><path class="awb" d="M33 22h9l-1 8h-8Z"/><path class="awa" d="M42 22h9l-1 8h-8Z"/><path class="awb" d="M51 22h9l-1 8h-8Z"/><path class="awa" d="M60 22h9l-1 8h-8Z"/><path class="awb" d="M69 22h9l-1 8h-8Z"/><path class="awa" d="M78 22h9l-1 8h-8Z"/><path class="awb" d="M87 22h9l-1 8h-8Z"/><path class="awa" d="M96 22h9l-1 8h-8Z"/><path class="awb" d="M105 22h9l-1 8h-8Z"/><path class="awa" d="M12 30a4 4 0 0 0 8 0Z"/><path class="awb" d="M20 30a4 4 0 0 0 8 0Z"/><path class="awa" d="M28 30a4 4 0 0 0 8 0Z"/><path class="awb" d="M36 30a4 4 0 0 0 8 0Z"/><path class="awa" d="M44 30a4 4 0 0 0 8 0Z"/><path class="awb" d="M52 30a4 4 0 0 0 8 0Z"/><path class="awa" d="M60 30a4 4 0 0 0 8 0Z"/><path class="awb" d="M68 30a4 4 0 0 0 8 0Z"/><path class="awa" d="M76 30a4 4 0 0 0 8 0Z"/><path class="awb" d="M84 30a4 4 0 0 0 8 0Z"/><path class="awa" d="M92 30a4 4 0 0 0 8 0Z"/><path class="awb" d="M100 30a4 4 0 0 0 8 0Z"/><rect class="booth-signboard" x="33" y="5" width="54" height="14" rx="3"/><text class="booth-signtext" x="60" y="15" text-anchor="middle">Cloakroom</text></svg>';
    const zr=document.createElement('div');zr.className='zone '+(right==='costume'?'party':'street');
    const more=[document.createElement('span'),document.createElement('span')];more.forEach(m=>m.className='more');
    zl.appendChild(more[0]);zr.appendChild(more[1]);
    root.append(zl,booth,zr);
    const L=[],R=[];let lTotal=0,rTotal=0,busy=Promise.resolve();

    const zoneBox=z=>({x:z.offsetLeft,w:z.offsetWidth});
    const slot=(z,i,side)=>{const b=zoneBox(z),gap=Math.min(30,Math.max(18,(b.w-48)/MAX));
      return side==='l'?b.x+b.w-40-i*gap:b.x+12+i*gap;};        // the left queue starts at the booth; the right one leaves it
    const door=()=>booth.offsetLeft+booth.offsetWidth/2-17;   // the doorway, centred in the booth
    const place=(p,x)=>{p.x=x;p.el.style.transform=`translateX(${x}px)`;};
    function walk(p,to,{fade}={}){
      const from=p.x;if(still()||from===to){place(p,to);if(fade)p.el.style.opacity=0;return Promise.resolve();}
      const ms=Math.max(140,Math.abs(to-from)/SPEED*1000);
      p.el.classList.add('walking');p.el.classList.toggle('back',to<from);
      const a=p.el.animate([{transform:`translateX(${from}px)`},{transform:`translateX(${to}px)`}],{duration:ms,easing:'linear',fill:'forwards'});
      return a.finished.then(()=>{place(p,to);a.cancel();p.el.classList.remove('walking','back');});
    }
    function label(){
      more[0].textContent=lTotal>MAX?'+'+(lTotal-MAX):'';more[1].textContent=rTotal>MAX?'+'+(rTotal-MAX):'';
    }
    function add(list,z,costumed,i,how){
      const s=seed++;const p={s,el:person(s,costumed)};root.appendChild(p.el);list.push(p);
      const x=slot(z,i,list===L?'l':'r');
      if(how==='rise'&&!still()){place(p,x);p.el.animate([{transform:`translate(${x}px,64px)`},{transform:`translate(${x}px,-6px)`,offset:.7},{transform:`translate(${x}px,0)`}],{duration:380,easing:'cubic-bezier(0.16,1,0.3,1)',delay:i*30,fill:'backwards'});}
      else if(how==='run'){place(p,zoneBox(z).x-36);walk(p,x);}
      else place(p,x);
      return p;
    }
    function drop(p){p.el.classList.add('going');if(still()){p.el.remove();return;}
      p.el.animate([{opacity:1,transform:`translate(${p.x}px,0)`},{opacity:0,transform:`translate(${p.x}px,40px)`}],{duration:180,easing:'cubic-bezier(0.7,0,0.84,0)',fill:'forwards'}).finished.then(()=>p.el.remove());}

    return {
      /* Set how many wait on the left. New ones rise out of the text, or run in when "join" is set. */
      setLeft(n,{join}={}){
        lTotal=n;const want=Math.min(n,MAX);
        while(L.length>want)drop(L.pop());
        const start=L.length;
        for(let i=start;i<want;i++)add(L,zl,left==='costume',i,join&&start>0?'run':'rise');
        label();
      },
      /* Everyone on the left walks into the booth and comes out the other side changed. "stay" are left outside, puzzled. */
      go({stay=0}={}){
        busy=busy.then(async()=>{
          [...R].forEach(p=>drop(p));R.length=0;rTotal=0;label();
          const goers=L.slice(0,Math.max(0,L.length-stay)),stayers=L.slice(goers.length);
          if(goers.length)booth.classList.add('busy');      // the door swings open for the whole procession
          const moving=goers.map((p,k)=>(async()=>{
            await wait(k*70);
            await walk(p,door(),{fade:false});
            if(!still())await p.el.animate([{opacity:1,transform:`translateX(${p.x}px)`},{opacity:0,transform:`translateX(${p.x}px) scale(.85)`}],{duration:90,fill:'forwards'}).finished;
            p.el.remove();
            await wait(140);
            const q={s:p.s,el:person(p.s,right==='costume')};root.appendChild(q.el);R.push(q);place(q,door());
            if(!still())q.el.animate([{opacity:0},{opacity:1}],{duration:90});
            await walk(q,slot(zr,R.indexOf(q),'r'));
          })());
          L.length=0;L.push(...stayers);
          stayers.forEach((p,i)=>{p.el.classList.add('puzzled');walk(p,slot(zl,i,'l'));});
          rTotal=Math.max(goers.length,lTotal-stay);lTotal=stayers.length;label();
          await Promise.all(moving);
          booth.classList.remove('busy');
        });
        return busy;
      },
      /* The evening ends: everyone on the right walks off the edge. */
      leave(){
        busy=busy.then(async()=>{
          const edge=root.offsetWidth+10;
          await Promise.all(R.map((p,i)=>wait(i*40).then(()=>walk(p,edge)).then(()=>p.el.remove())));
          R.length=0;rTotal=0;label();
        });
        return busy;
      },
      clear(){L.splice(0).forEach(drop);R.splice(0).forEach(drop);lTotal=rTotal=0;label();},
      clearRight(){R.splice(0).forEach(drop);rTotal=0;label();},
      /* After a resize, everyone steps back to their spot. */
      relayout(){L.forEach((p,i)=>place(p,slot(zl,i,'l')));R.forEach((p,i)=>place(p,slot(zr,i,'r')));},
    };
  }
  return {stage};
})();
