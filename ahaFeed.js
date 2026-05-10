// ahaFeed.js
(function () {
  "use strict";
  const KEY = "aha_feed_posts_v1";
  const load = () => { try { const p = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } };
  const save = (items) => localStorage.setItem(KEY, JSON.stringify(Array.isArray(items) ? items : []));
  const active = (items) => (Array.isArray(items) ? items : []).filter((x) => !x?.deleted_at);
  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  function persistPost(post) { window.AHARepository?.saveFeedPost?.(post).then((r)=>{ if(r?.ok===false&&r.error) console.warn("AHAFeed: database-save feilet", r.error); }); }
  function render(source){ const m=document.getElementById("feed-list"); if(!m) return; const posts=active(Array.isArray(source)?source:load()); m.innerHTML=posts.length?posts.map((p)=>`<article class="module-card"><p>${esc(p.text||"")}</p><div class="module-meta">${esc(p.created_at||"")}${p.last_source_event_id?` · source: ${esc(p.last_source_event_id)}`:""}</div><div class="module-actions"><button type="button" data-action="delete" data-id="${esc(p.id)}">Slett</button></div></article>`).join(""):'<p>Ingen poster ennå.</p>'; }
  function addPost(input){ const post={id:`feed_${Date.now()}_${Math.floor(Math.random()*100000)}`,text:String(input.text||"").trim(),tags:Array.isArray(input.tags)?input.tags:[],meta:{},created_at:new Date().toISOString(),deleted_at:null,last_source_event_id:null}; if(!post.text) return null; const res=window.AHAIngest?.ingest?.({source_type:"feed_post",source_app:"aha_feed",content_type:"text",title:"AHA Feed-post",text:post.text,user_created:true,imported:false,created_at:post.created_at,meta:{feed_post_id:post.id}}); if(res?.sourceEvent?.id) post.last_source_event_id=res.sourceEvent.id; const posts=load(); posts.unshift(post); save(posts); persistPost(post); render(posts); return post; }
  function deletePost(id){ const posts=load(); const i=posts.findIndex((p)=>p.id===id&&!p.deleted_at); if(i<0) return false; posts[i]={...posts[i],deleted_at:new Date().toISOString()}; save(posts); persistPost(posts[i]); render(posts); return true; }
  function bind(){ const form=document.getElementById("feed-form"); if(form){ form.addEventListener("submit",(e)=>{e.preventDefault(); const t=document.getElementById("feed-text"); addPost({text:t?.value}); if(t)t.value="";}); } document.getElementById("feed-list")?.addEventListener("click",(e)=>{ const b=e.target.closest("button[data-action='delete'][data-id]"); if(b) deletePost(b.dataset.id);}); render(); }
  window.AHAFeed={load,save,addPost,deletePost,render}; if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind); else bind();
})();
