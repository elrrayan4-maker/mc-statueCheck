import { useState, useEffect, useRef } from "react";

const PRESETS = [
  { label: "Hypixel", addr: "mc.hypixel.net" },
  { label: "CubeCraft", addr: "play.cubecraft.net" },
  { label: "Mineplex", addr: "mc.mineplex.com" },
  { label: "Wynncraft", addr: "play.wynncraft.com" },
  { label: "mcpvp.club", addr: "mcpvp.club" },
];

function PingBars({ ping }) {
  const cls = ping < 80 ? "good" : ping < 200 ? "medium" : "bad";
  const colors = { good: "#39ff6e", medium: "#ffd439", bad: "#ff3939" };
  const c = colors[cls];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {[6, 10, 14].map((h, i) => (
        <div key={i} style={{
          width: 4, height: h, borderRadius: 1,
          background: (cls === "good" || (cls === "medium" && i < 2) || (cls === "bad" && i < 1)) ? c : "#1e2a38",
          transition: "background 0.4s"
        }} />
      ))}
      <span style={{ color: "#4a6070", fontSize: 10, marginLeft: 5 }}>{ping}ms</span>
    </div>
  );
}

function PlayerCard({ name }) {
  const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/36`;
  return (
    <div style={{
      background: "#161c24", border: "1px solid #1e2a38", borderRadius: 6,
      padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
      transition: "border-color 0.2s, transform 0.2s", cursor: "default"
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#39ff6e"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e2a38"; e.currentTarget.style.transform = "none"; }}
    >
      <img src={avatarUrl} alt={name} width={32} height={32}
        style={{ imageRendering: "pixelated", borderRadius: 3 }}
        onError={e => { e.target.src = "https://mc-heads.net/avatar/steve/36"; }} />
      <span style={{ fontSize: 12, color: "#e8f4ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    </div>
  );
}

function StatBlock({ label, value, color = "#e8f4ff", sub }) {
  return (
    <div style={{ background: "#161c24", border: "1px solid #1e2a38", borderRadius: 6, padding: 16 }}>
      <div style={{ fontSize: 9, color: "#4a6070", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color, lineHeight: 1.4, textShadow: color === "#39ff6e" ? "0 0 10px rgba(57,255,110,0.4)" : "none" }}>{value}</div>
      {sub}
    </div>
  );
}

function InfoRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161c24", border: "1px solid #1e2a38", borderRadius: 6, padding: "11px 14px" }}>
      <span style={{ fontSize: 10, color: "#4a6070", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: highlight ? "#39ff6e" : "#e8f4ff", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function App() {
  const [addr, setAddr] = useState("");
  const [port, setPort] = useState("25565");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("Querying server...");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mcpulse_h") || "[]"); } catch { return []; }
  });
  const loadRef = useRef(null);

  useEffect(() => {
    if (loading) {
      const msgs = ["Querying server...", "Fetching live data...", "Reading response..."];
      let i = 0;
      loadRef.current = setInterval(() => { i = (i + 1) % msgs.length; setLoadMsg(msgs[i]); }, 900);
    } else {
      clearInterval(loadRef.current);
    }
    return () => clearInterval(loadRef.current);
  }, [loading]);

  const saveHistory = (a, p, online) => {
    const entry = { addr: a, port: p, online, time: Date.now() };
    const next = [entry, ...history.filter(h => !(h.addr === a && h.port === p))].slice(0, 8);
    setHistory(next);
    try { localStorage.setItem("mcpulse_h", JSON.stringify(next)); } catch {}
  };

  const checkServer = async (a, p) => {
    const target = (a || addr).trim();
    const targetPort = (p || port).trim() || "25565";
    if (!target) return;

    setLoading(true);
    setResult(null);
    setError(null);

    const prompt = `You are a Minecraft server status API. Check the Minecraft server "${target}:${targetPort}" using web search and return ONLY a JSON object (no markdown, no extra text) with these exact fields:
{
  "online": boolean,
  "hostname": "string",
  "ip": "string or null",
  "port": number,
  "version": "string or null",
  "protocol": number or null,
  "motd": "string - the server message of the day",
  "players_online": number,
  "players_max": number,
  "players_list": ["array of player name strings, up to 12"],
  "software": "string or null",
  "ping_ms": number or null,
  "map": "string or null",
  "gamemode": "string or null",
  "plugins_count": number or null,
  "mods_count": number or null,
  "srv": boolean,
  "notes": "any interesting info about this server"
}
Search for the current status of Minecraft server ${target} to get real live data. Use mcsrvstat.us or similar sources. Return ONLY the JSON, nothing else.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await res.json();
      const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";

      // Parse JSON from response
      let parsed = null;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch {}
      }

      if (!parsed) throw new Error("Could not parse server data");

      setResult({ ...parsed, _addr: target, _port: targetPort });
      saveHistory(target, targetPort, parsed.online);
    } catch (e) {
      setError("Could not fetch server data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = t => {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const pct = result ? Math.min(100, result.players_max > 0 ? (result.players_online / result.players_max) * 100 : 0) : 0;
  const barColor = pct >= 90 ? "#ff3939" : pct >= 60 ? "#ffd439" : "#39ff6e";

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0c0f", color: "#c8d8e8",
      fontFamily: "'JetBrains Mono', monospace", position: "relative", overflowX: "hidden"
    }}>
      {/* Scanlines */}
      <div style={{ position: "fixed", inset: 0, background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)", pointerEvents: "none", zIndex: 1000 }} />
      {/* Grid */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(57,255,110,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(57,255,110,0.03) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 36px", borderBottom: "1px solid #1e2a38", background: "rgba(10,12,15,0.97)", backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Pixel grass block */}
          <div style={{ width: 34, height: 34, position: "relative", flexShrink: 0, boxShadow: "0 0 18px rgba(57,255,110,0.35)", imageRendering: "pixelated" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "#5dba3a" }} />
            <div style={{ position: "absolute", top: 10, left: 0, right: 0, bottom: 0, background: "#8b5e3c" }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 15, color: "#39ff6e", textShadow: "0 0 18px rgba(57,255,110,0.4)", letterSpacing: 1 }}>MCPulse</div>
            <div style={{ fontSize: 9, color: "#4a6070", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>Server Monitor</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#39ff6e", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ width: 8, height: 8, background: "#39ff6e", borderRadius: "50%", boxShadow: "0 0 8px #39ff6e", animation: "pulse 1.5s infinite" }} />
          Live
        </div>
      </header>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes loadBar { 0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#161c24} ::-webkit-scrollbar-thumb{background:#1e2a38;border-radius:2px}
      `}</style>

      <main style={{ position: "relative", zIndex: 10, maxWidth: 1100, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 50 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: "clamp(12px,2.5vw,20px)", color: "#e8f4ff", lineHeight: 1.9, marginBottom: 10, textShadow: "0 0 28px rgba(57,196,255,0.25)" }}>
            Check Any <span style={{ color: "#39ff6e", textShadow: "0 0 18px rgba(57,255,110,0.5)" }}>Minecraft</span> Server
          </div>
          <div style={{ fontSize: 11, color: "#4a6070", marginBottom: 36, letterSpacing: 3, textTransform: "uppercase" }}>Status · Players · MOTD · Version · Ping</div>

          {/* Search */}
          <div style={{ display: "flex", maxWidth: 680, margin: "0 auto", gap: 0 }}>
            <input
              value={addr}
              onChange={e => setAddr(e.target.value)}
              onKeyDown={e => e.key === "Enter" && checkServer()}
              placeholder="play.hypixel.net"
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1, background: "#161c24", border: "1px solid #1e2a38", borderRight: "none",
                borderRadius: "4px 0 0 4px", padding: "15px 18px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#e8f4ff", outline: "none",
                transition: "border-color 0.2s"
              }}
              onFocus={e => e.target.style.borderColor = "#39ff6e"}
              onBlur={e => e.target.style.borderColor = "#1e2a38"}
            />
            <input
              value={port}
              onChange={e => setPort(e.target.value)}
              onKeyDown={e => e.key === "Enter" && checkServer()}
              placeholder="25565"
              style={{
                width: 90, background: "#161c24", border: "1px solid #1e2a38", borderRight: "none",
                padding: "15px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#4a6070", outline: "none"
              }}
            />
            <button
              onClick={() => checkServer()}
              disabled={loading || !addr.trim()}
              style={{
                background: loading ? "#1e2a38" : "#39ff6e", color: "#000",
                border: "none", borderRadius: "0 4px 4px 0", padding: "15px 24px",
                fontFamily: "'Press Start 2P', monospace", fontSize: 10, cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: 1, transition: "all 0.2s", whiteSpace: "nowrap", opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? "..." : "► CHECK"}
            </button>
          </div>

          {/* Presets */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
            {PRESETS.map(p => (
              <button key={p.addr} onClick={() => { setAddr(p.addr); setPort("25565"); checkServer(p.addr, "25565"); }}
                style={{ background: "transparent", border: "1px solid #1e2a38", borderRadius: 4, padding: "6px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#4a6070", cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={e => { e.target.style.borderColor = "#39ff6e"; e.target.style.color = "#39ff6e"; e.target.style.background = "rgba(57,255,110,0.08)"; }}
                onMouseLeave={e => { e.target.style.borderColor = "#1e2a38"; e.target.style.color = "#4a6070"; e.target.style.background = "transparent"; }}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "50px 0", animation: "fadeIn 0.3s ease" }}>
            <div style={{ width: 300, margin: "0 auto 18px", height: 6, background: "#161c24", borderRadius: 3, overflow: "hidden", border: "1px solid #1e2a38" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg,#39ff6e,#39c4ff)", borderRadius: 3, animation: "loadBar 1.5s ease infinite", boxShadow: "0 0 10px #39ff6e" }} />
            </div>
            <div style={{ fontSize: 11, color: "#4a6070", letterSpacing: 3, textTransform: "uppercase", animation: "blink 1s infinite" }}>{loadMsg}</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: "#0f1318", border: "1px solid rgba(255,57,57,0.3)", borderRadius: 8, padding: 40, textAlign: "center", animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 26, color: "#ff3939", marginBottom: 14, textShadow: "0 0 18px rgba(255,57,57,0.5)" }}>✕</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12, color: "#e8f4ff", marginBottom: 10 }}>Connection Failed</div>
            <div style={{ fontSize: 12, color: "#4a6070" }}>{error}</div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>

            {/* Status card */}
            <div style={{
              background: "#0f1318",
              border: `1px solid ${result.online ? "rgba(57,255,110,0.3)" : "rgba(255,57,57,0.3)"}`,
              borderRadius: 8, padding: 28, marginBottom: 16, position: "relative", overflow: "hidden",
              boxShadow: result.online ? "0 0 40px rgba(57,255,110,0.05)" : "0 0 40px rgba(255,57,57,0.05)"
            }}>
              {/* Top accent line */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${result.online ? "#39ff6e" : "#ff3939"},transparent)` }} />

              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22 }}>
                <div>
                  <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: "#e8f4ff", lineHeight: 1.7, marginBottom: 6, wordBreak: "break-all" }}>{result.hostname || result._addr}</div>
                  <div style={{ fontSize: 11, color: "#4a6070" }}>{result._addr}:{result._port}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 4,
                    fontFamily: "'Press Start 2P', monospace", fontSize: 10,
                    background: result.online ? "rgba(57,255,110,0.1)" : "rgba(255,57,57,0.1)",
                    border: `1px solid ${result.online ? "rgba(57,255,110,0.3)" : "rgba(255,57,57,0.3)"}`,
                    color: result.online ? "#39ff6e" : "#ff3939",
                    boxShadow: result.online ? "0 0 14px rgba(57,255,110,0.1)" : "none"
                  }}>
                    {result.online && <div style={{ width: 7, height: 7, background: "#39ff6e", borderRadius: "50%", boxShadow: "0 0 6px #39ff6e", animation: "pulse 1.5s infinite" }} />}
                    {result.online ? "ONLINE" : "OFFLINE"}
                  </div>
                  {result.online && result.ping_ms && <PingBars ping={result.ping_ms} />}
                </div>
              </div>

              {/* MOTD */}
              <div style={{ background: "#000", border: "1px solid #1e2a38", borderRadius: 6, padding: "14px 18px", marginBottom: 20, position: "relative" }}>
                <div style={{ position: "absolute", top: -8, left: 12, background: "#0f1318", padding: "0 8px", fontSize: 9, letterSpacing: 2, color: "#4a6070", textTransform: "uppercase" }}>MOTD</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#e8f4ff", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{result.motd || "A Minecraft Server"}</div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
                <StatBlock label="Players Online" value={result.players_online?.toLocaleString() ?? "0"} color="#39ff6e"
                  sub={<div style={{ marginTop: 10, height: 4, background: "#1e2a38", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 1s ease", boxShadow: `0 0 6px ${barColor}` }} />
                  </div>}
                />
                <StatBlock label="Max Players" value={result.players_max?.toLocaleString() ?? "0"} color="#39c4ff" />
                <StatBlock label="Version" value={result.version || "—"} color="#ffd439" />
                <StatBlock label="Protocol" value={result.protocol ? `#${result.protocol}` : "—"} />
              </div>

              {/* Info rows */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
                {result.software && <InfoRow label="Software" value={result.software} />}
                {result.ip && <InfoRow label="IP Address" value={result.ip} />}
                {result.gamemode && <InfoRow label="Gamemode" value={result.gamemode} highlight />}
                {result.map && <InfoRow label="Map" value={result.map} />}
                {result.plugins_count != null && <InfoRow label="Plugins" value={result.plugins_count} />}
                {result.mods_count != null && <InfoRow label="Mods" value={result.mods_count} />}
                <InfoRow label="SRV Record" value={result.srv ? "✔ Yes" : "No"} />
                {result.notes && <div style={{ gridColumn: "1/-1", background: "rgba(57,196,255,0.06)", border: "1px solid rgba(57,196,255,0.2)", borderRadius: 6, padding: "10px 14px", fontSize: 11, color: "#39c4ff" }}>ℹ {result.notes}</div>}
              </div>
            </div>

            {/* Players list */}
            {result.players_list?.length > 0 && (
              <div style={{ background: "#0f1318", border: "1px solid #1e2a38", borderRadius: 8, padding: 24, marginBottom: 16 }}>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#4a6070", textTransform: "uppercase", letterSpacing: 3, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  Players Online
                  <div style={{ flex: 1, height: 1, background: "#1e2a38" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                  {result.players_list.map((name, i) => <PlayerCard key={i} name={name} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* History */}
        <div style={{ marginTop: result || loading ? 36 : 0 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#4a6070", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            Recent Searches
            <div style={{ flex: 1, height: 1, background: "#1e2a38" }} />
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: 28, fontSize: 11, color: "#4a6070", border: "1px dashed #1e2a38", borderRadius: 6, letterSpacing: 2 }}>No searches yet. Check a server above.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {history.map((h, i) => (
                <div key={i} onClick={() => { setAddr(h.addr); setPort(h.port); checkServer(h.addr, h.port); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "#0f1318", border: "1px solid #1e2a38", borderRadius: 6, padding: "11px 16px", cursor: "pointer", fontSize: 12, transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#39ff6e"; e.currentTarget.style.background = "rgba(57,255,110,0.04)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e2a38"; e.currentTarget.style.background = "#0f1318"; }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: h.online ? "#39ff6e" : "#ff3939", boxShadow: h.online ? "0 0 6px #39ff6e" : "none" }} />
                  <span style={{ color: "#e8f4ff", flex: 1 }}>{h.addr}{h.port !== "25565" ? `:${h.port}` : ""}</span>
                  <span style={{ color: "#4a6070", fontSize: 10 }}>{timeAgo(h.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer style={{ position: "relative", zIndex: 10, borderTop: "1px solid #1e2a38", padding: "18px 36px", textAlign: "center", fontSize: 10, color: "#4a6070", letterSpacing: 2, textTransform: "uppercase" }}>
        MCPulse · Real-time Minecraft Server Monitor · AI-Powered
      </footer>
    </div>
  );
}
