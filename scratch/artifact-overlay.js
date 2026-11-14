/* Artifact review dock: state switcher + "Pick to change".
   Uses the comments capability's customAnchors so the page owns comment mode:
   pick an element -> claude.ai composer opens there (labelled with the element's data-s id);
   after the comment is sent or closed, comment mode ends and you are back to browsing. */
(()=>{
const STATES=window.SCRATCH_STATES||['empty','loading','error','full'];
const ss={get:k=>{try{return sessionStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{sessionStorage.setItem(k,v)}catch(e){}}};
const mk=(t,p={},...c)=>{const e=document.createElement(t);Object.assign(e,p);c.forEach(x=>e.append(x));return e};
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

document.head.append(mk('style',{textContent:STATES.map(s=>`body[data-state="${s}"] [data-when]:not([data-when~="${s}"]){display:none!important}`).join('')+`
#rv{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:6px;padding:5px;border-radius:999px;
 background:var(--surface);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);box-shadow:var(--hl),var(--shadow-2);font:600 12px var(--font);max-width:calc(100vw - 32px)}
#rv .grp{display:flex;gap:2px;padding:2px;border-radius:999px;background:var(--fill)}
#rv button{border:0;background:none;color:var(--label-2);font:600 11.5px var(--font);height:28px;padding:0 10px;border-radius:999px;cursor:pointer;transition:background-color 150ms ease,color 150ms ease,transform 160ms var(--ease-out)}
#rv button:active{transform:scale(.97)}
#rv .grp button[aria-pressed="true"]{background:var(--surface-solid);color:var(--label);box-shadow:var(--hl),0 1px 2px rgba(0,0,0,.12)}
#rv .pick{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:var(--on-accent);padding:0 14px}
#rv .pick[aria-pressed="true"]{background:var(--label);color:var(--bg)}
#rv .msg{color:var(--label-2);font-weight:500;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rv-hl{outline:2px solid var(--accent)!important;outline-offset:3px!important;border-radius:6px}
#rv-tag{position:fixed;z-index:61;pointer-events:none;padding:2px 7px;border-radius:6px;background:var(--accent);color:var(--on-accent);font:600 11px var(--mono);white-space:nowrap}
.np-bar{bottom:68px!important}
body.rv-picking *{cursor:crosshair!important}
body.rv-picking #rv,body.rv-picking #rv *{cursor:pointer!important}
@media (max-width:640px){#rv .msg{display:none}#rv .grp button{padding:0 7px}}
`}));

/* stable ids so anchors name the element */
document.querySelectorAll('[data-s]').forEach(el=>{if(!el.id)el.id='s-'+el.dataset.s});

/* dock */
const dock=mk('div',{id:'rv'});dock.setAttribute('data-uncommentable','');dock.setAttribute('role','toolbar');dock.setAttribute('aria-label','Review tools');
const grp=mk('div',{className:'grp'});grp.setAttribute('role','group');grp.setAttribute('aria-label','Screen state');
const setState=s=>{document.body.dataset.state=s;ss.set('rv-state',s);[...grp.children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===s));schedulePins()};
STATES.forEach(s=>{const b=mk('button',{textContent:s[0].toUpperCase()+s.slice(1)});b.dataset.v=s;b.onclick=()=>setState(s);grp.append(b)});
const pick=mk('button',{className:'pick',innerHTML:'<svg class="i" style="width:14px;height:14px"><use href="#i-search"/></svg><span>Pick to change</span>'});
pick.setAttribute('aria-pressed','false');
const msg=mk('span',{className:'msg'});
dock.append(grp,pick,msg);document.body.append(dock);
let sayT;const say=(t,ms=5000)=>{msg.textContent=t;clearTimeout(sayT);if(ms)sayT=setTimeout(()=>msg.textContent='',ms)};

/* comments + custom anchors */
let comments=null,ca=null,shellMode=false,composing=false,threads=[];
const resolve=a=>{try{return document.querySelector(a)}catch(e){return null}};
const visible=el=>el&&el.getClientRects().length>0;
let pinRaf=0;
function schedulePins(){if(!ca||pinRaf)return;pinRaf=requestAnimationFrame(()=>{pinRaf=0;const map={};
  threads.forEach(t=>{const el=resolve(t.anchor);if(visible(el)){const r=el.getBoundingClientRect();map[t.id]={x:Math.min(r.right,innerWidth-12)-10+scrollX,y:r.top+10+scrollY}}});
  try{ca.placed(map)}catch(e){}})}
['resize','hashchange'].forEach(ev=>addEventListener(ev,schedulePins));
document.getElementById('main')?.addEventListener('scroll',schedulePins,{passive:true});

(async()=>{
  try{comments=await window.claude?.use?.('comments')}catch(e){}
  if(!comments){say('Comments are off here. Use the comment button in the artifact toolbar.');return}
  try{ca=await comments.customAnchors({
      mode:on=>{shellMode=on;if(!on){threads=[];if(picking)setPick(false)}sync()},
      threads:list=>{threads=list||[];schedulePins()},
      reveal:id=>{const t=threads.find(x=>x.id===id),el=t&&resolve(t.anchor);if(visible(el))el.scrollIntoView({block:'center',behavior:calm()?'auto':'smooth'})},
      composing:open=>{const was=composing;composing=open;
        /* composer closed (sent or dismissed): leave comment mode so clicks browse again */
        if(was&&!open){setTimeout(()=>{if(!composing){try{ca.exitMode()}catch(e){}setPick(false);say('Sent. Back to browsing.',3000)}},250)}}
    });schedulePins()}
  catch(e){ca=null}
})();

/* pick mode */
let picking=false,hl=null;const tag=mk('div',{id:'rv-tag'});tag.hidden=true;document.body.append(tag);
const intercepting=()=>picking||shellMode;
const target=e=>e.closest('[data-s]')||e;
const clearHl=()=>{if(hl)hl.classList.remove('rv-hl');hl=null;tag.hidden=true};
function sync(){const on=intercepting();pick.setAttribute('aria-pressed',on);pick.querySelector('span').textContent=on?'Done':'Pick to change';
  document.body.classList.toggle('rv-picking',on);if(!on)clearHl()}
function setPick(v){picking=v;if(!v&&shellMode&&ca){try{ca.exitMode()}catch(e){}}sync();
  if(v)say('Click the part you want changed. Done or Esc to go back.',0);else if(msg.textContent.startsWith('Click'))say('')}
pick.onclick=()=>setPick(!intercepting());
addEventListener('keydown',e=>{if(e.key==='Escape'&&intercepting()&&!composing)setPick(false)});
document.addEventListener('mouseover',e=>{if(!intercepting()||e.target.closest('#rv'))return;const t=target(e.target);if(t===hl)return;clearHl();hl=t;t.classList.add('rv-hl');
  const r=t.getBoundingClientRect();tag.textContent=(t.dataset.s||t.tagName.toLowerCase())+' · '+(location.hash||'#home')+' · '+document.body.dataset.state;
  tag.hidden=false;tag.style.left=Math.max(8,Math.min(r.left,innerWidth-tag.offsetWidth-8))+'px';tag.style.top=Math.max(8,r.top-26)+'px'},true);
document.addEventListener('click',async e=>{if(!intercepting()||e.target.closest('#rv'))return;e.preventDefault();e.stopPropagation();
  const t=target(e.target);clearHl();
  const label=`${t.dataset.s||t.tagName.toLowerCase()} · ${location.hash||'#home'} · ${document.body.dataset.state}`;
  try{
    if(ca){const [anchor,at]=ca.domAnchor(t,e);const r=await ca.compose(anchor,at,{label,detail:(t.innerText||'').replace(/\s+/g,' ').slice(0,300)});
      if(r&&r.opened){picking=false;say('Type your change, then press Send to Claude.')}else say('Close the open comment first, then pick again.')}
    else if(comments){setPick(false);const r=await comments.openComposer({element:t});
      say(r&&r.opened?'Type your change, then press Send to Claude. Press Esc in the comment bar to stop commenting.':'Close the open comment first, then pick again.')}
    else{setPick(false);say('Comments are off here. Use the comment button in the artifact toolbar.')}
  }catch(err){say(err&&err.code==='rate_limited'?'Too many picks at once. Wait a moment.':'Couldn’t open a comment here. Use the comment button in the artifact toolbar.')}
  sync()},true);
setState(STATES.includes(ss.get('rv-state'))?ss.get('rv-state'):'full');
})();
