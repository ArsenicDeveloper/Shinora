import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════
   SHINORA — Anime · Movies · Manga
   Anime  → Jikan API + AniSkip + megaplay
   Movies → YTS API + vidsrc / 111movies
   Manga  → MangaDex API (built-in reader)
══════════════════════════════════════════ */

/* ── Local account storage ─── */
const LS = {
  users : () => JSON.parse(localStorage.getItem("sh_users") || "[]"),
  sess  : () => localStorage.getItem("sh_sess"),
  hist  : (id) => JSON.parse(localStorage.getItem(`sh_hist_${id}`) || "{}"),
  bm    : (id) => JSON.parse(localStorage.getItem(`sh_bm_${id}`) || "[]"),
  save  : (k,v) => localStorage.setItem(k, JSON.stringify(v)),
  saveU : (v) => localStorage.setItem("sh_users", JSON.stringify(v)),
  saveS : (id) => localStorage.setItem("sh_sess", id),
  clearS: () => localStorage.removeItem("sh_sess"),
  saveH : (id,v) => localStorage.setItem(`sh_hist_${id}`, JSON.stringify(v)),
  saveB : (id,v) => localStorage.setItem(`sh_bm_${id}`, JSON.stringify(v)),
};
const mkId = () => Math.random().toString(36).slice(2);

/* ══════════════════════════════════════════
   ANIME API  (Jikan — jikan.moe)
══════════════════════════════════════════ */
const JIKAN = "https://api.jikan.moe/v4";
const ANIME_GENRE_IDS = {
  Action:1,Adventure:2,Comedy:4,Drama:8,Fantasy:10,Horror:14,
  Mystery:7,Romance:22,"Sci-Fi":24,"Slice of Life":36,
  Sports:30,Supernatural:37,Thriller:41,Psychological:40,Mecha:18,
};
const ANIME_GENRES = ["All",...Object.keys(ANIME_GENRE_IDS)];

const jikanFetch = async (path) => {
  try {
    const r = await fetch(`${JIKAN}${path}`);
    const d = await r.json();
    return d;
  } catch { return {}; }
};

const fetchAnime = async ({ page=1, search="", genre="All" }={}) => {
  await new Promise(r => setTimeout(r, 250)); // rate limit buffer
  let path;
  if (search.trim()) {
    path = `/anime?q=${encodeURIComponent(search)}&type=tv&limit=24&sfw=true&page=${page}`;
  } else if (genre !== "All" && ANIME_GENRE_IDS[genre]) {
    path = `/anime?genres=${ANIME_GENRE_IDS[genre]}&type=tv&order_by=score&sort=desc&limit=24&sfw=true&page=${page}`;
  } else {
    path = `/top/anime?type=tv&limit=24&page=${page}&filter=bypopularity`;
  }
  const d = await jikanFetch(path);
  return { list: d.data || [], hasMore: d.pagination?.has_next_page || false, page: d.pagination?.current_page || page };
};

const fetchAnimeRow = async (path) => {
  const d = await jikanFetch(path);
  return d.data || [];
};

const fetchSkipTimes = async (malId, ep) => {
  try {
    const r = await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${ep}?types[]=op&types[]=ed&episodeLength=0`);
    const d = await r.json();
    if (!d.found) return null;
    return {
      op: d.results.find(x => x.skipType === "op")?.interval || null,
      ed: d.results.find(x => x.skipType === "ed")?.interval || null,
    };
  } catch { return null; }
};

/* ══════════════════════════════════════════
   MOVIE API  (YTS — yts.mx)
══════════════════════════════════════════ */
const YTS = "https://yts.mx/api/v2/list_movies.json";
const MOVIE_GENRES = ["All","Action","Adventure","Animation","Comedy","Crime","Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Thriller","Western"];


// Fetch with timeout — prevents hanging forever when an API is blocked/slow
const timedFetch = async (url, ms = 8000) => {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) { clearTimeout(id); throw e; }
};

const fetchMovies = async ({ page=1, search="", genre="All" }={}) => {
  try {
    let url = `${YTS}?limit=24&page=${page}&sort_by=download_count&order_by=desc`;
    if (search.trim()) url += `&query_term=${encodeURIComponent(search)}`;
    if (genre !== "All") url += `&genre=${encodeURIComponent(genre)}`;
    const r = await timedFetch(url);
    const d = await r.json();
    const movies = d.data?.movies || [];
    return { list: movies, hasMore: movies.length === 24, page };
  } catch (e) { console.error("Movies fetch error:", e); return { list: [], hasMore: false, page }; }
};

const fetchMovieRow = async (genre = "", sortBy = "download_count", minRating = 0) => {
  try {
    let url = `${YTS}?limit=20&sort_by=${sortBy}&order_by=desc&minimum_rating=${minRating}`;
    if (genre) url += `&genre=${encodeURIComponent(genre)}`;
    const r = await timedFetch(url);
    const d = await r.json();
    return d.data?.movies || [];
  } catch (e) { console.error("Movie row fetch error:", e); return []; }
};

/* ══════════════════════════════════════════
   MANGA API  (MangaDex — api.mangadex.org)
══════════════════════════════════════════ */
const MDX = "https://api.mangadex.org";
const MANGA_GENRES = ["All","Action","Adventure","Comedy","Drama","Fantasy","Horror","Romance","Sci-Fi","Slice of Life","Supernatural","Thriller","Psychological"];
const MDX_TAGS = {
  Action:      "391b0423-d847-456f-aff0-8b0cfc03066b",
  Adventure:   "87cc87cd-a395-47af-b27a-93258283bbc6",
  Comedy:      "4d32cc48-9f00-4cca-9b5a-a56702952f9c",
  Drama:       "b9af3a63-f058-46de-a9a0-e0c13906197a",
  Fantasy:     "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  Horror:      "cdad7e68-1419-41dd-bdce-27753074a640",
  Romance:     "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  "Sci-Fi":    "256c8bd9-4904-4360-bf4f-508a76d67183",
  "Slice of Life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  Supernatural:"eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
  Thriller:    "07251805-a27e-4d59-b488-f0bfbec15168",
  Psychological:"3b60b75c-a2d7-4860-ab56-05f391bb889c",
};

const fetchManga = async ({ page=1, search="", genre="All" }={}) => {
  try {
    let url = `${MDX}/manga?limit=24&offset=${(page-1)*24}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&availableTranslatedLanguage[]=en&order[followedCount]=desc`;
    if (search.trim()) url += `&title=${encodeURIComponent(search)}`;
    if (genre !== "All" && MDX_TAGS[genre]) url += `&includedTags[]=${MDX_TAGS[genre]}`;
    const r = await timedFetch(url);
    const d = await r.json();
    return { list: d.data || [], hasMore: (d.data?.length || 0) === 24, page };
  } catch (e) { console.error("Manga fetch error:", e); return { list: [], hasMore: false, page }; }
};

const fetchMangaRow = async (genre = "") => {
  try {
    let url = `${MDX}/manga?limit=20&includes[]=cover_art&contentRating[]=safe&availableTranslatedLanguage[]=en&order[followedCount]=desc`;
    if (genre && MDX_TAGS[genre]) url += `&includedTags[]=${MDX_TAGS[genre]}`;
    const r = await timedFetch(url);
    const d = await r.json();
    return d.data || [];
  } catch (e) { console.error("Manga row error:", e); return []; }
};

const fetchMangaChapters = async (id) => {
  try {
    const r = await fetch(`${MDX}/manga/${id}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=100&contentRating[]=safe&contentRating[]=suggestive`);
    const d = await r.json();
    return d.data || [];
  } catch { return []; }
};

const fetchChapterPages = async (chapterId) => {
  try {
    const r = await fetch(`${MDX}/at-home/server/${chapterId}`);
    const d = await r.json();
    if (!d.baseUrl || !d.chapter) return [];
    return d.chapter.data.map(f => `${d.baseUrl}/data/${d.chapter.hash}/${f}`);
  } catch { return []; }
};

/* ══════════════════════════════════════════
   VIDEO SERVERS
══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const aTitle  = (a) => a?.title_english || a?.title || "Unknown";
const aImg    = (a) => a?.images?.webp?.large_image_url || a?.images?.jpg?.large_image_url;
const aScore  = (a) => a?.score ? a.score.toFixed(1) : "N/A";
const aGenres = (a) => (a?.genres || []).map(g => g.name);
const aEps    = (a) => Array.from({ length: Math.min(Number(a?.episodes) || 12, 200) }, (_, i) => i + 1);
const mCover  = (m) => { const r = m?.relationships?.find(x => x.type === "cover_art"); return r?.attributes?.fileName ? `https://uploads.mangadex.org/covers/${m.id}/${r.attributes.fileName}.256.jpg` : null; };
const mTitle  = (m) => { const t = m?.attributes?.title; return t?.en || t?.["ja-ro"] || Object.values(t || {})[0] || "Unknown"; };

/* ══════════════════════════════════════════
   ICONS
══════════════════════════════════════════ */
const Ic = {
  Star  : () => <svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  Play  : ({ s=20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X     : ({ s=18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bm    : ({ on }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={on?"#a855f7":"none"} stroke={on?"#a855f7":"currentColor"} strokeWidth="2.2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  ChevL : () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevR : () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Menu  : () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Skip  : () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="2" height="16"/></svg>,
  Clock : () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Film  : () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
  Book  : () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Sword : () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/></svg>,
};

/* ══════════════════════════════════════════
   LOGO SVG
══════════════════════════════════════════ */
function Logo({ size=34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        <linearGradient id="lg_a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0abfc"/>
          <stop offset="45%" stopColor="#c084fc"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <linearGradient id="lg_b" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e879f9"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <filter id="glow_s" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow_sm" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Outer circle ring */}
      <circle cx="60" cy="60" r="54" fill="none" stroke="url(#lg_a)" strokeWidth="2.5" opacity=".65" filter="url(#glow_sm)"/>
      {/* Inner glow ring */}
      <circle cx="60" cy="60" r="50" fill="none" stroke="url(#lg_b)" strokeWidth=".8" opacity=".3"/>
      {/* Lightning bolt S */}
      <path d="M42 14 L72 14 L55 50 L76 50 L30 106 L47 106 L42 66 L18 66 Z"
            fill="url(#lg_a)" filter="url(#glow_s)"/>
      {/* Katana blade — diagonal slash */}
      <line x1="84" y1="10" x2="24" y2="110" stroke="url(#lg_b)" strokeWidth="2.2" opacity=".75" strokeLinecap="round"/>
      {/* Katana guard (tsuba) */}
      <ellipse cx="63" cy="53" rx="6" ry="3.5" fill="#1a0a2e" stroke="url(#lg_b)" strokeWidth="1.5" transform="rotate(-55 63 53)"/>
      {/* Katana handle */}
      <line x1="84" y1="10" x2="76" y2="24" stroke="#6d28d9" strokeWidth="3.5" strokeLinecap="round" opacity=".9"/>
      {/* Handle wrap detail */}
      <line x1="81" y1="15" x2="78" y2="20" stroke="#c084fc" strokeWidth="1" strokeLinecap="round" opacity=".7"/>
      <line x1="83" y1="12" x2="80" y2="17" stroke="#c084fc" strokeWidth="1" strokeLinecap="round" opacity=".5"/>
      {/* Sakura petals */}
      <circle cx="91" cy="35" r="3.5" fill="#e879f9" opacity=".55" filter="url(#glow_sm)"/>
      <circle cx="98" cy="50" r="2.2" fill="#c084fc" opacity=".4"/>
      <circle cx="94" cy="44" r="1.5" fill="#f0abfc" opacity=".5"/>
      {/* Film reel strip hint */}
      <rect x="14" y="68" width="10" height="7" rx="1.5" fill="none" stroke="#7c3aed" strokeWidth="1.2" opacity=".45"/>
      <line x1="14" y1="71.5" x2="24" y2="71.5" stroke="#7c3aed" strokeWidth=".8" opacity=".45"/>
    </svg>
  );
}

/* ══════════════════════════════════════════
   AUTH MODAL
══════════════════════════════════════════ */
function AuthModal({ onClose, onLogin }) {
  const [tab, setTab] = useState("login");
  const [name, setName] = useState("");
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState("");
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const submit = () => {
    setErr("");
    if (!name.trim() || !pw.trim()) return setErr("Please fill in all fields.");
    const users = LS.users();
    if (tab === "signup") {
      if (users.find(u => u.name === name)) return setErr("Username already taken.");
      const u = { id: mkId(), name, pw };
      LS.saveU([...users, u]); LS.saveS(u.id); onLogin(u);
    } else {
      const u = users.find(u => u.name === name && u.pw === pw);
      if (!u) return setErr("Wrong username or password.");
      LS.saveS(u.id); onLogin(u);
    }
  };
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(16px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:400,border:"1px solid #2d1a5e",boxShadow:"0 0 60px rgba(124,58,237,.2)",animation:"modalIn .2s ease" }}>
        <div style={{ display:"flex",borderBottom:"1px solid #1a1a28" }}>
          {[["login","Sign In"],["signup","Sign Up"]].map(([m,l]) => (
            <button key={m} onClick={() => { setTab(m); setErr(""); }} style={{ flex:1,background:"none",border:"none",color:tab===m?"#c084fc":"#4b5563",padding:"18px 0",fontSize:14,fontWeight:700,cursor:"pointer",borderBottom:tab===m?"2px solid #a855f7":"2px solid transparent" }}>{l}</button>
          ))}
        </div>
        <div style={{ padding:28 }}>
          <div style={{ fontSize:18,fontWeight:900,color:"#f1f5f9",marginBottom:5 }}>{tab==="login"?"Welcome back 👋":"Join Shinora 🎌"}</div>
          <div style={{ fontSize:12,color:"#4b5563",marginBottom:22 }}>Account data is stored locally on your device.</div>
          {[["Username",name,setName,"text"],["Password",pw,setPw,"password"]].map(([l,v,s,t]) => (
            <div key={l} style={{ marginBottom:14 }}>
              <label style={{ display:"block",color:"#6b7280",fontSize:11,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.8 }}>{l}</label>
              <input type={t} value={v} onChange={e => s(e.target.value)} onKeyDown={e => e.key==="Enter" && submit()} placeholder={l}
                style={{ width:"100%",background:"#060608",border:"1px solid #2d1a5e",borderRadius:10,color:"#f1f5f9",padding:"11px 14px",fontSize:14,outline:"none" }}/>
            </div>
          ))}
          {err && <div style={{ color:"#f87171",fontSize:12,marginBottom:12,background:"rgba(248,113,113,.08)",padding:"8px 12px",borderRadius:8,border:"1px solid rgba(248,113,113,.2)" }}>{err}</div>}
          <button onClick={submit} style={{ width:"100%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"12px 0",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 6px 24px rgba(124,58,237,.4)" }}>
            {tab==="login"?"Sign In":"Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   POSTER CARD
══════════════════════════════════════════ */
function Card({ img, title, sub, rating, badge, badgeColor="#059669", bookmarked, onBookmark, onClick, progress=0 }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ cursor:"pointer",borderRadius:10,overflow:"hidden",background:"#0d0d14",flexShrink:0,
        transform:hov?"translateY(-4px)":"none",
        boxShadow:hov?"0 16px 40px rgba(0,0,0,.8),0 0 0 1px rgba(168,85,247,.35)":"0 4px 16px rgba(0,0,0,.5)",
        transition:"transform .2s,box-shadow .2s" }}>
      <div onClick={onClick} style={{ position:"relative",paddingBottom:"148%",overflow:"hidden" }}>
        {img
          ? <img src={img} alt={title} loading="lazy" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",transform:hov?"scale(1.05)":"scale(1)",transition:"transform .35s" }}/>
          : <div style={{ position:"absolute",inset:0,background:"#1a1a28",display:"flex",alignItems:"center",justifyContent:"center",fontSize:38 }}>🎌</div>
        }
        <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.1) 55%,transparent 100%)" }}/>
        {badge && <div style={{ position:"absolute",top:8,left:8,background:badgeColor,color:"#fff",fontSize:9,fontWeight:800,padding:"3px 7px",borderRadius:20,textTransform:"uppercase",letterSpacing:.8 }}>{badge}</div>}
        {onBookmark && <button onClick={e => { e.stopPropagation(); onBookmark(); }} style={{ position:"absolute",top:7,right:7,background:"rgba(0,0,0,.75)",border:"none",cursor:"pointer",borderRadius:7,padding:"5px 6px",display:"flex",backdropFilter:"blur(4px)" }}><Ic.Bm on={bookmarked}/></button>}
        {hov && <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.1)" }}><div style={{ width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 24px rgba(168,85,247,.6)" }}><Ic.Play s={18}/></div></div>}
        {progress > 0 && <div style={{ position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.1)" }}><div style={{ height:"100%",background:"#a855f7",width:`${Math.min(progress,100)}%` }}/></div>}
      </div>
      <div onClick={onClick} style={{ padding:"8px 10px 10px" }}>
        <div style={{ color:"#f1f5f9",fontSize:12,fontWeight:600,lineHeight:1.3,marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{title}</div>
        <div style={{ display:"flex",alignItems:"center",gap:5 }}>
          {rating && <><Ic.Star/><span style={{ color:"#fbbf24",fontSize:10,fontWeight:600 }}>{rating}</span><span style={{ color:"#1a1a28" }}>·</span></>}
          <span style={{ color:"#4b5563",fontSize:10,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{sub}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ROW (horizontal scroll)
══════════════════════════════════════════ */
function Row({ title, loading, children }) {
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({ left: d * 340, behavior: "smooth" });
  return (
    <div style={{ marginBottom:36 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <h2 style={{ fontSize:13,fontWeight:800,color:"#e2e8f0",textTransform:"uppercase",letterSpacing:.8 }}>{title}</h2>
        <div style={{ display:"flex",gap:6 }}>
          <button onClick={() => scroll(-1)} style={rowBtn}><Ic.ChevL/></button>
          <button onClick={() => scroll(1)}  style={rowBtn}><Ic.ChevR/></button>
        </div>
      </div>
      {loading
        ? <div style={{ display:"flex",gap:12 }}>{[1,2,3,4,5,6].map(i => <div key={i} style={{ width:148,height:220,background:"#0d0d14",borderRadius:10,flexShrink:0,animation:"pulse 1.5s ease infinite",opacity:.6 }}/>)}</div>
        : <div ref={ref} className="hide-scroll" style={{ display:"flex",gap:12,overflowX:"auto",paddingBottom:4 }}>{children}</div>
      }
    </div>
  );
}
const rowBtn = { background:"#0d0d14",border:"1px solid #1a1a28",color:"#6b7280",borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex" };

/* ══════════════════════════════════════════
   CONTINUE WATCHING
══════════════════════════════════════════ */
function ContinueRow({ history, onPlay }) {
  const ref   = useRef(null);
  const items = Object.values(history).sort((a,b) => b.at-a.at).slice(0,16);
  if (!items.length) return null;
  const scroll = (d) => ref.current?.scrollBy({ left: d*280, behavior:"smooth" });
  return (
    <div style={{ marginBottom:36 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <h2 style={{ fontSize:13,fontWeight:800,color:"#e2e8f0",textTransform:"uppercase",letterSpacing:.8,display:"flex",alignItems:"center",gap:6 }}><Ic.Clock/> Continue Watching</h2>
        <div style={{ display:"flex",gap:6 }}>
          <button onClick={() => scroll(-1)} style={rowBtn}><Ic.ChevL/></button>
          <button onClick={() => scroll(1)}  style={rowBtn}><Ic.ChevR/></button>
        </div>
      </div>
      <div ref={ref} className="hide-scroll" style={{ display:"flex",gap:12,overflowX:"auto",paddingBottom:4 }}>
        {items.map(h => {
          const isAnime = h.type === "anime";
          const img   = isAnime ? aImg(h.data) : h.type==="movie" ? h.data.large_cover_image : mCover(h.data);
          const title = isAnime ? aTitle(h.data) : h.type==="movie" ? h.data.title : mTitle(h.data);
          const prog  = isAnime && h.data?.episodes ? (h.ep / h.data.episodes) * 100 : 50;
          return (
            <div key={h.key} onClick={() => onPlay(h)} style={{ width:240,flexShrink:0,background:"#0d0d14",borderRadius:10,overflow:"hidden",cursor:"pointer",border:"1px solid #1a1a28" }}>
              <div style={{ position:"relative",paddingBottom:"56%",overflow:"hidden" }}>
                {img ? <img src={img} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.75)" }}/> : <div style={{ position:"absolute",inset:0,background:"#1a1a28",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28 }}>🎌</div>}
                <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.88) 0%,transparent 60%)" }}/>
                <div style={{ position:"absolute",bottom:8,left:10,right:10,display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><Ic.Play s={12}/></div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ color:"#fff",fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{title}</div>
                    <div style={{ color:"#9ca3af",fontSize:10,marginTop:2 }}>{isAnime?`Ep ${h.ep}`:h.type==="movie"?"Movie":`Ch ${h.ch}`}</div>
                  </div>
                </div>
                <div style={{ position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.1)" }}><div style={{ height:"100%",background:"#a855f7",width:`${Math.min(prog,100)}%` }}/></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SERVER BAR
══════════════════════════════════════════ */
function ServerBar({ servers, active, onSelect }) {
  return (
    <div style={{ marginTop:14,background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",padding:"12px 14px" }}>
      <div style={{ color:"#4b5563",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10 }}>Servers</div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:7 }}>
        {servers.map(s => (
          <button key={s.id} onClick={() => onSelect(s)} style={{ background:active.id===s.id?"linear-gradient(135deg,#7c3aed,#a855f7)":"#0a0a10",border:`1px solid ${active.id===s.id?"#a855f7":"#1a1a28"}`,color:active.id===s.id?"#fff":"#9ca3af",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,transition:"all .18s" }}>
            {s.label} <span style={{ fontSize:9,background:active.id===s.id?"rgba(255,255,255,.2)":"#1a1a28",borderRadius:4,padding:"2px 4px" }}>{s.tag}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop:8,fontSize:11,color:"#374151" }}>💡 Video not loading? Try another server.</div>
    </div>
  );
}

/* ══════════════════════════════════════════
   ANIME WATCH VIEW
══════════════════════════════════════════ */
function AnimeWatch({ anime, startEp, onBack, bookmarked, onBookmark, onSaveHist }) {
  const [ep, setEp]               = useState(startEp);
  const [lang, setLang]           = useState("sub");
  const [srv, setSrv]             = useState(ANIME_SERVERS[0]);
  const [autoPlay, setAutoPlay]   = useState(true);
  const [autoSkip, setAutoSkip]   = useState(true);
  const [skipTimes, setSkipTimes] = useState(null);
  const [localSec, setLocalSec]   = useState(0);
  const [showSkip, setShowSkip]   = useState(false);
  const [showEd, setShowEd]       = useState(false);
  const [epGrid, setEpGrid]       = useState(true);
  const [nextBanner, setNextBanner] = useState(false);
  const [countdown, setCountdown]   = useState(5);
  const ifrRef  = useRef(null);
  const timerRef = useRef(null);
  const countRef = useRef(null);
  const epRef   = useRef(null);
  const eps     = aEps(anime);
  const total   = eps.length;
  const title   = aTitle(anime);
  const img     = aImg(anime);

  useEffect(() => { setSkipTimes(null); setShowSkip(false); setShowEd(false); fetchSkipTimes(anime.mal_id, ep).then(setSkipTimes); }, [anime.mal_id, ep]);

  const startTimer = useCallback(() => { clearInterval(timerRef.current); setLocalSec(0); timerRef.current = setInterval(() => setLocalSec(s => s+1), 1000); }, []);
  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (!skipTimes) return;
    const { op, ed } = skipTimes;
    if (op) setShowSkip(localSec >= op.startTime && localSec <= op.endTime);
    if (ed) setShowEd(localSec >= ed.startTime && localSec <= ed.endTime);
  }, [localSec, skipTimes]);

  useEffect(() => { if (autoSkip && showSkip && skipTimes?.op) doSkip("op"); }, [showSkip]); // eslint-disable-line

  useEffect(() => {
    const h = (e) => {
      try {
        const d = typeof e.data==="string" ? JSON.parse(e.data) : e.data;
        if (!d) return;
        if (d.event==="complete" && autoPlay && ep<total) {
          setNextBanner(true); setCountdown(5);
          countRef.current = setInterval(() => setCountdown(v => { if (v<=1) { clearInterval(countRef.current); goNext(); return 5; } return v-1; }), 1000);
        }
      } catch {}
    };
    window.addEventListener("message", h);
    return () => { window.removeEventListener("message", h); clearInterval(countRef.current); };
  }, [autoPlay, ep, total]); // eslint-disable-line

  const doSkip = (type) => {
    // We cannot seek inside a cross-origin iframe — reloading src restarts the video.
    // Best we can do: fast-forward the local timer past the intro window so the
    // button disappears, and post a seek message in case the player supports it.
    const endTime = type==="op" ? skipTimes?.op?.endTime : skipTimes?.ed?.endTime;
    if (!endTime) { setShowSkip(false); setShowEd(false); return; }
    // Try postMessage seek (works if the player supports it)
    try { ifrRef.current?.contentWindow?.postMessage({ type:"seek", time: endTime }, "*"); } catch {}
    // Jump the local timer past the intro so the skip button goes away
    setLocalSec(endTime + 1);
    setShowSkip(false);
    setShowEd(false);
  };

  const goNext = useCallback(() => { if (ep<total) { setEp(e=>e+1); setNextBanner(false); setCountdown(5); clearInterval(countRef.current); } }, [ep, total]);

  useEffect(() => {
    setShowSkip(false); setShowEd(false); setNextBanner(false); setCountdown(5); clearInterval(countRef.current);
    onSaveHist?.("anime", anime, ep);
    setTimeout(() => epRef.current?.querySelector(".ep-active")?.scrollIntoView({ block:"nearest", behavior:"smooth" }), 100);
  }, [ep]); // eslint-disable-line

  useEffect(() => { window.scrollTo({ top:0, behavior:"smooth" }); }, []);

  return (
    <div style={{ minHeight:"100vh",background:"#000",paddingTop:62 }}>
      <div style={{ padding:"10px 18px",borderBottom:"1px solid #0f0f18",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600 }}><Ic.ChevL/> Back</button>
        <span style={{ color:"#4b5563",fontSize:13 }}>{title}</span>
        <span style={{ color:"#1a1a28" }}>·</span>
        <span style={{ color:"#6b7280",fontSize:13 }}>Ep {ep}</span>
        {skipTimes?.op && <span style={{ marginLeft:"auto",background:"rgba(168,85,247,.12)",border:"1px solid rgba(168,85,247,.3)",color:"#c084fc",fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:600 }}>⏱ Skip times found</span>}
      </div>
      <div className="watch-layout">
        <div className="watch-main">
          <div style={{ position:"relative",width:"100%",aspectRatio:"16/9",background:"#000",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 50px rgba(0,0,0,1)" }}>
            <iframe ref={ifrRef} key={`${anime.mal_id}-${ep}-${lang}-${srv.id}`} src={srv.url(anime,ep,lang)} title={`${title} Ep ${ep}`} allowFullScreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture" onLoad={startTimer} style={{ width:"100%",height:"100%",border:"none",display:"block" }}/>
            {showSkip && !autoSkip && <button onClick={() => doSkip("op")} style={{ position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.92)",backdropFilter:"blur(10px)",border:"1px solid #a855f7",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .3s ease" }}><Ic.Skip/> Skip Intro</button>}
            {showEd && <button onClick={() => doSkip("ed")} style={{ position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.92)",backdropFilter:"blur(10px)",border:"1px solid #a855f7",color:"#fff",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .3s ease" }}><Ic.Skip/> Skip Outro</button>}
            {nextBanner && ep<total && (
              <div style={{ position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.97),rgba(0,0,0,.7))",padding:"18px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10 }}>
                <div><div style={{ color:"#9ca3af",fontSize:12,marginBottom:2 }}>Up Next</div><div style={{ color:"#fff",fontWeight:700,fontSize:15 }}>Episode {ep+1}</div></div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={() => { setNextBanner(false); clearInterval(countRef.current); }} style={{ background:"#1a1a28",border:"none",color:"#9ca3af",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600 }}>Cancel</button>
                  <button onClick={goNext} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6 }}><Ic.Play s={14}/> Play ({countdown}s)</button>
                </div>
              </div>
            )}
          </div>
          <ServerBar servers={ANIME_SERVERS} active={srv} onSelect={setSrv}/>
          <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
            <button onClick={() => ep>1 && setEp(e=>e-1)} disabled={ep<=1} style={{ flex:1,minWidth:90,background:ep<=1?"#060608":"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:ep<=1?"#374151":"#9ca3af",padding:"9px 0",cursor:ep<=1?"default":"pointer",fontSize:13,fontWeight:600 }}>← Prev</button>
            <button onClick={() => ep<total && setEp(e=>e+1)} disabled={ep>=total} style={{ flex:1,minWidth:90,background:ep>=total?"#060608":"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:ep>=total?"#374151":"#9ca3af",padding:"9px 0",cursor:ep>=total?"default":"pointer",fontSize:13,fontWeight:600 }}>Next →</button>
            <div style={{ display:"flex",background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,overflow:"hidden" }}>
              {["sub","dub"].map(l => <button key={l} onClick={() => setLang(l)} style={{ background:lang===l?"linear-gradient(135deg,#7c3aed,#a855f7)":"transparent",border:"none",color:lang===l?"#fff":"#6b7280",padding:"9px 16px",cursor:"pointer",fontSize:12,fontWeight:700,textTransform:"uppercase" }}>{l}</button>)}
            </div>
          </div>
          <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
            {[["Auto Play Next",autoPlay,setAutoPlay],["Auto Skip Intro",autoSkip,setAutoSkip]].map(([l,v,s]) => (
              <button key={l} onClick={() => s(x=>!x)} style={{ display:"flex",alignItems:"center",gap:7,background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:v?"#c084fc":"#6b7280",padding:"7px 13px",cursor:"pointer",fontSize:12,fontWeight:600 }}>
                <div style={{ width:28,height:16,borderRadius:8,background:v?"linear-gradient(135deg,#7c3aed,#a855f7)":"#1a1a28",position:"relative",flexShrink:0 }}><div style={{ position:"absolute",top:2,left:v?14:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s" }}/></div>
                {l}
              </button>
            ))}
          </div>
          <div style={{ marginTop:14,background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",padding:16 }}>
            <div style={{ display:"flex",gap:14,alignItems:"flex-start" }}>
              {img && <img src={img} alt={title} style={{ width:66,height:92,objectFit:"cover",borderRadius:8,flexShrink:0 }}/>}
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ color:"#f1f5f9",fontSize:15,fontWeight:800,marginBottom:7 }}>{title}</div>
                <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{aGenres(anime).slice(0,4).map(g => <span key={g} style={{ background:"#1a1a28",color:"#6b7280",fontSize:10,padding:"3px 8px",borderRadius:20 }}>{g}</span>)}</div>
                <div style={{ display:"flex",gap:6,fontSize:12,alignItems:"center",flexWrap:"wrap" }}><span style={{ display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:700 }}><Ic.Star/>{aScore(anime)}</span><span style={{ color:"#1a1a28" }}>·</span><span style={{ color:"#6b7280" }}>{anime.year}</span><span style={{ color:"#1a1a28" }}>·</span><span style={{ color:anime.airing?"#10b981":"#6b7280",fontWeight:600 }}>{anime.airing?"Ongoing":"Completed"}</span></div>
                <button onClick={() => onBookmark(anime.mal_id)} style={{ marginTop:10,background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6 }}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
              </div>
            </div>
            {anime.synopsis && <p style={{ color:"#6b7280",fontSize:13,lineHeight:1.75,marginTop:14 }}>{anime.synopsis.slice(0,280)}…</p>}
          </div>
        </div>
        <div className="watch-sidebar" ref={epRef}>
          <div style={{ background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",overflow:"hidden" }}>
            <div style={{ padding:"12px 14px",borderBottom:"1px solid #1a1a28",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ fontSize:13,fontWeight:700,color:"#e2e8f0" }}>Episodes <span style={{ color:"#374151",fontWeight:400 }}>({total})</span></div>
              <button onClick={() => setEpGrid(v=>!v)} style={{ background:"#1a1a28",border:"1px solid #252535",color:"#6b7280",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontSize:11 }}>{epGrid?"List":"Grid"}</button>
            </div>
            <div style={{ maxHeight:460,overflowY:"auto",padding:8 }}>
              {epGrid ? (
                <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5 }}>
                  {eps.map(n => <button key={n} className={ep===n?"ep-active":""} onClick={() => setEp(n)} style={{ background:ep===n?"linear-gradient(135deg,#7c3aed,#a855f7)":"#0a0a10",border:`1px solid ${ep===n?"#a855f7":"#1a1a28"}`,color:ep===n?"#fff":"#9ca3af",borderRadius:7,padding:"8px 4px",cursor:"pointer",fontSize:12,fontWeight:600 }}>{n}</button>)}
                </div>
              ) : (
                <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                  {eps.map(n => <button key={n} className={ep===n?"ep-active":""} onClick={() => setEp(n)} style={{ background:ep===n?"#1a0e2e":"transparent",border:`1px solid ${ep===n?"rgba(168,85,247,.3)":"transparent"}`,color:ep===n?"#c084fc":"#9ca3af",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:13,fontWeight:ep===n?700:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:10 }}><span style={{ width:26,height:26,borderRadius:6,flexShrink:0,background:ep===n?"linear-gradient(135deg,#7c3aed,#a855f7)":"#1a1a28",color:ep===n?"#fff":"#6b7280",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700 }}>{n}</span>Episode {n}<span style={{ marginLeft:"auto",color:"#374151",fontSize:11 }}>24m</span></button>)}
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
  useEffect(() => { window.scrollTo({ top:0 }); onSaveHist?.("movie", movie, 1); }, []); // eslint-disable-line
  return (
    <div style={{ minHeight:"100vh",background:"#000",paddingTop:62 }}>
      <div style={{ padding:"10px 18px",borderBottom:"1px solid #0f0f18",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600 }}><Ic.ChevL/> Back</button>
        <span style={{ color:"#4b5563",fontSize:13 }}>{movie.title}</span>
        <span style={{ marginLeft:"auto",color:"#6b7280",fontSize:12 }}>{movie.year} · {movie.runtime}min</span>
      </div>
      <div style={{ maxWidth:1100,margin:"0 auto",padding:"14px 20px 60px" }}>
        <div style={{ position:"relative",width:"100%",aspectRatio:"16/9",background:"#000",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 50px rgba(0,0,0,1)",marginBottom:14 }}>
          <iframe key={srv.id} src={srv.url(movie)} title={movie.title} allowFullScreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture" style={{ width:"100%",height:"100%",border:"none",display:"block" }}/>
        </div>
        <ServerBar servers={MOVIE_SERVERS} active={srv} onSelect={setSrv}/>
        <div style={{ marginTop:14,background:"#0d0d14",borderRadius:10,border:"1px solid #1a1a28",padding:16 }}>
          <div style={{ display:"flex",gap:14,alignItems:"flex-start" }}>
            {movie.large_cover_image && <img src={movie.large_cover_image} alt="" style={{ width:72,height:100,objectFit:"cover",borderRadius:8,flexShrink:0 }}/>}
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ color:"#f1f5f9",fontSize:17,fontWeight:800,marginBottom:7 }}>{movie.title} <span style={{ color:"#4b5563",fontWeight:400,fontSize:14 }}>({movie.year})</span></div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:8 }}>{(movie.genres||[]).map(g => <span key={g} style={{ background:"#1a1a28",color:"#6b7280",fontSize:10,padding:"3px 8px",borderRadius:20 }}>{g}</span>)}</div>
              <div style={{ display:"flex",gap:6,fontSize:12,flexWrap:"wrap" }}><span style={{ display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:700 }}><Ic.Star/>{movie.rating}</span><span style={{ color:"#1a1a28" }}>·</span><span style={{ color:"#6b7280" }}>{movie.runtime}min</span></div>
              <button onClick={() => onBookmark(movie.imdb_code)} style={{ marginTop:10,background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6 }}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
            </div>
          </div>
          {movie.description_full && <p style={{ color:"#6b7280",fontSize:13,lineHeight:1.75,marginTop:14 }}>{movie.description_full.slice(0,300)}…</p>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MANGA READER
══════════════════════════════════════════ */
function MangaReader({ chapterId, title, onBack }) {
  const [pages, setPages]   = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    window.scrollTo({ top:0 }); setLoading(true);
    fetchChapterPages(chapterId).then(p => { setPages(p); setLoading(false); });
  }, [chapterId]);
  return (
    <div style={{ minHeight:"100vh",background:"#000",paddingTop:62 }}>
      <div style={{ padding:"10px 18px",borderBottom:"1px solid #0f0f18",display:"flex",alignItems:"center",gap:10 }}>
        <button onClick={onBack} style={{ background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600 }}><Ic.ChevL/> Back</button>
        <span style={{ color:"#6b7280",fontSize:13,flex:1,textAlign:"center" }}>{title}</span>
      </div>
      {loading ? (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"60vh" }}><div style={{ width:36,height:36,border:"3px solid #1a1a28",borderTop:"3px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite" }}/></div>
      ) : (
        <div style={{ maxWidth:800,margin:"0 auto",padding:"16px 8px 60px" }}>
          {pages.length === 0 && <div style={{ textAlign:"center",padding:"60px 0",color:"#6b7280",fontSize:14 }}>Couldn't load pages — MangaDex servers may be busy. Try again.</div>}
          {pages.map((src,i) => <img key={i} src={src} alt={`Page ${i+1}`} loading="lazy" onError={e => { e.target.style.display="none"; }} style={{ display:"block",width:"100%",marginBottom:4 }}/>)}
          <button onClick={onBack} style={{ display:"block",margin:"30px auto 0",background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"12px 28px",fontSize:14,fontWeight:700,cursor:"pointer" }}>← Back</button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MODALS
══════════════════════════════════════════ */
function AnimeModal({ anime, onClose, bookmarked, onBookmark, onWatch }) {
  useEffect(() => { document.body.style.overflow="hidden"; return () => { document.body.style.overflow=""; }; }, []);
  const img = aImg(anime); const title = aTitle(anime);
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(14px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2d1a5e",boxShadow:"0 0 80px rgba(124,58,237,.15)",animation:"modalIn .22s ease" }}>
        <div style={{ position:"relative",height:210,overflow:"hidden",borderRadius:"18px 18px 0 0" }}>
          {img ? <img src={img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",filter:"blur(5px) brightness(.5)",transform:"scale(1.06)" }}/> : <div style={{ width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#0d0d14)" }}/>}
          <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,#0d0d14 0%,transparent 55%)" }}/>
          {img && <img src={img} alt="" style={{ position:"absolute",left:24,bottom:-16,height:"90%",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,.8)" }}/>}
          <button onClick={onClose} style={{ position:"absolute",top:14,right:14,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",borderRadius:10,padding:8,display:"flex" }}><Ic.X/></button>
        </div>
        <div style={{ padding:"28px 22px 22px" }}>
          <div style={{ color:"#6b7280",fontSize:12,marginBottom:4 }}>{anime.title}</div>
          <div style={{ fontSize:19,fontWeight:900,color:"#f1f5f9",marginBottom:10 }}>{title}</div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:7,alignItems:"center",marginBottom:12 }}>
            <span style={{ display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700,fontSize:13 }}><Ic.Star/>{aScore(anime)}</span>
            <span style={{ color:"#1a1a28" }}>·</span><span style={{ color:"#6b7280",fontSize:13 }}>{anime.year}</span>
            <span style={{ color:"#1a1a28" }}>·</span><span style={{ color:anime.airing?"#10b981":"#6b7280",fontSize:13,fontWeight:600 }}>{anime.airing?"Ongoing":"Done"}</span>
            {anime.episodes && <><span style={{ color:"#1a1a28" }}>·</span><span style={{ color:"#6b7280",fontSize:13 }}>{anime.episodes} eps</span></>}
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:14 }}>{aGenres(anime).map(g => <span key={g} style={{ background:"#1a1a28",color:"#6b7280",fontSize:11,padding:"3px 10px",borderRadius:20 }}>{g}</span>)}</div>
          {anime.synopsis && <p style={{ color:"#9ca3af",fontSize:14,lineHeight:1.75,marginBottom:18 }}>{anime.synopsis.slice(0,380)}…</p>}
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <button onClick={() => { onClose(); onWatch(anime,1); }} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 22px rgba(168,85,247,.4)" }}><Ic.Play s={16}/> Watch Now</button>
            <button onClick={() => onBookmark(anime.mal_id)} style={{ background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:12,padding:"12px 18px",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Add to List"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MovieModal({ movie, onClose, bookmarked, onBookmark, onWatch }) {
  useEffect(() => { document.body.style.overflow="hidden"; return () => { document.body.style.overflow=""; }; }, []);
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(14px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2d1a5e",boxShadow:"0 0 80px rgba(124,58,237,.15)",animation:"modalIn .22s ease" }}>
        <div style={{ position:"relative",height:210,overflow:"hidden",borderRadius:"18px 18px 0 0" }}>
          {movie.background_image ? <img src={movie.background_image} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.5)" }}/> : <div style={{ width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#0d0d14)" }}/>}
          <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,#0d0d14 0%,transparent 55%)" }}/>
          {movie.large_cover_image && <img src={movie.large_cover_image} alt="" style={{ position:"absolute",left:24,bottom:-16,height:"88%",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,.8)" }}/>}
          <button onClick={onClose} style={{ position:"absolute",top:14,right:14,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",borderRadius:10,padding:8,display:"flex" }}><Ic.X/></button>
        </div>
        <div style={{ padding:"28px 22px 22px" }}>
          <div style={{ fontSize:19,fontWeight:900,color:"#f1f5f9",marginBottom:10 }}>{movie.title} <span style={{ color:"#4b5563",fontWeight:400,fontSize:15 }}>({movie.year})</span></div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:7,alignItems:"center",marginBottom:12 }}>
            <span style={{ display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700,fontSize:13 }}><Ic.Star/>{movie.rating}</span>
            <span style={{ color:"#1a1a28" }}>·</span><span style={{ color:"#6b7280",fontSize:13 }}>{movie.runtime}min</span>
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:14 }}>{(movie.genres||[]).map(g => <span key={g} style={{ background:"#1a1a28",color:"#6b7280",fontSize:11,padding:"3px 10px",borderRadius:20 }}>{g}</span>)}</div>
          {movie.description_full && <p style={{ color:"#9ca3af",fontSize:14,lineHeight:1.75,marginBottom:18 }}>{movie.description_full.slice(0,360)}…</p>}
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <button onClick={() => { onClose(); onWatch(movie); }} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 22px rgba(168,85,247,.4)" }}><Ic.Film/> Watch Now</button>
            <button onClick={() => onBookmark(movie.imdb_code)} style={{ background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:12,padding:"12px 18px",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MangaModal({ manga, onClose, bookmarked, onBookmark, onRead, onSaveHist }) {
  const [chapters, setChapters] = useState(null);
  const img = mCover(manga); const title = mTitle(manga);
  useEffect(() => {
    document.body.style.overflow="hidden";
    fetchMangaChapters(manga.id).then(setChapters);
    return () => { document.body.style.overflow=""; };
  }, [manga.id]);
  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(14px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#0d0d14",borderRadius:18,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2d1a5e",boxShadow:"0 0 80px rgba(124,58,237,.15)",animation:"modalIn .22s ease" }}>
        <div style={{ position:"relative",height:200,overflow:"hidden",borderRadius:"18px 18px 0 0" }}>
          {img ? <img src={img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",filter:"blur(6px) brightness(.45)",transform:"scale(1.07)" }}/> : <div style={{ width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#0d0d14)" }}/>}
          <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,#0d0d14 0%,transparent 55%)" }}/>
          {img && <img src={img} alt="" style={{ position:"absolute",left:24,bottom:-16,height:"88%",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 30px rgba(0,0,0,.8)" }}/>}
          <button onClick={onClose} style={{ position:"absolute",top:14,right:14,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",borderRadius:10,padding:8,display:"flex" }}><Ic.X/></button>
        </div>
        <div style={{ padding:"26px 22px 22px" }}>
          <div style={{ fontSize:18,fontWeight:900,color:"#f1f5f9",marginBottom:8 }}>{title}</div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:12 }}>{(manga.attributes?.tags||[]).slice(0,6).map(t => <span key={t.id} style={{ background:"#1a1a28",color:"#6b7280",fontSize:10,padding:"3px 9px",borderRadius:20 }}>{t.attributes?.name?.en||""}</span>)}</div>
          {manga.attributes?.description?.en && <p style={{ color:"#9ca3af",fontSize:13,lineHeight:1.75,marginBottom:14 }}>{manga.attributes.description.en.slice(0,320)}…</p>}
          <button onClick={() => onBookmark(manga.id)} style={{ marginBottom:18,background:bookmarked?"rgba(168,85,247,.12)":"#1a1a28",border:`1px solid ${bookmarked?"rgba(168,85,247,.4)":"#252535"}`,color:bookmarked?"#c084fc":"#9ca3af",borderRadius:10,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6 }}><Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}</button>
          <div style={{ fontSize:12,fontWeight:700,color:"#e2e8f0",marginBottom:10,textTransform:"uppercase",letterSpacing:.8 }}>Chapters {chapters ? `(${chapters.length})` : ""}</div>
          {!chapters && <div style={{ display:"flex",justifyContent:"center",padding:"20px 0" }}><div style={{ width:28,height:28,border:"2px solid #1a1a28",borderTop:"2px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite" }}/></div>}
          {chapters?.length === 0 && <div style={{ color:"#374151",fontSize:13,padding:"12px 0" }}>No English chapters available yet.</div>}
          {chapters && chapters.length > 0 && (
            <div style={{ maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:4 }}>
              {chapters.map((ch, i) => {
                const num = ch.attributes?.chapter || String(i+1);
                const chTitle = ch.attributes?.title ? ` — ${ch.attributes.title}` : "";
                return (
                  <button key={ch.id} onClick={() => { onSaveHist?.("manga", manga, num); onClose(); onRead(ch.id, `Chapter ${num}${chTitle}`); }}
                    style={{ background:"#0a0a10",border:"1px solid #1a1a28",borderRadius:8,color:"#9ca3af",padding:"9px 14px",cursor:"pointer",fontSize:13,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <span style={{ fontWeight:600 }}>Chapter {num}{chTitle}</span>
                    <span style={{ color:"#374151",fontSize:11 }}>{ch.attributes?.pages||"?"} pages</span>
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
   HERO
══════════════════════════════════════════ */
function Hero({ item, type, onWatch, onInfo }) {
  const img   = type==="anime" ? aImg(item) : type==="movie" ? item.background_image : null;
  const title = type==="anime" ? aTitle(item) : type==="movie" ? item.title : mTitle(item);
  const desc  = type==="anime" ? item.synopsis : type==="movie" ? item.description_full : item.attributes?.description?.en;
  const score = type==="anime" ? aScore(item) : item.rating?.toString();
  const tags  = type==="anime" ? aGenres(item).slice(0,3) : type==="movie" ? (item.genres||[]).slice(0,3) : (item.attributes?.tags||[]).slice(0,3).map(t=>t.attributes?.name?.en||"");
  const coverImg = type==="manga" ? mCover(item) : null;
  return (
    <div style={{ position:"relative",height:"88vh",minHeight:500,overflow:"hidden" }}>
      {img ? <img src={img} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }}/> : coverImg ? <img src={coverImg} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"blur(3px)",transform:"scale(1.05)" }}/> : <div style={{ position:"absolute",inset:0,background:"linear-gradient(135deg,#1a0a2e,#060608)" }}/>}
      <div style={{ position:"absolute",inset:0,background:"linear-gradient(105deg,rgba(0,0,0,.98) 22%,rgba(0,0,0,.7) 58%,rgba(0,0,0,.1) 100%)" }}/>
      <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,#000 0%,transparent 45%)" }}/>
      <div className="hero-content" style={{ position:"relative",zIndex:2,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 44px 90px",maxWidth:640,animation:"fadeUp .7s ease" }}>
        <div style={{ fontSize:10,fontWeight:800,letterSpacing:3,textTransform:"uppercase",color:"#a855f7",marginBottom:12 }}>Now {type==="manga"?"Available":"Streaming"}</div>
        <h1 className="hero-title" style={{ fontSize:44,fontWeight:900,lineHeight:1.06,marginBottom:14,color:"#fff",textTransform:"uppercase",letterSpacing:.5 }}>{title}</h1>
        <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:16 }}>
          {tags.filter(Boolean).map(g => <span key={g} style={{ background:"rgba(124,58,237,.18)",border:"1px solid rgba(168,85,247,.35)",color:"#c084fc",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600 }}>{g}</span>)}
          {score && <span style={{ display:"flex",alignItems:"center",gap:3,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.25)",color:"#fbbf24",fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600 }}><Ic.Star/>{score}</span>}
        </div>
        {desc && <p style={{ color:"#9ca3af",fontSize:14,lineHeight:1.75,marginBottom:28,maxWidth:420 }}>{desc.slice(0,180)}…</p>}
        <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
          <button onClick={onWatch} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:11,padding:"13px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 28px rgba(168,85,247,.45)" }}><Ic.Play s={16}/> {type==="manga"?"Read Now":"Watch Now"}</button>
          <button onClick={onInfo} style={{ background:"rgba(255,255,255,.06)",color:"#e2e8f0",border:"1px solid rgba(255,255,255,.12)",borderRadius:11,padding:"13px 20px",fontWeight:600,fontSize:14,cursor:"pointer",backdropFilter:"blur(10px)" }}>More Info</button>
        </div>
      </div>
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
    <nav style={{ position:"fixed",top:0,left:0,right:0,zIndex:100,background:"rgba(0,0,0,.96)",backdropFilter:"blur(20px)",borderBottom:"1px solid #140d28",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",height:62,gap:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:9,flexShrink:0,cursor:"pointer" }} onClick={() => setSection("anime")}>
        <Logo size={34}/>
        <div>
          <div style={{ fontSize:15,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#fff",lineHeight:1 }}>
            SHIN<span style={{ display:"inline-block",color:"#c084fc",border:"1.5px solid #a855f7",borderRadius:3,padding:"0 2px",lineHeight:"inherit",boxShadow:"0 0 8px rgba(168,85,247,.5)" }}>O</span>RA
          </div>
          <div style={{ fontSize:7,fontWeight:700,letterSpacing:2,color:"#4b5563",textTransform:"uppercase",marginTop:1 }}>Anime · Movies · Manga</div>
        </div>
      </div>
      <div className="desk-nav" style={{ display:"flex",gap:4,background:"#0d0d14",borderRadius:10,padding:4,border:"1px solid #1a1a28" }}>
        {tabs.map(([id,label,icon]) => (
          <button key={id} onClick={() => setSection(id)} style={{ background:section===id?"linear-gradient(135deg,#7c3aed,#a855f7)":"transparent",border:"none",color:section===id?"#fff":"#6b7280",padding:"7px 16px",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6,transition:"all .2s",boxShadow:section===id?"0 4px 14px rgba(168,85,247,.3)":"none" }}>
            {icon} {label}
          </button>
        ))}
      </div>
      <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
        {searchOpen ? (
          <div style={{ display:"flex",alignItems:"center",background:"#0d0d14",borderRadius:10,padding:"6px 11px",gap:7,border:"1px solid #2d1a5e" }}>
            <Ic.Search/>
            <input autoFocus value={searchQ} onChange={e => onSearch(e.target.value)} placeholder={`Search ${section}...`} style={{ background:"none",border:"none",outline:"none",color:"#f1f5f9",fontSize:13,width:155 }}/>
            <button onClick={() => { setSearchOpen(false); onSearch(""); }} style={{ background:"none",border:"none",cursor:"pointer",color:"#374151",display:"flex" }}><Ic.X s={15}/></button>
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)} style={{ background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:9,color:"#6b7280",padding:"7px 11px",cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
            <Ic.Search/><span className="search-label" style={{ fontSize:13 }}>Search</span>
          </button>
        )}
        {user ? (
          <div style={{ position:"relative" }}>
            <button onClick={() => setProfileOpen(v=>!v)} style={{ display:"flex",alignItems:"center",gap:7,background:"#0d0d14",border:"1px solid #1a1a28",borderRadius:9,padding:"5px 10px 5px 5px",cursor:"pointer" }}>
              <div style={{ width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff" }}>{user.name[0].toUpperCase()}</div>
              <span style={{ color:"#e2e8f0",fontSize:13,fontWeight:600 }}>{user.name}</span>
            </button>
            {profileOpen && (
              <div style={{ position:"absolute",top:"calc(100% + 8px)",right:0,background:"#0d0d14",border:"1px solid #2d1a5e",borderRadius:12,minWidth:175,padding:6,boxShadow:"0 16px 50px rgba(0,0,0,.9)",animation:"fadeUp .2s ease",zIndex:200 }}>
                <div style={{ padding:"10px 12px",borderBottom:"1px solid #1a1a28",marginBottom:4 }}>
                  <div style={{ color:"#f1f5f9",fontSize:13,fontWeight:700 }}>{user.name}</div>
                  <div style={{ color:"#4b5563",fontSize:11,marginTop:2 }}>Local Account</div>
                </div>
                <button onClick={() => { setProfileOpen(false); onLogout(); }} style={{ width:"100%",background:"none",border:"none",color:"#ef4444",padding:"9px 12px",cursor:"pointer",fontSize:13,textAlign:"left",borderRadius:8 }}>🚪 Sign Out</button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={onAuthOpen} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700,boxShadow:"0 4px 14px rgba(168,85,247,.35)" }}>Sign In</button>
        )}
        <button className="hamburger" onClick={() => setMobileOpen(v=>!v)} style={{ background:"none",border:"none",color:"#9ca3af",cursor:"pointer",padding:4,display:"flex" }}><Ic.Menu/></button>
      </div>
    </nav>
  );
}

/* ══════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════ */
export default function App() {
  /* Auth */
  const [user, setUser]       = useState(null);
  const [history, setHistory] = useState({});
  const [bookmarks, setBm]    = useState(new Set());
  const [showAuth, setShowAuth] = useState(false);

  /* Nav */
  const [section, setSection] = useState("anime");
  const [view, setView]       = useState("home");

  /* Per-section data */
  const [animeData, setAnimeData] = useState({ trending:[], airing:[], topRated:[], loaded:false, loading:false });
  const [movieData, setMovieData] = useState({ popular:[], topRated:[], action:[], animation:[], loaded:false, loading:false });
  const [mangaData, setMangaData] = useState({ popular:[], action:[], romance:[], loaded:false, loading:false });

  /* Browse */
  const [browseList, setBrowseList]   = useState([]);
  const [browseMore, setBrowseMore]   = useState(false);
  const [browsePage, setBrowsePage]   = useState(1);
  const [browseLoad, setBrowseLoad]   = useState(false);
  const [moreLoad, setMoreLoad]       = useState(false);
  const [genre, setGenre]             = useState("All");
  const [searchQ, setSearchQ]         = useState("");

  /* Modals */
  const [selAnime, setSelAnime] = useState(null);
  const [selMovie, setSelMovie] = useState(null);
  const [selManga, setSelManga] = useState(null);

  /* Watch/Read */
  const [watchAnime, setWatchAnime] = useState(null);
  const [watchEp,    setWatchEp]    = useState(1);
  const [watchMovie, setWatchMovie] = useState(null);
  const [readChap,   setReadChap]   = useState(null);

  /* Hero */
  const [heroIdx, setHeroIdx] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchTimer = useRef(null);

  /* ─ Auth ─ */
  useEffect(() => {
    const sid = LS.sess();
    if (!sid) return;
    const u = LS.users().find(u => u.id === sid);
    if (u) { setUser(u); setHistory(LS.hist(u.id)); setBm(new Set(LS.bm(u.id))); }
  }, []);

  const handleLogin  = (u) => { setUser(u); setHistory(LS.hist(u.id)); setBm(new Set(LS.bm(u.id))); setShowAuth(false); };
  const handleLogout = () => { LS.clearS(); setUser(null); setHistory({}); setBm(new Set()); };

  const toggleBm = (key) => setBm(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key);
    if (user) LS.saveB(user.id, [...n]);
    return n;
  });

  const saveHist = (type, data, ep) => {
    if (!user) return;
    const key  = type==="anime" ? data.mal_id : type==="movie" ? data.imdb_code : data.id;
    const item = { key, type, data, ep: type==="anime"?ep:1, ch: type==="manga"?ep:null, at: Date.now() };
    const next = { ...history, [key]: item };
    setHistory(next); LS.saveH(user.id, next);
  };

  /* ─ Load section data ONLY when that section is first visited ─ */
  const loadAnimeSection = useCallback(async () => {
    if (animeData.loaded || animeData.loading) return;
    setAnimeData(d => ({ ...d, loading:true }));
    try {
      const [t, o, r] = await Promise.all([
        fetchAnimeRow("/top/anime?type=tv&limit=20&filter=bypopularity"),
        fetchAnimeRow("/seasons/now?limit=20"),
        fetchAnimeRow("/top/anime?type=tv&limit=20&filter=favorite"),
      ]);
      setAnimeData({ trending:t, airing:o, topRated:r, loaded:true, loading:false });
    } catch { setAnimeData(d => ({ ...d, loading:false })); }
  }, [animeData.loaded, animeData.loading]);

  // Use refs to avoid stale-closure issues with useCallback + state deps
  const movieLoadingRef = useRef(false);
  const mangaLoadingRef = useRef(false);

  const loadMovieSection = useCallback(async () => {
    if (movieData.loaded || movieLoadingRef.current) return;
    movieLoadingRef.current = true;
    setMovieData(d => ({ ...d, loading:true }));
    try {
      const [pop, top, act, anim] = await Promise.all([
        fetchMovieRow("", "download_count", 0),
        fetchMovieRow("", "rating", 7),
        fetchMovieRow("Action", "rating", 6),
        fetchMovieRow("Animation", "rating", 6),
      ]);
      setMovieData({ popular:pop, topRated:top, action:act, animation:anim, loaded:true, loading:false });
    } catch (e) {
      console.error("Movie section error:", e);
      setMovieData(d => ({ ...d, loading:false }));
    } finally { movieLoadingRef.current = false; }
  }, [movieData.loaded]);

  const loadMangaSection = useCallback(async () => {
    if (mangaData.loaded || mangaLoadingRef.current) return;
    mangaLoadingRef.current = true;
    setMangaData(d => ({ ...d, loading:true }));
    try {
      const [pop, act, rom] = await Promise.all([
        fetchMangaRow(""),
        fetchMangaRow("Action"),
        fetchMangaRow("Romance"),
      ]);
      setMangaData({ popular:pop, action:act, romance:rom, loaded:true, loading:false });
    } catch (e) {
      console.error("Manga section error:", e);
      setMangaData(d => ({ ...d, loading:false }));
    } finally { mangaLoadingRef.current = false; }
  }, [mangaData.loaded]);

  useEffect(() => {
    if (section === "anime")  loadAnimeSection();
    if (section === "movies") loadMovieSection();
    if (section === "manga")  loadMangaSection();
    setView("home"); setGenre("All"); setSearchQ(""); setHeroIdx(0);
  }, [section]); // eslint-disable-line

  /* ─ Hero rotation ─ */
  const heroItems = section==="anime" ? animeData.trending : section==="movies" ? movieData.popular : mangaData.popular;
  useEffect(() => {
    if (!heroItems.length) return;
    const t = setInterval(() => setHeroIdx(i => (i+1) % Math.min(6, heroItems.length)), 7500);
    return () => clearInterval(t);
  }, [heroItems.length]);
  const heroItem = heroItems[heroIdx];

  /* ─ Browse ─ */
  const loadBrowse = useCallback(async ({ page=1, q="", g="All", append=false }={}) => {
    try {
      let res;
      if (section==="anime")  res = await fetchAnime({ page, search:q, genre:g });
      else if (section==="movies") res = await fetchMovies({ page, search:q, genre:g });
      else res = await fetchManga({ page, search:q, genre:g });
      setBrowseList(prev => append ? [...prev,...res.list] : res.list);
      setBrowseMore(res.hasMore); setBrowsePage(res.page);
    } catch (e) { console.error("Browse error:", e); }
  }, [section]);

  useEffect(() => {
    if (view !== "browse") return;
    setBrowseLoad(true);
    loadBrowse({ page:1, q:searchQ, g:genre }).finally(() => setBrowseLoad(false));
  }, [genre]); // eslint-disable-line

  useEffect(() => {
    if (!searchQ.trim()) return;
    setView("browse"); setBrowseList([]);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setBrowseLoad(true);
      loadBrowse({ page:1, q:searchQ, g:genre }).finally(() => setBrowseLoad(false));
    }, 500);
    return () => clearTimeout(searchTimer.current);
  }, [searchQ]); // eslint-disable-line

  /* ─ Watch/Read handlers ─ */
  const goWatchAnime = (a, ep=1) => { setWatchAnime(a); setWatchEp(ep); setSelAnime(null); setView("watchAnime"); window.scrollTo({top:0}); };
  const goWatchMovie = (m) => { setWatchMovie(m); setSelMovie(null); setView("watchMovie"); window.scrollTo({top:0}); };
  const goRead = (chapId, chapTitle) => { setReadChap({ id:chapId, title:chapTitle }); setSelManga(null); setView("readManga"); window.scrollTo({top:0}); };
  const handleContinue = (h) => {
    if (h.type==="anime") goWatchAnime(h.data, h.ep);
    else if (h.type==="movie") goWatchMovie(h.data);
    else setSelManga(h.data);
  };

  const sectionLoading = section==="anime"?animeData.loading:section==="movies"?movieData.loading:mangaData.loading;
  const genres = section==="anime"?ANIME_GENRES:section==="movies"?MOVIE_GENRES:MANGA_GENRES;

  /* ─ Special views ─ */
  if (view==="watchAnime" && watchAnime) return (
    <div style={{ background:"#000",minHeight:"100vh",color:"#e2e8f0" }}>
      <GlobalStyles/>
      <Navbar section={section} setSection={s => { setSection(s); setView("home"); setWatchAnime(null); }} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={() => setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <AnimeWatch anime={watchAnime} startEp={watchEp} onBack={() => setView("home")} bookmarked={bookmarks.has(watchAnime.mal_id)} onBookmark={toggleBm} onSaveHist={saveHist}/>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  if (view==="watchMovie" && watchMovie) return (
    <div style={{ background:"#000",minHeight:"100vh",color:"#e2e8f0" }}>
      <GlobalStyles/>
      <Navbar section={section} setSection={s => { setSection(s); setView("home"); setWatchMovie(null); }} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={() => setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <MovieWatch movie={watchMovie} onBack={() => setView("home")} bookmarked={bookmarks.has(watchMovie.imdb_code)} onBookmark={toggleBm} onSaveHist={saveHist}/>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  if (view==="readManga" && readChap) return (
    <div style={{ background:"#000",minHeight:"100vh",color:"#e2e8f0" }}>
      <GlobalStyles/>
      <Navbar section={section} setSection={s => { setSection(s); setView("home"); setReadChap(null); }} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={() => setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <MangaReader chapterId={readChap.id} title={readChap.title} onBack={() => setView("home")}/>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  /* ─ MAIN SITE ─ */
  return (
    <div style={{ minHeight:"100vh",background:"#000",color:"#e2e8f0",overflowX:"hidden" }}>
      <GlobalStyles/>
      <Navbar section={section} setSection={setSection} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={() => setShowAuth(true)} onLogout={handleLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>

      {mobileOpen && (
        <div style={{ position:"fixed",top:62,left:0,right:0,zIndex:90,background:"#0d0d14",borderBottom:"1px solid #140d28",padding:"10px 16px",display:"flex",flexDirection:"column",gap:3 }}>
          {[["anime","Anime"],["movies","Movies"],["manga","Manga"]].map(([id,lbl]) => (
            <button key={id} onClick={() => { setSection(id); setMobileOpen(false); setView("home"); }} style={{ background:section===id?"#1a0e2e":"transparent",border:"none",color:section===id?"#c084fc":"#9ca3af",padding:"11px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,textAlign:"left" }}>{lbl}</button>
          ))}
          {!user && <button onClick={() => { setShowAuth(true); setMobileOpen(false); }} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",padding:"12px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,textAlign:"left",marginTop:4 }}>Sign In / Create Account</button>}
        </div>
      )}

      {/* HOME */}
      {view==="home" && (
        <>
          {/* Hero — shown when data is ready */}
          {heroItem ? (
            <Hero item={heroItem}
              type={section==="anime"?"anime":section==="movies"?"movie":"manga"}
              onWatch={() => section==="anime" ? goWatchAnime(heroItem,1) : section==="movies" ? goWatchMovie(heroItem) : setSelManga(heroItem)}
              onInfo={() => section==="anime" ? setSelAnime(heroItem) : section==="movies" ? setSelMovie(heroItem) : setSelManga(heroItem)}/>
          ) : (
            /* Placeholder hero while loading */
            <div style={{ height:"88vh",minHeight:500,background:"linear-gradient(135deg,#0a0014,#060608)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16 }}>
              <Logo size={60}/>
              <div style={{ width:40,height:40,border:"3px solid #1a1a28",borderTop:"3px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite" }}/>
              <div style={{ color:"#4b5563",fontSize:14 }}>Loading {section}...</div>
            </div>
          )}

          {/* Content rows — always shown (with skeleton loaders) */}
          <div style={{ padding:"28px 20px 60px",maxWidth:1400,margin:"0 auto" }}>
            {/* Hero dots */}
            {heroItems.length > 1 && (
              <div style={{ display:"flex",justifyContent:"center",gap:7,marginBottom:32 }}>
                {heroItems.slice(0,6).map((_,i) => <button key={i} onClick={() => setHeroIdx(i)} style={{ width:i===heroIdx?22:6,height:6,borderRadius:3,background:i===heroIdx?"#a855f7":"#1a1a28",border:"none",cursor:"pointer",transition:"all .3s",padding:0 }}/>)}
              </div>
            )}

            {/* Continue Watching */}
            {user && Object.keys(history).length > 0 && <ContinueRow history={history} onPlay={handleContinue}/>}

            {/* Sign-in banner */}
            {!user && (
              <div style={{ marginBottom:32,background:"rgba(124,58,237,.07)",border:"1px solid rgba(168,85,247,.2)",borderRadius:12,padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}>
                <div><div style={{ color:"#f1f5f9",fontWeight:700,fontSize:14,marginBottom:4 }}>Track your progress</div><div style={{ color:"#6b7280",fontSize:13 }}>Sign in to save history and continue where you left off.</div></div>
                <button onClick={() => setShowAuth(true)} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 4px 14px rgba(168,85,247,.35)" }}>Sign In / Sign Up</button>
              </div>
            )}

            {/* Browse All button */}
            <div style={{ textAlign:"right",marginBottom:18 }}>
              <button onClick={() => { setView("browse"); setBrowseLoad(true); loadBrowse({ page:1 }).finally(() => setBrowseLoad(false)); }} style={{ background:"none",border:"1px solid #1a1a28",borderRadius:8,color:"#6b7280",padding:"7px 16px",fontSize:12,cursor:"pointer",fontWeight:600 }}>Browse All →</button>
            </div>

            {/* ANIME ROWS */}
            {section==="anime" && <>
              <Row title="🔥 Trending Now" loading={animeData.loading && !animeData.trending.length}>
                {animeData.trending.map(a => <div key={a.mal_id} style={{ width:148,flexShrink:0 }}><Card img={aImg(a)} title={aTitle(a)} sub={a.year?.toString()} rating={aScore(a)} badge={a.airing?"Live":null} badgeColor="#a855f7" bookmarked={bookmarks.has(a.mal_id)} onBookmark={() => toggleBm(a.mal_id)} onClick={() => setSelAnime(a)} progress={history[a.mal_id]?.ep&&a.episodes?(history[a.mal_id].ep/a.episodes)*100:0}/></div>)}
              </Row>
              <Row title="📺 Currently Airing" loading={animeData.loading && !animeData.airing.length}>
                {animeData.airing.map(a => <div key={a.mal_id} style={{ width:148,flexShrink:0 }}><Card img={aImg(a)} title={aTitle(a)} sub={a.year?.toString()} rating={aScore(a)} bookmarked={bookmarks.has(a.mal_id)} onBookmark={() => toggleBm(a.mal_id)} onClick={() => setSelAnime(a)}/></div>)}
              </Row>
              <Row title="⭐ All-Time Favorites" loading={animeData.loading && !animeData.topRated.length}>
                {animeData.topRated.map(a => <div key={a.mal_id} style={{ width:148,flexShrink:0 }}><Card img={aImg(a)} title={aTitle(a)} sub={a.year?.toString()} rating={aScore(a)} bookmarked={bookmarks.has(a.mal_id)} onBookmark={() => toggleBm(a.mal_id)} onClick={() => setSelAnime(a)}/></div>)}
              </Row>
            </>}

            {/* MOVIE ROWS */}
            {section==="movies" && <>
              <Row title="🎬 Most Watched" loading={movieData.loading && !movieData.popular.length}>
                {movieData.popular.map(m => <div key={m.imdb_code} style={{ width:148,flexShrink:0 }}><Card img={m.large_cover_image} title={m.title} sub={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={() => toggleBm(m.imdb_code)} onClick={() => setSelMovie(m)}/></div>)}
              </Row>
              <Row title="⭐ Top Rated" loading={movieData.loading && !movieData.topRated.length}>
                {movieData.topRated.map(m => <div key={m.imdb_code} style={{ width:148,flexShrink:0 }}><Card img={m.large_cover_image} title={m.title} sub={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={() => toggleBm(m.imdb_code)} onClick={() => setSelMovie(m)}/></div>)}
              </Row>
              <Row title="💥 Action" loading={movieData.loading && !movieData.action.length}>
                {movieData.action.map(m => <div key={m.imdb_code} style={{ width:148,flexShrink:0 }}><Card img={m.large_cover_image} title={m.title} sub={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={() => toggleBm(m.imdb_code)} onClick={() => setSelMovie(m)}/></div>)}
              </Row>
              <Row title="🌸 Animation" loading={movieData.loading && !movieData.animation.length}>
                {movieData.animation.map(m => <div key={m.imdb_code} style={{ width:148,flexShrink:0 }}><Card img={m.large_cover_image} title={m.title} sub={m.year?.toString()} rating={m.rating?.toString()} bookmarked={bookmarks.has(m.imdb_code)} onBookmark={() => toggleBm(m.imdb_code)} onClick={() => setSelMovie(m)}/></div>)}
              </Row>
            </>}

            {/* MANGA ROWS */}
            {section==="manga" && <>
              <Row title="📖 Most Popular" loading={mangaData.loading && !mangaData.popular.length}>
                {mangaData.popular.map(m => <div key={m.id} style={{ width:148,flexShrink:0 }}><Card img={mCover(m)} title={mTitle(m)} bookmarked={bookmarks.has(m.id)} onBookmark={() => toggleBm(m.id)} onClick={() => setSelManga(m)}/></div>)}
              </Row>
              <Row title="⚔️ Action" loading={mangaData.loading && !mangaData.action.length}>
                {mangaData.action.map(m => <div key={m.id} style={{ width:148,flexShrink:0 }}><Card img={mCover(m)} title={mTitle(m)} bookmarked={bookmarks.has(m.id)} onBookmark={() => toggleBm(m.id)} onClick={() => setSelManga(m)}/></div>)}
              </Row>
              <Row title="💜 Romance" loading={mangaData.loading && !mangaData.romance.length}>
                {mangaData.romance.map(m => <div key={m.id} style={{ width:148,flexShrink:0 }}><Card img={mCover(m)} title={mTitle(m)} bookmarked={bookmarks.has(m.id)} onBookmark={() => toggleBm(m.id)} onClick={() => setSelManga(m)}/></div>)}
              </Row>
            </>}
          </div>
        </>
      )}

      {/* BROWSE */}
      {view==="browse" && (
        <div style={{ padding:"80px 20px 60px",maxWidth:1400,margin:"0 auto" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
            <h2 style={{ fontSize:22,fontWeight:900,color:"#fff",textTransform:"uppercase",letterSpacing:.5 }}>{searchQ ? `"${searchQ}"` : `Browse ${section==="anime"?"Anime":section==="movies"?"Movies":"Manga"}`}</h2>
            <span style={{ color:"#374151",fontSize:13 }}>{browseList.length} results</span>
          </div>
          <div className="genre-scroll" style={{ marginBottom:22 }}>
            {genres.map(g => <button key={g} onClick={() => setGenre(g)} style={{ background:genre===g?"linear-gradient(135deg,#7c3aed,#a855f7)":"#0d0d14",color:genre===g?"#fff":"#6b7280",border:genre===g?"1px solid #a855f7":"1px solid #1a1a28",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .18s",boxShadow:genre===g?"0 4px 14px rgba(168,85,247,.3)":"none" }}>{g}</button>)}
          </div>
          {browseLoad ? (
            <div style={{ display:"flex",justifyContent:"center",padding:"60px 0" }}><div style={{ width:36,height:36,border:"3px solid #1a1a28",borderTop:"3px solid #a855f7",borderRadius:"50%",animation:"spin 1s linear infinite" }}/></div>
          ) : (
            <>
              <div className="anime-grid">
                {browseList.map((item, i) => {
                  const key   = section==="anime" ? item.mal_id : section==="movies" ? item.imdb_code : item.id;
                  const img   = section==="anime" ? aImg(item)  : section==="movies" ? item.large_cover_image : mCover(item);
                  const title = section==="anime" ? aTitle(item): section==="movies" ? item.title : mTitle(item);
                  const score = section==="anime" ? aScore(item): item.rating?.toString();
                  const sub   = (item.year||item.seasonYear)?.toString();
                  return (
                    <div key={key} style={{ animation:`fadeUp .3s ease ${Math.min(i*.04,.5)}s both` }}>
                      <Card img={img} title={title} sub={sub} rating={score}
                        bookmarked={bookmarks.has(key)} onBookmark={() => toggleBm(key)}
                        onClick={() => section==="anime" ? setSelAnime(item) : section==="movies" ? setSelMovie(item) : setSelManga(item)}/>
                    </div>
                  );
                })}
              </div>
              {browseList.length===0 && <div style={{ textAlign:"center",padding:"60px 0",color:"#374151" }}><div style={{ fontSize:36,marginBottom:10 }}>🔍</div><div style={{ fontSize:15,fontWeight:600,color:"#6b7280" }}>No results found</div></div>}
              {browseMore && browseList.length>0 && (
                <div style={{ textAlign:"center",marginTop:28 }}>
                  <button onClick={async () => { setMoreLoad(true); await loadBrowse({ page:browsePage+1, q:searchQ, g:genre, append:true }); setMoreLoad(false); }} disabled={moreLoad}
                    style={{ background:moreLoad?"#0d0d14":"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:moreLoad?"1px solid #1a1a28":"none",borderRadius:11,padding:"12px 36px",fontSize:14,fontWeight:700,cursor:moreLoad?"default":"pointer",opacity:moreLoad?.7:1 }}>
                    {moreLoad ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <footer style={{ borderTop:"1px solid #140d28",padding:"26px 20px",textAlign:"center" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6 }}>
          <Logo size={20}/>
          <span style={{ fontSize:14,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#fff" }}>SHIN<span style={{ display:"inline-block",color:"#c084fc",border:"1.5px solid #a855f7",borderRadius:3,padding:"0 1px",lineHeight:"inherit",boxShadow:"0 0 6px rgba(168,85,247,.4)" }}>O</span>RA</span>
        </div>
        <div style={{ fontSize:11,color:"#1a1a28" }}>© 2026 Shinora · Anime · Movies · Manga</div>
      </footer>

      {selAnime && <AnimeModal anime={selAnime} onClose={() => setSelAnime(null)} bookmarked={bookmarks.has(selAnime.mal_id)} onBookmark={toggleBm} onWatch={goWatchAnime}/>}
      {selMovie && <MovieModal movie={selMovie} onClose={() => setSelMovie(null)} bookmarked={bookmarks.has(selMovie.imdb_code)} onBookmark={toggleBm} onWatch={goWatchMovie}/>}
      {selManga && <MangaModal manga={selManga} onClose={() => setSelManga(null)} bookmarked={bookmarks.has(selManga.id)} onBookmark={toggleBm} onRead={goRead} onSaveHist={saveHist}/>}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin}/>}
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
      *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
      html,body { overflow-x:hidden; max-width:100%; background:#000; }
      body { font-family:'Inter','Segoe UI',sans-serif; }
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:#000; }
      ::-webkit-scrollbar-thumb { background:#1a1a28; border-radius:2px; }
      ::-webkit-scrollbar-thumb:hover { background:#7c3aed; }
      .hide-scroll { scrollbar-width:none; -ms-overflow-style:none; }
      .hide-scroll::-webkit-scrollbar { display:none; }
      @keyframes fadeUp { from{opacity:0;transform:translateY(18px);} to{opacity:1;transform:translateY(0);} }
      @keyframes modalIn { from{opacity:0;transform:translateY(12px) scale(.97);} to{opacity:1;transform:translateY(0) scale(1);} }
      @keyframes spin { to{transform:rotate(360deg);} }
      @keyframes pulse { 0%,100%{opacity:.4;} 50%{opacity:.8;} }
      .anime-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:14px; }
      .genre-scroll { display:flex; gap:7px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; -ms-overflow-style:none; }
      .genre-scroll::-webkit-scrollbar { display:none; }
      .watch-layout { display:flex; gap:18px; padding:14px 20px 60px; max-width:1400px; margin:0 auto; }
      .watch-main { flex:1; min-width:0; }
      .watch-sidebar { width:290px; flex-shrink:0; position:sticky; top:74px; max-height:calc(100vh - 82px); overflow:hidden; }
      .desk-nav { display:flex; gap:4px; align-items:center; }
      .hamburger { display:none !important; }
      @media(max-width:860px) {
        .anime-grid { grid-template-columns:repeat(auto-fill,minmax(110px,1fr)) !important; gap:10px !important; }
        .hero-content { padding:0 16px 36px !important; max-width:100% !important; }
        .hero-title { font-size:22px !important; }
        .watch-layout { flex-direction:column !important; padding:10px 12px 40px !important; }
        .watch-sidebar { width:100% !important; position:static !important; max-height:none !important; }
        .desk-nav { display:none !important; }
        .hamburger { display:flex !important; }
        .search-label { display:none; }
      }
    `}</style>
  );
}
