import { useState, useEffect, useRef, useCallback } from "react";

/* ════════════════════════════════════════════
   SHINORA  ·  Anime Streaming
   Data    → AniList GraphQL (free, no key)
   Video   → megaplay.buzz  (AniList IDs)
   Skips   → AniSkip API
   Auth    → localStorage
════════════════════════════════════════════ */

/* ── Auth storage ── */
const LS = {
  users : () => JSON.parse(localStorage.getItem("sh_u") || "[]"),
  sess  : () => localStorage.getItem("sh_s"),
  hist  : (id) => JSON.parse(localStorage.getItem(`sh_h_${id}`) || "{}"),
  bm    : (id) => JSON.parse(localStorage.getItem(`sh_b_${id}`) || "[]"),
  saveU : (v)  => localStorage.setItem("sh_u",  JSON.stringify(v)),
  saveS : (id) => localStorage.setItem("sh_s",  id),
  clearS: ()   => localStorage.removeItem("sh_s"),
  saveH : (id,v) => localStorage.setItem(`sh_h_${id}`, JSON.stringify(v)),
  saveB : (id,v) => localStorage.setItem(`sh_b_${id}`, JSON.stringify(v)),
};
const uid = () => Math.random().toString(36).slice(2);

/* ════════════════════════════════════════════
   ANILIST API
════════════════════════════════════════════ */
const AL = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id idMal
  title { romaji english }
  description(asHtml:false)
  coverImage { extraLarge large }
  bannerImage
  averageScore episodes status
  genres seasonYear
  nextAiringEpisode { episode }
  isAdult
`;

const gql = async (query, variables = {}) => {
  try {
    const r = await fetch(AL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    return (await r.json()).data;
  } catch { return null; }
};

const fetchTrending = () => gql(`query {
  Page(perPage:20) { media(type:ANIME,sort:TRENDING_DESC,isAdult:false) { ${MEDIA_FIELDS} } }
}`).then(d => d?.Page?.media || []);

const fetchPopular = () => gql(`query {
  Page(perPage:20) { media(type:ANIME,sort:POPULARITY_DESC,isAdult:false) { ${MEDIA_FIELDS} } }
}`).then(d => d?.Page?.media || []);

const fetchAiring = () => gql(`query {
  Page(perPage:20) { media(type:ANIME,status:RELEASING,sort:POPULARITY_DESC,isAdult:false) { ${MEDIA_FIELDS} } }
}`).then(d => d?.Page?.media || []);

const fetchTopRated = () => gql(`query {
  Page(perPage:20) { media(type:ANIME,sort:SCORE_DESC,isAdult:false) { ${MEDIA_FIELDS} } }
}`).then(d => d?.Page?.media || []);

const fetchByGenre = (genre) => gql(`query($g:String) {
  Page(perPage:20) { media(type:ANIME,genre:$g,sort:POPULARITY_DESC,isAdult:false) { ${MEDIA_FIELDS} } }
}`, { g: genre }).then(d => d?.Page?.media || []);

const searchAnime = async ({ page = 1, search = "", genre = "All" } = {}) => {
  const variables = { page, perPage: 40, isAdult: false };
  let sort = "POPULARITY_DESC";
  if (search.trim()) { variables.search = search; sort = "SEARCH_MATCH"; }
  if (genre !== "All") variables.genre = genre;

  const d = await gql(`query($page:Int,$perPage:Int,$search:String,$genre:String,$sort:[MediaSort]) {
    Page(page:$page,perPage:$perPage) {
      pageInfo { hasNextPage currentPage }
      media(type:ANIME,search:$search,genre:$genre,sort:[$sort],isAdult:false) { ${MEDIA_FIELDS} }
    }
  }`, { ...variables, sort });

  return {
    list: d?.Page?.media || [],
    hasMore: d?.Page?.pageInfo?.hasNextPage || false,
    page: d?.Page?.pageInfo?.currentPage || page,
  };
};

/* ── AniSkip ── */
const fetchSkipTimes = async (malId, ep) => {
  try {
    const d = await (await fetch(
      `https://api.aniskip.com/v2/skip-times/${malId}/${ep}?types[]=op&types[]=ed&episodeLength=0`
    )).json();
    if (!d.found) return null;
    return {
      op: d.results.find(x => x.skipType === "op")?.interval || null,
      ed: d.results.find(x => x.skipType === "ed")?.interval || null,
    };
  } catch { return null; }
};

/* ════════════════════════════════════════════
   SERVERS
════════════════════════════════════════════ */
const SERVERS = [
  { id:"s1", label:"Server 1", tag:"HD",  url:(a,ep,l) => `https://megaplay.buzz/stream/ani/${a.id}/${ep}/${l}` },
  { id:"s2", label:"Server 2", tag:"HD",  url:(a,ep,l) => `https://megaplay.buzz/stream/mal/${a.idMal}/${ep}/${l}` },
  { id:"s3", label:"Server 3", tag:"ALT", url:(a,ep)   => `https://vidsrc.to/embed/anime/${a.idMal}/${ep}` },
  { id:"s4", label:"Server 4", tag:"ALT", url:(a,ep)   => `https://vidsrc.xyz/embed/anime?id=${a.idMal}&ep=${ep}` },
];

/* ════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════ */
const GENRES = ["All","Action","Adventure","Comedy","Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller","Psychological","Mecha"];

const aTitle  = (a) => a?.title?.english || a?.title?.romaji || "Unknown";
const aImg    = (a) => a?.coverImage?.extraLarge || a?.coverImage?.large;
const aScore  = (a) => a?.averageScore ? (a.averageScore / 10).toFixed(1) : "N/A";
const aStatus = (a) => a?.status === "RELEASING" ? "Ongoing" : a?.status === "FINISHED" ? "Completed" : a?.status || "";
const aEps    = (a) => Array.from({ length: Math.min(Number(a?.episodes) || 12, 200) }, (_, i) => i + 1);
const strip   = (s = "") => s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();

/* ════════════════════════════════════════════
   ICONS
════════════════════════════════════════════ */
const Ic = {
  Star  : () => <svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  Play  : ({ s=18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  Search: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X     : ({ s=16 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bm    : ({ on }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? "#a78bfa" : "none"} stroke={on ? "#a78bfa" : "currentColor"} strokeWidth="2.2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  ChevL : () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevR : () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Menu  : () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Skip  : () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="2" height="16"/></svg>,
  Clock : () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Info  : () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
};

/* ════════════════════════════════════════════
   LOGO
════════════════════════════════════════════ */
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
      </defs>
      <ellipse cx="52" cy="50" rx="42" ry="42" fill="none" stroke="url(#lg)" strokeWidth="3" opacity=".7"/>
      <path d="M38 18 L62 18 L48 46 L66 46 L28 82 L42 82 L38 54 L20 54 Z" fill="url(#lg)"/>
      <line x1="22" y1="20" x2="78" y2="80" stroke="url(#lg)" strokeWidth="2.5" opacity=".5"/>
      <circle cx="22" cy="20" r="3" fill="#c084fc"/>
    </svg>
  );
}

/* ── O letter with gradient + smooth corner ── */
const OLetter = ({ size = "inherit" }) => (
  <span style={{
    display: "inline-block",
    background: "linear-gradient(135deg,#c084fc,#7c3aed)",
    color: "#fff",
    fontWeight: 900,
    fontSize: size,
    padding: "0 4px",
    borderRadius: 5,
    verticalAlign: "middle",
    lineHeight: 1.25,
    position: "relative",
    top: "-1px",
    letterSpacing: 0,
  }}>O</span>
);

/* ════════════════════════════════════════════
   AUTH MODAL
════════════════════════════════════════════ */
function AuthModal({ onClose, onLogin }) {
  const [tab, setTab]   = useState("login");
  const [name, setName] = useState("");
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState("");

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const submit = () => {
    setErr("");
    if (!name.trim() || !pw.trim()) return setErr("Fill in all fields.");
    const users = LS.users();
    if (tab === "signup") {
      if (users.find(u => u.name === name)) return setErr("Username taken.");
      const u = { id: uid(), name, pw };
      LS.saveU([...users, u]); LS.saveS(u.id); onLogin(u);
    } else {
      const u = users.find(u => u.name === name && u.pw === pw);
      if (!u) return setErr("Wrong username or password.");
      LS.saveS(u.id); onLogin(u);
    }
  };

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(20px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#111115",borderRadius:20,width:"100%",maxWidth:380,border:"1px solid #2a2a3a",boxShadow:"0 25px 60px rgba(0,0,0,.8)",animation:"fadeUp .22s ease" }}>
        <div style={{ display:"flex",borderBottom:"1px solid #1a1a28" }}>
          {[["login","Sign In"],["signup","Sign Up"]].map(([m,l]) => (
            <button key={m} onClick={() => { setTab(m); setErr(""); }}
              style={{ flex:1,background:"none",border:"none",color:tab===m?"#a78bfa":"#52525b",padding:"18px 0",fontSize:14,fontWeight:700,cursor:"pointer",borderBottom:tab===m?"2px solid #7c3aed":"2px solid transparent",transition:"color .2s" }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ padding:"28px 26px 24px" }}>
          <div style={{ fontSize:19,fontWeight:800,color:"#fafafa",marginBottom:4 }}>{tab==="login"?"Welcome back":"Create account"}</div>
          <div style={{ fontSize:12,color:"#52525b",marginBottom:22 }}>Saved locally on your device only.</div>
          {[["Username",name,setName,"text"],["Password",pw,setPw,"password"]].map(([l,v,s,t]) => (
            <div key={l} style={{ marginBottom:14 }}>
              <label style={{ display:"block",color:"#71717a",fontSize:11,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:.8 }}>{l}</label>
              <input type={t} value={v} onChange={e => s(e.target.value)} onKeyDown={e => e.key==="Enter" && submit()}
                placeholder={l}
                style={{ width:"100%",background:"#0a0a0f",border:"1px solid #2a2a3a",borderRadius:10,color:"#fafafa",padding:"11px 14px",fontSize:14,outline:"none",transition:"border .2s" }}
                onFocus={e => e.target.style.borderColor="#7c3aed"}
                onBlur={e => e.target.style.borderColor="#2a2a3a"}/>
            </div>
          ))}
          {err && <div style={{ color:"#f87171",fontSize:12,marginBottom:14,background:"rgba(248,113,113,.08)",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(248,113,113,.15)" }}>{err}</div>}
          <button onClick={submit} style={{ width:"100%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:11,color:"#fff",padding:"12px 0",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(124,58,237,.4)",transition:"opacity .2s" }}
            onMouseEnter={e => e.target.style.opacity=".88"} onMouseLeave={e => e.target.style.opacity="1"}>
            {tab==="login"?"Sign In":"Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   ANIME CARD  — Miruro-inspired clean poster
════════════════════════════════════════════ */
function AnimeCard({ a, onClick, bookmarked, onBookmark, progress = 0 }) {
  const [hov, setHov] = useState(false);
  const img = aImg(a);

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ cursor:"pointer",borderRadius:10,overflow:"hidden",background:"#111115",flexShrink:0,
        transform: hov ? "translateY(-6px) scale(1.02)" : "none",
        boxShadow: hov ? "0 20px 48px rgba(0,0,0,.7),0 0 0 1.5px rgba(124,58,237,.45)" : "0 2px 12px rgba(0,0,0,.4)",
        transition:"transform .25s cubic-bezier(.22,.68,0,1.2),box-shadow .25s ease" }}>

      {/* Poster */}
      <div onClick={() => onClick(a)} style={{ position:"relative",paddingBottom:"145%",overflow:"hidden" }}>
        {img
          ? <img src={img} alt={aTitle(a)} loading="lazy"
              style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",
                transform: hov ? "scale(1.06)" : "scale(1)", transition:"transform .4s ease" }}/>
          : <div style={{ position:"absolute",inset:0,background:"#1a1a25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36 }}>🎌</div>
        }
        <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.9) 0%,rgba(0,0,0,.05) 50%,transparent 100%)" }}/>

        {/* Status pill */}
        <div style={{ position:"absolute",top:8,left:8,
          background: a.status==="RELEASING" ? "rgba(16,185,129,.9)" : "rgba(30,30,40,.9)",
          backdropFilter:"blur(6px)", color:"#fff",fontSize:9,fontWeight:700,
          padding:"3px 8px",borderRadius:20,textTransform:"uppercase",letterSpacing:.8 }}>
          {a.status==="RELEASING" ? "Airing" : "Done"}
        </div>

        {/* Bookmark */}
        {onBookmark && (
          <button onClick={e => { e.stopPropagation(); onBookmark(a.id); }}
            style={{ position:"absolute",top:7,right:7,background:"rgba(0,0,0,.6)",
              border:"none",cursor:"pointer",borderRadius:7,padding:"5px 6px",
              display:"flex",backdropFilter:"blur(6px)",color:bookmarked?"#a78bfa":"#a1a1aa",
              transition:"color .2s" }}>
            <Ic.Bm on={bookmarked}/>
          </button>
        )}

        {/* Play button on hover */}
        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",
          justifyContent:"center",opacity: hov ? 1 : 0, transition:"opacity .2s" }}>
          <div onClick={() => onClick(a)} style={{ width:46,height:46,borderRadius:"50%",
            background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 0 28px rgba(124,58,237,.6)",transform: hov ? "scale(1)" : "scale(.8)",
            transition:"transform .25s cubic-bezier(.22,.68,0,1.2)" }}>
            <Ic.Play s={18}/>
          </div>
        </div>

        {/* Progress bar */}
        {progress > 0 && (
          <div style={{ position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.08)" }}>
            <div style={{ height:"100%",background:"linear-gradient(90deg,#7c3aed,#a855f7)",width:`${Math.min(progress,100)}%` }}/>
          </div>
        )}
      </div>

      {/* Info below poster */}
      <div onClick={() => onClick(a)} style={{ padding:"9px 10px 11px" }}>
        <div style={{ color:"#f4f4f5",fontSize:12,fontWeight:600,lineHeight:1.35,marginBottom:4,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
          {aTitle(a)}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,fontSize:10 }}>
          <span style={{ display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:600 }}>
            <Ic.Star/>{aScore(a)}
          </span>
          <span style={{ color:"#3f3f46" }}>·</span>
          <span style={{ color:"#71717a" }}>{a.seasonYear || ""}</span>
          {a.episodes && <><span style={{ color:"#3f3f46" }}>·</span><span style={{ color:"#71717a" }}>{a.episodes} eps</span></>}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   HORIZONTAL ROW
════════════════════════════════════════════ */
function Row({ title, accent, list, loading, onCard, bookmarks, onBm, histMap }) {
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({ left: d * 340, behavior: "smooth" });

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
        <h2 style={{ fontSize:15,fontWeight:800,color:"#fafafa",display:"flex",alignItems:"center",gap:8 }}>
          {accent && <span>{accent}</span>}
          {title}
        </h2>
        <div style={{ display:"flex",gap:6 }}>
          {[[-1,<Ic.ChevL/>],[1,<Ic.ChevR/>]].map(([d,ic]) => (
            <button key={d} onClick={() => scroll(d)}
              style={{ background:"#18181f",border:"1px solid #2a2a3a",color:"#71717a",
                borderRadius:8,padding:"5px 8px",cursor:"pointer",display:"flex",
                transition:"color .2s,border-color .2s" }}
              onMouseEnter={e => { e.currentTarget.style.color="#fafafa"; e.currentTarget.style.borderColor="#52525b"; }}
              onMouseLeave={e => { e.currentTarget.style.color="#71717a"; e.currentTarget.style.borderColor="#2a2a3a"; }}>
              {ic}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display:"flex",gap:12 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ width:150,flexShrink:0,borderRadius:10,overflow:"hidden",background:"#111115" }}>
              <div style={{ paddingBottom:"145%",background:"#18181f",animation:"shimmer 1.5s ease infinite" }}/>
              <div style={{ padding:"9px 10px 11px" }}>
                <div style={{ height:12,background:"#18181f",borderRadius:4,marginBottom:6,animation:"shimmer 1.5s ease infinite" }}/>
                <div style={{ height:10,background:"#18181f",borderRadius:4,width:"60%",animation:"shimmer 1.5s ease infinite" }}/>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div ref={ref} className="row-scroll">
          {list.map(a => {
            const prog = histMap?.[a.id]?.ep && a.episodes ? (histMap[a.id].ep / a.episodes) * 100 : 0;
            return (
              <div key={a.id} style={{ width:150,flexShrink:0 }}>
                <AnimeCard a={a} onClick={onCard} bookmarked={bookmarks?.has(a.id)} onBookmark={onBm} progress={prog}/>
              </div>
            );
          })}
          {list.length === 0 && <div style={{ color:"#52525b",fontSize:14,padding:"20px 0" }}>Nothing to show.</div>}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   CONTINUE WATCHING
════════════════════════════════════════════ */
function ContinueRow({ history, onPlay }) {
  const ref   = useRef(null);
  const items = Object.values(history).sort((a,b) => b.at - a.at).slice(0, 16);
  if (!items.length) return null;
  const scroll = (d) => ref.current?.scrollBy({ left: d * 260, behavior:"smooth" });

  return (
    <div style={{ marginBottom:44 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
        <h2 style={{ fontSize:15,fontWeight:800,color:"#fafafa",display:"flex",alignItems:"center",gap:8 }}>
          <Ic.Clock/> Continue Watching
        </h2>
        <div style={{ display:"flex",gap:6 }}>
          {[[-1,<Ic.ChevL/>],[1,<Ic.ChevR/>]].map(([d,ic]) => (
            <button key={d} onClick={() => scroll(d)}
              style={{ background:"#18181f",border:"1px solid #2a2a3a",color:"#71717a",borderRadius:8,padding:"5px 8px",cursor:"pointer",display:"flex" }}>
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="row-scroll">
        {items.map(h => {
          const img   = aImg(h.data);
          const title = aTitle(h.data);
          const prog  = h.ep && h.data?.episodes ? (h.ep / h.data.episodes) * 100 : 50;
          return (
            <div key={h.data.id} onClick={() => onPlay(h)}
              style={{ width:240,flexShrink:0,background:"#111115",borderRadius:10,overflow:"hidden",cursor:"pointer",border:"1px solid #1a1a28",transition:"transform .2s,border-color .2s" }}
              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.borderColor="#3f3f52"; }}
              onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.borderColor="#1a1a28"; }}>
              <div style={{ position:"relative",paddingBottom:"56%",overflow:"hidden" }}>
                {img
                  ? <img src={img} alt="" style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.7)" }}/>
                  : <div style={{ position:"absolute",inset:0,background:"#1a1a25" }}/>
                }
                <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 55%)" }}/>
                <div style={{ position:"absolute",bottom:8,left:10,right:10,display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                    <Ic.Play s={12}/>
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ color:"#fff",fontSize:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{title}</div>
                    <div style={{ color:"#a1a1aa",fontSize:10,marginTop:2 }}>Episode {h.ep}</div>
                  </div>
                </div>
                <div style={{ position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.08)" }}>
                  <div style={{ height:"100%",background:"linear-gradient(90deg,#7c3aed,#a855f7)",width:`${Math.min(prog,100)}%` }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   ANIME DETAIL MODAL
════════════════════════════════════════════ */
function AnimeModal({ a, onClose, bookmarked, onBookmark, onWatch }) {
  useEffect(() => { document.body.style.overflow="hidden"; return () => { document.body.style.overflow=""; }; }, []);
  const img = aImg(a); const title = aTitle(a);

  return (
    <div onClick={onClose}
      style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(16px)" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"#111115",borderRadius:20,width:"100%",maxWidth:820,maxHeight:"90vh",overflowY:"auto",border:"1px solid #2a2a3a",boxShadow:"0 30px 80px rgba(0,0,0,.9)",animation:"fadeUp .22s ease" }}>

        {/* Banner */}
        <div style={{ position:"relative",height:220,overflow:"hidden",borderRadius:"20px 20px 0 0" }}>
          {a.bannerImage
            ? <img src={a.bannerImage} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.6)" }}/>
            : img
              ? <img src={img} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",filter:"blur(4px) brightness(.5)",transform:"scale(1.05)" }}/>
              : <div style={{ width:"100%",height:"100%",background:"linear-gradient(135deg,#1a0a2e,#111115)" }}/>
          }
          <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,#111115 0%,transparent 50%)" }}/>
          {img && <img src={img} alt="" style={{ position:"absolute",left:24,bottom:-18,height:"88%",objectFit:"contain",borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,.8)" }}/>}
          <button onClick={onClose}
            style={{ position:"absolute",top:14,right:14,background:"rgba(0,0,0,.6)",border:"1px solid rgba(255,255,255,.08)",color:"#a1a1aa",cursor:"pointer",borderRadius:10,padding:"7px 8px",display:"flex",backdropFilter:"blur(8px)" }}>
            <Ic.X/>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding:"26px 24px 24px" }}>
          <div style={{ color:"#71717a",fontSize:12,marginBottom:4 }}>{a.title?.romaji}</div>
          <div style={{ fontSize:20,fontWeight:900,color:"#fafafa",marginBottom:12,lineHeight:1.2 }}>{title}</div>

          <div style={{ display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:14 }}>
            <span style={{ display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700,fontSize:13 }}><Ic.Star/>{aScore(a)}</span>
            {a.seasonYear && <><span style={{ color:"#2a2a3a" }}>·</span><span style={{ color:"#71717a",fontSize:13 }}>{a.seasonYear}</span></>}
            {a.episodes && <><span style={{ color:"#2a2a3a" }}>·</span><span style={{ color:"#71717a",fontSize:13 }}>{a.episodes} eps</span></>}
            <span style={{ color:"#2a2a3a" }}>·</span>
            <span style={{ color: a.status==="RELEASING"?"#10b981":"#71717a",fontSize:13,fontWeight:600 }}>{aStatus(a)}</span>
          </div>

          <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:16 }}>
            {a.genres?.map(g => (
              <span key={g} style={{ background:"#18181f",color:"#71717a",fontSize:11,padding:"4px 10px",borderRadius:20,border:"1px solid #2a2a3a" }}>{g}</span>
            ))}
          </div>

          {a.description && <p style={{ color:"#a1a1aa",fontSize:14,lineHeight:1.75,marginBottom:20 }}>{strip(a.description).slice(0,380)}…</p>}

          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <button onClick={() => { onClose(); onWatch(a, 1); }}
              style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 20px rgba(124,58,237,.4)",transition:"opacity .2s" }}
              onMouseEnter={e => e.currentTarget.style.opacity=".88"} onMouseLeave={e => e.currentTarget.style.opacity="1"}>
              <Ic.Play s={16}/> Watch Now
            </button>
            <button onClick={() => onBookmark(a.id)}
              style={{ background:bookmarked?"rgba(167,139,250,.12)":"#18181f",border:`1px solid ${bookmarked?"rgba(167,139,250,.4)":"#2a2a3a"}`,color:bookmarked?"#a78bfa":"#a1a1aa",borderRadius:12,padding:"12px 18px",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .2s" }}>
              <Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Add to List"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   WATCH VIEW
════════════════════════════════════════════ */
function WatchView({ a, startEp, onBack, bookmarked, onBookmark, onSaveHist }) {
  const [ep, setEp]               = useState(startEp);
  const [lang, setLang]           = useState("sub");
  const [srv, setSrv]             = useState(SERVERS[0]);
  const [autoPlay, setAutoPlay]   = useState(true);
  const [autoSkip, setAutoSkip]   = useState(true);
  const [skipTimes, setSkipTimes] = useState(null);
  const [localSec, setLocalSec]   = useState(0);
  const [showSkip, setShowSkip]   = useState(false);
  const [showEd,   setShowEd]     = useState(false);
  const [epGrid, setEpGrid]       = useState(true);
  const [nextBanner, setNextBanner] = useState(false);
  const [countdown, setCountdown]   = useState(5);
  const ifrRef  = useRef(null);
  const timerRef = useRef(null);
  const countRef = useRef(null);
  const epRef   = useRef(null);
  const eps     = aEps(a);
  const total   = eps.length;
  const title   = aTitle(a);
  const img     = aImg(a);

  useEffect(() => {
    setSkipTimes(null); setShowSkip(false); setShowEd(false);
    if (a.idMal) fetchSkipTimes(a.idMal, ep).then(setSkipTimes);
  }, [a.idMal, ep]);

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current); setLocalSec(0);
    timerRef.current = setInterval(() => setLocalSec(s => s + 1), 1000);
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (!skipTimes) return;
    const { op, ed } = skipTimes;
    if (op) setShowSkip(localSec >= op.startTime && localSec <= op.endTime);
    if (ed) setShowEd(localSec >= ed.startTime && localSec <= ed.endTime);
  }, [localSec, skipTimes]);

  // Auto skip
  useEffect(() => { if (autoSkip && showSkip) doSkip("op"); }, [showSkip]); // eslint-disable-line

  // postMessage auto-next
  useEffect(() => {
    const h = (e) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "complete" && autoPlay && ep < total) {
          setNextBanner(true); setCountdown(5);
          countRef.current = setInterval(() => setCountdown(v => {
            if (v <= 1) { clearInterval(countRef.current); goNext(); return 5; }
            return v - 1;
          }), 1000);
        }
      } catch {}
    };
    window.addEventListener("message", h);
    return () => { window.removeEventListener("message", h); clearInterval(countRef.current); };
  }, [autoPlay, ep, total]); // eslint-disable-line

  const doSkip = (type) => {
    const end = type === "op" ? skipTimes?.op?.endTime : skipTimes?.ed?.endTime;
    if (!end) { setShowSkip(false); setShowEd(false); return; }
    try { ifrRef.current?.contentWindow?.postMessage({ type:"seek", time: end }, "*"); } catch {}
    setLocalSec(end + 1); setShowSkip(false); setShowEd(false);
  };

  const goNext = useCallback(() => {
    if (ep < total) { setEp(e => e + 1); setNextBanner(false); setCountdown(5); clearInterval(countRef.current); }
  }, [ep, total]);

  useEffect(() => {
    setShowSkip(false); setShowEd(false); setNextBanner(false);
    setCountdown(5); clearInterval(countRef.current);
    onSaveHist?.(a, ep);
    setTimeout(() => epRef.current?.querySelector(".ep-active")?.scrollIntoView({ block:"nearest", behavior:"smooth" }), 100);
  }, [ep]); // eslint-disable-line

  useEffect(() => { window.scrollTo({ top: 0, behavior:"smooth" }); }, []);

  return (
    <div style={{ minHeight:"100vh",background:"#0a0a0a",paddingTop:64,color:"#fafafa" }}>
      {/* Breadcrumb */}
      <div style={{ padding:"10px 20px",borderBottom:"1px solid #1a1a28",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
        <button onClick={onBack}
          style={{ background:"#18181f",border:"1px solid #2a2a3a",borderRadius:8,color:"#a1a1aa",cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600,transition:"all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.color="#fafafa"; e.currentTarget.style.borderColor="#52525b"; }}
          onMouseLeave={e => { e.currentTarget.style.color="#a1a1aa"; e.currentTarget.style.borderColor="#2a2a3a"; }}>
          <Ic.ChevL/> Back
        </button>
        <span style={{ color:"#3f3f46",fontSize:13 }}>{title}</span>
        <span style={{ color:"#27272a" }}>·</span>
        <span style={{ color:"#71717a",fontSize:13 }}>Episode {ep}</span>
        {skipTimes?.op && (
          <span style={{ marginLeft:"auto",background:"rgba(167,139,250,.1)",border:"1px solid rgba(167,139,250,.25)",color:"#c4b5fd",fontSize:10,padding:"3px 9px",borderRadius:20,fontWeight:600 }}>
            ⏱ Skip times loaded
          </span>
        )}
      </div>

      <div className="watch-layout">
        {/* ── Player Column ── */}
        <div className="watch-main">
          {/* Player */}
          <div style={{ position:"relative",width:"100%",aspectRatio:"16/9",background:"#000",borderRadius:12,overflow:"hidden",boxShadow:"0 10px 60px rgba(0,0,0,.9)" }}>
            <iframe ref={ifrRef} key={`${a.id}-${ep}-${lang}-${srv.id}`}
              src={srv.url(a, ep, lang)} title={`${title} Ep ${ep}`}
              allowFullScreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              onLoad={startTimer}
              style={{ width:"100%",height:"100%",border:"none",display:"block" }}/>

            {/* Skip Intro */}
            {showSkip && !autoSkip && (
              <button onClick={() => doSkip("op")}
                style={{ position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.88)",backdropFilter:"blur(12px)",border:"1px solid rgba(124,58,237,.5)",color:"#fff",borderRadius:9,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .25s ease",boxShadow:"0 4px 20px rgba(0,0,0,.5)" }}>
                <Ic.Skip/> Skip Intro
              </button>
            )}
            {showEd && (
              <button onClick={() => doSkip("ed")}
                style={{ position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.88)",backdropFilter:"blur(12px)",border:"1px solid rgba(124,58,237,.5)",color:"#fff",borderRadius:9,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .25s ease" }}>
                <Ic.Skip/> Skip Outro
              </button>
            )}

            {/* Auto-next banner */}
            {nextBanner && ep < total && (
              <div style={{ position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.97),rgba(0,0,0,.6))",padding:"20px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10 }}>
                <div>
                  <div style={{ color:"#a1a1aa",fontSize:12,marginBottom:2 }}>Up Next</div>
                  <div style={{ color:"#fff",fontWeight:700,fontSize:15 }}>Episode {ep + 1}</div>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={() => { setNextBanner(false); clearInterval(countRef.current); }}
                    style={{ background:"#18181f",border:"1px solid #2a2a3a",color:"#a1a1aa",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600 }}>
                    Cancel
                  </button>
                  <button onClick={goNext}
                    style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",borderRadius:9,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6,boxShadow:"0 4px 16px rgba(124,58,237,.4)" }}>
                    <Ic.Play s={14}/> Play ({countdown}s)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Servers */}
          <div style={{ marginTop:14,background:"#111115",borderRadius:12,border:"1px solid #1a1a28",padding:"13px 16px" }}>
            <div style={{ color:"#52525b",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,marginBottom:10 }}>Servers</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:7 }}>
              {SERVERS.map(s => (
                <button key={s.id} onClick={() => setSrv(s)}
                  style={{ background:srv.id===s.id?"linear-gradient(135deg,#7c3aed,#a855f7)":"#18181f",
                    border:`1px solid ${srv.id===s.id?"transparent":"#2a2a3a"}`,
                    color:srv.id===s.id?"#fff":"#a1a1aa",borderRadius:8,padding:"7px 14px",
                    cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,
                    transition:"all .18s",boxShadow:srv.id===s.id?"0 4px 14px rgba(124,58,237,.35)":"none" }}>
                  {s.label}
                  <span style={{ fontSize:9,background:srv.id===s.id?"rgba(255,255,255,.2)":"#2a2a3a",borderRadius:4,padding:"2px 4px" }}>{s.tag}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop:9,fontSize:11,color:"#3f3f46" }}>If the video doesn't load, try another server.</div>
          </div>

          {/* Controls */}
          <div style={{ display:"flex",gap:8,marginTop:12,flexWrap:"wrap" }}>
            <button onClick={() => ep > 1 && setEp(e => e - 1)} disabled={ep <= 1}
              style={{ flex:1,minWidth:90,background:ep<=1?"#0f0f14":"#111115",border:"1px solid #1a1a28",borderRadius:9,color:ep<=1?"#3f3f46":"#a1a1aa",padding:"10px 0",cursor:ep<=1?"default":"pointer",fontSize:13,fontWeight:600,transition:"all .2s" }}>
              ← Prev
            </button>
            <button onClick={() => ep < total && setEp(e => e + 1)} disabled={ep >= total}
              style={{ flex:1,minWidth:90,background:ep>=total?"#0f0f14":"#111115",border:"1px solid #1a1a28",borderRadius:9,color:ep>=total?"#3f3f46":"#a1a1aa",padding:"10px 0",cursor:ep>=total?"default":"pointer",fontSize:13,fontWeight:600,transition:"all .2s" }}>
              Next →
            </button>
            <div style={{ display:"flex",background:"#111115",border:"1px solid #1a1a28",borderRadius:9,overflow:"hidden" }}>
              {["sub","dub"].map(l => (
                <button key={l} onClick={() => setLang(l)}
                  style={{ background:lang===l?"linear-gradient(135deg,#7c3aed,#a855f7)":"transparent",border:"none",color:lang===l?"#fff":"#71717a",padding:"10px 16px",cursor:"pointer",fontSize:12,fontWeight:700,textTransform:"uppercase",transition:"all .2s" }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
            {[["Auto Play Next",autoPlay,setAutoPlay],["Auto Skip Intro",autoSkip,setAutoSkip]].map(([l,v,s]) => (
              <button key={l} onClick={() => s(x => !x)}
                style={{ display:"flex",alignItems:"center",gap:8,background:"#111115",border:"1px solid #1a1a28",borderRadius:9,color:v?"#a78bfa":"#71717a",padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .2s" }}>
                <div style={{ width:30,height:17,borderRadius:9,background:v?"linear-gradient(135deg,#7c3aed,#a855f7)":"#27272a",position:"relative",flexShrink:0,transition:"background .2s" }}>
                  <div style={{ position:"absolute",top:2.5,left:v?15:2.5,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .22s cubic-bezier(.22,.68,0,1.2)",boxShadow:"0 1px 4px rgba(0,0,0,.4)" }}/>
                </div>
                {l}
              </button>
            ))}
          </div>

          {/* Anime info */}
          <div style={{ marginTop:14,background:"#111115",borderRadius:12,border:"1px solid #1a1a28",padding:18 }}>
            <div style={{ display:"flex",gap:14,alignItems:"flex-start" }}>
              {img && <img src={img} alt={title} style={{ width:68,height:96,objectFit:"cover",borderRadius:9,flexShrink:0 }}/>}
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ color:"#fafafa",fontSize:16,fontWeight:800,marginBottom:8,lineHeight:1.2 }}>{title}</div>
                <div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:9 }}>
                  {a.genres?.slice(0,4).map(g => (
                    <span key={g} style={{ background:"#18181f",color:"#71717a",fontSize:10,padding:"3px 9px",borderRadius:20,border:"1px solid #2a2a3a" }}>{g}</span>
                  ))}
                </div>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",fontSize:12 }}>
                  <span style={{ display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700 }}><Ic.Star/>{aScore(a)}</span>
                  {a.seasonYear && <><span style={{ color:"#27272a" }}>·</span><span style={{ color:"#71717a" }}>{a.seasonYear}</span></>}
                  <span style={{ color:"#27272a" }}>·</span>
                  <span style={{ color:a.status==="RELEASING"?"#10b981":"#71717a",fontWeight:600 }}>{aStatus(a)}</span>
                </div>
                <button onClick={() => onBookmark(a.id)}
                  style={{ marginTop:10,background:bookmarked?"rgba(167,139,250,.12)":"#18181f",border:`1px solid ${bookmarked?"rgba(167,139,250,.35)":"#2a2a3a"}`,color:bookmarked?"#a78bfa":"#a1a1aa",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6,transition:"all .2s" }}>
                  <Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}
                </button>
              </div>
            </div>
            {a.description && <p style={{ color:"#71717a",fontSize:13,lineHeight:1.75,marginTop:14 }}>{strip(a.description).slice(0,280)}…</p>}
          </div>
        </div>

        {/* ── Episode List ── */}
        <div className="watch-sidebar" ref={epRef}>
          <div style={{ background:"#111115",borderRadius:12,border:"1px solid #1a1a28",overflow:"hidden" }}>
            <div style={{ padding:"13px 14px",borderBottom:"1px solid #1a1a28",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ fontSize:13,fontWeight:700,color:"#fafafa" }}>
                Episodes <span style={{ color:"#3f3f46",fontWeight:400 }}>({total})</span>
              </div>
              <button onClick={() => setEpGrid(v => !v)}
                style={{ background:"#18181f",border:"1px solid #2a2a3a",color:"#71717a",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,transition:"all .2s" }}>
                {epGrid ? "List" : "Grid"}
              </button>
            </div>
            <div style={{ maxHeight:460,overflowY:"auto",padding:8 }} className="ep-list">
              {epGrid ? (
                <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5 }}>
                  {eps.map(n => (
                    <button key={n} className={ep===n?"ep-active":""} onClick={() => setEp(n)}
                      style={{ background:ep===n?"linear-gradient(135deg,#7c3aed,#a855f7)":"#18181f",border:`1px solid ${ep===n?"transparent":"#2a2a3a"}`,color:ep===n?"#fff":"#a1a1aa",borderRadius:8,padding:"8px 4px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .18s" }}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                  {eps.map(n => (
                    <button key={n} className={ep===n?"ep-active":""} onClick={() => setEp(n)}
                      style={{ background:ep===n?"rgba(124,58,237,.15)":"transparent",border:`1px solid ${ep===n?"rgba(124,58,237,.3)":"transparent"}`,color:ep===n?"#a78bfa":"#a1a1aa",borderRadius:9,padding:"9px 12px",cursor:"pointer",fontSize:13,fontWeight:ep===n?700:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:10,transition:"all .18s" }}>
                      <span style={{ width:28,height:28,borderRadius:7,flexShrink:0,background:ep===n?"linear-gradient(135deg,#7c3aed,#a855f7)":"#18181f",color:ep===n?"#fff":"#71717a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700 }}>{n}</span>
                      Episode {n}
                      <span style={{ marginLeft:"auto",color:"#3f3f46",fontSize:11 }}>24m</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   NAVBAR
════════════════════════════════════════════ */
function Navbar({ page, setPage, searchQ, onSearch, user, onAuthOpen, onLogout, mobileOpen, setMobileOpen }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const navLinks = [["home","Home"],["trending","Trending"],["schedule","Schedule"],["bookmarks","Bookmarks"]];

  return (
    <nav style={{ position:"fixed",top:0,left:0,right:0,zIndex:100,background:"rgba(10,10,10,.92)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:"1px solid #1a1a28",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 22px",height:64,gap:16 }}>

      {/* Logo */}
      <div style={{ display:"flex",alignItems:"center",gap:9,flexShrink:0,cursor:"pointer" }} onClick={() => setPage("home")}>
        <Logo size={30}/>
        <span style={{ fontSize:16,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase",color:"#fafafa" }}>
          SHIN<OLetter/>RA
        </span>
      </div>

      {/* Desktop nav */}
      <div className="desk-nav">
        {navLinks.map(([id,label]) => (
          <button key={id} onClick={() => setPage(id)}
            style={{ background:"none",border:"none",cursor:"pointer",padding:"6px 14px",borderRadius:8,fontSize:13,fontWeight:page===id?700:500,color:page===id?"#fafafa":"#71717a",position:"relative",transition:"color .2s" }}>
            {label}
            {page===id && <div style={{ position:"absolute",bottom:-1,left:"50%",transform:"translateX(-50%)",width:20,height:2,borderRadius:2,background:"linear-gradient(90deg,#7c3aed,#a855f7)" }}/>}
          </button>
        ))}
      </div>

      {/* Right */}
      <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
        {/* Search */}
        {searchOpen ? (
          <div style={{ display:"flex",alignItems:"center",background:"#111115",borderRadius:10,padding:"7px 12px",gap:7,border:"1px solid #2a2a3a",transition:"border .2s" }}
            onFocus={e => e.currentTarget.style.borderColor="#7c3aed"}
            onBlur={e => e.currentTarget.style.borderColor="#2a2a3a"}>
            <Ic.Search/>
            <input autoFocus value={searchQ} onChange={e => onSearch(e.target.value)}
              placeholder="Search anime..." style={{ background:"none",border:"none",outline:"none",color:"#fafafa",fontSize:13,width:160 }}/>
            <button onClick={() => { setSearchOpen(false); onSearch(""); }} style={{ background:"none",border:"none",cursor:"pointer",color:"#52525b",display:"flex" }}><Ic.X s={15}/></button>
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)}
            style={{ background:"#111115",border:"1px solid #2a2a3a",borderRadius:9,color:"#71717a",padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="#52525b"; e.currentTarget.style.color="#fafafa"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="#2a2a3a"; e.currentTarget.style.color="#71717a"; }}>
            <Ic.Search/>
            <span className="search-label" style={{ fontSize:13 }}>Search</span>
          </button>
        )}

        {/* Profile / Auth */}
        {user ? (
          <div style={{ position:"relative" }}>
            <button onClick={() => setProfileOpen(v => !v)}
              style={{ display:"flex",alignItems:"center",gap:7,background:"#111115",border:"1px solid #2a2a3a",borderRadius:9,padding:"5px 10px 5px 5px",cursor:"pointer",transition:"border .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor="#52525b"}
              onMouseLeave={e => e.currentTarget.style.borderColor="#2a2a3a"}>
              <div style={{ width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff" }}>
                {user.name[0].toUpperCase()}
              </div>
              <span style={{ color:"#e4e4e7",fontSize:13,fontWeight:600 }}>{user.name}</span>
            </button>
            {profileOpen && (
              <div style={{ position:"absolute",top:"calc(100% + 8px)",right:0,background:"#111115",border:"1px solid #2a2a3a",borderRadius:12,minWidth:175,padding:6,boxShadow:"0 16px 50px rgba(0,0,0,.9)",animation:"fadeUp .18s ease",zIndex:200 }}>
                <div style={{ padding:"10px 12px",borderBottom:"1px solid #1a1a28",marginBottom:4 }}>
                  <div style={{ color:"#fafafa",fontSize:13,fontWeight:700 }}>{user.name}</div>
                  <div style={{ color:"#52525b",fontSize:11,marginTop:2 }}>Local Account</div>
                </div>
                <button onClick={() => { setPage("bookmarks"); setProfileOpen(false); }}
                  style={{ width:"100%",background:"none",border:"none",color:"#a1a1aa",padding:"9px 12px",cursor:"pointer",fontSize:13,textAlign:"left",borderRadius:8,transition:"color .2s" }}
                  onMouseEnter={e => e.currentTarget.style.color="#fafafa"} onMouseLeave={e => e.currentTarget.style.color="#a1a1aa"}>
                  🔖 My Bookmarks
                </button>
                <button onClick={() => { LS.clearS(); onLogout(); setProfileOpen(false); }}
                  style={{ width:"100%",background:"none",border:"none",color:"#f87171",padding:"9px 12px",cursor:"pointer",fontSize:13,textAlign:"left",borderRadius:8 }}>
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={onAuthOpen}
            style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700,boxShadow:"0 4px 14px rgba(124,58,237,.35)",transition:"opacity .2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity=".85"} onMouseLeave={e => e.currentTarget.style.opacity="1"}>
            Sign In
          </button>
        )}

        <button className="hamburger" onClick={() => setMobileOpen(v => !v)}
          style={{ background:"none",border:"none",color:"#71717a",cursor:"pointer",padding:4,display:"flex" }}>
          <Ic.Menu/>
        </button>
      </div>
    </nav>
  );
}

/* ════════════════════════════════════════════
   HERO
════════════════════════════════════════════ */
function Hero({ items, onWatch, onInfo }) {
  const [idx, setIdx] = useState(0);
  const a = items[idx];

  useEffect(() => {
    if (!items.length) return;
    const t = setInterval(() => setIdx(i => (i + 1) % Math.min(6, items.length)), 7000);
    return () => clearInterval(t);
  }, [items.length]);

  if (!a) return (
    <div style={{ height:"88vh",minHeight:480,background:"linear-gradient(135deg,#0f0718,#0a0a0a)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16 }}>
      <Logo size={56}/>
      <div style={{ width:36,height:36,border:"3px solid #1a1a28",borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite" }}/>
    </div>
  );

  const title  = aTitle(a);
  const banner = a.bannerImage;
  const cover  = aImg(a);

  return (
    <div style={{ position:"relative",height:"88vh",minHeight:480,overflow:"hidden" }}>
      {/* Background */}
      <div key={idx} style={{ position:"absolute",inset:0,animation:"heroIn .8s ease" }}>
        {banner
          ? <img src={banner} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
          : cover
            ? <img src={cover} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",filter:"blur(4px)",transform:"scale(1.05)" }}/>
            : <div style={{ width:"100%",height:"100%",background:"linear-gradient(135deg,#0f0718,#0a0a0a)" }}/>
        }
        {/* Cinematic gradient overlays */}
        <div style={{ position:"absolute",inset:0,background:"linear-gradient(to right,rgba(10,10,10,.96) 20%,rgba(10,10,10,.55) 60%,rgba(10,10,10,.1) 100%)" }}/>
        <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,#0a0a0a 0%,transparent 50%)" }}/>
      </div>

      {/* Content */}
      <div className="hero-content" style={{ position:"relative",zIndex:2,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 48px 88px",maxWidth:680,animation:"fadeUp .65s ease" }}>
        <div style={{ fontSize:10,fontWeight:700,letterSpacing:3,textTransform:"uppercase",color:"#a78bfa",marginBottom:12 }}>
          {a.status==="RELEASING" ? "⚡ Now Airing" : "⭐ Featured"}
        </div>
        {a.title?.romaji && <div style={{ color:"#52525b",fontSize:13,marginBottom:6 }}>{a.title.romaji}</div>}
        <h1 className="hero-title" style={{ fontSize:46,fontWeight:900,lineHeight:1.06,marginBottom:14,color:"#fff" }}>{title}</h1>

        <div style={{ display:"flex",flexWrap:"wrap",gap:7,marginBottom:16 }}>
          {a.genres?.slice(0,3).map(g => (
            <span key={g} style={{ background:"rgba(124,58,237,.18)",border:"1px solid rgba(124,58,237,.3)",color:"#c4b5fd",fontSize:11,padding:"4px 11px",borderRadius:20,fontWeight:600 }}>{g}</span>
          ))}
          <span style={{ display:"flex",alignItems:"center",gap:4,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.25)",color:"#fbbf24",fontSize:11,padding:"4px 11px",borderRadius:20,fontWeight:600 }}>
            <Ic.Star/>{aScore(a)}
          </span>
        </div>

        {a.description && (
          <p style={{ color:"#a1a1aa",fontSize:14,lineHeight:1.78,marginBottom:28,maxWidth:440 }}>
            {strip(a.description).slice(0, 180)}…
          </p>
        )}

        <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
          <button onClick={() => onWatch(a, 1)}
            style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:"none",borderRadius:12,padding:"13px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 28px rgba(124,58,237,.45)",transition:"opacity .2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity=".88"} onMouseLeave={e => e.currentTarget.style.opacity="1"}>
            <Ic.Play s={16}/> Watch Now
          </button>
          <button onClick={() => onInfo(a)}
            style={{ background:"rgba(255,255,255,.08)",color:"#e4e4e7",border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:"13px 22px",fontWeight:600,fontSize:14,cursor:"pointer",backdropFilter:"blur(10px)",transition:"background .2s" }}
            onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.14)"}
            onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.08)"}>
            <Ic.Info/> More Info
          </button>
        </div>
      </div>

      {/* Dots */}
      <div style={{ position:"absolute",bottom:28,left:48,display:"flex",gap:8,zIndex:2 }}>
        {items.slice(0,6).map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ width:i===idx?24:6,height:6,borderRadius:3,background:i===idx?"linear-gradient(90deg,#7c3aed,#a855f7)":"rgba(255,255,255,.2)",border:"none",cursor:"pointer",transition:"all .35s cubic-bezier(.22,.68,0,1.2)",padding:0 }}/>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   BROWSE PAGE
════════════════════════════════════════════ */
function BrowsePage({ list, loading, hasMore, onLoadMore, moreLoad, searchQ, genre, setGenre, onCard, bookmarks, onBm, histMap }) {
  return (
    <div style={{ padding:"84px 22px 60px",maxWidth:1400,margin:"0 auto" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
        <h2 style={{ fontSize:22,fontWeight:900,color:"#fafafa" }}>
          {searchQ ? `"${searchQ}"` : genre !== "All" ? genre : "Browse Anime"}
        </h2>
        <span style={{ color:"#3f3f46",fontSize:13 }}>{list.length} titles</span>
      </div>

      {/* Genre pills */}
      <div className="genre-scroll" style={{ marginBottom:24 }}>
        {GENRES.map(g => (
          <button key={g} onClick={() => setGenre(g)}
            style={{ background:genre===g?"linear-gradient(135deg,#7c3aed,#a855f7)":"#111115",color:genre===g?"#fff":"#71717a",border:`1px solid ${genre===g?"transparent":"#2a2a3a"}`,borderRadius:20,padding:"7px 16px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",boxShadow:genre===g?"0 4px 14px rgba(124,58,237,.3)":"none" }}>
            {g}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:"flex",justifyContent:"center",padding:"60px 0" }}>
          <div style={{ width:36,height:36,border:"3px solid #1a1a28",borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite" }}/>
        </div>
      ) : (
        <>
          <div className="anime-grid">
            {list.map((a, i) => (
              <div key={a.id} style={{ animation:`fadeUp .3s ease ${Math.min(i * .04, .5)}s both` }}>
                <AnimeCard a={a} onClick={onCard} bookmarked={bookmarks?.has(a.id)} onBookmark={onBm}
                  progress={histMap?.[a.id]?.ep && a.episodes ? (histMap[a.id].ep / a.episodes) * 100 : 0}/>
              </div>
            ))}
          </div>
          {list.length === 0 && (
            <div style={{ textAlign:"center",padding:"80px 0",color:"#3f3f46" }}>
              <div style={{ fontSize:40,marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:16,fontWeight:700,color:"#71717a" }}>No results found</div>
            </div>
          )}
          {hasMore && list.length > 0 && (
            <div style={{ textAlign:"center",marginTop:32 }}>
              <button onClick={onLoadMore} disabled={moreLoad}
                style={{ background:moreLoad?"#111115":"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",border:moreLoad?"1px solid #2a2a3a":"none",borderRadius:12,padding:"12px 38px",fontSize:14,fontWeight:700,cursor:moreLoad?"default":"pointer",opacity:moreLoad?.7:1,boxShadow:moreLoad?"none":"0 6px 20px rgba(124,58,237,.35)" }}>
                {moreLoad ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   SCHEDULE PAGE
════════════════════════════════════════════ */
const SCHEDULE = [
  { day:"Mon", shows:["One Piece","Bleach"] },
  { day:"Tue", shows:["Jujutsu Kaisen"] },
  { day:"Wed", shows:["Blue Lock","Solo Leveling"] },
  { day:"Thu", shows:["Frieren"] },
  { day:"Fri", shows:["Demon Slayer"] },
  { day:"Sat", shows:["Attack on Titan"] },
  { day:"Sun", shows:["Naruto","Dragon Ball Super"] },
];

function SchedulePage() {
  return (
    <div style={{ padding:"84px 22px 60px",maxWidth:1200,margin:"0 auto",animation:"fadeUp .4s ease" }}>
      <h2 style={{ fontSize:22,fontWeight:900,color:"#fafafa",marginBottom:6 }}>Airing Schedule</h2>
      <p style={{ color:"#71717a",marginBottom:28,fontSize:14 }}>This week's episode releases</p>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14 }}>
        {SCHEDULE.map(({ day, shows }) => (
          <div key={day} style={{ background:"#111115",borderRadius:14,padding:18,border:"1px solid #1a1a28" }}>
            <div style={{ color:"#a78bfa",fontWeight:800,fontSize:15,marginBottom:14 }}>{day}</div>
            {shows.map(s => (
              <div key={s} style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #0f0f14",color:"#a1a1aa",fontSize:13 }}>
                <div style={{ width:5,height:5,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#a855f7)",flexShrink:0 }}/>
                {s}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════ */
export default function App() {
  /* Auth */
  const [user, setUser]       = useState(null);
  const [history, setHistory] = useState({});
  const [bookmarks, setBm]    = useState(new Set());
  const [showAuth, setShowAuth] = useState(false);

  /* Navigation */
  const [page, setPage]       = useState("home");
  const [searchQ, setSearchQ] = useState("");
  const [genre, setGenre]     = useState("All");

  /* Home data */
  const [rows, setRows]       = useState({ trending:[], popular:[], airing:[], topRated:[], loaded:false });

  /* Browse data */
  const [browseList, setBrowseList]   = useState([]);
  const [browseMore, setBrowseMore]   = useState(false);
  const [browsePage, setBrowsePage]   = useState(1);
  const [browseLoad, setBrowseLoad]   = useState(false);
  const [moreLoad, setMoreLoad]       = useState(false);

  /* Modals & watch */
  const [selAnime, setSelAnime]   = useState(null);
  const [watchAnime, setWatchAnime] = useState(null);
  const [watchEp, setWatchEp]     = useState(1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchTimer = useRef(null);

  /* ── Auth init ── */
  useEffect(() => {
    const sid = LS.sess();
    if (!sid) return;
    const u = LS.users().find(u => u.id === sid);
    if (u) { setUser(u); setHistory(LS.hist(u.id)); setBm(new Set(LS.bm(u.id))); }
  }, []);

  const handleLogin  = (u) => { setUser(u); setHistory(LS.hist(u.id)); setBm(new Set(LS.bm(u.id))); setShowAuth(false); };
  const handleLogout = () => { setUser(null); setHistory({}); setBm(new Set()); };

  /* ── Bookmarks ── */
  const toggleBm = (id) => setBm(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    if (user) LS.saveB(user.id, [...n]);
    return n;
  });

  /* ── History ── */
  const saveHist = (anime, ep) => {
    if (!user) return;
    const next = { ...history, [anime.id]: { data: anime, ep, at: Date.now() } };
    setHistory(next); LS.saveH(user.id, next);
  };

  /* ── Load home rows ── */
  useEffect(() => {
    if (rows.loaded) return;
    Promise.all([fetchTrending(), fetchPopular(), fetchAiring(), fetchTopRated()])
      .then(([trending, popular, airing, topRated]) => {
        setRows({ trending, popular, airing, topRated, loaded: true });
      });
  }, []); // eslint-disable-line

  /* ── Browse / search ── */
  const loadBrowse = useCallback(async ({ page=1, q="", g="All", append=false }={}) => {
    try {
      const res = await searchAnime({ page, search: q, genre: g });
      setBrowseList(prev => append ? [...prev, ...res.list] : res.list);
      setBrowseMore(res.hasMore); setBrowsePage(res.page);
    } catch (e) { console.error(e); }
  }, []);

  /* Search debounce */
  useEffect(() => {
    if (!searchQ.trim()) return;
    setPage("browse");
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setBrowseLoad(true);
      loadBrowse({ page:1, q:searchQ, g:genre }).finally(() => setBrowseLoad(false));
    }, 500);
    return () => clearTimeout(searchTimer.current);
  }, [searchQ]); // eslint-disable-line

  /* Genre change triggers browse */
  useEffect(() => {
    if (page !== "browse") return;
    setBrowseLoad(true);
    loadBrowse({ page:1, q:searchQ, g:genre }).finally(() => setBrowseLoad(false));
  }, [genre]); // eslint-disable-line

  /* Entering browse with no data */
  useEffect(() => {
    if (page === "browse" && browseList.length === 0 && !browseLoad) {
      setBrowseLoad(true);
      loadBrowse({ page:1 }).finally(() => setBrowseLoad(false));
    }
  }, [page]); // eslint-disable-line

  /* ── Watch ── */
  const goWatch = (a, ep=1) => { setWatchAnime(a); setWatchEp(ep); setSelAnime(null); window.scrollTo({ top:0 }); };

  /* ── WATCH VIEW ── */
  if (watchAnime) return (
    <div style={{ background:"#0a0a0a",minHeight:"100vh",color:"#fafafa" }}>
      <GlobalStyles/>
      <Navbar page={page} setPage={p => { setPage(p); setWatchAnime(null); }} searchQ={searchQ} onSearch={setSearchQ}
        user={user} onAuthOpen={() => setShowAuth(true)} onLogout={handleLogout}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <WatchView a={watchAnime} startEp={watchEp} onBack={() => setWatchAnime(null)}
        bookmarked={bookmarks.has(watchAnime.id)} onBookmark={toggleBm} onSaveHist={saveHist}/>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );

  /* ── MAIN ── */
  return (
    <div style={{ minHeight:"100vh",background:"#0a0a0a",color:"#fafafa",overflowX:"hidden" }}>
      <GlobalStyles/>
      <Navbar page={page} setPage={setPage} searchQ={searchQ} onSearch={setSearchQ}
        user={user} onAuthOpen={() => setShowAuth(true)} onLogout={handleLogout}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ position:"fixed",top:64,left:0,right:0,zIndex:90,background:"#111115",borderBottom:"1px solid #1a1a28",padding:"10px 16px",display:"flex",flexDirection:"column",gap:3 }}>
          {[["home","Home"],["trending","Trending"],["browse","Browse"],["schedule","Schedule"],["bookmarks","Bookmarks"]].map(([id,l]) => (
            <button key={id} onClick={() => { setPage(id); setMobileOpen(false); }}
              style={{ background:page===id?"rgba(124,58,237,.15)":"transparent",border:"none",color:page===id?"#a78bfa":"#a1a1aa",padding:"11px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:600,textAlign:"left" }}>
              {l}
            </button>
          ))}
          {!user && (
            <button onClick={() => { setShowAuth(true); setMobileOpen(false); }}
              style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",padding:"12px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,textAlign:"left",marginTop:4 }}>
              Sign In / Create Account
            </button>
          )}
        </div>
      )}

      {/* ── HOME ── */}
      {page === "home" && (
        <>
          <Hero items={rows.trending} onWatch={goWatch} onInfo={setSelAnime}/>
          <div style={{ padding:"36px 22px 60px",maxWidth:1400,margin:"0 auto" }}>
            {user && Object.keys(history).length > 0 && (
              <ContinueRow history={history} onPlay={h => goWatch(h.data, h.ep)}/>
            )}
            {!user && (
              <div style={{ marginBottom:40,background:"rgba(124,58,237,.07)",border:"1px solid rgba(124,58,237,.2)",borderRadius:14,padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}>
                <div>
                  <div style={{ color:"#e4e4e7",fontWeight:700,fontSize:14,marginBottom:4 }}>Track your anime</div>
                  <div style={{ color:"#71717a",fontSize:13 }}>Sign in to save your watch history and continue where you left off.</div>
                </div>
                <button onClick={() => setShowAuth(true)}
                  style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 4px 14px rgba(124,58,237,.35)" }}>
                  Sign In
                </button>
              </div>
            )}
            <Row title="Trending Now"      accent="🔥" list={rows.trending}  loading={!rows.loaded} onCard={setSelAnime} bookmarks={bookmarks} onBm={toggleBm} histMap={history}/>
            <Row title="Currently Airing"  accent="📺" list={rows.airing}    loading={!rows.loaded} onCard={setSelAnime} bookmarks={bookmarks} onBm={toggleBm} histMap={history}/>
            <Row title="All-Time Popular"  accent="👑" list={rows.popular}   loading={!rows.loaded} onCard={setSelAnime} bookmarks={bookmarks} onBm={toggleBm} histMap={history}/>
            <Row title="Top Rated"         accent="⭐" list={rows.topRated}  loading={!rows.loaded} onCard={setSelAnime} bookmarks={bookmarks} onBm={toggleBm} histMap={history}/>
          </div>
        </>
      )}

      {/* ── TRENDING ── */}
      {page === "trending" && (
        <div style={{ padding:"84px 22px 60px",maxWidth:1400,margin:"0 auto",animation:"fadeUp .4s ease" }}>
          <h2 style={{ fontSize:22,fontWeight:900,color:"#fafafa",marginBottom:24 }}>🔥 Trending Anime</h2>
          <div className="anime-grid">
            {rows.trending.map((a,i) => (
              <div key={a.id} style={{ animation:`fadeUp .3s ease ${Math.min(i*.04,.5)}s both` }}>
                <AnimeCard a={a} onClick={setSelAnime} bookmarked={bookmarks.has(a.id)} onBookmark={toggleBm}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BROWSE ── */}
      {page === "browse" && (
        <BrowsePage list={browseList} loading={browseLoad} hasMore={browseMore}
          onLoadMore={async () => { setMoreLoad(true); await loadBrowse({ page:browsePage+1, q:searchQ, g:genre, append:true }); setMoreLoad(false); }}
          moreLoad={moreLoad} searchQ={searchQ} genre={genre} setGenre={setGenre}
          onCard={setSelAnime} bookmarks={bookmarks} onBm={toggleBm} histMap={history}/>
      )}

      {/* ── SCHEDULE ── */}
      {page === "schedule" && <SchedulePage/>}

      {/* ── BOOKMARKS ── */}
      {page === "bookmarks" && (
        <div style={{ padding:"84px 22px 60px",maxWidth:1400,margin:"0 auto",animation:"fadeUp .4s ease" }}>
          <h2 style={{ fontSize:22,fontWeight:900,color:"#fafafa",marginBottom:6 }}>My List</h2>
          <p style={{ color:"#71717a",marginBottom:28,fontSize:14 }}>{bookmarks.size} saved anime</p>
          {!user ? (
            <div style={{ textAlign:"center",padding:"80px 0",color:"#3f3f46" }}>
              <div style={{ fontSize:44,marginBottom:12 }}>🔒</div>
              <div style={{ fontSize:16,fontWeight:700,color:"#71717a",marginBottom:12 }}>Sign in to see your bookmarks</div>
              <button onClick={() => setShowAuth(true)} style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:11,color:"#fff",padding:"11px 24px",fontWeight:700,fontSize:14,cursor:"pointer" }}>Sign In</button>
            </div>
          ) : bookmarks.size === 0 ? (
            <div style={{ textAlign:"center",padding:"80px 0",color:"#3f3f46" }}>
              <div style={{ fontSize:44,marginBottom:12 }}>🔖</div>
              <div style={{ fontSize:16,fontWeight:700,color:"#71717a",marginBottom:6 }}>Nothing saved yet</div>
              <div style={{ fontSize:13 }}>Tap the bookmark icon on any anime card</div>
            </div>
          ) : (
            <div className="anime-grid">
              {[...rows.trending, ...rows.popular, ...rows.airing, ...rows.topRated]
                .filter((a,i,arr) => arr.findIndex(x => x.id === a.id) === i && bookmarks.has(a.id))
                .map((a,i) => (
                  <div key={a.id} style={{ animation:`fadeUp .3s ease ${i*.07}s both` }}>
                    <AnimeCard a={a} onClick={setSelAnime} bookmarked={true} onBookmark={toggleBm}/>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      <footer style={{ borderTop:"1px solid #1a1a28",padding:"28px 22px",textAlign:"center" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6 }}>
          <Logo size={18}/>
          <span style={{ fontSize:14,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#fafafa" }}>
            SHIN<OLetter size="0.9em"/>RA
          </span>
        </div>
        <div style={{ fontSize:11,color:"#27272a" }}>© 2026 Shinora · For entertainment purposes only</div>
      </footer>

      {selAnime && <AnimeModal a={selAnime} onClose={() => setSelAnime(null)} bookmarked={bookmarks.has(selAnime.id)} onBookmark={toggleBm} onWatch={goWatch}/>}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin}/>}
    </div>
  );
}

/* ════════════════════════════════════════════
   GLOBAL STYLES
════════════════════════════════════════════ */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
      html,body { overflow-x:hidden; max-width:100%; background:#0a0a0a; }
      body { font-family:'Inter','Segoe UI',sans-serif; }

      /* Scrollbars */
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:#27272a; border-radius:2px; }
      ::-webkit-scrollbar-thumb:hover { background:#7c3aed; }

      /* Horizontal row scroll */
      .row-scroll { display:flex; gap:12px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; -ms-overflow-style:none; scroll-behavior:smooth; }
      .row-scroll::-webkit-scrollbar { display:none; }

      /* Genre pills scroll */
      .genre-scroll { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; -ms-overflow-style:none; }
      .genre-scroll::-webkit-scrollbar { display:none; }

      /* Grid */
      .anime-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:16px; }

      /* Watch layout */
      .watch-layout { display:flex; gap:20px; padding:14px 22px 60px; max-width:1400px; margin:0 auto; }
      .watch-main { flex:1; min-width:0; }
      .watch-sidebar { width:295px; flex-shrink:0; position:sticky; top:76px; max-height:calc(100vh - 84px); overflow:hidden; }
      .ep-list { scrollbar-width:thin; scrollbar-color:#27272a transparent; }

      /* Nav */
      .desk-nav { display:flex; gap:2px; align-items:center; }
      .hamburger { display:none !important; }

      /* Animations */
      @keyframes fadeUp  { from{opacity:0;transform:translateY(18px);} to{opacity:1;transform:translateY(0);} }
      @keyframes heroIn  { from{opacity:0;transform:scale(1.02);}      to{opacity:1;transform:scale(1);}      }
      @keyframes modalIn { from{opacity:0;transform:translateY(12px) scale(.97);} to{opacity:1;transform:translateY(0) scale(1);} }
      @keyframes spin    { to{transform:rotate(360deg);}                           }
      @keyframes shimmer { 0%,100%{opacity:.3;} 50%{opacity:.65;}                 }

      /* Smooth everything */
      button { cursor:pointer; transition:opacity .18s, transform .18s, background .18s, color .18s, border-color .18s, box-shadow .18s; }
      button:active { transform:scale(.96); }
      a { transition:color .18s; }
      img { transition:transform .4s ease, filter .3s ease; }

      /* Mobile */
      @media(max-width:860px) {
        .anime-grid  { grid-template-columns:repeat(auto-fill,minmax(108px,1fr)) !important; gap:10px !important; }
        .hero-content { padding:0 18px 36px !important; max-width:100% !important; }
        .hero-title  { font-size:22px !important; }
        .watch-layout { flex-direction:column !important; padding:10px 14px 40px !important; }
        .watch-sidebar { width:100% !important; position:static !important; max-height:none !important; }
        .desk-nav    { display:none !important; }
        .hamburger   { display:flex !important; }
        .search-label { display:none; }
      }
    `}</style>
  );
}
