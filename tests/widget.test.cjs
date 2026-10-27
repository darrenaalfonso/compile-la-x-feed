const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('public/widget.js','utf8');
class Element {
  constructor(tag) { this.tag = tag; this.children=[]; this.dataset={}; this.attributes={}; }
  append(...nodes) { for (const n of nodes) this.children.push(...(n.tag === 'fragment' ? n.children : [n])); }
  replaceChildren(...nodes) { this.children=[]; this.append(...nodes); }
  setAttribute(k,v) { this.attributes[k]=v; }
  set textContent(v) { this.text=String(v); this.children=[]; }
  get textContent() { return (this.text || '') + this.children.map(n=>n.textContent).join(''); }
  set innerHTML(v) { assert.match(v, /^<svg /); this.staticHTML=v; }
}
async function run(feed, ok=true, present=true) {
  const host = new Element('div'), timers=[];
  let calls=0;
  const document = {currentScript:{src:'https://example.github.io/feed/widget.js',dataset:{}},readyState:'complete',getElementById:()=>present?host:null,
    createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),createTextNode:text=>{const n=new Element('text');n.textContent=text;return n;}};
  vm.runInNewContext(source,{document,URL,AbortController,Date,location:{pathname:'/'},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},fetch:async()=>{calls++;return {ok,json:async()=>feed};}});
  await new Promise(resolve=>setImmediate(resolve));
  const walk=n=>[n,...n.children.flatMap(walk)];
  return {host,nodes:walk(host),timers,calls};
}
const fixture=()=>({version:1,updated_at:new Date().toISOString(),author:{username:'compilela',name:'Compile LA'},posts:[{id:'123',text:'<img src=x onerror=alert(1)>',created_at:'2026-10-27T14:23:00Z'}]});
test('renders post text without interpreting HTML and safe permalink',async()=>{
  const r=await run(fixture());
  assert.equal(r.nodes.filter(n=>n.tag==='article').length,1);
  assert(r.host.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.equal(r.nodes.filter(n=>n.tag==='img').length,0);
  assert(r.nodes.some(n=>n.href==='https://x.com/compilela/status/123'));
});
test('stale and unavailable feeds show fallback',async()=>{
  for (const r of [await run({...fixture(),updated_at:'2020-01-01'}),await run(null,false)]) {
    assert.equal(r.nodes.filter(n=>n.tag==='article').length,0);
    assert(r.host.textContent.includes('For the latest posts'));
  }
});
test('does not fetch on pages without a feed target',async()=>assert.equal((await run(fixture(),true,false)).calls,0));
test('limits cards to five and expires open-tab content',async()=>{
  const f=fixture();f.posts=Array.from({length:8},(_,i)=>({...f.posts[0],id:String(i+100)}));
  const r=await run(f); assert.equal(r.nodes.filter(n=>n.tag==='article').length,5);
  r.timers.find(t=>t.ms>10000).fn(); assert(r.host.textContent.includes('For the latest posts'));
  assert(!r.host.textContent.includes('onerror'));
});
test('rejects hostile URL entities and unsafe IDs',async()=>{
  const f=fixture();f.posts[0].entities={urls:[{start:0,end:4,url:'javascript:alert(1)',display_url:'click'}]};
  const r=await run(f);assert(!r.nodes.some(n=>(n.href||'').startsWith('javascript:')));
  f.posts[0].id='../../bad';assert.equal((await run(f)).nodes.filter(n=>n.tag==='article').length,0);
});
test('links unicode-offset entities without changing surrounding text',async()=>{
  const f=fixture();f.posts[0].text='😀 https://t.co/a';f.posts[0].entities={urls:[{start:2,end:16,url:'https://t.co/a',display_url:'example.com'}]};
  // X entity indices count Unicode code points.
  f.posts[0].entities.urls[0].end=Array.from(f.posts[0].text).length;
  const r=await run(f);assert(r.nodes.some(n=>n.href==='https://t.co/a' && n.textContent==='example.com'));
  assert(r.host.textContent.includes('😀 example.com'));
});
