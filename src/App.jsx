import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════
   CONFIG
   AniList IDs are used for both data + megaplay embed URLs
   Embed format: https://megaplay.buzz/stream/ani/{anilistId}/{ep}/{lang}
═══════════════════════════════════════════════════════════ */
const ANILIST_IDS = [101922, 113415, 16498, 21, 154587, 127230, 98478, 170942];

const ANILIST_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 20) {
    media(id_in: $ids, type: ANIME, sort: POPULARITY_DESC) {
      id
      idMal
      title { romaji english }
      description(asHtml: false)
      episodes
      status
      genres
      coverImage { extraLarge large }
      bannerImage
      averageScore
      seasonYear
      nextAiringEpisode { episode }
    }
  }
}`;

const getEmbedUrl = (anilistId, ep, lang) =>
  `https://megaplay.buzz/stream/ani/${anilistId}/${ep}/${lang}`;

const SCHEDULE = [
  { day: "Mon", shows: ["Demon Slayer", "One Piece"] },
  { day: "Tue", shows: ["Jujutsu Kaisen"] },
  { day: "Wed", shows: ["Solo Leveling", "Chainsaw Man"] },
  { day: "Thu", shows: ["Vinland Saga"] },
  { day: "Fri", shows: ["Frieren"] },
  { day: "Sat", shows: ["Attack on Titan"] },
  { day: "Sun", shows: ["One Piece", "Demon Slayer"] },
];

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const stripHtml = (s = "") => s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();

const getEps = (anime) => {
  const total = anime.episodes || anime.nextAiringEpisode?.episode - 1 || 12;
  return Array.from({ length: Math.min(total, 100) }, (_, i) => i + 1);
};

/* ═══════════════════════════════════════════════════════════
   ICONS
═══════════════════════════════════════════════════════════ */
const Ic = {
  Star: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" /></svg>,
  Play: ({ s = 24 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>,
  Search: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  X: ({ s = 18 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  Bm: ({ on }) => <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>,
  ChevL: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>,
  Menu: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  Skip: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20" /><rect x="17" y="4" width="2" height="16" /></svg>,
  Settings: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  Logout: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
};

/* ═══════════════════════════════════════════════════════════
   ANIME CARD
═══════════════════════════════════════════════════════════ */
function AnimeCard({ anime, onClick, bookmarked, onBookmark }) {
  const [hov, setHov] = useState(false);
  const title = anime.title.english || anime.title.romaji;
  const img = anime.coverImage?.extraLarge || anime.coverImage?.large;

  return (
    <div
      onClick={() => onClick(anime)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative", cursor: "pointer", borderRadius: 10, overflow: "hidden",
        background: "#0d1421", flexShrink: 0,
        transform: hov ? "translateY(-5px) scale(1.02)" : "none",
        boxShadow: hov ? "0 20px 50px rgba(0,0,0,0.7)" : "0 4px 18px rgba(0,0,0,0.4)",
        transition: "transform .24s ease, box-shadow .24s ease",
      }}>
      <div style={{ position: "relative", paddingBottom: "145%", overflow: "hidden" }}>
        {img ? (
          <img src={img} alt={title} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            transform: hov ? "scale(1.06)" : "scale(1)", transition: "transform .4s ease",
          }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#111927", display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", fontSize: 32 }}>🎌</div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(7,11,18,1) 0%, rgba(7,11,18,.4) 55%, transparent 100%)" }} />

        {/* Status */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: anime.status === "RELEASING" ? "#059669" : "#374151",
          color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 7px",
          borderRadius: 20, textTransform: "uppercase", letterSpacing: .8,
        }}>{anime.status === "RELEASING" ? "Ongoing" : "Completed"}</div>

        {/* Bookmark */}
        <button onClick={e => { e.stopPropagation(); onBookmark(anime.id); }} style={{
          position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,0.6)",
          border: "none", color: bookmarked ? "#e040fb" : "#9ca3af",
          cursor: "pointer", borderRadius: 7, padding: "5px 6px", display: "flex",
        }}><Ic.Bm on={bookmarked} /></button>

        {/* Play overlay */}
        {hov && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.2)" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e040fb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 28px #e040fb99" }}>
              <Ic.Play s={18} />
            </div>
          </div>
        )}

        {/* Info */}
        <div style={{ position: "absolute", bottom: 7, left: 8, right: 8 }}>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.3, textShadow: "0 2px 8px rgba(0,0,0,.9)", marginBottom: 4 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Ic.Star /><span style={{ color: "#fbbf24", fontSize: 10, fontWeight: 600 }}>{anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "N/A"}</span>
            <span style={{ color: "#374151" }}>·</span>
            <span style={{ color: "#6b7280", fontSize: 10 }}>{anime.seasonYear || ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WATCH VIEW
═══════════════════════════════════════════════════════════ */
function WatchView({ anime, startEp, onBack, bookmarked, onBookmark }) {
  const [ep, setEp] = useState(startEp);
  const [lang, setLang] = useState("sub");
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoSkip, setAutoSkip] = useState(true);
  const [showSkip, setShowSkip] = useState(false);
  const [skipTimer, setSkipTimer] = useState(null);
  const [epGrid, setEpGrid] = useState(true);
  const [autoNextBanner, setAutoNextBanner] = useState(false);
  const [countdownVal, setCountdownVal] = useState(5);
  const iframeRef = useRef(null);
  const epListRef = useRef(null);
  const countdownRef = useRef(null);
  const episodes = getEps(anime);
  const title = anime.title.english || anime.title.romaji;
  const totalEps = episodes.length;

  const nextEp = useCallback(() => {
    if (ep < totalEps) {
      setEp(e => e + 1);
      setShowSkip(false);
      setAutoNextBanner(false);
      setCountdownVal(5);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [ep, totalEps]);

  // Listen for postMessage from megaplay iframe
  useEffect(() => {
    const handler = (event) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!data) return;

        // Time tracking — show skip intro between 60s–210s
        const t = data.time ?? data.currentTime;
        if (t !== undefined) {
          if (autoSkip && t >= 85 && t <= 210) setShowSkip(true);
          else setShowSkip(false);
          // Auto skip intro
          if (autoSkip && t >= 85 && t <= 92) {
            setSkipTimer(t);
          }
        }

        // Episode complete → auto next
        if (data.event === "complete") {
          if (autoPlay && ep < totalEps) {
            setAutoNextBanner(true);
            setCountdownVal(5);
            countdownRef.current = setInterval(() => {
              setCountdownVal(v => {
                if (v <= 1) {
                  clearInterval(countdownRef.current);
                  nextEp();
                  return 5;
                }
                return v - 1;
              });
            }, 1000);
          }
        }
      } catch (_) {}
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoPlay, autoSkip, ep, totalEps, nextEp]);

  // Reset skip/banner when ep changes
  useEffect(() => {
    setShowSkip(false);
    setAutoNextBanner(false);
    setCountdownVal(5);
    if (countdownRef.current) clearInterval(countdownRef.current);
    // Scroll active episode into view
    setTimeout(() => {
      epListRef.current?.querySelector(".ep-active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 100);
  }, [ep]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, []);

  const img = anime.coverImage?.extraLarge || anime.coverImage?.large;

  return (
    <div style={{ minHeight: "100vh", background: "#070b12", paddingTop: 60 }}>
      {/* Breadcrumb */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid #0f1a2b", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{
          background: "#0d1421", border: "1px solid #1e2d42", borderRadius: 8,
          color: "#9ca3af", cursor: "pointer", padding: "6px 12px",
          display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600,
        }}><Ic.ChevL /> Back</button>
        <span style={{ color: "#374151", fontSize: 13 }}>{title}</span>
        <span style={{ color: "#1e2d42" }}>·</span>
        <span style={{ color: "#6b7280", fontSize: 13 }}>Episode {ep}</span>
      </div>

      <div className="watch-layout">
        {/* ── LEFT: Player + info ── */}
        <div className="watch-main">
          {/* Player */}
          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,.8)" }}>
            <iframe
              ref={iframeRef}
              key={`${anime.id}-${ep}-${lang}`}
              src={getEmbedUrl(anime.id, ep, lang)}
              title={`${title} Episode ${ep}`}
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            />

            {/* Skip Intro overlay */}
            {showSkip && (
              <button
                onClick={() => setShowSkip(false)}
                style={{
                  position: "absolute", bottom: 70, right: 16,
                  background: "rgba(10,14,25,.85)", backdropFilter: "blur(8px)",
                  border: "1px solid rgba(224,64,251,.4)", color: "#fff",
                  borderRadius: 8, padding: "9px 18px", cursor: "pointer",
                  fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 7,
                  boxShadow: "0 4px 20px rgba(0,0,0,.6)",
                  animation: "fadeUp .3s ease",
                }}><Ic.Skip /> Skip Intro</button>
            )}

            {/* Auto-next banner */}
            {autoNextBanner && ep < totalEps && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "linear-gradient(to top, rgba(7,11,18,.98), rgba(7,11,18,.7))",
                padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
                flexWrap: "wrap", gap: 12,
              }}>
                <div>
                  <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 3 }}>Up Next</div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Episode {ep + 1}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => { setAutoNextBanner(false); clearInterval(countdownRef.current); }} style={{ background: "#1e2d42", border: "none", color: "#9ca3af", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                  <button onClick={nextEp} style={{ background: "#e040fb", border: "none", color: "#fff", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <Ic.Play s={14} /> Play ({countdownVal}s)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls row */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {/* Prev/Next */}
            <button onClick={() => ep > 1 && setEp(e => e - 1)} disabled={ep <= 1} style={{
              flex: 1, minWidth: 100, background: ep <= 1 ? "#0a0f1a" : "#0d1421", border: "1px solid #1e2d42",
              borderRadius: 8, color: ep <= 1 ? "#374151" : "#9ca3af", padding: "9px 0",
              cursor: ep <= 1 ? "default" : "pointer", fontSize: 13, fontWeight: 600,
            }}>← Prev</button>
            <button onClick={() => ep < totalEps && setEp(e => e + 1)} disabled={ep >= totalEps} style={{
              flex: 1, minWidth: 100, background: ep >= totalEps ? "#0a0f1a" : "#0d1421", border: "1px solid #1e2d42",
              borderRadius: 8, color: ep >= totalEps ? "#374151" : "#9ca3af", padding: "9px 0",
              cursor: ep >= totalEps ? "default" : "pointer", fontSize: 13, fontWeight: 600,
            }}>Next →</button>

            {/* Sub / Dub */}
            <div style={{ display: "flex", background: "#0d1421", border: "1px solid #1e2d42", borderRadius: 8, overflow: "hidden" }}>
              {["sub", "dub"].map(l => (
                <button key={l} onClick={() => setLang(l)} style={{
                  background: lang === l ? "#e040fb" : "transparent", border: "none",
                  color: lang === l ? "#fff" : "#6b7280", padding: "9px 16px",
                  cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5,
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Auto-play / Auto-skip toggles */}
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { label: "Auto Play", val: autoPlay, set: setAutoPlay },
              { label: "Auto Skip Intro", val: autoSkip, set: setAutoSkip },
            ].map(({ label, val, set }) => (
              <button key={label} onClick={() => set(v => !v)} style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "#0d1421", border: "1px solid #1e2d42", borderRadius: 8,
                color: val ? "#e040fb" : "#6b7280", padding: "7px 14px",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>
                <div style={{
                  width: 28, height: 16, borderRadius: 8, background: val ? "#e040fb" : "#1e2d42",
                  position: "relative", transition: "background .2s", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 2, left: val ? 14 : 2, width: 12, height: 12,
                    borderRadius: "50%", background: "#fff", transition: "left .2s",
                  }} />
                </div>
                {label}
              </button>
            ))}
          </div>

          {/* Anime info */}
          <div style={{ marginTop: 16, background: "#0d1421", borderRadius: 12, border: "1px solid #161f30", padding: 18 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              {img && <img src={img} alt={title} style={{ width: 72, height: 100, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 3 }}>{anime.title.romaji}</div>
                <div style={{ color: "#f1f5f9", fontSize: 17, fontWeight: 800, marginBottom: 8, lineHeight: 1.2 }}>{title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                  {anime.genres?.slice(0, 4).map(g => (
                    <span key={g} style={{ background: "#161f30", color: "#6b7280", fontSize: 10, padding: "3px 8px", borderRadius: 20 }}>{g}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>
                    <Ic.Star /> {anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "N/A"}
                  </span>
                  <span style={{ color: "#374151" }}>·</span>
                  <span style={{ color: "#6b7280", fontSize: 12 }}>{anime.seasonYear}</span>
                  <span style={{ color: "#374151" }}>·</span>
                  <span style={{ color: anime.status === "RELEASING" ? "#10b981" : "#6b7280", fontSize: 12, fontWeight: 600 }}>
                    {anime.status === "RELEASING" ? "Ongoing" : "Completed"}
                  </span>
                </div>
                <button onClick={() => onBookmark(anime.id)} style={{
                  marginTop: 10, background: bookmarked ? "rgba(224,64,251,.1)" : "#161f30",
                  border: `1px solid ${bookmarked ? "rgba(224,64,251,.4)" : "#1e2d42"}`,
                  color: bookmarked ? "#e040fb" : "#9ca3af", borderRadius: 8,
                  padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                }}><Ic.Bm on={bookmarked} /> {bookmarked ? "Saved" : "Save"}</button>
              </div>
            </div>
            {anime.description && (
              <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.75, marginTop: 14 }}>
                {stripHtml(anime.description).slice(0, 300)}{anime.description.length > 300 ? "…" : ""}
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT: Episode list ── */}
        <div className="watch-sidebar" ref={epListRef}>
          <div style={{ background: "#0d1421", borderRadius: 12, border: "1px solid #161f30", overflow: "hidden" }}>
            <div style={{ padding: "13px 14px", borderBottom: "1px solid #161f30", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
                Episodes <span style={{ color: "#374151", fontWeight: 400 }}>({totalEps})</span>
              </div>
              <button onClick={() => setEpGrid(v => !v)} style={{ background: "#161f30", border: "1px solid #1e2d42", color: "#6b7280", borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "flex", fontSize: 11 }}>
                {epGrid ? "List" : "Grid"}
              </button>
            </div>
            <div style={{ maxHeight: 460, overflowY: "auto", padding: 8 }}>
              {epGrid ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }}>
                  {episodes.map(n => (
                    <button key={n} className={ep === n ? "ep-active" : ""}
                      onClick={() => setEp(n)}
                      style={{
                        background: ep === n ? "#e040fb" : "#111927",
                        border: `1px solid ${ep === n ? "#e040fb" : "#1e2d42"}`,
                        color: ep === n ? "#fff" : "#9ca3af",
                        borderRadius: 7, padding: "8px 4px", cursor: "pointer",
                        fontSize: 12, fontWeight: 600, transition: "all .15s",
                      }}>{n}</button>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {episodes.map(n => (
                    <button key={n} className={ep === n ? "ep-active" : ""}
                      onClick={() => setEp(n)}
                      style={{
                        background: ep === n ? "#1a1f35" : "transparent",
                        border: `1px solid ${ep === n ? "rgba(224,64,251,.35)" : "transparent"}`,
                        color: ep === n ? "#e040fb" : "#9ca3af",
                        borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                        fontSize: 13, fontWeight: ep === n ? 700 : 400,
                        textAlign: "left", width: "100%", display: "flex", alignItems: "center", gap: 10,
                      }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: ep === n ? "#e040fb" : "#1e2d42",
                        color: ep === n ? "#fff" : "#6b7280",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700,
                      }}>{n}</span>
                      Episode {n}
                      <span style={{ marginLeft: "auto", color: "#374151", fontSize: 11 }}>24m</span>
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

/* ═══════════════════════════════════════════════════════════
   DETAIL MODAL
═══════════════════════════════════════════════════════════ */
function AnimeModal({ anime, onClose, bookmarked, onBookmark, onWatch }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const title = anime.title.english || anime.title.romaji;
  const img = anime.coverImage?.extraLarge || anime.coverImage?.large;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)" }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0a1020", borderRadius: 20, width: "100%", maxWidth: 820,
        maxHeight: "90vh", overflowY: "auto", border: "1px solid #1a2840",
        boxShadow: "0 30px 80px rgba(0,0,0,.85)", animation: "modalIn .25s ease",
      }}>
        {/* Banner */}
        <div style={{ position: "relative", height: 220, overflow: "hidden", borderRadius: "20px 20px 0 0" }}>
          {anime.bannerImage ? (
            <img src={anime.bannerImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : img ? (
            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(4px) brightness(.6)", transform: "scale(1.05)" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a0a2e, #0d1a35)" }} />
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a1020 0%, transparent 55%)" }} />
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,.65)", border: "1px solid rgba(255,255,255,.1)", color: "#fff", cursor: "pointer", borderRadius: 10, padding: 8, display: "flex" }}>
            <Ic.X />
          </button>
        </div>
        {/* Content */}
        <div style={{ padding: "18px 24px 24px" }}>
          <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>{anime.title.romaji}</div>
          <div style={{ color: "#f1f5f9", fontSize: 21, fontWeight: 800, marginBottom: 10, lineHeight: 1.2 }}>{title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginBottom: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#fbbf24", fontWeight: 700, fontSize: 13 }}>
              <Ic.Star /> {anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "N/A"}
            </span>
            <span style={{ color: "#374151" }}>·</span>
            <span style={{ color: "#6b7280", fontSize: 13 }}>{anime.seasonYear}</span>
            <span style={{ color: "#374151" }}>·</span>
            <span style={{ color: anime.status === "RELEASING" ? "#10b981" : "#6b7280", fontSize: 13, fontWeight: 600 }}>
              {anime.status === "RELEASING" ? "Ongoing" : "Completed"}
            </span>
            {anime.episodes && <><span style={{ color: "#374151" }}>·</span><span style={{ color: "#6b7280", fontSize: 13 }}>{anime.episodes} eps</span></>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            {anime.genres?.map(g => (
              <span key={g} style={{ background: "#161f30", color: "#6b7280", fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>{g}</span>
            ))}
          </div>
          {anime.description && (
            <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.75, marginBottom: 20 }}>{stripHtml(anime.description).slice(0, 400)}…</p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => { onClose(); onWatch(anime, 1); }} style={{
              background: "linear-gradient(135deg, #e040fb, #7c4dff)", color: "#fff",
              border: "none", borderRadius: 12, padding: "12px 26px", fontWeight: 700,
              fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 6px 22px rgba(224,64,251,.35)",
            }}><Ic.Play s={16} /> Watch Now</button>
            <button onClick={() => onBookmark(anime.id)} style={{
              background: bookmarked ? "rgba(224,64,251,.1)" : "#161f30",
              border: `1px solid ${bookmarked ? "rgba(224,64,251,.4)" : "#1e2d42"}`,
              color: bookmarked ? "#e040fb" : "#9ca3af", borderRadius: 12,
              padding: "12px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}><Ic.Bm on={bookmarked} /> {bookmarked ? "Saved" : "Add to List"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR
═══════════════════════════════════════════════════════════ */
function Navbar({ navLinks, activeNav, setActiveNav, searchActive, setSearchActive, searchQuery, setSearchQuery, mobileMenu, setMobileMenu }) {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      background: "rgba(7,11,18,.94)", backdropFilter: "blur(20px)",
      borderBottom: "1px solid #0f1a2b",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", height: 60, gap: 12,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#e040fb,#7c4dff)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px rgba(224,64,251,.45)", fontSize: 16 }}>⚡</div>
        <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg,#e040fb,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AniStream</span>
      </div>

      {/* Desktop links */}
      <div className="desk-nav">
        {navLinks.map(n => (
          <button key={n} onClick={() => setActiveNav(n)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "6px 13px",
            borderRadius: 8, fontSize: 13, fontWeight: activeNav === n ? 700 : 500,
            color: activeNav === n ? "#e040fb" : "#6b7280",
            borderBottom: `2px solid ${activeNav === n ? "#e040fb" : "transparent"}`,
            transition: "color .2s",
          }}>{n}</button>
        ))}
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* Search */}
        {searchActive ? (
          <div style={{ display: "flex", alignItems: "center", background: "#0d1421", borderRadius: 10, padding: "6px 11px", gap: 7, border: "1px solid #1e2d42" }}>
            <Ic.Search />
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search anime..."
              style={{ background: "none", border: "none", outline: "none", color: "#e2e8f0", fontSize: 13, width: 140 }} />
            <button onClick={() => { setSearchActive(false); setSearchQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", display: "flex" }}>
              <Ic.X s={16} />
            </button>
          </div>
        ) : (
          <button onClick={() => setSearchActive(true)} style={{ background: "#0d1421", border: "1px solid #1e2d42", borderRadius: 9, color: "#6b7280", padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Ic.Search />
          </button>
        )}

        {/* Profile */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setProfileOpen(v => !v)} style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg,#e040fb,#7c4dff)",
            border: "none", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, cursor: "pointer", fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>A</button>
          {profileOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "#0d1421", border: "1px solid #1e2d42", borderRadius: 12,
              minWidth: 180, padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,.7)",
              animation: "fadeUp .2s ease", zIndex: 200,
            }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #161f30", marginBottom: 4 }}>
                <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 700 }}>AniStream User</div>
                <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>Free Plan</div>
              </div>
              {[["Settings", <Ic.Settings />], ["Sign Out", <Ic.Logout />]].map(([label, icon]) => (
                <button key={label} onClick={() => setProfileOpen(false)} style={{
                  width: "100%", background: "none", border: "none", color: label === "Sign Out" ? "#ef4444" : "#9ca3af",
                  padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 9, borderRadius: 8,
                  textAlign: "left",
                }}>{icon} {label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Hamburger — visible only on mobile via CSS */}
        <button className="hamburger" onClick={() => setMobileMenu(v => !v)} style={{
          background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 4, display: "flex",
        }}><Ic.Menu /></button>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Home");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [watchingAnime, setWatchingAnime] = useState(null);
  const [watchEp, setWatchEp] = useState(1);
  const [bookmarks, setBookmarks] = useState(new Set());
  const [heroIndex, setHeroIndex] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const navLinks = ["Home", "Trending", "Schedule", "Bookmarks"];

  // Fetch real anime data from AniList
  useEffect(() => {
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { ids: ANILIST_IDS } }),
    })
      .then(r => r.json())
      .then(d => {
        setAnimeList(d.data?.Page?.media || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Hero rotation
  useEffect(() => {
    if (!animeList.length) return;
    const t = setInterval(() => setHeroIndex(i => (i + 1) % Math.min(3, animeList.length)), 7000);
    return () => clearInterval(t);
  }, [animeList.length]);

  const toggleBookmark = id => setBookmarks(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleWatch = (anime, ep = 1) => {
    setWatchingAnime(anime);
    setWatchEp(ep);
    setSelectedAnime(null);
    window.scrollTo({ top: 0 });
  };

  // All genres from fetched data
  const allGenres = ["All", ...new Set(animeList.flatMap(a => a.genres || []))].slice(0, 14);

  const filtered = animeList.filter(a => {
    const t = a.title.english || a.title.romaji || "";
    const matchSearch = !searchQuery || t.toLowerCase().includes(searchQuery.toLowerCase());
    const matchGenre = selectedGenre === "All" || a.genres?.includes(selectedGenre);
    return matchSearch && matchGenre;
  });

  const heroAnime = animeList[heroIndex];

  // ── WATCH VIEW ──
  if (watchingAnime) {
    return (
      <div style={{ background: "#070b12", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Outfit','Segoe UI',sans-serif" }}>
        <GlobalStyles />
        <Navbar navLinks={navLinks} activeNav={activeNav}
          setActiveNav={n => { setActiveNav(n); setWatchingAnime(null); }}
          searchActive={searchActive} setSearchActive={setSearchActive}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />
        <WatchView anime={watchingAnime} startEp={watchEp}
          onBack={() => setWatchingAnime(null)}
          bookmarked={bookmarks.has(watchingAnime.id)}
          onBookmark={toggleBookmark} />
      </div>
    );
  }

  // ── MAIN SITE ──
  return (
    <div style={{ minHeight: "100vh", background: "#070b12", color: "#e2e8f0", fontFamily: "'Outfit','Segoe UI',sans-serif", overflowX: "hidden" }}>
      <GlobalStyles />
      <Navbar navLinks={navLinks} activeNav={activeNav} setActiveNav={setActiveNav}
        searchActive={searchActive} setSearchActive={setSearchActive}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} />

      {/* Mobile menu dropdown */}
      {mobileMenu && (
        <div style={{
          position: "fixed", top: 60, left: 0, right: 0, zIndex: 90,
          background: "#0a1020", borderBottom: "1px solid #0f1a2b",
          padding: "10px 16px", display: "flex", flexDirection: "column", gap: 3,
        }}>
          {navLinks.map(n => (
            <button key={n} onClick={() => { setActiveNav(n); setMobileMenu(false); }} style={{
              background: activeNav === n ? "#1a2840" : "transparent",
              border: "none", color: activeNav === n ? "#e040fb" : "#9ca3af",
              padding: "11px 14px", borderRadius: 10, cursor: "pointer",
              fontSize: 15, fontWeight: 600, textAlign: "left",
            }}>{n}</button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: "3px solid #1e2d42", borderTop: "3px solid #e040fb", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <div style={{ color: "#374151", fontSize: 14 }}>Loading anime...</div>
        </div>
      )}

      {!loading && (
        <>
          {/* HERO */}
          {activeNav === "Home" && heroAnime && !searchQuery && (
            <div style={{ position: "relative", height: "88vh", minHeight: 480, overflow: "hidden" }}>
              <div key={heroIndex} style={{ position: "absolute", inset: 0, animation: "heroIn .9s ease" }}>
                {heroAnime.bannerImage ? (
                  <img src={heroAnime.bannerImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <img src={heroAnime.coverImage?.extraLarge || heroAnime.coverImage?.large} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(2px)", transform: "scale(1.04)" }} />
                )}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(7,11,18,.97) 28%, rgba(7,11,18,.55) 65%, rgba(7,11,18,.1) 100%)" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #070b12 0%, transparent 45%)" }} />
              </div>
              <div className="hero-content" style={{
                position: "relative", zIndex: 2, height: "100%",
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
                padding: "0 40px 80px", maxWidth: 660, animation: "fadeUp .8s ease",
              }}>
                <div style={{ color: "#e040fb", fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>⚡ Now Streaming</div>
                <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 5 }}>{heroAnime.title.romaji}</div>
                <h1 className="hero-title" style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.08, marginBottom: 12 }}>
                  {heroAnime.title.english || heroAnime.title.romaji}
                </h1>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {heroAnime.genres?.slice(0, 3).map(g => (
                    <span key={g} style={{ background: "rgba(224,64,251,.12)", border: "1px solid rgba(224,64,251,.28)", color: "#e040fb", fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{g}</span>
                  ))}
                  <span style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.28)", color: "#fbbf24", fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>
                    <Ic.Star /> {heroAnime.averageScore ? (heroAnime.averageScore / 10).toFixed(1) : "N/A"}
                  </span>
                </div>
                {heroAnime.description && (
                  <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.75, marginBottom: 26, maxWidth: 440 }}>
                    {stripHtml(heroAnime.description).slice(0, 200)}…
                  </p>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => handleWatch(heroAnime, 1)} style={{
                    background: "linear-gradient(135deg,#e040fb,#7c4dff)", color: "#fff",
                    border: "none", borderRadius: 12, padding: "12px 26px", fontWeight: 700,
                    fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    boxShadow: "0 8px 26px rgba(224,64,251,.4)",
                  }}><Ic.Play s={16} /> Watch Now</button>
                  <button onClick={() => setSelectedAnime(heroAnime)} style={{
                    background: "rgba(255,255,255,.06)", color: "#e2e8f0",
                    border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "12px 20px",
                    fontWeight: 600, fontSize: 14, cursor: "pointer", backdropFilter: "blur(10px)",
                  }}>More Info</button>
                </div>
              </div>
              {/* Dots */}
              <div style={{ position: "absolute", bottom: 24, left: 40, display: "flex", gap: 7, zIndex: 2 }}>
                {animeList.slice(0, 3).map((_, i) => (
                  <button key={i} onClick={() => setHeroIndex(i)} style={{
                    width: i === heroIndex ? 24 : 6, height: 6, borderRadius: 3,
                    background: i === heroIndex ? "#e040fb" : "#1e2d42",
                    border: "none", cursor: "pointer", transition: "all .3s", padding: 0,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* CONTENT */}
          <div style={{ padding: activeNav === "Home" ? "0 20px 60px" : "80px 20px 60px", maxWidth: 1400, margin: "0 auto" }}>

            {/* HOME */}
            {activeNav === "Home" && (
              <>
                {searchQuery && <div style={{ marginBottom: 16, color: "#6b7280", fontSize: 13 }}>Results for <strong style={{ color: "#e040fb" }}>"{searchQuery}"</strong> — {filtered.length} found</div>}
                <div className="main-layout">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Genre pills */}
                    <div className="genre-scroll" style={{ marginBottom: 22 }}>
                      {allGenres.map(g => (
                        <button key={g} onClick={() => setSelectedGenre(g)} style={{
                          background: selectedGenre === g ? "#e040fb" : "#0d1421",
                          color: selectedGenre === g ? "#fff" : "#6b7280",
                          border: selectedGenre === g ? "1px solid #e040fb" : "1px solid #1e2d42",
                          borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", whiteSpace: "nowrap", transition: "all .2s",
                          boxShadow: selectedGenre === g ? "0 4px 12px rgba(224,64,251,.28)" : "none",
                        }}>{g}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <h2 style={{ fontSize: 17, fontWeight: 800 }}>
                        {searchQuery ? "Search Results" : selectedGenre !== "All" ? selectedGenre : "🔥 Trending This Season"}
                      </h2>
                    </div>
                    <div className="anime-grid">
                      {filtered.map((a, i) => (
                        <div key={a.id} style={{ animation: `fadeUp .4s ease ${i * .05}s both` }}>
                          <AnimeCard anime={a} onClick={setSelectedAnime} bookmarked={bookmarks.has(a.id)} onBookmark={toggleBookmark} />
                        </div>
                      ))}
                      {filtered.length === 0 && (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "#374151" }}>
                          <div style={{ fontSize: 34, marginBottom: 10 }}>🔍</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#6b7280" }}>No results</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sidebar */}
                  <div className="sidebar">
                    <div style={{ background: "#0d1421", borderRadius: 12, border: "1px solid #161f30", marginBottom: 14, padding: "14px 0 8px" }}>
                      <div style={{ padding: "0 14px 8px", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>🕐 Recently Added</span>
                        <span style={{ fontSize: 11, color: "#e040fb", cursor: "pointer", fontWeight: 600 }}>See all</span>
                      </div>
                      {animeList.slice(0, 5).map(a => {
                        const t = a.title.english || a.title.romaji;
                        const img = a.coverImage?.large;
                        return (
                          <div key={a.id} onClick={() => setSelectedAnime(a)} style={{
                            display: "flex", gap: 10, cursor: "pointer", padding: "8px 12px", alignItems: "center",
                          }}>
                            {img && <img src={img} alt="" style={{ width: 44, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: "#d1d5db", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</div>
                              <div style={{ color: "#e040fb", fontSize: 10, marginTop: 2 }}>{a.episodes ? `${a.episodes} eps` : "Ongoing"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ background: "#0d1421", borderRadius: 12, border: "1px solid #161f30", padding: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📅 Airing Schedule</div>
                      {SCHEDULE.map(({ day, shows }) => (
                        <div key={day} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                          <div style={{ width: 30, color: "#e040fb", fontSize: 11, fontWeight: 700, paddingTop: 2 }}>{day}</div>
                          <div style={{ flex: 1 }}>
                            {shows.map(s => <div key={s} style={{ color: "#6b7280", fontSize: 12, padding: "1px 0" }}>· {s}</div>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TRENDING */}
            {activeNav === "Trending" && (
              <div style={{ animation: "fadeUp .4s ease" }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>🔥 Trending Anime</h2>
                <p style={{ color: "#6b7280", marginBottom: 22, fontSize: 13 }}>Sorted by popularity</p>
                <div className="anime-grid">
                  {[...animeList].sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0)).map((a, i) => (
                    <div key={a.id} style={{ animation: `fadeUp .4s ease ${i * .06}s both` }}>
                      <AnimeCard anime={a} onClick={setSelectedAnime} bookmarked={bookmarks.has(a.id)} onBookmark={toggleBookmark} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SCHEDULE */}
            {activeNav === "Schedule" && (
              <div style={{ animation: "fadeUp .4s ease" }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>📅 Airing Schedule</h2>
                <p style={{ color: "#6b7280", marginBottom: 22, fontSize: 13 }}>This week's episodes</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(175px,1fr))", gap: 12 }}>
                  {SCHEDULE.map(({ day, shows }) => (
                    <div key={day} style={{ background: "#0d1421", borderRadius: 12, padding: 16, border: "1px solid #161f30" }}>
                      <div style={{ color: "#e040fb", fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{day}</div>
                      {shows.map(s => (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 0", borderBottom: "1px solid #111927", color: "#94a3b8", fontSize: 13 }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#e040fb", flexShrink: 0 }} /> {s}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOOKMARKS */}
            {activeNav === "Bookmarks" && (
              <div style={{ animation: "fadeUp .4s ease" }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>🔖 My List</h2>
                <p style={{ color: "#6b7280", marginBottom: 22, fontSize: 13 }}>Saved anime ({bookmarks.size})</p>
                {bookmarks.size === 0 ? (
                  <div style={{ textAlign: "center", padding: "80px 0", color: "#374151" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🔖</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>Nothing saved yet</div>
                    <div style={{ fontSize: 13 }}>Tap the bookmark icon on any anime</div>
                  </div>
                ) : (
                  <div className="anime-grid">
                    {animeList.filter(a => bookmarks.has(a.id)).map((a, i) => (
                      <div key={a.id} style={{ animation: `fadeUp .4s ease ${i * .07}s both` }}>
                        <AnimeCard anime={a} onClick={setSelectedAnime} bookmarked={true} onBookmark={toggleBookmark} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FOOTER */}
          <footer style={{ borderTop: "1px solid #0f1a2b", padding: "30px 20px", textAlign: "center", color: "#1e2d42" }}>
            <div style={{ fontSize: 18, fontWeight: 900, background: "linear-gradient(135deg,#e040fb,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>AniStream</div>
            <div style={{ fontSize: 11 }}>© 2026 AniStream · For entertainment purposes only · Not affiliated with any studio</div>
          </footer>
        </>
      )}

      {/* MODAL */}
      {selectedAnime && (
        <AnimeModal anime={selectedAnime} onClose={() => setSelectedAnime(null)}
          bookmarked={bookmarks.has(selectedAnime.id)} onBookmark={toggleBookmark}
          onWatch={handleWatch} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GLOBAL STYLES
═══════════════════════════════════════════════════════════ */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { overflow-x: hidden; max-width: 100%; background: #070b12; }
      body { font-family: 'Outfit', 'Segoe UI', sans-serif; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: #070b12; }
      ::-webkit-scrollbar-thumb { background: #1e2d42; border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: #e040fb; }
      @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      @keyframes heroIn { from { opacity:0; transform:scale(1.03); } to { opacity:1; transform:scale(1); } }
      @keyframes modalIn { from { opacity:0; transform:translateY(14px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes spin { to { transform:rotate(360deg); } }
      .anime-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; }
      .genre-scroll { display:flex; gap:7px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; -ms-overflow-style:none; }
      .genre-scroll::-webkit-scrollbar { display:none; }
      .main-layout { display:flex; gap:22px; align-items:flex-start; margin-top:26px; }
      .sidebar { width:280px; flex-shrink:0; }
      .watch-layout { display:flex; gap:18px; padding:14px 20px 60px; max-width:1400px; margin:0 auto; }
      .watch-main { flex:1; min-width:0; }
      .watch-sidebar { width:290px; flex-shrink:0; position:sticky; top:72px; max-height:calc(100vh - 80px); overflow:hidden; }
      .desk-nav { display:flex; gap:2px; align-items:center; }
      .hamburger { display:none !important; }
      @media(max-width:860px) {
        .anime-grid { grid-template-columns:repeat(auto-fill,minmax(120px,1fr)) !important; gap:10px !important; }
        .hero-content { padding:0 16px 36px !important; max-width:100% !important; }
        .hero-title { font-size:24px !important; }
        .main-layout { flex-direction:column !important; }
        .sidebar { width:100% !important; }
        .watch-layout { flex-direction:column !important; padding:12px 14px 40px !important; }
        .watch-sidebar { width:100% !important; position:static !important; max-height:none !important; }
        .desk-nav { display:none !important; }
        .hamburger { display:flex !important; }
      }
    `}</style>
  );
}
