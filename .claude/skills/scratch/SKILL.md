---
name: "scratch"
description: "Scratch prototyping loop: turn the prior chat discussion into a spec sheet, build one scratch.html in the app's real styles, then iterate by clicking elements and leaving notes in a floating panel. Use when Haykal says scratch."
---

# Scratch

Prototype a screen as one throwaway `scratch/scratch.html` before building it for real. The user reviews visually and points at what to change instead of reading plans. Every step is designed to spend as few tokens as possible.

## Token rules (apply throughout)
- Never re-read `scratch.html` in full after creating it. Locate things with `grep -n 'data-s="<id>"'` and change them with small `Edit` calls.
- Never rewrite the whole file for feedback. Only `Write` it once (or when the user asks for a fresh redo).
- Read only the app's style source (tokens, CSS variables, tailwind config, one representative component) - not the whole codebase.
- Keep `SPEC.md` short: bullet points, no prose.
- Keep chat replies to 1-2 lines during the iterate loop ("Done: 3 edits. Page reloads itself.").
- `overlay.js` and `serve.py` below are fixed. Write them only if `scratch/` doesn't already have them; never read or edit them afterwards.

## 1. Spec sheet
The user has already discussed the idea in the conversation before calling this skill. Don't ask discovery questions. Write the spec straight from that discussion, filling small gaps with sensible defaults (states default to empty, loading, error, full) and listing anything truly unresolved under Open questions.

Write `scratch/SPEC.md`:

```
# <Screen name>
Goal: <one line>
Screens/routes: #main, #settings ...
States: empty | loading | error | full
Components: <id> - <what it is> (one per line)
Data: <fields + 3-5 realistic sample rows>
Actions: <button -> what happens>
Style source: <file paths of tokens used>
Open questions: <if any>
```
Show it in 5-10 lines and ask "Build it?" Wait for a yes (or apply edits to SPEC.md first).

## 2. Build scratch.html
Single self-contained file in `scratch/` that looks exactly like the real app:
- Copy the real CSS variables/colors/fonts/radius into a `<style>` block (or link the app's built CSS if served locally). If no app exists yet, pick a clean, deliberate style and note it in SPEC.md.
- Multiple screens = hash routes (`#main`, `#settings`); show/hide sections with a tiny `hashchange` handler.
- States: put `<script>window.SCRATCH_STATES=['empty','loading','error','full']</script>` in `<head>`. Mark state-specific elements with `data-when="full"` (space-separated for several: `data-when="full error"`). Elements without `data-when` always show. The overlay renders the state switcher bar.
- Give every meaningful element a short, unique, readable `data-s` id (`title`, `new-btn`, `row-2`, `filter-status`). These ids are how notes map to edits - be generous with them.
- Realistic sample data from SPEC.md, no lorem ipsum.
- Last line before `</body>`: `<script src="overlay.js"></script>`
- Fake interactions only (toggle classes, show toasts). No backend.

Then write `overlay.js` and `serve.py` (if missing), and start the server in the background:
`python scratch/serve.py` (Windows) / `python3 scratch/serve.py` - port 4321, pass another port as an argument if busy.

Tell the user: open http://localhost:4321 - press **P** (or the Pick button) to click any element and type a change, use the bottom bar to switch states, write general prompts in the panel, then hit **Send** and say **"go"**. If the server can't run, they can open the file directly and use **Copy**, then paste the notes into chat.

## 3. Iterate loop
When the user says "go" (or pastes notes):
1. Read `scratch/notes.txt` (or the pasted text). Format:
   ```
   @#route state
   [data-s id or css path] change requested
   @general #route state
   free-form prompt
   ```
2. For each line: `grep -n` the id, then make the smallest `Edit` that does it. Batch independent edits in one turn. If a change needs a new element, give it a new `data-s`.
3. If a note is ambiguous, make your best reasonable call and mention it in one line - don't stop to ask unless the change is large.
4. Empty `notes.txt` after applying.
5. Reply in 1-2 lines. The page auto-reloads when scratch.html changes.

Repeat until the user is happy. Update `SPEC.md` only if scope changed (new screen, new state, new data field).

## 4. Build the real thing
When the user approves ("ship it", "build it", "looks good, implement"):
- Use `SPEC.md` + `scratch.html` as the source of truth; map each `data-s` region to a real component in the project's framework and reuse its existing components/tokens.
- Implement every state from SCRATCH_STATES.
- Run the project's checks (typecheck/lint/tests) if they exist.
- Leave `scratch/` in place unless the user asks to delete it; suggest adding `scratch/` to `.gitignore`.

## overlay.js (write verbatim)
```js
/* Scratch overlay: pick elements, pin notes, send to notes.txt. No deps. */
(()=>{
const LS='scratch-notes',$=(t,p={},...c)=>{const e=document.createElement(t);Object.assign(e,p);c.forEach(x=>e.append(x));return e};
let notes=[];try{notes=JSON.parse(localStorage.getItem(LS))||[]}catch(e){}
const save=()=>{try{localStorage.setItem(LS,JSON.stringify(notes))}catch(e){}};
const css=`#sx,#sx *{all:revert;box-sizing:border-box;font:12px/1.4 ui-sans-serif,system-ui,sans-serif}
#sx{position:fixed;right:16px;bottom:16px;width:300px;z-index:2147483646;background:#111;color:#eee;border:1px solid #333;border-radius:12px;box-shadow:0 10px 40px #0008;display:flex;flex-direction:column;max-height:70vh}
#sx header{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #2a2a2a;cursor:move;user-select:none}
#sx header b{flex:1;font-weight:700;color:#ff7a33}
#sx button{background:#222;color:#eee;border:1px solid #3a3a3a;border-radius:6px;padding:4px 8px;cursor:pointer}
#sx button.on,#sx button.pri{background:#ff7a33;border-color:#ff7a33;color:#111;font-weight:700}
#sx ol{margin:0;padding:6px 10px 6px 28px;overflow:auto;flex:1}
#sx li{margin:4px 0}#sx li code{color:#ff7a33;font-family:ui-monospace,monospace}
#sx li span.x{color:#888;cursor:pointer;margin-left:6px}
#sx textarea{margin:0 10px;min-height:54px;resize:vertical;background:#0b0b0b;color:#eee;border:1px solid #333;border-radius:6px;padding:6px}
#sx footer{display:flex;gap:6px;padding:8px 10px;align-items:center}#sx footer i{flex:1;color:#888;font-style:normal}
#sx.min ol,#sx.min textarea,#sx.min footer{display:none}
.sx-hl{outline:2px dashed #ff7a33!important;outline-offset:2px!important;cursor:crosshair!important}
.sx-pin{position:absolute;z-index:2147483645;width:20px;height:20px;border-radius:50%;background:#ff7a33;color:#111;font:700 11px/20px system-ui;text-align:center;pointer-events:none;box-shadow:0 2px 6px #0006}
#sx-ask{position:absolute;z-index:2147483647;display:flex;gap:4px;background:#111;padding:6px;border:1px solid #ff7a33;border-radius:8px}
#sx-ask input{all:revert;width:240px;background:#0b0b0b;color:#eee;border:1px solid #333;border-radius:6px;padding:4px 6px;font:12px system-ui}
#sx-states{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483646;display:flex;gap:4px;background:#111;padding:4px;border-radius:999px;border:1px solid #333}
#sx-states button{all:revert;background:none;color:#aaa;border:0;border-radius:999px;padding:4px 10px;font:700 10px system-ui;letter-spacing:.06em;cursor:pointer}
#sx-states button.on{background:#ff7a33;color:#111}`;
document.head.append($('style',{textContent:css}));

/* ---- states: elements with data-when="full error" show only in those states ---- */
const states=window.SCRATCH_STATES||[];
const getState=()=>document.body.dataset.state||'';
if(states.length){
  document.head.append($('style',{textContent:states.map(s=>`body[data-state="${s}"] [data-when]:not([data-when~="${s}"]){display:none!important}`).join('')}));
  const bar=$('div',{id:'sx-states'});
  const set=s=>{document.body.dataset.state=s;try{sessionStorage.setItem('sx-state',s)}catch(e){};[...bar.children].forEach(b=>b.classList.toggle('on',b.textContent===s.toUpperCase()))};
  states.forEach(s=>bar.append($('button',{textContent:s.toUpperCase(),onclick:()=>set(s)})));
  document.body.append(bar);let s0=states.at(-1);try{s0=sessionStorage.getItem('sx-state')||s0}catch(e){};set(states.includes(s0)?s0:states.at(-1));
}

/* ---- target id: nearest data-s, else short css path ---- */
const isUI=e=>e.closest('#sx,#sx-ask,#sx-states');
const target=e=>e.closest('[data-s]')||e;
const idOf=e=>{if(e.dataset.s)return e.dataset.s;const p=[];for(let n=e;n&&n!==document.body&&p.length<4;n=n.parentElement){let k=n.tagName.toLowerCase();if(n.id){p.unshift('#'+n.id);break}const sib=[...n.parentElement.children].filter(x=>x.tagName===n.tagName);if(sib.length>1)k+=`:nth-of-type(${sib.indexOf(n)+1})`;p.unshift(k)}return p.join('>')};
const find=id=>{try{return document.querySelector(`[data-s="${id}"]`)||document.querySelector(id)}catch(e){return null}};

/* ---- panel ---- */
const box=$('div',{id:'sx'}),pick=$('button',{textContent:'Pick (P)',title:'Click elements to comment'}),list=$('ol'),
 ta=$('textarea',{placeholder:'General prompt for this screen… (optional)'}),info=$('i'),
 send=$('button',{className:'pri',textContent:'Send'}),copy=$('button',{textContent:'Copy'}),clr=$('button',{textContent:'Clear'}),
 mn=$('button',{textContent:'–',title:'Minimise'});
const head=$('header',{},$('b',{textContent:'Scratch'}),pick,mn);
box.append(head,list,ta,$('footer',{},info,clr,copy,send));document.body.append(box);
mn.onclick=()=>box.classList.toggle('min');

/* drag */
head.onpointerdown=d=>{if(d.target.tagName==='BUTTON')return;const r=box.getBoundingClientRect(),ox=d.clientX-r.left,oy=d.clientY-r.top;
 const mv=m=>{box.style.left=m.clientX-ox+'px';box.style.top=m.clientY-oy+'px';box.style.right=box.style.bottom='auto'};
 addEventListener('pointermove',mv);addEventListener('pointerup',()=>removeEventListener('pointermove',mv),{once:true})};

/* pins + list */
let pins=[];
const render=()=>{pins.forEach(p=>p.remove());pins=[];list.replaceChildren();
 notes.forEach((n,i)=>{const x=$('span',{className:'x',textContent:'✕',onclick:()=>{notes.splice(i,1);save();render()}});
  list.append($('li',{},$('code',{textContent:n.s}),' '+n.note,x));
  const el=n.route===location.hash?find(n.s):null;if(!el)return;const r=el.getBoundingClientRect();
  const p=$('div',{className:'sx-pin',textContent:i+1});p.style.left=r.right+scrollX-10+'px';p.style.top=r.top+scrollY-10+'px';document.body.append(p);pins.push(p)});
 info.textContent=notes.length?notes.length+' note'+(notes.length>1?'s':''):''};
addEventListener('resize',render);addEventListener('hashchange',render);

/* pick mode */
let picking=false,hl=null;
const setPick=v=>{picking=v;pick.classList.toggle('on',v);if(!v&&hl){hl.classList.remove('sx-hl');hl=null}};
pick.onclick=()=>setPick(!picking);
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='p'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!e.metaKey&&!e.ctrlKey)setPick(!picking);if(e.key==='Escape'){setPick(false);document.getElementById('sx-ask')?.remove()}});
document.addEventListener('mouseover',e=>{if(!picking||isUI(e.target))return;const t=target(e.target);if(hl)hl.classList.remove('sx-hl');hl=t;t.classList.add('sx-hl')},true);
document.addEventListener('click',e=>{if(!picking||isUI(e.target))return;e.preventDefault();e.stopPropagation();
 const t=target(e.target),r=t.getBoundingClientRect();document.getElementById('sx-ask')?.remove();
 const inp=$('input',{placeholder:`Change to ${idOf(t)}… (Enter)`}),ask=$('div',{id:'sx-ask'},inp);
 ask.style.left=Math.min(r.left+scrollX,innerWidth+scrollX-270)+'px';ask.style.top=r.bottom+scrollY+6+'px';document.body.append(ask);inp.focus();
 inp.onkeydown=k=>{if(k.key==='Enter'&&inp.value.trim()){notes.push({s:idOf(t),note:inp.value.trim(),route:location.hash,state:getState()});save();ask.remove();render()}if(k.key==='Escape')ask.remove()}},true);

/* compact output: one line per note, grouped by screen/state */
const compact=()=>{const g={};notes.forEach(n=>{const k=`${n.route||'#'} ${n.state}`.trim();(g[k]=g[k]||[]).push(`[${n.s}] ${n.note}`)});
 let out=Object.entries(g).map(([k,v])=>`@${k}\n${v.join('\n')}`).join('\n');
 if(ta.value.trim())out+=`\n@general ${location.hash||'#'} ${getState()}\n${ta.value.trim()}`;return out.trim()};
const done=msg=>{notes=[];ta.value='';save();render();info.textContent=msg};
copy.onclick=async()=>{const t=compact();if(!t)return;try{await navigator.clipboard.writeText(t);done('Copied — paste to Claude')}catch(e){prompt('Copy this:',t)}};
send.onclick=async()=>{const t=compact();if(!t)return;try{const r=await fetch('/notes',{method:'POST',body:t});if(!r.ok)throw 0;done('Sent ✓ — tell Claude "go"')}catch(e){copy.onclick()}};
clr.onclick=()=>done('');

/* live reload when scratch.html changes (only when served by serve.py) */
let v0=null;setInterval(async()=>{try{const v=await(await fetch('/v',{cache:'no-store'})).text();if(v0&&v!==v0)location.reload();v0=v}catch(e){}},1500);
render();
})();
```

## serve.py (write verbatim)
```python
"""Scratch server: serves this folder, appends POST /notes to notes.txt, /v = scratch.html mtime."""
import http.server, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/v":
            b = str(os.path.getmtime("scratch.html")).encode()
            self.send_response(200); self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(b)
        else:
            if self.path == "/": self.path = "/scratch.html"
            super().do_GET()
    def do_POST(self):
        if self.path != "/notes": return self.send_error(404)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        with open("notes.txt", "a", encoding="utf-8") as f: f.write(body.strip() + "\n")
        print("NOTES RECEIVED", flush=True)
        self.send_response(204); self.end_headers()
    def log_message(self, *a): pass

print(f"Scratch on http://localhost:{PORT}", flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
```