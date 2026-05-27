import { useState, useEffect, useRef, useCallback } from "react";

/*
  SHINORA  ·  Miruro-twin
  ─────────────────────────────
  Layout:  Full-screen hero → Tabbed grid (Trending/Popular/Airing/Top)
  Cards:   Hover overlay info (no always-visible text below image)
  Search:  Prominent, centered on hero
  Colors:  #0f0f0f bg · #6366f1 indigo accent · white text
*/

/* ─── Local auth ─────────────────────────── */
const LS = {
  users : ()     => JSON.parse(localStorage.getItem("sh_u") || "[]"),
  sess  : ()     => localStorage.getItem("sh_s"),
  hist  : (id)   => JSON.parse(localStorage.getItem(`sh_h_${id}`) || "{}"),
  bm    : (id)   => JSON.parse(localStorage.getItem(`sh_b_${id}`) || "[]"),
  saveU : (v)    => localStorage.setItem("sh_u", JSON.stringify(v)),
  saveS : (id)   => localStorage.setItem("sh_s", id),
  clearS: ()     => localStorage.removeItem("sh_s"),
  saveH : (id,v) => localStorage.setItem(`sh_h_${id}`, JSON.stringify(v)),
  saveB : (id,v) => localStorage.setItem(`sh_b_${id}`, JSON.stringify(v)),
};
const mkId = () => Math.random().toString(36).slice(2);

/* ─── AniList ────────────────────────────── */
const FIELDS = `id idMal title{romaji english} description(asHtml:false)
  coverImage{extraLarge large} bannerImage averageScore
  episodes status genres seasonYear nextAiringEpisode{episode}`;

const gql = async (q, v = {}) => {
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, variables: v }),
    });
    return (await r.json()).data;
  } catch { return null; }
};

const alSort = (sort, extra = "") => gql(
  `query{Page(perPage:24){media(type:ANIME,sort:${sort},isAdult:false${extra}){${FIELDS}}}}`
).then(d => d?.Page?.media || []);

const alSearch = async ({ page = 1, search = "", genre = "All" } = {}) => {
  const vars = { page, perPage: 40, isAdult: false };
  const hasS = !!search.trim();
  const hasG = genre !== "All";
  if (hasS) vars.search = search.trim();
  if (hasG) vars.genre  = genre;
  const sort = hasS ? ["SEARCH_MATCH"] : ["POPULARITY_DESC"];
  const sP   = hasS ? ",$search:String" : "";
  const gP   = hasG ? ",$genre:String"  : "";
  const sA   = hasS ? ",search:$search"  : "";
  const gA   = hasG ? ",genre:$genre"    : "";
  const d = await gql(
    `query($page:Int,$perPage:Int,$isAdult:Boolean,$sort:[MediaSort]${sP}${gP}){
      Page(page:$page,perPage:$perPage){
        pageInfo{hasNextPage currentPage}
        media(type:ANIME,sort:$sort,isAdult:$isAdult${sA}${gA}){${FIELDS}}
      }}`,
    { ...vars, sort }
  );
  return { list: d?.Page?.media||[], hasMore: d?.Page?.pageInfo?.hasNextPage||false, page: d?.Page?.pageInfo?.currentPage||page };
};

const getSkip = async (malId, ep) => {
  try {
    const d = await (await fetch(
      `https://api.aniskip.com/v2/skip-times/${malId}/${ep}?types[]=op&types[]=ed&episodeLength=0`
    )).json();
    if (!d.found) return null;
    return { op: d.results.find(x=>x.skipType==="op")?.interval||null, ed: d.results.find(x=>x.skipType==="ed")?.interval||null };
  } catch { return null; }
};

/* ─── Servers ────────────────────────────── */
const SERVERS = [
  { id:"s1", label:"Server 1", url:(a,ep,l)=>`https://megaplay.buzz/stream/ani/${a.id}/${ep}/${l}` },
  { id:"s2", label:"Server 2", url:(a,ep,l)=>`https://megaplay.buzz/stream/mal/${a.idMal}/${ep}/${l}` },
  { id:"s3", label:"Server 3", url:(a,ep)=>`https://vidsrc.to/embed/anime/${a.idMal}/${ep}` },
  { id:"s4", label:"Server 4", url:(a,ep)=>`https://vidsrc.xyz/embed/anime?id=${a.idMal}&ep=${ep}` },
];

/* ─── Helpers ────────────────────────────── */
const GENRES = ["All","Action","Adventure","Comedy","Drama","Fantasy","Horror","Mystery","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller","Psychological","Mecha"];
const t   = a  => a?.title?.english || a?.title?.romaji || "Unknown";
const img = a  => a?.coverImage?.extraLarge || a?.coverImage?.large;
const sc  = a  => a?.averageScore ? (a.averageScore/10).toFixed(1) : "—";
const eps = a  => Array.from({length:Math.min(Number(a?.episodes)||12,200)},(_,i)=>i+1);
const txt = s  => (s||"").replace(/<[^>]*>/g,"").replace(/&[a-z]+;/gi," ").trim();

/* ─── Design tokens ─────────────────────── */
const BG   = "#0f0f0f";
const S1   = "#161616";
const S2   = "#1e1e1e";
const BD   = "#2a2a2a";
const ACC  = "#6366f1";
const ACCL = "#818cf8";
const MUT  = "#a1a1aa";
const DIM  = "#52525b";
const DIMR = "#27272a";

/* ─── Icons ──────────────────────────────── */
const Ic = {
  Star  : ()=><svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>,
  Play  : ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  Search: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X     : ({s=15})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Bm    : ({on})=><svg width="13" height="13" viewBox="0 0 24 24" fill={on?"#818cf8":"none"} stroke={on?"#818cf8":"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  ChevL : ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  ChevR : ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Menu  : ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Skip  : ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="2" height="16"/></svg>,
  Info  : ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Clock : ()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};

/* ─── Logo ───────────────────────────────── */
function Logo({size=26}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#6366f1"/>
        </linearGradient>
      </defs>
      <ellipse cx="52" cy="50" rx="42" ry="42" fill="none" stroke="url(#lg)" strokeWidth="3" opacity=".6"/>
      <path d="M38 18 L62 18 L48 46 L66 46 L28 82 L42 82 L38 54 L20 54 Z" fill="url(#lg)"/>
      <line x1="22" y1="20" x2="78" y2="80" stroke="url(#lg)" strokeWidth="2.5" opacity=".4"/>
      <circle cx="22" cy="20" r="3" fill="#818cf8"/>
    </svg>
  );
}

const OGlyph = () => (
  <span style={{display:"inline-block",background:"linear-gradient(135deg,#818cf8,#6366f1)",
    color:"#fff",fontWeight:900,padding:"1px 5px",borderRadius:5,
    verticalAlign:"middle",lineHeight:1.3,position:"relative",top:"-1px"}}>O</span>
);

/* ─── Auth Modal ─────────────────────────── */
function AuthModal({onClose,onLogin}) {
  const [tab,setTab]=useState("login");
  const [name,setName]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};}, []);
  const go=()=>{
    setErr("");
    if(!name.trim()||!pw.trim()) return setErr("Fill in all fields.");
    const users=LS.users();
    if(tab==="signup"){
      if(users.find(u=>u.name===name)) return setErr("Username taken.");
      const u={id:mkId(),name,pw};LS.saveU([...users,u]);LS.saveS(u.id);onLogin(u);
    } else {
      const u=users.find(u=>u.name===name&&u.pw===pw);
      if(!u) return setErr("Wrong credentials.");
      LS.saveS(u.id);onLogin(u);
    }
  };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(20px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:S1,borderRadius:16,width:"100%",maxWidth:380,border:`1px solid ${BD}`,boxShadow:"0 24px 64px rgba(0,0,0,.9)",animation:"fadeUp .2s ease"}}>
        <div style={{display:"flex",borderBottom:`1px solid ${BD}`}}>
          {[["login","Sign In"],["signup","Sign Up"]].map(([m,l])=>(
            <button key={m} onClick={()=>{setTab(m);setErr("");}}
              style={{flex:1,background:"none",border:"none",color:tab===m?"#fff":DIM,padding:"18px 0",fontSize:14,fontWeight:700,cursor:"pointer",borderBottom:tab===m?`2px solid ${ACC}`:"2px solid transparent",transition:"color .18s"}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{padding:"26px 24px 22px"}}>
          <p style={{color:DIM,fontSize:12,marginBottom:20}}>Saved locally on your device.</p>
          {[["Username",name,setName,"text"],["Password",pw,setPw,"password"]].map(([l,v,s,tp])=>(
            <div key={l} style={{marginBottom:14}}>
              <label style={{display:"block",color:MUT,fontSize:11,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:.8}}>{l}</label>
              <input type={tp} value={v} onChange={e=>s(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}
                placeholder={l}
                style={{width:"100%",background:BG,border:`1px solid ${BD}`,borderRadius:10,color:"#fff",padding:"11px 14px",fontSize:14,outline:"none",transition:"border .18s"}}
                onFocus={e=>e.target.style.borderColor=ACC} onBlur={e=>e.target.style.borderColor=BD}/>
            </div>
          ))}
          {err&&<p style={{color:"#f87171",fontSize:12,marginBottom:12,background:"rgba(248,113,113,.07)",padding:"9px 12px",borderRadius:8}}>{err}</p>}
          <button onClick={go}
            style={{width:"100%",background:ACC,border:"none",borderRadius:10,color:"#fff",padding:"12px 0",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 20px ${ACC}44`,transition:"opacity .18s"}}
            onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            {tab==="login"?"Sign In":"Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Anime Card  (Miruro style: hover overlay) ──── */
function Card({a,onClick,bookmarked,onBm,progress=0}) {
  const [hov,setHov]=useState(false);
  const cover=img(a);
  const score=sc(a);
  const title=t(a);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={()=>onClick(a)}
      style={{cursor:"pointer",borderRadius:10,overflow:"hidden",position:"relative",
        transform:hov?"translateY(-6px) scale(1.03)":"none",
        boxShadow:hov?`0 20px 50px rgba(0,0,0,.75),0 0 0 1.5px ${ACC}66`:"0 4px 16px rgba(0,0,0,.5)",
        transition:"transform .25s cubic-bezier(.22,.68,0,1.2),box-shadow .25s ease",
        background:S1}}>

      {/* Poster */}
      <div style={{position:"relative",paddingBottom:"148%",overflow:"hidden"}}>
        {cover
          ? <img src={cover} alt={title} loading="lazy"
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",
                transform:hov?"scale(1.07)":"scale(1)",transition:"transform .4s ease"}}/>
          : <div style={{position:"absolute",inset:0,background:S2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>🎌</div>
        }

        {/* Hover overlay with info */}
        <div style={{position:"absolute",inset:0,
          background:`linear-gradient(to top,rgba(0,0,0,.96) 0%,rgba(0,0,0,.6) 55%,rgba(0,0,0,.15) 100%)`,
          opacity:hov?1:.35,transition:"opacity .25s ease"}}>
        </div>

        {/* Title overlay — slides up on hover */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 10px 10px",
          transform:hov?"translateY(0)":"translateY(8px)",opacity:hov?1:0,
          transition:"transform .25s ease,opacity .25s ease"}}>
          <p style={{color:"#fff",fontSize:12,fontWeight:700,lineHeight:1.35,marginBottom:4,
            display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
            {title}
          </p>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10}}>
            <span style={{display:"flex",alignItems:"center",gap:3,color:"#fbbf24",fontWeight:600}}><Ic.Star/>{score}</span>
            {a.seasonYear&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT}}>{a.seasonYear}</span></>}
            {a.episodes&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT}}>{a.episodes}ep</span></>}
          </div>
        </div>

        {/* Play button center */}
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          opacity:hov?1:0,transition:"opacity .2s"}}>
          <div style={{width:46,height:46,borderRadius:"50%",background:ACC,color:"#fff",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 0 28px ${ACC}88`,
            transform:hov?"scale(1)":"scale(.7)",transition:"transform .25s cubic-bezier(.22,.68,0,1.2)"}}>
            <Ic.Play s={18}/>
          </div>
        </div>

        {/* Bookmark */}
        {onBm&&<button onClick={e=>{e.stopPropagation();onBm(a.id);}}
          style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.65)",border:"none",
            cursor:"pointer",borderRadius:7,padding:"5px 6px",display:"flex",
            backdropFilter:"blur(6px)",color:bookmarked?ACCL:MUT,transition:"color .18s"}}
          onMouseEnter={e=>e.stopPropagation()} onMouseLeave={e=>e.stopPropagation()}>
          <Ic.Bm on={bookmarked}/>
        </button>}

        {/* Airing badge */}
        {a.status==="RELEASING"&&(
          <div style={{position:"absolute",top:8,left:8,background:"rgba(16,185,129,.88)",
            backdropFilter:"blur(6px)",color:"#fff",fontSize:9,fontWeight:800,
            padding:"3px 8px",borderRadius:20,textTransform:"uppercase",letterSpacing:.8}}>
            Airing
          </div>
        )}

        {/* Progress */}
        {progress>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.08)"}}>
          <div style={{height:"100%",background:ACC,width:`${Math.min(progress,100)}%`}}/>
        </div>}
      </div>
    </div>
  );
}

/* ─── Skeleton ───────────────────────────── */
function Skel() {
  return (
    <div style={{borderRadius:10,overflow:"hidden",background:S1}}>
      <div style={{paddingBottom:"148%",background:S2,animation:"shimmer 1.4s ease infinite"}}/>
    </div>
  );
}

/* ─── Anime Grid with tabs (Miruro core layout) ─── */
function AnimeGrid({tabs,bookmarks,onBm,onCard,histMap}) {
  const [activeTab,setActiveTab] = useState(0);
  const tab = tabs[activeTab];
  return (
    <div>
      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`1px solid ${BD}`,paddingBottom:0}}>
        {tabs.map((tb,i)=>(
          <button key={tb.label} onClick={()=>setActiveTab(i)}
            style={{background:"none",border:"none",cursor:"pointer",padding:"10px 18px",fontSize:14,fontWeight:600,
              color:activeTab===i?"#fff":MUT,position:"relative",transition:"color .18s",
              borderBottom:activeTab===i?`2px solid ${ACC}`:"2px solid transparent",
              marginBottom:-1}}>
            {tb.label}
          </button>
        ))}
      </div>
      {/* Grid */}
      <div className="main-grid">
        {tab.loading
          ? Array(24).fill(0).map((_,i)=><Skel key={i}/>)
          : tab.list.map(a=>{
              const prog=histMap?.[a.id]?.ep&&a.episodes?(histMap[a.id].ep/a.episodes)*100:0;
              return <Card key={a.id} a={a} onClick={onCard} bookmarked={bookmarks?.has(a.id)} onBm={onBm} progress={prog}/>;
            })
        }
      </div>
    </div>
  );
}

/* ─── Continue Watching row ──────────────── */
function ContinueRow({history,onPlay}) {
  const ref=useRef(null);
  const items=Object.values(history).sort((a,b)=>b.at-a.at).slice(0,16);
  if(!items.length) return null;
  const scroll=d=>ref.current?.scrollBy({left:d*260,behavior:"smooth"});
  return (
    <div style={{marginBottom:48}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <h2 style={{fontSize:15,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",gap:7}}><Ic.Clock/>Continue Watching</h2>
        <div style={{display:"flex",gap:6}}>
          {[[-1],[ 1]].map(([d])=>(
            <button key={d} onClick={()=>scroll(d)}
              style={{background:S1,border:`1px solid ${BD}`,color:DIM,borderRadius:8,padding:"5px 8px",cursor:"pointer",display:"flex",transition:"all .18s"}}
              onMouseEnter={e=>{e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.color=DIM;}}>
              {d===-1?<Ic.ChevL/>:<Ic.ChevR/>}
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className="row-scroll">
        {items.map(h=>{
          const cover=img(h.data);
          const prog=h.ep&&h.data?.episodes?(h.ep/h.data.episodes)*100:50;
          return (
            <div key={h.data.id} onClick={()=>onPlay(h)}
              style={{width:240,flexShrink:0,background:S1,borderRadius:10,overflow:"hidden",cursor:"pointer",border:`1px solid ${BD}`,transition:"transform .2s,border-color .18s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.borderColor=BD;}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.borderColor=BD;}}>
              <div style={{position:"relative",paddingBottom:"55%",overflow:"hidden"}}>
                {cover?<img src={cover} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.65)"}}/>
                       :<div style={{position:"absolute",inset:0,background:S2}}/>}
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 60%)"}}/>
                <div style={{position:"absolute",bottom:8,left:10,right:10,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:ACC,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic.Play s={12}/></div>
                  <div style={{minWidth:0}}>
                    <p style={{color:"#fff",fontSize:11,fontWeight:700,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t(h.data)}</p>
                    <p style={{color:MUT,fontSize:10,margin:"2px 0 0"}}>Episode {h.ep}</p>
                  </div>
                </div>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,.08)"}}>
                  <div style={{height:"100%",background:ACC,width:`${Math.min(prog,100)}%`}}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Detail Modal ───────────────────────── */
function DetailModal({a,onClose,bookmarked,onBm,onWatch}) {
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};}, []);
  const cover=img(a);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(20px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:S1,borderRadius:18,width:"100%",maxWidth:800,maxHeight:"90vh",overflowY:"auto",border:`1px solid ${BD}`,boxShadow:"0 30px 80px rgba(0,0,0,.95)",animation:"fadeUp .22s ease"}}>
        {/* Banner */}
        <div style={{position:"relative",height:220,overflow:"hidden",borderRadius:"18px 18px 0 0"}}>
          {a.bannerImage
            ? <img src={a.bannerImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover",filter:"brightness(.5)"}}/>
            : cover
              ? <img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover",filter:"blur(6px) brightness(.4)",transform:"scale(1.07)"}}/>
              : <div style={{width:"100%",height:"100%",background:S2}}/>
          }
          <div style={{position:"absolute",inset:0,background:`linear-gradient(to top,${S1} 0%,transparent 55%)`}}/>
          {cover&&<img src={cover} alt="" style={{position:"absolute",left:24,bottom:-18,height:"90%",objectFit:"contain",borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,.8)"}}/>}
          <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(0,0,0,.6)",border:`1px solid ${BD}`,color:MUT,cursor:"pointer",borderRadius:9,padding:"7px 8px",display:"flex",backdropFilter:"blur(8px)"}}>
            <Ic.X s={16}/>
          </button>
        </div>
        {/* Body */}
        <div style={{padding:"26px 24px 24px"}}>
          {a.title?.romaji&&<p style={{color:DIM,fontSize:12,marginBottom:4}}>{a.title.romaji}</p>}
          <h2 style={{fontSize:20,fontWeight:800,color:"#fff",marginBottom:12,lineHeight:1.2}}>{t(a)}</h2>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:14}}>
            <span style={{display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700,fontSize:13}}><Ic.Star/>{sc(a)}</span>
            {a.seasonYear&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT,fontSize:13}}>{a.seasonYear}</span></>}
            {a.episodes&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT,fontSize:13}}>{a.episodes} eps</span></>}
            <span style={{color:DIMR}}>·</span>
            <span style={{color:a.status==="RELEASING"?"#10b981":MUT,fontSize:13,fontWeight:600}}>{a.status==="RELEASING"?"Airing":"Done"}</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:18}}>
            {a.genres?.map(g=><span key={g} style={{background:S2,color:MUT,fontSize:11,padding:"4px 10px",borderRadius:99,border:`1px solid ${BD}`}}>{g}</span>)}
          </div>
          {a.description&&<p style={{color:MUT,fontSize:14,lineHeight:1.75,marginBottom:22}}>{txt(a.description).slice(0,380)}…</p>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={()=>{onClose();onWatch(a,1);}}
              style={{background:ACC,color:"#fff",border:"none",borderRadius:11,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:`0 6px 20px ${ACC}55`,transition:"opacity .18s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
              <Ic.Play s={16}/>Watch Now
            </button>
            <button onClick={()=>onBm(a.id)}
              style={{background:bookmarked?`${ACC}22`:"transparent",border:`1px solid ${bookmarked?ACC:BD}`,color:bookmarked?ACCL:MUT,borderRadius:11,padding:"12px 18px",fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .18s"}}>
              <Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Add to List"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Watch View ─────────────────────────── */
function WatchView({a,startEp,onBack,bookmarked,onBm,onSaveHist}) {
  const [ep,setEp]=useState(startEp);
  const [lang,setLang]=useState("sub");
  const [srv,setSrv]=useState(SERVERS[0]);
  const [autoPlay,setAutoPlay]=useState(true);
  const [autoSkip,setAutoSkip]=useState(true);
  const [skipTimes,setSkipTimes]=useState(null);
  const [localSec,setLocalSec]=useState(0);
  const [showSkip,setShowSkip]=useState(false);
  const [showEd,setShowEd]=useState(false);
  const [epGrid,setEpGrid]=useState(true);
  const [nextBanner,setNextBanner]=useState(false);
  const [cd,setCd]=useState(5);
  const ifrRef=useRef(null);timerRef=useRef(null);const countRef=useRef(null);const epRef=useRef(null);
  const epList=eps(a);const total=epList.length;const title=t(a);const cover=img(a);

  useEffect(()=>{setSkipTimes(null);setShowSkip(false);setShowEd(false);if(a.idMal)getSkip(a.idMal,ep).then(setSkipTimes);},[a.idMal,ep]);

  const startTimer=useCallback(()=>{clearInterval(timerRef.current);setLocalSec(0);timerRef.current=setInterval(()=>setLocalSec(s=>s+1),1000);},[]);
  useEffect(()=>()=>clearInterval(timerRef.current),[]);

  useEffect(()=>{if(!skipTimes)return;const{op,ed}=skipTimes;if(op)setShowSkip(localSec>=op.startTime&&localSec<=op.endTime);if(ed)setShowEd(localSec>=ed.startTime&&localSec<=ed.endTime);},[localSec,skipTimes]);
  useEffect(()=>{if(autoSkip&&showSkip)doSkip("op");},[showSkip]); // eslint-disable-line

  useEffect(()=>{
    const h=e=>{try{const d=typeof e.data==="string"?JSON.parse(e.data):e.data;if(d?.event==="complete"&&autoPlay&&ep<total){setNextBanner(true);setCd(5);countRef.current=setInterval(()=>setCd(v=>{if(v<=1){clearInterval(countRef.current);goNext();return 5;}return v-1;}),1000);}}catch{}};
    window.addEventListener("message",h);return()=>{window.removeEventListener("message",h);clearInterval(countRef.current);};
  },[autoPlay,ep,total]); // eslint-disable-line

  const doSkip=type=>{const end=type==="op"?skipTimes?.op?.endTime:skipTimes?.ed?.endTime;if(!end){setShowSkip(false);setShowEd(false);return;}try{ifrRef.current?.contentWindow?.postMessage({type:"seek",time:end},"*");}catch{}setLocalSec(end+1);setShowSkip(false);setShowEd(false);};
  const goNext=useCallback(()=>{if(ep<total){setEp(e=>e+1);setNextBanner(false);setCd(5);clearInterval(countRef.current);}},[ep,total]);

  useEffect(()=>{setShowSkip(false);setShowEd(false);setNextBanner(false);setCd(5);clearInterval(countRef.current);onSaveHist?.(a,ep);setTimeout(()=>epRef.current?.querySelector(".ep-active")?.scrollIntoView({block:"nearest",behavior:"smooth"}),100);},[ep]); // eslint-disable-line
  useEffect(()=>{window.scrollTo({top:0});},[]);

  return (
    <div style={{minHeight:"100vh",background:BG,paddingTop:64,color:"#fff"}}>
      <div style={{padding:"10px 22px",borderBottom:`1px solid ${BD}`,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack}
          style={{background:S1,border:`1px solid ${BD}`,borderRadius:8,color:MUT,cursor:"pointer",padding:"6px 12px",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600,transition:"all .18s"}}
          onMouseEnter={e=>{e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=BD;}} onMouseLeave={e=>{e.currentTarget.style.color=MUT;e.currentTarget.style.borderColor=BD;}}>
          <Ic.ChevL/>Back
        </button>
        <span style={{color:DIM,fontSize:13}}>{title}</span>
        <span style={{color:DIMR}}>·</span>
        <span style={{color:DIM,fontSize:13}}>Episode {ep}</span>
        {skipTimes?.op&&<span style={{marginLeft:"auto",background:`${ACC}18`,border:`1px solid ${ACC}44`,color:ACCL,fontSize:10,padding:"3px 9px",borderRadius:99,fontWeight:600}}>Skip times loaded</span>}
      </div>

      <div className="watch-layout">
        <div className="watch-main">
          {/* Player */}
          <div style={{position:"relative",width:"100%",aspectRatio:"16/9",background:"#000",borderRadius:12,overflow:"hidden",boxShadow:"0 10px 60px rgba(0,0,0,.9)"}}>
            <iframe ref={ifrRef} key={`${a.id}-${ep}-${lang}-${srv.id}`}
              src={srv.url(a,ep,lang)} title={`${title} Ep ${ep}`}
              allowFullScreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              onLoad={startTimer}
              style={{width:"100%",height:"100%",border:"none",display:"block"}}/>
            {showSkip&&!autoSkip&&<button onClick={()=>doSkip("op")} style={{position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.9)",backdropFilter:"blur(12px)",border:`1px solid ${ACC}88`,color:"#fff",borderRadius:9,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .22s ease"}}><Ic.Skip/>Skip Intro</button>}
            {showEd&&<button onClick={()=>doSkip("ed")} style={{position:"absolute",bottom:70,right:16,background:"rgba(0,0,0,.9)",backdropFilter:"blur(12px)",border:`1px solid ${ACC}88`,color:"#fff",borderRadius:9,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,animation:"fadeUp .22s ease"}}><Ic.Skip/>Skip Outro</button>}
            {nextBanner&&ep<total&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.96),rgba(0,0,0,.65))",padding:"20px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div><p style={{color:MUT,fontSize:12,margin:"0 0 2px"}}>Up Next</p><p style={{color:"#fff",fontWeight:700,fontSize:15,margin:0}}>Episode {ep+1}</p></div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setNextBanner(false);clearInterval(countRef.current);}} style={{background:S1,border:`1px solid ${BD}`,color:MUT,borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>Cancel</button>
                <button onClick={goNext} style={{background:ACC,border:"none",color:"#fff",borderRadius:9,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}><Ic.Play s={14}/>Play ({cd}s)</button>
              </div>
            </div>}
          </div>

          {/* Servers */}
          <div style={{marginTop:14,background:S1,borderRadius:12,border:`1px solid ${BD}`,padding:"13px 16px"}}>
            <p style={{color:DIM,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,margin:"0 0 10px"}}>Servers</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {SERVERS.map(s=>(
                <button key={s.id} onClick={()=>setSrv(s)}
                  style={{background:srv.id===s.id?ACC:S2,border:`1px solid ${srv.id===s.id?"transparent":BD}`,color:srv.id===s.id?"#fff":MUT,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .18s"}}>
                  {s.label}
                </button>
              ))}
            </div>
            <p style={{marginTop:8,fontSize:11,color:DIMR}}>Not loading? Try another server.</p>
          </div>

          {/* Controls */}
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
            <button onClick={()=>ep>1&&setEp(e=>e-1)} disabled={ep<=1}
              style={{flex:1,minWidth:90,background:ep<=1?BG:S1,border:`1px solid ${BD}`,borderRadius:9,color:ep<=1?DIMR:MUT,padding:"10px 0",cursor:ep<=1?"default":"pointer",fontSize:13,fontWeight:600,transition:"all .18s"}}>
              ← Prev
            </button>
            <button onClick={()=>ep<total&&setEp(e=>e+1)} disabled={ep>=total}
              style={{flex:1,minWidth:90,background:ep>=total?BG:S1,border:`1px solid ${BD}`,borderRadius:9,color:ep>=total?DIMR:MUT,padding:"10px 0",cursor:ep>=total?"default":"pointer",fontSize:13,fontWeight:600,transition:"all .18s"}}>
              Next →
            </button>
            <div style={{display:"flex",background:S1,border:`1px solid ${BD}`,borderRadius:9,overflow:"hidden"}}>
              {["sub","dub"].map(l=>(
                <button key={l} onClick={()=>setLang(l)}
                  style={{background:lang===l?ACC:"transparent",border:"none",color:lang===l?"#fff":MUT,padding:"10px 16px",cursor:"pointer",fontSize:12,fontWeight:700,textTransform:"uppercase",transition:"all .18s"}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
            {[["Auto Play",autoPlay,setAutoPlay],["Auto Skip Intro",autoSkip,setAutoSkip]].map(([l,v,s])=>(
              <button key={l} onClick={()=>s(x=>!x)}
                style={{display:"flex",alignItems:"center",gap:8,background:S1,border:`1px solid ${BD}`,borderRadius:9,color:v?ACCL:MUT,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .18s"}}>
                <div style={{width:30,height:17,borderRadius:9,background:v?ACC:S2,position:"relative",flexShrink:0,transition:"background .18s"}}>
                  <div style={{position:"absolute",top:2.5,left:v?15:2.5,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .22s cubic-bezier(.22,.68,0,1.2)",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}}/>
                </div>{l}
              </button>
            ))}
          </div>

          {/* Info */}
          <div style={{marginTop:14,background:S1,borderRadius:12,border:`1px solid ${BD}`,padding:18}}>
            <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              {cover&&<img src={cover} alt="" style={{width:66,height:94,objectFit:"cover",borderRadius:9,flexShrink:0}}/>}
              <div style={{flex:1,minWidth:0}}>
                <p style={{color:"#fff",fontSize:16,fontWeight:800,marginBottom:8,lineHeight:1.2}}>{title}</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:9}}>
                  {a.genres?.slice(0,4).map(g=><span key={g} style={{background:S2,color:MUT,fontSize:10,padding:"3px 9px",borderRadius:99,border:`1px solid ${BD}`}}>{g}</span>)}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",fontSize:12}}>
                  <span style={{display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700}}><Ic.Star/>{sc(a)}</span>
                  {a.seasonYear&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT}}>{a.seasonYear}</span></>}
                  <span style={{color:DIMR}}>·</span>
                  <span style={{color:a.status==="RELEASING"?"#10b981":MUT,fontWeight:600}}>{a.status==="RELEASING"?"Airing":"Done"}</span>
                </div>
                <button onClick={()=>onBm(a.id)}
                  style={{marginTop:10,background:bookmarked?`${ACC}22`:"transparent",border:`1px solid ${bookmarked?ACC:BD}`,color:bookmarked?ACCL:MUT,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6,transition:"all .18s"}}>
                  <Ic.Bm on={bookmarked}/>{bookmarked?"Saved":"Save"}
                </button>
              </div>
            </div>
            {a.description&&<p style={{color:DIM,fontSize:13,lineHeight:1.75,marginTop:14}}>{txt(a.description).slice(0,280)}…</p>}
          </div>
        </div>

        {/* Episode list */}
        <div className="watch-sidebar" ref={epRef}>
          <div style={{background:S1,borderRadius:12,border:`1px solid ${BD}`,overflow:"hidden"}}>
            <div style={{padding:"13px 14px",borderBottom:`1px solid ${BD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p style={{fontSize:13,fontWeight:700,color:"#fff",margin:0}}>Episodes <span style={{color:DIM,fontWeight:400}}>({total})</span></p>
              <button onClick={()=>setEpGrid(v=>!v)}
                style={{background:S2,border:`1px solid ${BD}`,color:MUT,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,transition:"all .18s"}}>
                {epGrid?"List":"Grid"}
              </button>
            </div>
            <div style={{maxHeight:460,overflowY:"auto",padding:8}}>
              {epGrid?(
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5}}>
                  {epList.map(n=>(
                    <button key={n} className={ep===n?"ep-active":""} onClick={()=>setEp(n)}
                      style={{background:ep===n?ACC:S2,border:`1px solid ${ep===n?"transparent":BD}`,color:ep===n?"#fff":MUT,borderRadius:8,padding:"8px 4px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .15s"}}>
                      {n}
                    </button>
                  ))}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {epList.map(n=>(
                    <button key={n} className={ep===n?"ep-active":""} onClick={()=>setEp(n)}
                      style={{background:ep===n?`${ACC}18`:"transparent",border:`1px solid ${ep===n?`${ACC}44`:"transparent"}`,color:ep===n?ACCL:MUT,borderRadius:9,padding:"9px 12px",cursor:"pointer",fontSize:13,fontWeight:ep===n?700:400,textAlign:"left",width:"100%",display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}>
                      <span style={{width:28,height:28,borderRadius:7,flexShrink:0,background:ep===n?ACC:S2,color:ep===n?"#fff":DIM,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{n}</span>
                      Episode {n}
                      <span style={{marginLeft:"auto",color:DIMR,fontSize:11}}>24m</span>
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

/* ─── Spotlight / Hero ───────────────────── */
function Spotlight({items,onWatch,onInfo}) {
  const [idx,setIdx]=useState(0);
  useEffect(()=>{
    if(!items.length) return;
    const id=setInterval(()=>setIdx(i=>(i+1)%Math.min(6,items.length)),7000);
    return()=>clearInterval(id);
  },[items.length]);
  const a=items[idx];
  if(!a) return <div style={{height:"68vh",minHeight:440,background:S1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14}}><Logo size={52}/><div style={{width:32,height:32,border:`3px solid ${BD}`,borderTop:`3px solid ${ACC}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/></div>;

  const cover=img(a);
  return (
    <div style={{position:"relative",height:"68vh",minHeight:440,overflow:"hidden"}}>
      <div key={idx} style={{position:"absolute",inset:0,animation:"heroIn .75s ease"}}>
        {a.bannerImage
          ? <img src={a.bannerImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : cover
            ? <img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover",filter:"blur(6px)",transform:"scale(1.06)"}}/>
            : <div style={{width:"100%",height:"100%",background:S2}}/>
        }
        <div style={{position:"absolute",inset:0,background:`linear-gradient(to right,rgba(15,15,15,.98) 18%,rgba(15,15,15,.65) 55%,rgba(15,15,15,.08) 100%)`}}/>
        <div style={{position:"absolute",inset:0,background:`linear-gradient(to top,${BG} 0%,transparent 50%)`}}/>
      </div>

      <div className="hero-content" style={{position:"relative",zIndex:2,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 52px 60px",maxWidth:640,animation:"fadeUp .6s ease"}}>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          {a.status==="RELEASING"&&<span style={{background:`${ACC}22`,border:`1px solid ${ACC}44`,color:ACCL,fontSize:11,padding:"4px 12px",borderRadius:99,fontWeight:600}}>Airing</span>}
          {a.genres?.slice(0,2).map(g=><span key={g} style={{background:"rgba(255,255,255,.08)",color:MUT,fontSize:11,padding:"4px 12px",borderRadius:99}}>{g}</span>)}
        </div>
        <h1 className="hero-title" style={{fontSize:40,fontWeight:900,lineHeight:1.06,marginBottom:10,color:"#fff"}}>{t(a)}</h1>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:13}}>
          <span style={{display:"flex",alignItems:"center",gap:4,color:"#fbbf24",fontWeight:700}}><Ic.Star s={12}/>{sc(a)}</span>
          {a.seasonYear&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT}}>{a.seasonYear}</span></>}
          {a.episodes&&<><span style={{color:DIMR}}>·</span><span style={{color:MUT}}>{a.episodes} episodes</span></>}
        </div>
        {a.description&&<p style={{color:MUT,fontSize:13,lineHeight:1.75,marginBottom:24,maxWidth:400}}>{txt(a.description).slice(0,160)}…</p>}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button onClick={()=>onWatch(a,1)}
            style={{background:ACC,color:"#fff",border:"none",borderRadius:11,padding:"12px 26px",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:8,boxShadow:`0 8px 28px ${ACC}55`,transition:"opacity .18s"}}
            onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <Ic.Play s={16}/>Watch Now
          </button>
          <button onClick={()=>onInfo(a)}
            style={{background:"rgba(255,255,255,.08)",color:"#e4e4e7",border:"1px solid rgba(255,255,255,.12)",borderRadius:11,padding:"12px 20px",fontWeight:600,fontSize:14,cursor:"pointer",backdropFilter:"blur(10px)",transition:"background .18s",display:"flex",alignItems:"center",gap:7}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.14)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.08)"}>
            <Ic.Info/>More Info
          </button>
        </div>
      </div>

      {/* Dots */}
      <div style={{position:"absolute",bottom:20,left:52,display:"flex",gap:7,zIndex:2}}>
        {items.slice(0,6).map((_,i)=>(
          <button key={i} onClick={()=>setIdx(i)}
            style={{width:i===idx?20:5,height:5,borderRadius:3,background:i===idx?ACC:"rgba(255,255,255,.22)",border:"none",cursor:"pointer",transition:"all .3s cubic-bezier(.22,.68,0,1.2)",padding:0}}/>
        ))}
      </div>
    </div>
  );
}

/* ─── Navbar ─────────────────────────────── */
function Navbar({page,setPage,searchQ,onSearch,user,onAuthOpen,onLogout,mobileOpen,setMobileOpen}) {
  const [profOpen,setProfOpen]=useState(false);
  const [srchOpen,setSrchOpen]=useState(false);
  const links=[["home","Home"],["browse","Browse"],["schedule","Schedule"],["bookmarks","Bookmarks"]];

  return (
    <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,background:"rgba(15,15,15,.92)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:`1px solid ${BD}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:64,gap:16}}>

      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,cursor:"pointer"}} onClick={()=>setPage("home")}>
        <Logo size={26}/>
        <span style={{fontSize:15,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#fff"}}>SHIN<OGlyph/>RA</span>
      </div>

      <div className="desk-nav">
        {links.map(([id,label])=>(
          <button key={id} onClick={()=>setPage(id)}
            style={{background:"none",border:"none",cursor:"pointer",padding:"6px 14px",borderRadius:8,fontSize:13,fontWeight:page===id?700:400,color:page===id?"#fff":MUT,position:"relative",transition:"color .18s"}}>
            {label}
            {page===id&&<div style={{position:"absolute",bottom:-1,left:"50%",transform:"translateX(-50%)",width:16,height:2,borderRadius:2,background:ACC}}/>}
          </button>
        ))}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        {srchOpen?(
          <div style={{display:"flex",alignItems:"center",background:S1,borderRadius:10,padding:"7px 12px",gap:7,border:`1px solid ${ACC}`}}>
            <Ic.Search/>
            <input autoFocus value={searchQ} onChange={e=>onSearch(e.target.value)}
              placeholder="Search anime..."
              style={{background:"none",border:"none",outline:"none",color:"#fff",fontSize:13,width:160}}/>
            <button onClick={()=>{setSrchOpen(false);onSearch("");}} style={{background:"none",border:"none",cursor:"pointer",color:DIM,display:"flex"}}><Ic.X s={14}/></button>
          </div>
        ):(
          <button onClick={()=>setSrchOpen(true)}
            style={{background:S1,border:`1px solid ${BD}`,borderRadius:9,color:MUT,padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all .18s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=BD;e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=BD;e.currentTarget.style.color=MUT;}}>
            <Ic.Search/><span className="search-label" style={{fontSize:13}}>Search</span>
          </button>
        )}

        {user?(
          <div style={{position:"relative"}}>
            <button onClick={()=>setProfOpen(v=>!v)}
              style={{display:"flex",alignItems:"center",gap:7,background:S1,border:`1px solid ${BD}`,borderRadius:9,padding:"5px 10px 5px 5px",cursor:"pointer",transition:"border .18s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=BD} onMouseLeave={e=>e.currentTarget.style.borderColor=BD}>
              <div style={{width:26,height:26,borderRadius:"50%",background:ACC,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff"}}>{user.name[0].toUpperCase()}</div>
              <span style={{color:"#e4e4e7",fontSize:13,fontWeight:600}}>{user.name}</span>
            </button>
            {profOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:S1,border:`1px solid ${BD}`,borderRadius:12,minWidth:170,padding:6,boxShadow:"0 16px 50px rgba(0,0,0,.95)",animation:"fadeUp .18s ease",zIndex:200}}>
                <div style={{padding:"10px 12px",borderBottom:`1px solid ${BD}`,marginBottom:4}}>
                  <p style={{color:"#fff",fontSize:13,fontWeight:700,margin:0}}>{user.name}</p>
                  <p style={{color:DIM,fontSize:11,margin:"2px 0 0"}}>Local Account</p>
                </div>
                <button onClick={()=>{setPage("bookmarks");setProfOpen(false);}} style={{width:"100%",background:"none",border:"none",color:MUT,padding:"9px 12px",cursor:"pointer",fontSize:13,textAlign:"left",borderRadius:8,transition:"color .18s"}} onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color=MUT}>🔖 Bookmarks</button>
                <button onClick={()=>{LS.clearS();onLogout();setProfOpen(false);}} style={{width:"100%",background:"none",border:"none",color:"#f87171",padding:"9px 12px",cursor:"pointer",fontSize:13,textAlign:"left",borderRadius:8}}>🚪 Sign Out</button>
              </div>
            )}
          </div>
        ):(
          <button onClick={onAuthOpen}
            style={{background:ACC,border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:700,boxShadow:`0 4px 14px ${ACC}44`,transition:"opacity .18s"}}
            onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            Sign In
          </button>
        )}

        <button className="hamburger" onClick={()=>setMobileOpen(v=>!v)} style={{background:"none",border:"none",color:MUT,cursor:"pointer",padding:4,display:"flex"}}><Ic.Menu/></button>
      </div>
    </nav>
  );
}

/* ─── Schedule ───────────────────────────── */
const SCHED=[{day:"Mon",shows:["One Piece","Bleach"]},{day:"Tue",shows:["Jujutsu Kaisen"]},{day:"Wed",shows:["Blue Lock","Solo Leveling"]},{day:"Thu",shows:["Frieren"]},{day:"Fri",shows:["Demon Slayer"]},{day:"Sat",shows:["Attack on Titan"]},{day:"Sun",shows:["Naruto","Dragon Ball Super"]}];

/* ═══════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════ */
let timerRef = { current: null }; // hoisted ref for WatchView

export default function App() {
  const [user,setUser]         = useState(null);
  const [history,setHistory]   = useState({});
  const [bookmarks,setBm]      = useState(new Set());
  const [showAuth,setShowAuth] = useState(false);
  const [page,setPage]         = useState("home");
  const [searchQ,setSearchQ]   = useState("");
  const [genre,setGenre]       = useState("All");

  /* Tab data for AnimeGrid */
  const [tabs,setTabs] = useState([
    {label:"Trending",    list:[], loading:true},
    {label:"Popular",     list:[], loading:true},
    {label:"Airing Now",  list:[], loading:true},
    {label:"Top Rated",   list:[], loading:true},
  ]);

  /* Browse */
  const [browseList,setBrowseList] = useState([]);
  const [browseMore,setBrowseMore] = useState(false);
  const [browsePg,setBrowsePg]     = useState(1);
  const [browseLoad,setBrowseLoad] = useState(false);
  const [moreLoad,setMoreLoad]     = useState(false);

  const [selAnime,setSelAnime]     = useState(null);
  const [watchAnime,setWatchAnime] = useState(null);
  const [watchEp,setWatchEp]       = useState(1);
  const [mobileOpen,setMobileOpen] = useState(false);
  const searchTimer = useRef(null);

  /* Auth */
  useEffect(()=>{
    const sid=LS.sess();if(!sid)return;
    const u=LS.users().find(u=>u.id===sid);
    if(u){setUser(u);setHistory(LS.hist(u.id));setBm(new Set(LS.bm(u.id)));}
  },[]);
  const login  = u => {setUser(u);setHistory(LS.hist(u.id));setBm(new Set(LS.bm(u.id)));setShowAuth(false);};
  const logout = () => {setUser(null);setHistory({});setBm(new Set());};
  const toggleBm = id => setBm(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);if(user)LS.saveB(user.id,[...n]);return n;});
  const saveHist = (anime,ep) => {if(!user)return;const next={...history,[anime.id]:{data:anime,ep,at:Date.now()}};setHistory(next);LS.saveH(user.id,next);};

  /* Load home tab data */
  useEffect(()=>{
    const loaders = [
      alSort("TRENDING_DESC"),
      alSort("POPULARITY_DESC"),
      alSort("POPULARITY_DESC",",status:RELEASING"),
      alSort("SCORE_DESC"),
    ];
    loaders.forEach((p,i)=>{
      p.then(list=>{
        setTabs(prev=>{const next=[...prev];next[i]={...next[i],list,loading:false};return next;});
      });
    });
  },[]);

  /* Browse + search */
  const loadBrowse=useCallback(async({page=1,q="",g="All",append=false}={})=>{
    try{const res=await alSearch({page,search:q,genre:g});setBrowseList(prev=>append?[...prev,...res.list]:res.list);setBrowseMore(res.hasMore);setBrowsePg(res.page);}catch(e){console.error(e);}
  },[]);

  useEffect(()=>{
    if(!searchQ.trim())return;
    setPage("browse");
    clearTimeout(searchTimer.current);
    searchTimer.current=setTimeout(()=>{setBrowseLoad(true);loadBrowse({page:1,q:searchQ,g:genre}).finally(()=>setBrowseLoad(false));},500);
    return()=>clearTimeout(searchTimer.current);
  },[searchQ]); // eslint-disable-line

  useEffect(()=>{
    if(page!=="browse")return;
    setBrowseLoad(true);loadBrowse({page:1,q:searchQ,g:genre}).finally(()=>setBrowseLoad(false));
  },[genre]); // eslint-disable-line

  useEffect(()=>{
    if(page==="browse"&&browseList.length===0&&!browseLoad&&!searchQ.trim()){
      setBrowseLoad(true);loadBrowse({page:1}).finally(()=>setBrowseLoad(false));
    }
  },[page]); // eslint-disable-line

  const goWatch=(a,ep=1)=>{setWatchAnime(a);setWatchEp(ep);setSelAnime(null);window.scrollTo({top:0});};

  /* Watch view */
  if(watchAnime) return (
    <div style={{background:BG,minHeight:"100vh",color:"#fff"}}>
      <GlobalStyles/>
      <Navbar page={page} setPage={p=>{setPage(p);setWatchAnime(null);}} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={()=>setShowAuth(true)} onLogout={logout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <WatchView a={watchAnime} startEp={watchEp} onBack={()=>setWatchAnime(null)} bookmarked={bookmarks.has(watchAnime.id)} onBm={toggleBm} onSaveHist={saveHist}/>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={login}/>}
    </div>
  );

  const allLoaded=tabs[0].list; // for bookmarks

  return (
    <div style={{minHeight:"100vh",background:BG,color:"#fff",overflowX:"hidden"}}>
      <GlobalStyles/>
      <Navbar page={page} setPage={setPage} searchQ={searchQ} onSearch={setSearchQ} user={user} onAuthOpen={()=>setShowAuth(true)} onLogout={logout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>

      {/* Mobile menu */}
      {mobileOpen&&(
        <div style={{position:"fixed",top:64,left:0,right:0,zIndex:90,background:S1,borderBottom:`1px solid ${BD}`,padding:"10px 16px",display:"flex",flexDirection:"column",gap:3}}>
          {[["home","Home"],["browse","Browse"],["schedule","Schedule"],["bookmarks","Bookmarks"]].map(([id,l])=>(
            <button key={id} onClick={()=>{setPage(id);setMobileOpen(false);}}
              style={{background:page===id?`${ACC}22`:"transparent",border:"none",color:page===id?ACCL:MUT,padding:"11px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:600,textAlign:"left"}}>
              {l}
            </button>
          ))}
          {!user&&<button onClick={()=>{setShowAuth(true);setMobileOpen(false);}} style={{background:ACC,border:"none",color:"#fff",padding:"12px 14px",borderRadius:10,cursor:"pointer",fontSize:15,fontWeight:700,textAlign:"left",marginTop:4}}>Sign In / Create Account</button>}
        </div>
      )}

      {/* ── HOME ── */}
      {page==="home"&&(
        <>
          <Spotlight items={tabs[0].list} onWatch={goWatch} onInfo={setSelAnime}/>
          <div style={{padding:"40px 24px 60px",maxWidth:1400,margin:"0 auto"}}>
            {user&&Object.keys(history).length>0&&<ContinueRow history={history} onPlay={h=>goWatch(h.data,h.ep)}/>}
            {!user&&(
              <div style={{marginBottom:44,background:`${ACC}0f`,border:`1px solid ${ACC}30`,borderRadius:14,padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <p style={{color:"#e4e4e7",fontWeight:700,fontSize:14,margin:"0 0 4px"}}>Track your anime</p>
                  <p style={{color:MUT,fontSize:13,margin:0}}>Sign in to save watch history.</p>
                </div>
                <button onClick={()=>setShowAuth(true)} style={{background:ACC,border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:`0 4px 14px ${ACC}44`}}>Sign In</button>
              </div>
            )}
            {/* Tabbed grid — this is the Miruro-style core layout */}
            <AnimeGrid tabs={tabs} bookmarks={bookmarks} onBm={toggleBm} onCard={setSelAnime} histMap={history}/>
          </div>
        </>
      )}

      {/* ── BROWSE ── */}
      {page==="browse"&&(
        <div style={{padding:"84px 24px 60px",maxWidth:1400,margin:"0 auto",animation:"fadeUp .35s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
            <h2 style={{fontSize:22,fontWeight:800,color:"#fff"}}>{searchQ?`"${searchQ}"`:genre!=="All"?genre:"Browse Anime"}</h2>
            <span style={{color:DIM,fontSize:13}}>{browseList.length} results</span>
          </div>
          {/* Genre filter pills */}
          <div className="genre-scroll" style={{marginBottom:28}}>
            {GENRES.map(g=>(
              <button key={g} onClick={()=>setGenre(g)}
                style={{background:genre===g?ACC:"transparent",color:genre===g?"#fff":MUT,border:`1px solid ${genre===g?"transparent":BD}`,borderRadius:99,padding:"7px 18px",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .18s",boxShadow:genre===g?`0 4px 14px ${ACC}33`:"none"}}>
                {g}
              </button>
            ))}
          </div>
          {browseLoad?(
            <div style={{display:"flex",justifyContent:"center",padding:"60px 0"}}>
              <div style={{width:34,height:34,border:`3px solid ${BD}`,borderTop:`3px solid ${ACC}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
            </div>
          ):(
            <>
              <div className="main-grid">
                {browseList.map((a,i)=>(
                  <div key={a.id} style={{animation:`fadeUp .28s ease ${Math.min(i*.04,.5)}s both`}}>
                    <Card a={a} onClick={setSelAnime} bookmarked={bookmarks.has(a.id)} onBm={toggleBm}/>
                  </div>
                ))}
              </div>
              {browseList.length===0&&<div style={{textAlign:"center",padding:"80px 0",color:DIMR}}><p style={{fontSize:36,margin:"0 0 12px"}}>🔍</p><p style={{fontSize:16,fontWeight:700,color:DIM}}>No results</p></div>}
              {browseMore&&browseList.length>0&&(
                <div style={{textAlign:"center",marginTop:32}}>
                  <button onClick={async()=>{setMoreLoad(true);await loadBrowse({page:browsePg+1,q:searchQ,g:genre,append:true});setMoreLoad(false);}} disabled={moreLoad}
                    style={{background:moreLoad?S1:ACC,color:"#fff",border:moreLoad?`1px solid ${BD}`:"none",borderRadius:12,padding:"12px 38px",fontSize:14,fontWeight:700,cursor:moreLoad?"default":"pointer",opacity:moreLoad?.7:1,boxShadow:moreLoad?"none":`0 6px 20px ${ACC}44`}}>
                    {moreLoad?"Loading…":"Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SCHEDULE ── */}
      {page==="schedule"&&(
        <div style={{padding:"84px 24px 60px",maxWidth:1200,margin:"0 auto",animation:"fadeUp .35s ease"}}>
          <h2 style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:6}}>Airing Schedule</h2>
          <p style={{color:MUT,marginBottom:28,fontSize:14}}>Weekly release calendar</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
            {SCHED.map(({day,shows})=>(
              <div key={day} style={{background:S1,borderRadius:14,padding:18,border:`1px solid ${BD}`}}>
                <p style={{color:ACCL,fontWeight:800,fontSize:15,margin:"0 0 14px"}}>{day}</p>
                {shows.map(s=>(
                  <div key={s} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid ${BG}`,color:MUT,fontSize:13}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:ACC,flexShrink:0}}/>{s}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BOOKMARKS ── */}
      {page==="bookmarks"&&(
        <div style={{padding:"84px 24px 60px",maxWidth:1400,margin:"0 auto",animation:"fadeUp .35s ease"}}>
          <h2 style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:6}}>My List</h2>
          <p style={{color:MUT,marginBottom:28,fontSize:14}}>{bookmarks.size} saved anime</p>
          {!user?(
            <div style={{textAlign:"center",padding:"80px 0"}}>
              <p style={{fontSize:44,margin:"0 0 12px"}}>🔒</p>
              <p style={{fontSize:16,fontWeight:700,color:MUT,margin:"0 0 14px"}}>Sign in to see your bookmarks</p>
              <button onClick={()=>setShowAuth(true)} style={{background:ACC,border:"none",borderRadius:11,color:"#fff",padding:"11px 24px",fontWeight:700,fontSize:14,cursor:"pointer"}}>Sign In</button>
            </div>
          ):bookmarks.size===0?(
            <div style={{textAlign:"center",padding:"80px 0"}}>
              <p style={{fontSize:44,margin:"0 0 12px"}}>🔖</p>
              <p style={{fontSize:16,fontWeight:700,color:MUT,margin:"0 0 6px"}}>Nothing saved yet</p>
              <p style={{fontSize:13,color:DIM}}>Click the bookmark icon on any card</p>
            </div>
          ):(
            <div className="main-grid">
              {[...tabs.flatMap(tb=>tb.list)]
                .filter((a,i,arr)=>arr.findIndex(x=>x.id===a.id)===i&&bookmarks.has(a.id))
                .map((a,i)=>(
                  <div key={a.id} style={{animation:`fadeUp .28s ease ${i*.07}s both`}}>
                    <Card a={a} onClick={setSelAnime} bookmarked={true} onBm={toggleBm}/>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <footer style={{borderTop:`1px solid ${BD}`,padding:"26px 24px",textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
          <Logo size={18}/>
          <span style={{fontSize:13,fontWeight:900,letterSpacing:2,textTransform:"uppercase",color:"#fff"}}>SHIN<OGlyph/>RA</span>
        </div>
        <p style={{fontSize:11,color:DIMR,margin:0}}>© 2026 Shinora · For entertainment purposes only</p>
      </footer>

      {selAnime&&<DetailModal a={selAnime} onClose={()=>setSelAnime(null)} bookmarked={bookmarks.has(selAnime.id)} onBm={toggleBm} onWatch={goWatch}/>}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={login}/>}
    </div>
  );
}

/* ─── Global Styles ──────────────────────── */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      html,body{overflow-x:hidden;background:#0f0f0f;}
      body{font-family:'Inter','Segoe UI',sans-serif;color:#fff;}
      ::-webkit-scrollbar{width:4px;height:4px;}
      ::-webkit-scrollbar-track{background:transparent;}
      ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px;}
      ::-webkit-scrollbar-thumb:hover{background:#6366f1;}
      .row-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth;}
      .row-scroll::-webkit-scrollbar{display:none;}
      .genre-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
      .genre-scroll::-webkit-scrollbar{display:none;}
      .main-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;}
      .watch-layout{display:flex;gap:20px;padding:14px 24px 60px;max-width:1400px;margin:0 auto;}
      .watch-main{flex:1;min-width:0;}
      .watch-sidebar{width:295px;flex-shrink:0;position:sticky;top:76px;max-height:calc(100vh - 84px);overflow:hidden;}
      .desk-nav{display:flex;gap:2px;align-items:center;}
      .hamburger{display:none !important;}
      @keyframes fadeUp {from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
      @keyframes heroIn {from{opacity:0;transform:scale(1.02);}to{opacity:1;transform:scale(1);}}
      @keyframes spin   {to{transform:rotate(360deg);}}
      @keyframes shimmer{0%,100%{opacity:.3;}50%{opacity:.65;}}
      button{cursor:pointer;transition:opacity .18s,transform .15s,background .18s,color .18s,border-color .18s;}
      button:active{transform:scale(.96);}
      img{transition:transform .4s ease;}
      @media(max-width:860px){
        .main-grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr)) !important;gap:10px !important;}
        .hero-content{padding:0 18px 36px !important;max-width:100% !important;}
        .hero-title{font-size:22px !important;}
        .watch-layout{flex-direction:column !important;padding:10px 14px 40px !important;}
        .watch-sidebar{width:100% !important;position:static !important;max-height:none !important;}
        .desk-nav{display:none !important;}
        .hamburger{display:flex !important;}
        .search-label{display:none;}
      }
    `}</style>
  );
}
