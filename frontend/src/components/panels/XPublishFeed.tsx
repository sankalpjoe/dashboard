/**
 * XPublishFeed — Official Handle Feed for X/Twitter.
 *
 * WEB: fetches recent posts/mentions for the selected handle from the free
 *      multi-tier backend aggregator (/api/twitter-intel, raw mode) — Apify /
 *      Twitter API (if keyed) → RSS-Bridge → RSSHub → Nitter → Google News.
 *      One handle at a time, so no rate-limit storm. Renders them as a list.
 * DESKTOP (Tauri): opens the native X Live window (real x.com via your login).
 *
 * Free X access is genuinely unreliable; when every tier is empty we show a
 * clear "Open on X" fallback rather than a blank panel.
 */
import { useEffect, useRef, useState } from "react";
import { T } from "@/lib/theme";

const C_BLR = "#2563eb", C_MUM = "#dc2626", C_HYD = "#7c3aed", C_DEL = "#16a34a";

type Handle = { handle: string; label: string; color: string; city: string };
const HANDLES: Handle[] = [
  { handle: "NammaBESCOM", label: "BESCOM", color: C_BLR, city: "Bengaluru" },
  { handle: "BlrCityPolice", label: "BLR Police", color: C_BLR, city: "Bengaluru" },
  { handle: "blrcitytraffic", label: "BLR Traffic", color: C_BLR, city: "Bengaluru" },
  { handle: "MumbaiPolice", label: "Mumbai Police", color: C_MUM, city: "Mumbai" },
  { handle: "mybmc", label: "BMC", color: C_MUM, city: "Mumbai" },
  { handle: "MTPHereToHelp", label: "Mumbai Traffic", color: C_MUM, city: "Mumbai" },
  { handle: "myBESTBus", label: "BEST Bus", color: C_MUM, city: "Mumbai" },
  { handle: "hydcitypolice", label: "HYD Police", color: C_HYD, city: "Hyderabad" },
  { handle: "HYDTP", label: "HYD Traffic", color: C_HYD, city: "Hyderabad" },
  { handle: "Ghmconline", label: "GHMC", color: C_HYD, city: "Hyderabad" },
  { handle: "tgspdcl", label: "TGSPDCL", color: C_HYD, city: "Hyderabad" },
  { handle: "DelhiPolice", label: "Delhi Police", color: C_DEL, city: "Delhi" },
  { handle: "dtptraffic", label: "Delhi Traffic", color: C_DEL, city: "Delhi" },
  { handle: "OfficialDMRC", label: "DMRC", color: C_DEL, city: "Delhi" },
];
const CITIES = ["ALL", "Bengaluru", "Mumbai", "Hyderabad", "Delhi"] as const;

type Post = { headline: string; source: string; url?: string; time: string };
type SourceDiag = { name: string; status: "ok" | "empty" | "error" | "filtered"; count: number; ms: number };

const SOURCE_LABELS: Record<string, string> = {
  nitter: "Nitter mirrors",
  syndication: "X widget feed",
  gnews: "Google News",
  apify: "Apify scraper",
  "twitter-v2": "Twitter API",
  groq: "Groq web search",
  "rss-bridge": "RSS-Bridge",
  rsshub: "RSSHub",
};

function explainSources(sources: SourceDiag[]): string {
  if (!sources?.length) return "";
  return sources
    .map((s) => {
      const label = SOURCE_LABELS[s.name] ?? s.name;
      if (s.status === "ok") return `${label}: ✓ ${s.count} posts`;
      if (s.status === "filtered") return `${label}: replied, but nothing recent/relevant`;
      if (s.status === "error") return `${label}: failed`;
      return `${label}: nothing found`;
    })
    .join(" · ");
}

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;
function tauriInvoke(): InvokeFn | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke: InvokeFn } };
  return w.__TAURI_INTERNALS__?.invoke ?? null;
}

function timeAgo(t: string): string {
  const d = new Date(t).getTime();
  if (isNaN(d)) return "";
  const m = Math.floor((Date.now() - d) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function XPublishFeed() {
  const invoke = tauriInvoke();
  const desktop = !!invoke;

  const [city, setCity] = useState<(typeof CITIES)[number]>("ALL");
  const visible = city === "ALL" ? HANDLES : HANDLES.filter((h) => h.city === city);
  const [active, setActive] = useState<Handle>(HANDLES[0]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!visible.some((h) => h.handle === active.handle)) setActive(visible[0]);
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WEB: fetch posts for the selected handle ──
  const [status, setStatus] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [posts, setPosts] = useState<Post[]>([]);
  const [diag, setDiag] = useState<SourceDiag[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    if (desktop) return;
    const my = ++reqId.current;
    setStatus("loading");
    setPosts([]);
    setDiag([]);
    const ctrl = new AbortController();
    // Server worst case is ~23s (free tier 8s + backup tier 15s); repeat loads
    // hit the server cache and return instantly.
    const t = setTimeout(() => ctrl.abort(), 30000);
    fetch("/api/twitter-intel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handles: [active.handle], raw: true }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data: { items?: Post[]; sources?: SourceDiag[] }) => {
        if (my !== reqId.current) return;
        const items = (data.items || []).filter((i) => i.headline && i.headline.length > 3);
        setPosts(items);
        setDiag(data.sources || []);
        setStatus(items.length ? "ok" : "empty");
      })
      .catch(() => {
        if (my === reqId.current) setStatus("error");
      })
      .finally(() => clearTimeout(t));
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [active.handle, reloadKey, desktop]);

  // ── DESKTOP: native X Live window ──
  const [opened, setOpened] = useState(false);
  const [deskErr, setDeskErr] = useState("");
  useEffect(() => {
    if (!desktop || !opened || !invoke) return;
    invoke("x_open_handle", { handle: active.handle }).catch((e) => setDeskErr(String(e?.message ?? e)));
  }, [active.handle, opened, desktop]); // eslint-disable-line react-hooks/exhaustive-deps

  const pill = (on: boolean, color = T.text) => ({
    padding: "5px 12px", borderRadius: 999,
    border: `1px solid ${on ? color : T.border}`,
    background: on ? color : T.bg, color: on ? T.bg : T.textMid,
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CITIES.map((c) => (
          <button key={c} onClick={() => setCity(c)} style={pill(city === c)}>
            {c === "ALL" ? "All cities" : c}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {visible.map((h) => {
          const on = active.handle === h.handle;
          return (
            <button key={h.handle} onClick={() => setActive(h)} title={`@${h.handle}`}
              style={{ padding: "6px 12px", borderRadius: T.radiusSm,
                border: `1px solid ${on ? h.color : T.border}`,
                background: on ? `${h.color}14` : T.bg, color: on ? h.color : T.textMid,
                fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: h.color }} />
              {h.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", border: `1px solid ${T.border}`,
        borderRadius: T.radius, background: T.bg, padding: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 10px" }}>
          <span style={{ fontWeight: 700, color: active.color }}>@{active.handle}</span>
          <span style={{ fontSize: 12, color: T.textDim }}>
            · {desktop ? "live X view" : "recent posts & mentions"}
          </span>
          <button onClick={() => { setReloadKey((k) => k + 1); setOpened(false); }}
            style={{ marginLeft: "auto", ...pill(false), padding: "3px 10px" }}>⟳ Reload</button>
          <a href={`https://x.com/${active.handle}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: T.info, textDecoration: "none" }}>Open on X ↗</a>
        </div>

        {desktop ? (
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: T.textMid, maxWidth: 620 }}>
              Opens the real @{active.handle} timeline in a native window using <b>your own X login</b> —
              free, no rate limits. Sign in once; then picking any handle switches that window.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => invoke?.("x_sign_in").catch((e) => setDeskErr(String(e?.message ?? e)))}
                style={{ ...pill(false), padding: "8px 14px" }}>Sign in to X (once)</button>
              <button onClick={() => { setDeskErr(""); setOpened(true); invoke?.("x_open_handle", { handle: active.handle }).catch((e) => setDeskErr(String(e?.message ?? e))); }}
                style={{ ...pill(true, active.color), padding: "8px 14px" }}>▶ Open @{active.handle} live</button>
            </div>
            {deskErr && <div style={{ fontSize: 12, color: T.critical }}>Couldn't open X window: {deskErr}</div>}
          </div>
        ) : (
          <>
            {status === "loading" && (
              <div style={{ padding: 16, color: T.textDim, fontSize: 13 }}>Fetching @{active.handle}…</div>
            )}
            {(status === "empty" || status === "error") && (
              <div style={{ margin: 8, padding: 16, fontSize: 13, color: T.textMid,
                border: `1px dashed ${T.border}`, borderRadius: T.radius, background: T.bgPanel }}>
                {status === "error" ? "Fetch failed." : "No recent posts came back from the free sources"}
                {" "}for @{active.handle}. Try <b>⟳ Reload</b>, or{" "}
                <a href={`https://x.com/${active.handle}`} target="_blank" rel="noreferrer" style={{ color: T.info }}>
                  open @{active.handle} on X ↗</a>. For a reliable live feed, use the desktop app.
                {diag.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.border}`,
                    fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
                    What each source said: {explainSources(diag)}
                  </div>
                )}
              </div>
            )}
            {status === "ok" && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {posts.map((p, i) => (
                  <a key={i} href={p.url || `https://x.com/${active.handle}`} target="_blank" rel="noreferrer"
                    style={{ display: "block", padding: "10px 8px", borderTop: i ? `1px solid ${T.border}` : "none",
                      textDecoration: "none", color: T.text }}>
                    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{p.headline}</div>
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
                      @{p.source || active.handle}{p.time ? ` · ${timeAgo(p.time)}` : ""}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
