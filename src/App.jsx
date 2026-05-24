import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════
   SHINORA — Anime · Movies · Manga
   APIs:
   • Anime  → Jikan (jikan.moe) + megaplay.buzz
   • Movies → YTS  (yts.mx/api/v2) + vidsrc / 111movies
   • Manga  → MangaDex (api.mangadex.org) — built-in reader
══════════════════════════════════════════ */

/* ── Storage (local accounts) ─────────── */
const LS = {
  users    : () => JSON.parse(localStorage.getItem("sh_users")    || "[]"),
  session  : () => localStorage.getItem("sh_session"),
  hist     : (id) => JSON.parse(localStorage.getItem(`sh_hist_${id}`)  || "{}"),
  bm       : (id) => JSON.parse(localStorage.getItem(`sh_bm_${id}`)    || "[]"),
  saveUsers: (v)  => localStorage.setItem("sh_users",   JSON.stringify(v)),
  saveSess : (id) => localStorage.setItem("sh_session", id),
  clearSess: ()   => localStorage.removeItem("sh_session"),
  saveHist : (id,v) => localStorage.setItem(`sh_hist_${id}`,  JSON.stringify(v)),
  saveBm   : (id,v) => localStorage.setItem(`sh_bm_${id}`,    JSON.stringify(v)),
};
const mkId = () => Math.random().toString(36).slice(2);

/* ── Anime API (Jikan) ────────────────── */
const JIKAN = "https://api.jikan.moe/v4";
const GENRE_IDS = { Action:1,Adventure:2,Comedy:4,Drama:8,Fantasy:10,Horror:14,Mystery:7,Romance:22,"Sci-Fi":24,"Slice of Life":36,Sports:30,Supernatural:37,Thriller:41,Psychological:40,Historical:13,Mecha:18 };
const ANIME_GENRES = ["All",...Object.keys(GENRE_IDS)];

const fetchAnime = async ({ page=1, search="", genre="All" }={}) => {
  await new Promise(r => setTimeout(r, 300));
  let path;
  if (search.trim()) path = `/anime?q=${encodeURIComponent(search)}&type=tv&limit=24&sfw=true&page=${page}&order_by=popularity`;
  else if (genre !== "All" && GENRE_IDS[genre]) path = `/anime?genres=${GENRE_IDS[genre]}&type=tv&order_by=score&sort=desc&limit=24&sfw=true&page=${page}`;
  else path = `/top/anime?type=tv&limit=24&page=${page}&filter=bypopularity`;
  const d = await (await fetch(`${JIKAN}${path}`)).json();
  return { list: d.data||[], hasMore: d.pagination?.has_next_page||false, page: d.pagination?.current_page||page };
};
const fetchAnimeRow = async (path) => { try { return (await (await fetch(`${JIKAN}${path}`)).json()).data||[]; } catch { return []; } };
const fetchSkipTimes = async (malId, ep) => {
  try {
    const d = await (await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${ep}?types[]=op&types[]=ed&episodeLength=0`)).json();
    if (!d.found) return null;
    return { op: d.results.find(x=>x.skipType==="op")?.interval||null, ed: d.results.find(x=>x.skipType==="ed")?.interval||null };
  } catch { return null; }
};

/* ── Movie API (YTS) ──────────────────── */
const YTS = "https://yts.mx/api/v2/list_movies.json";
const MOVIE_GENRES = ["All","Action","Adventure","Animation","Comedy","Crime","Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Thriller","Western"];

const fetchMovies = async ({ page=1, search="", genre="All", rating=0 }={}) => {
  let url = `${YTS}?limit=24&page=${page}&sort_by=rating&order_by=desc&minimum_rating=${rating}`;
  if (search.trim()) url += `&query_term=${encodeURIComponent(search)}`;
  if (genre !== "All") url += `&genre=${genre}`;
  const d = await (await fetch(url)).json();
  return { list: d.data?.movies||[], hasMore: (d.data?.movie_count||0) > page*24, page };
};
const fetchMovieRow = async (params) => {
  try { const d = await (await fetch(`${YTS}?limit=20&sort_by=rating&order_by=desc&minimum_rating=7&${params}`)).json(); return d.data?.movies||[]; } catch { return []; }
};

/* ── Manga API (MangaDex) ─────────────── */
const MDX = "https://api.mangadex.org";
const MANGA_GENRES = ["All","Action","Adventure","Comedy","Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Slice of Life","Supernatural","Thriller"];
const MDX_TAGS = { Action:"391b0423-d847-456f-aff0-8b0cfc03066b",Adventure:"87cc87cd-a395-47af-b27a-93258283bbc6",Comedy:"4d32cc48-9f00-4cca-9b5a-a56702952f9c",Drama:"b9af3a63-f058-46de-a9a0-e0c13906197a",Fantasy:"cdc58593-87dd-415e-bbc0-2ec27bf404cc",Horror:"cdad7e68-1419-41dd-bdce-27753074a640",Mystery:"ee968100-4191-4968-93d3-f68d863pac1",Romance:"423e2eae-a7a2-4a8b-ac03-a8351462d71d","Sci-Fi":"256c8bd9-4904-4360-bf4f-508a76d67183","Slice of Life":"e5301a23-ebd9-49dd-a0cb-2add944c7fe9",Supernatural:"eabc5b4c-6aff-42f3-b657-3e90cbd00b75",Thriller:"07251805-a27e-4d59-b488-f0bfbec15168" };

const getCoverUrl = (m) => {
  const rel = m.relationships?.find(r=>r.type==="cover_art");
  if (!rel?.attributes?.fileName) return null;
  return `https://uploads.mangadex.org/covers/${m.id}/${rel.attributes.fileName}.256.jpg`;
};

const fetchManga = async ({ page=1, search="", genre="All" }={}) => {
  let url = `${MDX}/manga?limit=24&offset=${(page-1)*24}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc`;
  if (search.trim()) url += `&title=${encodeURIComponent(search)}`;
  if (genre !== "All" && MDX_TAGS[genre]) url += `&includedTags[]=${MDX_TAGS[genre]}`;
  const d = await (await fetch(url)).json();
  return { list: d.data||[], hasMore: (d.data?.length||0)===24, page };
};
const fetchMangaChapters = async (id) => {
  const d = await (await fetch(`${MDX}/manga/${id}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=100&contentRating[]=safe&contentRating[]=suggestive`)).json();
  return d.data||[];
};
const fetchChapterPages = async (chapterId) => {
  const d = await (await fetch(`${MDX}/at-home/server/${chapterId}`)).json();
  if (!d.baseUrl||!d.chapter) return [];
  return d.chapter.data.map(f=>`${d.baseUrl}/data/${d.chapter.hash}/${f}`);
};

/* ── Video servers ────────────────────── */
const ANIME_SERVERS = [
  { id:"a1", label:"Server 1", tag:"HD",  url:(a,ep,l)=>`https://megaplay.buzz/stream/mal/${a.mal_id}/${ep}/${l}` },
  { id:"a2", label:"Server 2", tag:"HD",  url:(a,ep,l)=>`https://megaplay.buzz/stream/ani/${a.mal_id}/${ep}/${l}` },
  { id:"a3", label:"Server 3", tag:"ALT", url:(a,ep)=>`https://vidsrc.to/embed/anime/${a.mal_id}/${ep}` },
  { id:"a4", label:"Server 4", tag:"ALT", url:(a,ep)=>`https://vidsrc.xyz/embed/anime?id=${a.mal_id}&ep=${ep}` },
];
const MOVIE_SERVERS = [
  { id:"m1", label:"Server 1", tag:"HD",  url:(m)=>`https://vidsrc.to/embed/movie/${m.imdb_code}` },
  { id:"m2", label:"Server 2", tag:"HD",  url:(m)=>`https://vidsrc.xyz/embed/movie?imdb=${m.imdb_code}` },
  { id:"m3", label:"Server 3", tag:"ALT", url:(m)=>`https://111movies.net/movie/${m.imdb_code}` },
  { id:"m4", label:"Server 4", tag:"ALT", url:(m)=>`https://vidsrc.me/embed/movie?imdb=${m.imdb_code}` },
];

/* ── Helpers ──────────────────────────── */
const animeTitle  = (a) => a.title_english||a.title||"Unknown";
const animeImg    = (a) => a.images?.webp?.large_image_url||a.images?.jpg?.large_image_url;
const animeScore  = (a) => a.score?a.score.toFixed(1):"N/A";
const animeGenres = (a) => (a.genres||[]).map(g=>g.name);
const animeEps    = (a) => Array.from({length:Math.min(Number(a.episodes)||12,200)},(_,i)=>i+1);
const mangaTitle  = (m) => m.attributes?.title?.en||m.attributes?.title?.["ja-ro"]||Object.values(m.attributes?.title||{})[0]||"Unknown";

/* ══════════════════════════════════════════
   ICONS
══════════════════════════════════════════ */
const Ic = {
  Star  : ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  Play  : ({s=20})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  Search: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X     : ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bm    : ({on})=><svg width="14" height="14" viewBox="0 0 24 24" fill={on?"#a855f7":"none"} stroke={on?"#a855f7":"currentColor"} strokeWidth="2.2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  ChevL : ()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevR : ()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Menu  : ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Skip  : ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="2" height="16"/></svg>,
  Book  : ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Film  : ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>,
  Sword : ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>,
  Clock : ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};

/* ══════════════════════════════════════════
   SHINORA LOGO (inline SVG)
══════════════════════════════════════════ */
function ShinoraLogo({ size=34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc"/>
          <stop offset="50%" stopColor="#a855f7"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Circle ring */}
      <ellipse cx="52" cy="50" rx="42" ry="42" fill="none" stroke="url(#lg1)" strokeWidth="3" filter="url(#glow)" opacity=".7"/>
      {/* Lightning bolt S shape */}
      <path d="M38 18 L62 18 L48 46 L66 46 L28 82 L42 82 L38 54 L20 54 Z" fill="url(#lg1)" filter="url(#glow)"/>
      {/* Katana diagonal */}
      <line x1="20" y1="18" x2="80" y2="82" stroke="url(#lg1)" strokeWidth="2.5" opacity=".6"/>
      <circle cx="20" cy="18" r="3" fill="#c084fc" opacity=".8"/>
    </svg>
  );
}

/* ══════════════════════════════════════════
   AUTH MODAL
══════════════════════════════════════════ */
function AuthModal({ onClose, onLogin }) {
  const [tab, setTab] = useState("login");
  const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};},[]);
  const submit = () => {
    setErr("");
    if (!name.trim()||!pw.trim()) return setErr("Please fill in all fields.");
    const users = LS.users();
    if (tab==="signup") {
      if (users.find(u=>u.name===name)) return setErr("Username already taken.");
      const u = {id:mkId(),name,pw}; LS.saveUsers([...users,u]); LS.saveSess(u.id); onLogin(u);
    } else {
      const u = users.find(u=>u.name===name&&u.pw===pw);
      if (!u) return setErr("Wrong username or password.");
      LS.saveSess(u.id); onLogin(u);
    }
  };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(16px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:400,border:"1px solid #2d1a5e",boxShadow:"0 0 60px rgba(124,58,237,.2)",animation:"modalIn .2s ease"}}>
        <div style={{display:"flex",borderBottom:"1px solid #1a1a28"}}>
          {[["login","Sign In"],["signup","Sign Up"]].map(([m,l])=>(
            <button key={m} onClick={()=>{setTab(m);setErr("");}} style={{flex:1,background:"none",border:"none",color:tab===m?"#c084fc":"#4b5563",padding:"18px 0",fontSize:14,fontWeight:700,cursor:"pointer",borderBottom:tab===m?"2px solid #a855f7":"2px solid transparent"}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{padding:"28px"}}>
          <div style={{fontSize:19,fontWeight:900,color:"#f1f5f9",marginBottom:5,letterSpacing:-.3}}>{tab==="login"?"Welcome Back":"Join Shinora"}</div>
          <div style={{fontSize:12,color:"#4b5563",marginBottom:22}}>Your watch history saves locally on your device.</div>
          {[["Username",name,setName,"text"],["Password",pw,setPw,"password"]].map(([lbl,val,set,type])=>(
            <div key={lbl} style={{marginBottom:14}}>
              <label style={{display:"block",color:"#6b7280",fontSize:11,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.8}}>{lbl}</label>
              <input type={type} value={val} onChange={e=>set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={lbl}
                style={{width:"100%",background:"#060608",border:"1px solid #2d1a5e",borderRadius:10,color:"#f1f5f9",padding:"11px 14px",fontSize:14,outline:"none"}}/>
            </div>
          ))}
          {err&&<div style={{color:"#f87171",fontSize:12,marginBottom:12,background:"rgba(248,113,113,.08)",padding:"8px 12px",borderRadius:8,border:"1px solid rgba(248,113,113,.2)"}}>{err}</div>}
          <button onClick={submit} style={{width:"100%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"12px 0",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 6px 24px rgba(124,58,237,.4)"}}>
            {tab==="login"?"Sign In":"Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   UNIVERSAL CARD (poster style)
══════════════════════════════════════════ */
function PosterCard({ img, title, subtitle, rating, badge, badgeColor="#059669", bookmarked, onBookmark, onClick, progress }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{position:"relative",cursor:"pointer",borderRadius:10,overflow:"hidden",background:"#0d0d14",flexShrink:0,
        transform:hov?"translateY(-4px)":"none",
        boxShadow:hov?"0 16px 40px rgba(0,0,0,.8),0 0 0 1px rgba(168,85,247,.3)":"0 4px 16px rgba(0,0,0,.5)",
        transition:"transform .2s ease,box-shadow .2s ease"}}>
      <div onClick={onClick} style={{position:"relative",paddingBottom:"148%",overflow:"hidden"}}>
        {img
          ? <img src={img} alt={title} loading="lazy" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",transform:hov?"scale(1.05)":"scale(1)",transition:"transform .35s ease"}}/>
          : <div style={{position:"absolute",inset:0,background:"#1a1a28",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>🎌</div>
        }
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.15) 55%,transparent 100%)"}}/>
        {badge&&<div style={{position:"absolute",top:8,left:8,background:badgeColor,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 7px",borderRadius:20,textTransform:"uppercase",letterSpacing:.8}}>{badge}</div>}
        {onBookmark&&<button onClick={e=>{e.stopPropagation();onBookmark();}} style={{position:"absolute",top:7,right:7,background:"rgba(0,0,0,.75)",border:"none",color:"currentColor",cursor:"pointer",borderRadius:7,padding:"5px 6px",display:"flex",backdropFilter:"blur(4px)"}}><Ic.Bm on={bookmarked}/></button>}
        {hov&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.1)"}}><div style={{width:46,height:46,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 28px rgba(168,85,247,.6)"}}><Ic.Play s={18}/></div></div>}
        {progress>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.1)"}}><div style={{height:"100%",background:"#a855f7",width:`${Math.min(progress,100)}%`}}/></div>}
      </div>
      <div onClick={onClick} style={{padding:"8px 10px 10px"}}>
        <div style={{color:"#f1f5f9",fontSize:12,fontWeight:600,lineHeight:1.3,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          {rating&&<><Ic.Star/><span style={{color:"#fbbf24",fontSize:10,fontWeight:600}}>{rating}</span><span style={{color:"#1a1a28"}}>·</span></>}
          {subtitle&&<span style={{color:"#4b5563",fontSize:10,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   HORIZONTAL ROW
══════════════════════════════════════════ */
function Row({ title, icon, children, count }) {
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({left:d*340,behavior:"smooth"});
  return (
    <div style={{marginBottom:38}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:14,fontWeight:800,color:"#e2e8f0",display:"flex",alignItems:"center",gap:7,textTransform:"uppercase",letterSpacing:.8}}>
          {icon&&<span style={{color:"#a855f7"}}>{icon}</span>}{title}
          {count&&<span style={{color:"#374151",fontWeight:400,textTransform:"none",letterSpacing:0,fontSize:12}}>({count})</span>}
        </h2>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>scroll(-1)} style={{background:"#0d0d14",border:"1px solid #1a1a28",color:"#6b7280",borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex"}}><Ic.ChevL/></button>
          <button onClick={()=>scroll(1)}  style={{background:"#0d0d14",border:"1px solid #1a1a28",color:"#6b7280",borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex"}}><Ic.ChevR/></button>
        </div>
      </div>
      <div ref={ref} className="hide-scroll" style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:4}}>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CONTINUE WATCHING ROW
══════════════════════════════════════════ */
function ContinueRow({ history, onPlay }) {
  const ref  = useRef(null);
  const items = Object.values(history).sort((a,b)=>b.at-a.at).slice(0,16);
  if (!items.length) return null;
  const scroll = (d) => ref.current?.scrollBy({left:d*280,behavior:"smooth"});
  return (
    <div style={{marginBottom:38}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{fontSize:14,fontWeight:800,color:"#e2e8f0",display:"flex",alignItems:"center",gap:7,textTransform:"uppercase",letterSpacing:.8}}><span style={{color:"#a855f7"}}><Ic.Clock/></span> Continue Watching</h2>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>scroll(-1)} style={{background:"#0d0d14",border:"1px solid #1a1a28",color:"#6b7280",borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex"}}><Ic.ChevL/></button>
          <button onClick={()=>scroll(1)}  style={{background:"#0d0d14",border:"1px solid #1a1a28",color:"#6b7280",borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex"}}><Ic.ChevR/></button>
        </div>
      </div>
      <div ref={ref} className="hide-scroll" style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:4}}>
        {items.map(h=>{
          const a = h.data; const img = h.type==="anime"?animeImg(a):a.large_cover_image;
          const title = h.type==="anime"?animeTitle(a):a.title;
          const prog  = h.type==="anime"&&a.episodes?(h.ep/a.episodes)*100:50;
          return (
            <div key={h.key} onClick={()=>onPlay(h)} style={{width:240,flexShrink:0,background:"#0d0d14",borderRadius:10,overflow:"hidden",cursor:"pointer",border:"1px solid #1a1a28"}}>
              <div style={{position:"relative",paddingBottom:"56%",overflow:"hidden"}}>
                {img?<img src={img} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.75)"}}/>
                    :<div style={{position:"absolute",inset:0,background:"#1a1a28",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🎌</div>}
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.88) 0%,transparent 60%)"}}/>
                <div style={{position:"absolute",bottom:8,left:10,right:10,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic.Play s={13}/></div>
                  <div style={{minWidth:0}}>
                    <div style={{color:"#fff",fontSize:11,fontWeight:700,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div>
                    <div style={{color:"#9ca3af",fontSize:10,marginTop:2}}>{h.type==="anime"?`Ep ${h.ep}`:h.type==="movie"?"Movie":h.type==="manga"?`Ch ${h.ch}`:"Continue"}</div>
                  </div>
                </div>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.1)"}}><div style={{height:"100%",background:"#a855f7",width:`${Math.min(prog,100)}%`}}/></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ANIME WATCH VIEW
══════════════════════════════════════════ */
function AnimeWatch({ anime, startEp, onBack, bookmarked, onBookmark, onSaveHist }) {
  const [ep,setEp]       = useState(startEp);
  const [lang,setLang]   = useState("sub");
  const [srv,setSrv]     = useState(ANIME_SERVERS[0]);
  const [autoPlay,setAutoPlay]   = useState(true);
  const [autoSkip,setAutoSkip]   = useState(true);
  const [skipTimes,setSkipTimes] = useState(null);
  const [localSec,setLocalSec]   = useState(0);
  const [showSkip,setShowSkip]   = useState(false);
  const [showEd,setShowEd]       = useState(false);
  const [epGrid,setEpGrid]       = useState(true);
  const [nextBanner,setNextBanner] = useState(false);
  const [countdown,setCountdown]   = useState(5);
  const iframeRef = useRef(null); const timerRef = useRef(null); const countRef = useRef(null); const epRef = useRef(null);
  const eps = animeEps(anime); const total = eps.length;
  const title = animeTitle(anime); const img = animeImg(anime);

  useEffect(()=>{setSkipTimes(null);setShowSkip(false);setShowEd(false);fetchSkipTimes(anime.mal_id,ep).then(setSkipTimes);},[anime.mal_id,ep]);
  const startTimer = useCallback(()=>{clearInterval(timerRef.current);setLocalSec(0);timerRef.current=setInterval(()=>setLocalSec(s=>s+1),1000);},[]);
  useEffect(()=>()=>clearInterval(timerRef.current),[]);
  useEffect(()=>{if(!skipTimes)return;const{op,ed}=skipTimes;if(op)setShowSkip(localSec>=op.startTime&&localSec<=op.endTime);if(ed)setShowEd(localSec>=ed.startTime&&localSec<=ed.endTime);},[localSec,skipTimes]);
  useEffect(()=>{if(autoSkip&&showSkip&&skipTimes?.op)handleSkip("op");},[showSkip]); // eslint-disable-line

  useEffect(()=>{
    const h=(e)=>{try{const d=typeof e.data==="string"?JSON.parse(e.data):e.data;if(!d)return;if(d.event==="complete"&&autoPlay&&ep<total){setNextBanner(true);setCountdown(5);countRef.current=setInterval(()=>setCountdown(v=>{if(v<=1){clearInterval(countRef.current);goNext();return 5;}return v-1;}),1000);}}catch{}};
    window.addEventListener("message",h);return()=>{window.removeEventListener("message",h);clearInterval(countRef.current);};
  },[autoPlay,ep,total]); // eslint-disable-line

  const handleSkip=(type)=>{const t=type==="op"?skipTimes?.op?.endTime:skipTimes?.ed?.endTime;if(!t||!iframeRef.current){setShowSkip(false);setShowEd(false);return;}iframeRef.current.src=`${srv.url(anime,ep,lang)}?start=${Math.floor(t)}`;setLocalSec(Math.floor(t));setShowSkip(false);setShowEd(false);};
  const goNext=useCallback(()=>{if(ep<total){setEp(e=>e+1);setNextBanner(false);setCountdown(5);clearInterval(countRef.current);}},[ep,total]);

  useEffect(()=>{setShowSkip(false);setShowEd(false);setNextBanner(false);setCountdown(5);clearInterval(countRef.current);onSaveHist?.("anime",anime,ep);setTimeout(()=>epRef.current?.querySelector(".ep-active")?.scrollIntoView({block:"nearest",behavior:"smooth"}),100);},[ep]); // eslint-disable-line
  useEffect(()=>{window.scrollTo({top:0,behavior:"smooth"});},[]);

  return (
    <div style={{minHeight:"100vh",background:"#000",paddingTop:60}}>
      <div style={{padding:"10px 18px",borderBottom:"1px solid #0f0f18",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600}}><Ic.ChevL/> Back</button>
        <span style={{color:"#4b5563",fontSize:13}}>{title}</span><span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280",fontSize:13}}>Ep {ep}</span>
        {skipTimes?.op&&<span style={{marginLeft:"auto",background:"rgba(168,85,247,.12)",border:"1px solid rgba(168,85,247,.3)",color:"#c084fc",fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:600}}>⏱ Skip times found</span>}
      </div>
      <div className="watch-layout">
        <div className="watch-main">
          {/* PLAYER */}
          <div style={{position:"relative",width:"100%",aspectRatio:"16/9",background:"#000",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 50px rgba(0,0,0,1)"}}>
            <iframe ref={iframeRef} key={`${anime.mal_id}-${ep}-${lang}-${srv.id}`} src={srv.url(anime,ep,lang)} title={`${title} Ep ${ep}`} allowFullScreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture" onLoad={startTimer} style={{width:"100%",height:"100%",border:"none",display:"block"}}/>
            {showSkip&&!autoSkip&&<button onClick={()=>handleSkip("op")} style={{position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.92)",backdropFilter:"blur(10px)",border:"1px solid #a855f7",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .3s ease",boxShadow:"0 0 20px rgba(168,85,247,.3)"}}><Ic.Skip/> Skip Intro</button>}
            {showEd&&<button onClick={()=>handleSkip("ed")} style={{position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.92)",backdropFilter:"blur(10px)",border:"1px solid #a855f7",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .3s ease"}}><Ic.Skip/> Skip Outro</button>}
            {nextBanner&&ep<total&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.97),rgba(0,0,0,.7))",padding:"18px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div><div style={{color:"#9ca3af",fontSize:12,marginBottom:2}}>Up Next</div><div style={{color:"#fff",fontWeight:700,fontSize:15}}>Episode {ep+1}</div></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setNextBanner(false);clearInterval(countRef.current);}} style={{background:"#1a1a28",border:"none",color:"#9ca3af",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>Cancel</button>
                <button onClick={goNext} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6,boxShadow:"0 4px 16px rgba(168,85,247,.4)"}}><Ic.Play s={14}/> Play ({countdown}s)</button>
              </div>
            </div>}
          </div>

          {/* Servers */}
          <ServerBar servers={ANIME_SERVERS} active={srv} onSelect={setSrv}/>

          {/* Controls */}
          <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
            <button onClick={()=>ep>1&&setEp(e=>e-1)} disabled={ep<=1} style={{flex:1,minWidth:90,background:ep<=1?"#060608":"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:ep<=1?"#374151":"#9ca3af",padding:"9px 0",cursor:ep<=1?"default":"pointer",fontSize:13,fontWeight:600}}>← Prev</button>
            <button onClick={()=>ep<total&&setEp(e=>e+1)} disabled={ep>=total} style={{flex:1,minWidth:90,background:ep>=total?"#060608":"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:ep>=total?"#374151":"#9ca3af",padding:"9px 0",cursor:ep>=total?"default":"pointer",fontSize:13,fontWeight:600}}>Next →</button>
            <div style={{display:"flex",background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,overflow:"hidden"}}>
              {["sub","dub"].map(l=><button key={l} onClick={()=>setLang(l)} style={{background:lang===l?"linear-gradient(135deg,#7c3aed,#a855f7)":"transparent",border:"none",color:lang===l?"#fff":"#6b7280",padding:"9px 16px",cursor:"pointer",fontSize:12,fontWeight:700,textTransform:"uppercase"}}>{l}</button>)}
            </div>
          </div>
          <ToggleRow items={[["Auto Play",autoPlay,setAutoPlay],["Auto Skip Intro",autoSkip,setAutoSkip]]}/>

          {/* Info */}
          <div style={{marginTop:14,background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",padding:16}}>
            <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              {img&&<img src={img} alt={title} style={{width:66,height:92,objectFit:"cover",borderRadius:8,flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#f1f5f9",fontSize:15,fontWeight:800,marginBottom:7,lineHeight:1.2}}>{title}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>{animeGenres(anime).slice(0,4).map(g=><span key={g} style={{background:"#1a1a28",color:"#6b7280",fontSize:10,padding:"3px 8px",borderRadius:20}}>{g}</span>)}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",fontSize:12}}><span style={{display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:700}}><Ic.Star/>{animeScore(anime)}</span><span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280"}}>{anime.year}</span><span style={{color:"#1a1a28"}}>·</span><span style={{color:anime.airing?"#10b981":"#6b7280",fontWeight:600}}>{anime.airing?"Ongoing":"Completed"}</span></div>
                <button onClick={()=>onBookmark(anime.mal_id)} style={{marginTop:10,background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
              </div>
            </div>
            {anime.synopsis&&<p style={{color:"#6b7280",fontSize:13,lineHeight:1.75,marginTop:14}}>{anime.synopsis.slice(0,280)}…</p>}
          </div>
        </div>

        {/* Episode list */}
        <div className="watch-sidebar" ref={epRef}>
          <div style={{background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",overflow:"hidden"}}>
            <div style={{padding:"12px 14px",borderBottom:"1px solid #1a1a28",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>Episodes <span style={{color:"#374151",fontWeight:400}}>({total})</span></div>
              <button onClick={()=>setEpGrid(v=>!v)} style={{background:"#1a1a28",border:"1px solid #252535",color:"#6b7280",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:11}}>{epGrid?"List":"Grid"}</button>
            </div>
            <div style={{maxHeight:460,overflowY:"auto",padding:8}}>
              {epGrid?(
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
                  {eps.map(n=><button key={n} className={ep===n?"ep-active":""} onClick={()=>setEp(n)} style={{background:ep===n?"linear-gradient(135deg,#7c3aed,#a855f7)":"#0a0a10",border:`1px solid ${ep===n?"#a855f7":"#1a1a28"}`,color:ep===n?"#fff":"#9ca3af",borderRadius:7,padding:"8px 4px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .15s"}}>{n}</button>)}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {eps.map(n=><button key={n} className={ep===n?"ep-active":""} onClick={()=>setEp(n)} style={{background:ep===n?"#1a0e2e":"transparent",border:`1px solid ${ep===n?"rgba(168,85,247,.3)":"transparent"}`,color:ep===n?"#c084fc":"#9ca3af",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:13,fontWeight:ep===n?700:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}><span style={{width:26,height:26,borderRadius:6,flexShrink:0,background:ep===n?"linear-gradient(135deg,#7c3aed,#a855f7)":"#1a1a28",color:ep===n?"#fff":"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{n}</span>Episode {n}<span style={{marginLeft:"auto",color:"#374151",fontSize:11}}>24m</span></button>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MOVIE WATCH VIEW
══════════════════════════════════════════ */
function MovieWatch({ movie, onBack, bookmarked, onBookmark, onSaveHist }) {
  const [srv, setSrv] = useState(MOVIE_SERVERS[0]);
  useEffect(()=>{window.scrollTo({top:0});onSaveHist?.("movie",movie,1);},[]);  // eslint-disable-line
  return (
    <div style={{minHeight:"100vh",background:"#000",paddingTop:60}}>
      <div style={{padding:"10px 18px",borderBottom:"1px solid #0f0f18",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600}}><Ic.ChevL/> Back</button>
        <span style={{color:"#4b5563",fontSize:13}}>{movie.title}</span>
        <span style={{marginLeft:"auto",color:"#6b7280",fontSize:12}}>{movie.year} · {movie.runtime}m</span>
      </div>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"14px 20px 60px"}}>
        <div style={{position:"relative",width:"100%",aspectRatio:"16/9",background:"#000",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 50px rgba(0,0,0,1)",marginBottom:14}}>
          <iframe key={srv.id} src={srv.url(movie)} title={movie.title} allowFullScreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style={{width:"100%",height:"100%",border:"none",display:"block"}}/>
        </div>
        <ServerBar servers={MOVIE_SERVERS} active={srv} onSelect={setSrv}/>
        <div style={{marginTop:14,background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",padding:16}}>
          <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
            {movie.large_cover_image&&<img src={movie.large_cover_image} alt="" style={{width:72,height:100,objectFit:"cover",borderRadius:8,flexShrink:0}}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#f1f5f9",fontSize:17,fontWeight:800,marginBottom:7,lineHeight:1.2}}>{movie.title} <span style={{color:"#4b5563",fontWeight:400,fontSize:14}}>({movie.year})</span></div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>{(movie.genres||[]).map(g=><span key={g} style={{background:"#1a1a28",color:"#6b7280",fontSize:10,padding:"3px 8px",borderRadius:20}}>{g}</span>)}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",fontSize:12,marginBottom:10}}><span style={{display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:700}}><Ic.Star/>{movie.rating}</span><span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280"}}>{movie.runtime}min</span><span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280"}}>{movie.language?.toUpperCase()}</span></div>
              <button onClick={()=>onBookmark(movie.imdb_code)} style={{background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
            </div>
          </div>
          {movie.description_full&&<p style={{color:"#6b7280",fontSize:13,lineHeight:1.75,marginTop:14}}>{movie.description_full.slice(0,300)}…</p>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MANGA READER
══════════════════════════════════════════ */
function MangaReader({ chapterId, title, onBack }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ window.scrollTo({top:0}); setLoading(true); fetchChapterPages(chapterId).then(p=>{setPages(p);setLoading(false);}); },[chapterId]);
  return (
    <div style={{minHeight:"100vh",background:"#000",paddingTop:60}}>
      <div style={{padding:"10px 18px",borderBottom:"1px solid #0f0f18",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600}}><Ic.ChevL/> Back</button>
        <span style={{color:"#6b7280",fontSize:13,flex:1,textAlign:"center"}}>{title}</span>
      </div>
      {loading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh"}}><div style={{width:36,height:36,border:"3px solid #1a1a28",borderTop:"3px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite"}}/></div>
      :<div style={{maxWidth:800,margin:"0 auto",padding:"16px 8px 60px"}}>
        {pages.map((src,i)=><img key={i} src={src} alt={`Page ${i+1}`} loading="lazy" onError={e=>e.target.style.display="none"} style={{display:"block",width:"100%",marginBottom:4}}/>)}
        {!pages.length&&<div style={{textAlign:"center",padding:"60px 0",color:"#374151",fontSize:14}}>Couldn't load pages. MangaDex servers may be busy.</div>}
        <button onClick={onBack} style={{display:"block",margin:"30px auto 0",background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"12px 28px",fontSize:14,fontWeight:700,cursor:"pointer"}}>← Back to Chapters</button>
      </div>}
    </div>
  );
}

/* ══════════════════════════════════════════
   MANGA MODAL
══════════════════════════════════════════ */
function MangaModal({ manga, onClose, bookmarked, onBookmark, onRead, onSaveHist }) {
  const [chapters, setChapters] = useState(null);
  const img = getCoverUrl(manga); const title = mangaTitle(manga);
  useEffect(()=>{ document.body.style.overflow="hidden"; fetchMangaChapters(manga.id).then(setChapters); return()=>{document.body.style.overflow="";}; },[manga.id]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(14px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2d1a5e",boxShadow:"0 0 80px rgba(124,58,237,.15)",animation:"modalIn .22s ease"}}>
        <div style={{position:"relative",height:200,overflow:"hidden",borderRadius:"18px 18px 0 0"}}>
          {img?<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover",filter:"blur(6px) brightness(.5)",transform:"scale(1.07)"}}/>:<div style={{width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#0d0d14)"}}/>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#0d0d14 0%,transparent 55%)"}}/>
          {img&&<img src={img} alt="" style={{position:"absolute",left:24,bottom:-16,height:"88%",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,.8)"}}/>}
          <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",borderRadius:10,padding:8,display:"flex"}}><Ic.X/></button>
        </div>
        <div style={{padding:"26px 22px 22px"}}>
          <div style={{fontSize:19,fontWeight:900,color:"#f1f5f9",marginBottom:8,lineHeight:1.2}}>{title}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>{(manga.attributes?.tags||[]).slice(0,6).map(t=><span key={t.id} style={{background:"#1a1a28",color:"#6b7280",fontSize:10,padding:"3px 9px",borderRadius:20}}>{t.attributes?.name?.en||""}</span>)}</div>
          {manga.attributes?.description?.en&&<p style={{color:"#9ca3af",fontSize:13,lineHeight:1.75,marginBottom:16}}>{manga.attributes.description.en.slice(0,350)}…</p>}
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            <button onClick={()=>onBookmark(manga.id)} style={{background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:10,padding:"10px 16px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
          </div>
          {/* Chapter list */}
          <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0",marginBottom:10,textTransform:"uppercase",letterSpacing:.8}}>Chapters {chapters?`(${chapters.length})`:""}</div>
          {!chapters&&<div style={{display:"flex",justifyContent:"center",padding:"20px 0"}}><div style={{width:28,height:28,border:"2px solid #1a1a28",borderTop:"2px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite"}}/></div>}
          {chapters&&chapters.length===0&&<div style={{color:"#374151",fontSize:13,padding:"12px 0"}}>No English chapters available.</div>}
          {chapters&&chapters.length>0&&(
            <div style={{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
              {chapters.map((ch,i)=>{
                const chNum = ch.attributes?.chapter||String(i+1);
                const chTitle = ch.attributes?.title?` — ${ch.attributes.title}`:"";
                return (
                  <button key={ch.id} onClick={()=>{onSaveHist?.("manga",manga,chNum);onClose();onRead(ch.id,`Chapter ${chNum}${chTitle}`);}}
                    style={{background:"#0a0a10",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",padding:"9px 14px",cursor:"pointer",fontSize:13,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background .15s"}}>
                    <span style={{fontWeight:600}}>Chapter {chNum}{chTitle}</span>
                    <span style={{color:"#374151",fontSize:11}}>{ch.attributes?.pages||"?"} pages</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ANIME DETAIL MODAL
══════════════════════════════════════════ */
function AnimeModal({ anime, onClose, bookmarked, onBookmark, onWatch }) {
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};},[]);
  const img = animeImg(anime); const title = animeTitle(anime);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(14px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2d1a5e",boxShadow:"0 0 80px rgba(124,58,237,.15)",animation:"modalIn .22s ease"}}>
        <div style={{position:"relative",height:210,overflow:"hidden",borderRadius:"18px 18px 0 0"}}>
          {img?<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover",filter:"blur(5px) brightness(.55)",transform:"scale(1.06)"}}/>:<div style={{width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#0d0d14)"}}/>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#0d0d14 0%,transparent 55%)"}}/>
          {img&&<img src={img} alt="" style={{position:"absolute",left:24,bottom:-16,height:"90%",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,.8)"}}/>}
          <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",borderRadius:10,padding:8,display:"flex"}}><Ic.X/></button>
        </div>
        <div style={{padding:"28px 22px 22px"}}>
          <div style={{color:"#6b7280",fontSize:12,marginBottom:4}}>{anime.title}</div>
          <div style={{fontSize:19,fontWeight:900,color:"#f1f5f9",marginBottom:10,lineHeight:1.2}}>{title}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:7,alignItems:"center",marginBottom:12}}>
            <span style={{display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:700,fontSize:13}}><Ic.Star/>{animeScore(anime)}</span>
            <span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280",fontSize:13}}>{anime.year}</span>
            <span style={{color:"#1a1a28"}}>·</span><span style={{color:anime.airing?"#10b981":"#6b7280",fontSize:13,fontWeight:600}}>{anime.airing?"Ongoing":"Completed"}</span>
            {anime.episodes&&<><span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280",fontSize:13}}>{anime.episodes} eps</span></>}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>{animeGenres(anime).map(g=><span key={g} style={{background:"#1a1a28",color:"#6b7280",fontSize:11,padding:"3px 10px",borderRadius:20}}>{g}</span>)}</div>
          {anime.synopsis&&<p style={{color:"#9ca3af",fontSize:14,lineHeight:1.75,marginBottom:18}}>{anime.synopsis.slice(0,380)}…</p>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={()=>{onClose();onWatch(anime,1);}} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 22px rgba(168,85,247,.4)"}}><Ic.Play s={16}/> Watch Now</button>
            <button onClick={()=>onBookmark(anime.mal_id)} style={{background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:12,padding:"12px 18px",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Add to List"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MOVIE MODAL
══════════════════════════════════════════ */
function MovieModal({ movie, onClose, bookmarked, onBookmark, onWatch }) {
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};},[]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(14px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2d1a5e",boxShadow:"0 0 80px rgba(124,58,237,.15)",animation:"modalIn .22s ease"}}>
        <div style={{position:"relative",height:210,overflow:"hidden",borderRadius:"18px 18px 0 0"}}>
          {movie.background_image?<img src={movie.background_image} alt="" style={{width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.5)"}}/>:<div style={{width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#0d0d14)"}}/>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#0d0d14 0%,transparent 55%)"}}/>
          {movie.large_cover_image&&<img src={movie.large_cover_image} alt="" style={{position:"absolute",left:24,bottom:-16,height:"88%",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,.8)"}}/>}
          <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",borderRadius:10,padding:8,display:"flex"}}><Ic.X/></button>
        </div>
        <div style={{padding:"28px 22px 22px"}}>
          <div style={{fontSize:19,fontWeight:900,color:"#f1f5f9",marginBottom:10,lineHeight:1.2}}>{movie.title} <span style={{color:"#4b5563",fontWeight:400,fontSize:15}}>({movie.year})</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:7,alignItems:"center",marginBottom:12}}>
            <span style={{display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:700,fontSize:13}}><Ic.Star/>{movie.rating}</span>
            <span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280",fontSize:13}}>{movie.runtime}min</span>
            <span style={{color:"#1a1a28"}}>·</span><span style={{color:"#6b7280",fontSize:13}}>{movie.language?.toUpperCase()}</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>{(movie.genres||[]).map(g=><span key={g} style={{background:"#1a1a28",color:"#6b7280",fontSize:11,padding:"3px 10px",borderRadius:20}}>{g}</span>)}</div>
          {movie.description_full&&<p style={{color:"#9ca3af",fontSize:14,lineHeight:1.75,marginBottom:18}}>{movie.description_full.slice(0,360)}…</p>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={()=>{onClose();onWatch(movie);}} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 22px rgba(168,85,247,.4)"}}><Ic.Film/> Watch Now</button>
            <button onClick={()=>onBookmark(movie.imdb_code)} style={{background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:12,padding:"12px 18px",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SHARED SMALL COMPONENTS
══════════════════════════════════════════ */
function ServerBar({ servers, active, onSelect }) {
  return (
    <div style={{marginTop:14,background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",padding:"12px 14px"}}>
      <div style={{color:"#4b5563",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10}}>Servers</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
        {servers.map(s=>(
          <button key={s.id} onClick={()=>onSelect(s)} style={{background:active.id===s.id?"linear-gradient(135deg,#7c3aed,#a855f7)":"#0a0a10",border:`1px solid ${active.id===s.id?"#a855f7":"#1a1a28"}`,color:active.id===s.id?"#fff":"#9ca3af",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,transition:"all .18s"}}>
            {s.label} <span style={{fontSize:9,background:active.id===s.id?"rgba(255,255,255,.2)":"#1a1a28",borderRadius:4,padding:"2px 4px"}}>{s.tag}</span>
          </button>
        ))}
      </div>
      <div style={{marginTop:8,fontSize:11,color:"#374151"}}>💡 Video not loading? Try another server.</div>
    </div>
  );
}

function ToggleRow({ items }) {
  return (
    <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
      {items.map(([lbl,val,set])=>(
        <button key={lbl} onClick={()=>set(v=>!v)} style={{display:"flex",alignItems:"center",gap:7,background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:val?"#c084fc":"#6b7280",padding:"7px 13px",cursor:"pointer",fontSize:12,fontWeight:600}}>
          <div style={{width:28,height:16,borderRadius:8,background:val?"linear-gradient(135deg,#7c3aed,#a855f7)":"#1a1a28",position:"relative",transition:"background .2s",flexShrink:0}}>
            <div style={{position:"absolute",top:2,left:val?14:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
          {lbl}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   NAVBAR
══════════════════════════════════════════ */
function Navbar({ section, setSection, searchQ, onSearch, user, onAuthOpen, onLogout, mobileOpen, setMobileOpen }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const tabs = [["anime","Anime",<Ic.Sword/>],["movies","Movies",<Ic.Film/>],["manga","Manga",<Ic.Book/>]];
  return (
    <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,background:"rgba(0,0,0,.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid #140d28",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",height:62,gap:14}}>
      {/* Logo */}
      <div style={{display:"flex",alignItems:"center",gap:9,flexShrink:0,cursor:"pointer"}} onClick={()=>setSection("anime")}>
        <ShinoraLogo size={36}/>
        <div>
          <div style={{fontSize:16,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase",color:"#fff",lineHeight:1}}>
            SHIN<span style={{background:"linear-gradient(135deg,#7c3aed,#c084fc)",padding:"0 3px",borderRadius:2}}>O</span>RA
          </div>
          <div style={{fontSize:8,fontWeight:600,letterSpacing:2,color:"#4b5563",textTransform:"uppercase"}}>Anime · Movies · Manga</div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="desk-nav" style={{display:"flex",gap:4,background:"#0d0d14",borderRadius:10,padding:4,border:"1px solid #1a1a28"}}>
        {tabs.map(([id,label,icon])=>(
          <button key={id} onClick={()=>setSection(id)} style={{background:section===id?"linear-gradient(135deg,#7c3aed,#a855f7)":"transparent",border:"none",color:section===id?"#fff":"#6b7280",padding:"7px 16px",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6,transition:"all .2s",boxShadow:section===id?"0 4px 14px rgba(168,85,247,.3)":"none"}}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Right */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        {searchOpen?(
          <div style={{display:"flex",alignItems:"center",background:"#0d0d14",borderRadius:10,padding:"6px 11px",gap:7,border:"1px solid #2d1a5e"}}>
            <Ic.Search/>
            <input autoFocus value={searchQ} onChange={e=>onSearch(e.target.value)} placeholder={`Search ${section}...`}
              style={{background:"none",border:"none",outline:"none",color:"#f1f5f9",fontSize:13,width:155}}/>
            <button onClick={()=>{setSearchOpen(false);onSearch("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#374151",display:"flex"}}><Ic.X s={15}/></button>
          </div>
        ):(
          <button onClick={()=>setSearchOpen(true)} style={{background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:9,color:"#6b7280",padding:"7px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <Ic.Search/><span className="search-label" style={{fontSize:13}}>Search</span>
          </button>
        )}
        {user?(
          <div style={{position:"relative"}}>
            <button onClick={()=>setProfileOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:7,background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:9,padding:"5px 10px 5px 5px",cursor:"pointer"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff"}}>{user.name[0].toUpperCase()}</div>
              <span style={{color:"#e2e8f0",fontSize:13,fontWeight:600}}>{user.name}</span>
            </button>
            {profileOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:"#0d0d14",border:"1px solid #2d1a5e",borderRadius:12,minWidth:175,padding:6,boxShadow:"0 16px 50px rgba(0,0,0,.9)",animation:"fadeUp .2s ease",zIndex:200}}>
                <div style={{padding:"10px 12px",borderBottom:"1px solid #1a1a28",marginBottom:4}}>
                  <div style={{color:"#f1f5f9",fontSize:13,fontWeight:700}}>{user.name}</div>
                  <div style={{color:"#4b5563",fontSize:11,marginTop:2}}>Local Account</div>
                </div>
                <button onClick={()=>{setProfileOpen(false);onLogout();}} style={{width:"100%",background:"none",border:"none",color:"#ef4444",padding:"9px 12px",cursor:"pointer",fontSize:13,textAlign:"left",borderRadius:8}}>🚪 Sign Out</button>
              </div>
            )}
          </div>
        ):(
          <button onClick={onAuthOpen} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700,boxShadow:"0 4px 14px rgba(168,85,247,.35)"}}>Sign In</button>
        )}
        <button className="hamburger" onClick={()=>setMobileOpen(v=>!v)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",padding:4,display:"flex"}}><Ic.Menu/></button>
      </div>
    </nav>
  );
}

/* ══════════════════════════════════════════
   HERO
══════════════════════════════════════════ */
function Hero({ item, onWatch, onInfo, type }) {
  const img  = type==="anime"?animeImg(item):item.background_image;
  const title= type==="anime"?animeTitle(item):item.title;
  const desc = type==="anime"?item.synopsis:item.description_full;
  const score= type==="anime"?animeScore(item):item.rating?.toString();
  const tags  = type==="anime"?animeGenres(item).slice(0,3):(item.genres||[]).slice(0,3);
  return (
    <div style={{position:"relative",height:"88vh",minHeight:480,overflow:"hidden"}}>
      {img?<img src={img} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} key={item.id||item.imdb_code}/>
          :<div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#1a0a2e,#060608)"}}/>}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(105deg,rgba(0,0,0,.98) 22%,rgba(0,0,0,.7) 58%,rgba(0,0,0,.15) 100%)"}}/>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#000 0%,transparent 45%)"}}/>
      <div className="hero-content" style={{position:"relative",zIndex:2,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 44px 90px",maxWidth:640,animation:"fadeUp .7s ease"}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:3,textTransform:"uppercase",color:"#a855f7",marginBottom:12}}>Now {type==="manga"?"Reading":"Streaming"}</div>
        <h1 className="hero-title" style={{fontSize:44,fontWeight:900,lineHeight:1.06,marginBottom:14,color:"#fff",textTransform:"uppercase",letterSpacing:.5}}>{title}</h1>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          {tags.map(g=><span key={g} style={{background:"rgba(124,58,237,.18)",border:"1px solid rgba(168,85,247,.35)",color:"#c084fc",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600}}>{g}</span>)}
          {score&&<span style={{display:"flex",alignItems:"center",gap:3,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.25)",color:"#fbbf24",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600}}><Ic.Star/>{score}</span>}
        </div>
        {desc&&<p style={{color:"#9ca3af",fontSize:14,lineHeight:1.75,marginBottom:28,maxWidth:420}}>{desc.slice(0,180)}…</p>}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={onWatch} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:11,padding:"13px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 28px rgba(168,85,247,.45)"}}><Ic.Play s={16}/> {type==="manga"?"Read Now":"Watch Now"}</button>
          <button onClick={onInfo} style={{background:"rgba(255,255,255,.06)",color:"#e2e8f0",border:"1px solid rgba(255,255,255,.12)",borderRadius:11,padding:"13px 20px",fontWeight:600,fontSize:14,cursor:"pointer",backdropFilter:"blur(10px)"}}>More Info</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   BROWSE PAGE (generic)
══════════════════════════════════════════ */
function BrowsePage({ list, loading, hasMore, onLoadMore, moreLoading, genres, genre, setGenre, searchQ, onCard, bookmarks, onBookmark, type, histMap }) {
  return (
    <div style={{padding:"80px 20px 60px",maxWidth:1400,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h2 style={{fontSize:22,fontWeight:900,color:"#fff",textTransform:"uppercase",letterSpacing:.5}}>{searchQ?`"${searchQ}"`:`Browse ${type==="anime"?"Anime":type==="movies"?"Movies":"Manga"}`}</h2>
        <span style={{color:"#374151",fontSize:13}}>{list.length} titles</span>
      </div>
      <div className="genre-scroll" style={{marginBottom:22}}>
        {genres.map(g=>(
          <button key={g} onClick={()=>setGenre(g)} style={{background:genre===g?"linear-gradient(135deg,#7c3aed,#a855f7)":"#0d0d14",color:genre===g?"#fff":"#6b7280",border:genre===g?"1px solid #a855f7":"1px solid #1a1a28",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .18s",boxShadow:genre===g?"0 4px 14px rgba(168,85,247,.3)":"none"}}>{g}</button>
        ))}
      </div>
      {loading?<div style={{display:"flex",justifyContent:"center",padding:"60px 0"}}><div style={{width:36,height:36,border:"3px solid #1a1a28",borderTop:"3px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite"}}/></div>:(
        <>
          <div className="anime-grid">
            {list.map((item,i)=>{
              const key  = type==="anime"?item.mal_id:type==="movies"?item.imdb_code:item.id;
              const img  = type==="anime"?animeImg(item):type==="movies"?item.large_cover_image:getCoverUrl(item);
              const title= type==="anime"?animeTitle(item):type==="movies"?item.title:mangaTitle(item);
              const score= type==="anime"?animeScore(item):type==="movies"?item.rating?.toString():null;
              const sub  = type==="anime"?item.year:type==="movies"?item.year:null;
              const badge= type==="anime"?(item.airing?"Ongoing":"Done"):type==="movies"?item.year?.toString():null;
              const bc   = type==="anime"?(item.airing?"#059669":"#374151"):"#374151";
              const prog = type==="anime"&&histMap?.[key]&&item.episodes?(histMap[key].ep/item.episodes)*100:0;
              return (
                <div key={key} style={{animation:`fadeUp .3s ease ${Math.min(i*.04,.5)}s both`}}>
                  <PosterCard img={img} title={title} subtitle={sub?.toString()} rating={score} badge={badge} badgeColor={bc}
                    bookmarked={bookmarks?.has(key)} onBookmark={onBookmark?()=>onBookmark(key):null}
                    onClick={()=>onCard(item)} progress={prog}/>
                </div>
              );
            })}
          </div>
          {list.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"#374151"}}><div style={{fontSize:36,marginBottom:10}}>🔍</div><div style={{fontSize:15,fontWeight:600,color:"#6b7280"}}>No results found</div></div>}
          {hasMore&&list.length>0&&<div style={{textAlign:"center",marginTop:28}}><button onClick={onLoadMore} disabled={moreLoading} style={{background:moreLoading?"#0d0d14":"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:moreLoading?"1px solid #1a1a28":"none",borderRadius:11,padding:"12px 36px",fontSize:14,fontWeight:700,cursor:moreLoading?"default":"pointer",opacity:moreLoading?.7:1,boxShadow:moreLoading?"none":"0 6px 20px rgba(168,85,247,.35)"}}>{moreLoading?"Loading...":"Load More"}</button></div>}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════ */
export default function App() {
  /* Auth */
  const [user, setUser]     = useState(null);
  const [history, setHistory] = useState({});
  const [bookmarks, setBookmarks] = useState(new Set());
  const [showAuth, setShowAuth] = useState(false);

  /* Navigation */
  const [section, setSection] = useState("anime"); // anime | movies | manga
  const [view, setView]       = useState("home");  // home | browse | watch | read

  /* Content state */
  const [animeRows,  setAnimeRows]  = useState({ trending:[], airing:[], topRated:[] });
  const [movieRows,  setMovieRows]  = useState({ popular:[], topRated:[], action:[], animation:[] });
  const [mangaRows,  setMangaRows]  = useState({ popular:[], action:[], romance:[] });

  const [browseList, setBrowseList] = useState([]);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [genre, setGenre]   = useState("All");
  const [searchQ, setSearchQ] = useState("");

  /* Modals & players */
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedManga, setSelectedManga] = useState(null);
  const [watchAnime, setWatchAnime]   = useState(null);
  const [watchEp,    setWatchEp]      = useState(1);
  const [watchMovie, setWatchMovie]   = useState(null);
  const [readChapter, setReadChapter] = useState(null); // {id, title}
  const [heroIdx, setHeroIdx]   = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const searchTimer = useRef(null);

  /* ─── Auth ─── */
  useEffect(()=>{
    const sid = LS.session(); if (!sid) return;
    const u = LS.users().find(u=>u.id===sid); if (u) loadUser(u);
  },[]);
  const loadUser = (u) => { setUser(u); setHistory(LS.hist(u.id)); setBookmarks(new Set(LS.bm(u.id))); };
  const handleLogin  = (u) => { loadUser(u); setShowAuth(false); };
  const handleLogout = () => { LS.clearSess(); setUser(null); setHistory({}); setBookmarks(new Set()); };

  /* ─── Bookmarks ─── */
  const toggleBm = (key) => setBookmarks(prev=>{
    const n=new Set(prev); n.has(key)?n.delete(key):n.add(key);
    if(user) LS.saveBm(user.id,[...n]); return n;
  });

  /* ─── History ─── */
  const saveHist = (type, data, ep) => {
    if (!user) return;
    const key = type==="anime"?data.mal_id:type==="movies"?data.imdb_code:data.id;
    const h = { key, type, data, ep:type==="anime"?ep:1, ch:type==="manga"?ep:null, at:Date.now() };
    const next = { ...history, [key]:h }; setHistory(next); LS.saveHist(user.id, next);
  };

  /* ─── Load home data ─── */
  const loadHome = useCallback(async () => {
    // Anime rows
    const [t, o, r] = await Promise.all([
      fetchAnimeRow("/top/anime?type=tv&limit=20&filter=bypopularity"),
      fetchAnimeRow("/seasons/now?limit=20"),
      fetchAnimeRow("/top/anime?type=tv&limit=20&filter=favorite"),
    ]);
    setAnimeRows({ trending:t, airing:o, topRated:r });
    // Movie rows
    const [mp, mr, ma, man] = await Promise.all([
      fetchMovieRow("sort_by=download_count&minimum_rating=0"),
      fetchMovieRow("sort_by=rating"),
      fetchMovieRow("genre=action&sort_by=rating"),
      fetchMovieRow("genre=animation&sort_by=rating"),
    ]);
    setMovieRows({ popular:mp, topRated:mr, action:ma, animation:man });
    // Manga rows
    const [mpo, mac, mro] = await Promise.all([
      fetchManga({ page:1 }).then(r=>r.list),
      fetchManga({ page:1, genre:"Action" }).then(r=>r.list),
      fetchManga({ page:1, genre:"Romance" }).then(r=>r.list),
    ]);
    setMangaRows({ popular:mpo, action:mac, romance:mro });
  }, []);

  useEffect(()=>{ loadHome(); },[loadHome]);

  /* ─── Browse ─── */
  const loadBrowse = useCallback(async ({ page=1, q="", g="All", append=false }={}) => {
    try {
      let res;
      if (section==="anime")  res = await fetchAnime({ page, search:q, genre:g });
      else if (section==="movies") res = await fetchMovies({ page, search:q, genre:g });
      else res = await fetchManga({ page, search:q, genre:g });
      setBrowseList(prev => append ? [...prev,...res.list] : res.list);
      setBrowseHasMore(res.hasMore); setBrowsePage(res.page);
    } catch(e) { console.error(e); }
  },[section]);

  /* Section change → reset browse */
  useEffect(()=>{ setGenre("All"); setSearchQ(""); setBrowseList([]); setView("home"); },[section]);

  /* Genre/search → browse mode */
  useEffect(()=>{
    if(view==="browse"){ setBrowseLoading(true); loadBrowse({page:1,q:searchQ,g:genre}).finally(()=>setBrowseLoading(false)); }
  },[genre]); // eslint-disable-line

  useEffect(()=>{
    if(!searchQ.trim()) return;
    setView("browse");
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(()=>{ setBrowseLoading(true); loadBrowse({page:1,q:searchQ,g:genre}).finally(()=>setBrowseLoading(false)); },500);
    return ()=>clearTimeout(searchTimer.current);
  },[searchQ]); // eslint-disable-line

  /* Hero rotation per section */
  const heroItems = section==="anime"?animeRows.trending:section==="movies"?movieRows.popular:mangaRows.popular;
  useEffect(()=>{ setHeroIdx(0); },[section]);
  useEffect(()=>{
    if(!heroItems.length) return;
    const t = setInterval(()=>setHeroIdx(i=>(i+1)%Math.min(6,heroItems.length)),7500);
    return ()=>clearInterval(t);
  },[heroItems.length]);
  const heroItem = heroItems[heroIdx];

  const handleWatchAnime = (a,ep=1)=>{ setWatchAnime(a); setWatchEp(ep); setSelectedAnime(null); setView("watch"); window.scrollTo({top:0}); };
  const handleWatchMovie = (m)=>{ setWatchMovie(m); setSelectedMovie(null); setView("watch"); window.scrollTo({top:0}); };
  const handleReadManga  = (chapId,chapTitle)=>{ setReadChapter({id:chapId,title:chapTitle}); setSelectedManga(null); setView("read"); window.scrollTo({top:0}); };
  const handleContinue   = (h)=>{ if(h.type==="anime")handleWatchAnime(h.data,h.ep); else if(h.type==="movies")handleWatchMovie(h.data); else setSelectedManga(h.data); };

  /* ─── WATCH / READ VIEWS ─── */
  if (view==="watch" && watchAnime) return (
    <div style={{background:"#000",minHeight:"100vh",color:"#e2e8f0"}}>
      <GlobalStyles/>
      <Navbar section={section} setSection={s=>{setSection(s);setView("home");setWatchAnime(null);setWatchMovie(null);}} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={()=>setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <AnimeWatch anime={watchAnime} startEp={watchEp} onBack={()=>setView("home")} bookmarked={bookmarks.has(watchAnime.mal_id)} onBookmark={toggleBm} onSaveHist={saveHist}/>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  if (view==="watch" && watchMovie) return (
    <div style={{background:"#000",minHeight:"100vh",color:"#e2e8f0"}}>
      <GlobalStyles/>
      <Navbar section={section} setSection={s=>{setSection(s);setView("home");setWatchAnime(null);setWatchMovie(null);}} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={()=>setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <MovieWatch movie={watchMovie} onBack={()=>setView("home")} bookmarked={bookmarks.has(watchMovie.imdb_code)} onBookmark={toggleBm} onSaveHist={saveHist}/>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  if (view==="read" && readChapter) return (
    <div style={{background:"#000",minHeight:"100vh",color:"#e2e8f0"}}>
      <GlobalStyles/>
      <Navbar section={section} setSection={s=>{setSection(s);setView("home");setReadChapter(null);}} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={()=>setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <MangaReader chapterId={readChapter.id} title={readChapter.title} onBack={()=>setView("home")}/>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  /* ─── MAIN SITE ─── */
  return (
    <div style={{minHeight:"100vh",background:"#000",color:"#e2e8f0",overflowX:"hidden"}}>
      <GlobalStyles/>
      <Navbar section={section} setSection={setSection} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={()=>setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>

      {/* Mobile menu */}
      {mobileOpen&&(
        <div style={{position:"fixed",top:62,left:0,right:0,zIndex:90,background:"#0d0d14",borderBottom:"1px solid #140d28",padding:"10px 16px",display:"flex",flexDirection:"column",gap:3}}>
          {[["anime","Anime"],["movies","Movies"],["manga","Manga"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>{setSection(id);setMobileOpen(false);setView("home");}} style={{background:section===id?"#1a0e2e":"transparent",border:"none",color:section===id?"#c084fc":"#9ca3af",padding:"11px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,textAlign:"left"}}>{lbl}</button>
          ))}
          {!user&&<button onClick={()=>{setShowAuth(true);setMobileOpen(false);}} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",padding:"12px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,textAlign:"left",marginTop:4}}>Sign In / Create Account</button>}
        </div>
      )}

      {/* HOME */}
      {view==="home" && heroItem && (
        <>
          <Hero item={heroItem} type={section==="manga"?"manga":section==="movies"?"movie":"anime"}
            onWatch={()=>section==="anime"?handleWatchAnime(heroItem,1):section==="movies"?handleWatchMovie(heroItem):setSelectedManga(heroItem)}
            onInfo={()=>section==="anime"?setSelectedAnime(heroItem):section==="movies"?setSelectedMovie(heroItem):setSelectedManga(heroItem)}/>

          <div style={{padding:"28px 20px 60px",maxWidth:1400,margin:"0 auto"}}>
            {/* Hero dots */}
            <div style={{display:"flex",justifyContent:"center",gap:7,marginBottom:32}}>
              {heroItems.slice(0,6).map((_,i)=><button key={i} onClick={()=>setHeroIdx(i)} style={{width:i===heroIdx?22:6,height:6,borderRadius:3,background:i===heroIdx?"#a855f7":"#1a1a28",border:"none",cursor:"pointer",transition:"all .3s",padding:0}}/>)}
            </div>

            {/* Continue watching */}
            {user&&Object.keys(history).length>0&&<ContinueRow history={history} onPlay={handleContinue}/>}

            {/* Sign-in prompt */}
            {!user&&<div style={{marginBottom:32,background:"rgba(124,58,237,.07)",border:"1px solid rgba(168,85,247,.2)",borderRadius:12,padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div><div style={{color:"#f1f5f9",fontWeight:700,fontSize:14,marginBottom:4}}>Track your progress</div><div style={{color:"#6b7280",fontSize:13}}>Sign in to save history and continue where you left off.</div></div>
              <button onClick={()=>setShowAuth(true)} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 4px 14px rgba(168,85,247,.35)"}}>Sign In / Sign Up</button>
            </div>}

            {/* Browse button */}
            <div style={{textAlign:"right",marginBottom:16}}>
              <button onClick={()=>{setView("browse");setBrowseLoading(true);loadBrowse({page:1}).finally(()=>setBrowseLoading(false));}} style={{background:"none",border:"1px solid #1a1a28",borderRadius:8,color:"#6b7280",padding:"7px 16px",fontSize:12,cursor:"pointer",fontWeight:600,letterSpacing:.5}}>Browse All →</button>
            </div>

            {/* Section rows */}
            {section==="anime"&&<>
              <Row title="Trending Now" icon="🔥">{animeRows.trending.map(a=><div key={a.mal_id} style={{width:148,flexShrink:0}}><PosterCard img={animeImg(a)} title={animeTitle(a)} subtitle={a.year?.toString()} rating={animeScore(a)} badge={a.airing?"Live":null} badgeColor="#a855f7" bookmarked={bookmarks.has(a.mal_id)} onBookmark={()=>toggleBm(a.mal_id)} onClick={()=>setSelectedAnime(a)} progress={history[a.mal_id]?.ep&&a.episodes?(history[a.mal_id].ep/a.episodes)*100:0}/></div>)}</Row>
              <Row title="Currently Airing" icon="📺">{animeRows.airing.map(a=><div key={a.mal_id} style={{width:148,flexShrink:0}}><PosterCard img={animeImg(a)} title={animeTitle(a)} subtitle={a.year?.toString()} rating={animeScore(a)} bookmarked={bookmarks.has(a.mal_id)} onBookmark={()=>toggleBm(a.mal_id)} onClick={()=>setSelectedAnime(a)}/></div>)}</Row>
              <Row title="All-Time Favorites" icon="⭐">{animeRows.topRated.map(a=><div key={a.mal_id} style={{width:148,flexShrink:0}}><PosterCard img={animeImg(a)} title={animeTitle(a)} subtitle={a.year?.toString()} rating={animeScore(a)} bookmarked={bookmarks.has(a.mal_id)} onBookmark={()=>toggleBm(a.mal_id)} onClick={()=>setSelectedAnime(a)}/></div>)}</Row>
            </>}

            {section==="movies"&&<>
              <Row title="Most Watched" icon="🎬">{movieRows.popular.map(m=><div key={m.imdb_code} style={{width:148,flexShrink:0}}><PosterCard img={m.large_cover_image} title={m.title} subtitle={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={()=>toggleBm(m.imdb_code)} onClick={()=>setSelectedMovie(m)}/></div>)}</Row>
              <Row title="Top Rated" icon="⭐">{movieRows.topRated.map(m=><div key={m.imdb_code} style={{width:148,flexShrink:0}}><PosterCard img={m.large_cover_image} title={m.title} subtitle={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={()=>toggleBm(m.imdb_code)} onClick={()=>setSelectedMovie(m)}/></div>)}</Row>
              <Row title="Action" icon="💥">{movieRows.action.map(m=><div key={m.imdb_code} style={{width:148,flexShrink:0}}><PosterCard img={m.large_cover_image} title={m.title} subtitle={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={()=>toggleBm(m.imdb_code)} onClick={()=>setSelectedMovie(m)}/></div>)}</Row>
              <Row title="Animation" icon="🌸">{movieRows.animation.map(m=><div key={m.imdb_code} style={{width:148,flexShrink:0}}><PosterCard img={m.large_cover_image} title={m.title} subtitle={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={()=>toggleBm(m.imdb_code)} onClick={()=>setSelectedMovie(m)}/></div>)}</Row>
            </>}

            {section==="manga"&&<>
              <Row title="Most Popular" icon="📖">{mangaRows.popular.map(m=><div key={m.id} style={{width:148,flexShrink:0}}><PosterCard img={getCoverUrl(m)} title={mangaTitle(m)} onClick={()=>setSelectedManga(m)} bookmarked={bookmarks.has(m.id)} onBookmark={()=>toggleBm(m.id)}/></div>)}</Row>
              <Row title="Action" icon="⚔️">{mangaRows.action.map(m=><div key={m.id} style={{width:148,flexShrink:0}}><PosterCard img={getCoverUrl(m)} title={mangaTitle(m)} onClick={()=>setSelectedManga(m)} bookmarked={bookmarks.has(m.id)} onBookmark={()=>toggleBm(m.id)}/></div>)}</Row>
              <Row title="Romance" icon="💜">{mangaRows.romance.map(m=><div key={m.id} style={{width:148,flexShrink:0}}><PosterCard img={getCoverUrl(m)} title={mangaTitle(m)} onClick={()=>setSelectedManga(m)} bookmarked={bookmarks.has(m.id)} onBookmark={()=>toggleBm(m.id)}/></div>)}</Row>
            </>}
          </div>
        </>
      )}

      {/* BROWSE */}
      {view==="browse"&&(
        <BrowsePage list={browseList} loading={browseLoading} hasMore={browseHasMore}
          onLoadMore={async()=>{setMoreLoading(true);await loadBrowse({page:browsePage+1,q:searchQ,g:genre,append:true});setMoreLoading(false);}}
          moreLoading={moreLoading}
          genres={section==="anime"?ANIME_GENRES:section==="movies"?MOVIE_GENRES:MANGA_GENRES}
          genre={genre} setGenre={setGenre} searchQ={searchQ}
          onCard={section==="anime"?setSelectedAnime:section==="movies"?setSelectedMovie:setSelectedManga}
          bookmarks={bookmarks} onBookmark={toggleBm} type={section}
          histMap={history}/>
      )}

      <footer style={{borderTop:"1px solid #140d28",padding:"26px 20px",textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
          <ShinoraLogo size={22}/>
          <span style={{fontSize:15,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase",color:"#fff"}}>SHIN<span style={{background:"linear-gradient(135deg,#7c3aed,#c084fc)",padding:"0 2px",borderRadius:2}}>O</span>RA</span>
        </div>
        <div style={{fontSize:11,color:"#1a1a28"}}>© 2026 Shinora · Anime · Movies · Manga · For entertainment purposes only</div>
      </footer>

      {selectedAnime&&<AnimeModal anime={selectedAnime} onClose={()=>setSelectedAnime(null)} bookmarked={bookmarks.has(selectedAnime.mal_id)} onBookmark={toggleBm} onWatch={handleWatchAnime}/>}
      {selectedMovie&&<MovieModal movie={selectedMovie} onClose={()=>setSelectedMovie(null)} bookmarked={bookmarks.has(selectedMovie.imdb_code)} onBookmark={toggleBm} onWatch={handleWatchMovie}/>}
      {selectedManga&&<MangaModal manga={selectedManga} onClose={()=>setSelectedManga(null)} bookmarked={bookmarks.has(selectedManga.id)} onBookmark={toggleBm} onRead={handleReadManga} onSaveHist={saveHist}/>}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );
}

/* ══════════════════════════════════════════
   GLOBAL STYLES
══════════════════════════════════════════ */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      html,body{overflow-x:hidden;max-width:100%;background:#000;}
      body{font-family:'Inter','Segoe UI',sans-serif;}
      ::-webkit-scrollbar{width:4px;height:4px;}
      ::-webkit-scrollbar-track{background:#000;}
      ::-webkit-scrollbar-thumb{background:#1a1a28;border-radius:2px;}
      ::-webkit-scrollbar-thumb:hover{background:#7c3aed;}
      .hide-scroll{scrollbar-width:none;-ms-overflow-style:none;}
      .hide-scroll::-webkit-scrollbar{display:none;}
      @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
      @keyframes modalIn{from{opacity:0;transform:translateY(12px) scale(.97);}to{opacity:1;transform:translateY(0) scale(1);}}
      @keyframes spin{to{transform:rotate(360deg);}}
      .anime-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:14px;}
      .genre-scroll{display:flex;gap:7px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-ms-overflow-style:none;}
      .genre-scroll::-webkit-scrollbar{display:none;}
      .watch-layout{display:flex;gap:18px;padding:14px 20px 60px;max-width:1400px;margin:0 auto;}
      .watch-main{flex:1;min-width:0;}
      .watch-sidebar{width:290px;flex-shrink:0;position:sticky;top:74px;max-height:calc(100vh - 82px);overflow:hidden;}
      .desk-nav{display:flex;gap:4px;align-items:center;}
      .hamburger{display:none !important;}
      @media(max-width:860px){
        .anime-grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr)) !important;gap:10px !important;}
        .hero-content{padding:0 16px 36px !important;max-width:100% !important;}
        .hero-title{font-size:22px !important;}
        .watch-layout{flex-direction:column !important;padding:10px 12px 40px !important;}
        .watch-sidebar{width:100% !important;position:static !important;max-height:none !important;}
        .desk-nav{display:none !important;}
        .hamburger{display:flex !important;}
        .search-label{display:none;}
      }
    `}</style>
  );
}
