"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import OnboardingModal from "./components/OnboardingModal";
import SettingsPanel from "./components/SettingsPanel";
import { getApiKey, saveApiKey, getSettingsFolder, saveSettingsFolder, sendConfigToBackend } from "./lib/config";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "ws://localhost:8000";
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_MODEL || "gemma-4-26b-a4b-it";

const MODELS: { label: string; id: string }[] = [
  { label: "Gemma 4 31B",             id: "gemma-4-31b-it" },
  { label: "Gemma 4 26B",             id: "gemma-4-26b-a4b-it" },
  { label: "Gemma 3 27B",             id: "gemma-3-27b-it" },
  { label: "Gemma 3 12B",             id: "gemma-3-12b-it" },
  { label: "Gemma 3 4B",              id: "gemma-3-4b-it" },
  { label: "Gemma 3 1B",              id: "gemma-3-1b-it" },
  { label: "Gemma 3n E4B",            id: "gemma-3n-e4b-it" },
  { label: "Gemma 3n E2B",            id: "gemma-3n-e2b-it" },
  { label: "Gemini 3 Flash",          id: "gemini-3-flash-preview" },
  { label: "Gemini 3.1 Flash Lite",   id: "gemini-3.1-flash-lite-preview" },
];

const RECENT_DIRS_KEY = "freecode:recent_dirs";
const COMPACT_THRESHOLD_KEY = "freecode:compact_threshold";
const AUTO_COMPACT_KEY = "freecode:auto_compact";
const SESSION_ID_KEY = "freecode:session_id";
const DEFAULT_THRESHOLD = 80;

function generateSessionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    return generateSessionId();
  }
}

function loadRecentDirs(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_DIRS_KEY) || "[]"); } catch { return []; }
}
function saveRecentDir(dir: string) {
  const dirs = [dir, ...loadRecentDirs().filter(d => d !== dir)].slice(0, 8);
  localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(dirs));
}

function shortenPath(path: string | null): string {
  if (!path) return "~";
  // Windows: C:\Users\Name\Projects\foo -> ~\Projects\foo
  const parts = path.split(/[\\\/]/);
  const usersIdx = parts.findIndex(p => p.toLowerCase() === "users");
  if (usersIdx !== -1 && parts.length > usersIdx + 1) {
    // We assume parts[usersIdx+1] is the username
    return "~\\" + parts.slice(usersIdx + 2).join("\\");
  }
  // Fallback for non-User paths or simple names
  return path.length > 30 ? "..." + path.slice(-27) : path;
}

function getEffortColor(effort: string): string {
  switch (effort) {
    case "MINIMAL": return "#555";
    case "LOW":     return "#4a9";
    case "MEDIUM":  return "#da4";
    case "HIGH":    return "#d75";
    default:        return "#666";
  }
}

const EFFORT_BARS = ["▂", "▄", "▆", "█"];
const EFFORT_FILL: Record<string, number> = { MINIMAL: 1, LOW: 2, MEDIUM: 3, HIGH: 4 };

function EffortIcon({ effort }: { effort: string }) {
  const fill = EFFORT_FILL[effort] ?? 3;
  const color = getEffortColor(effort);
  return (
    <span className="effort-icon">
      {EFFORT_BARS.map((bar, i) => (
        <span key={i} style={{ color, opacity: i < fill ? 1 : 0.18 }}>{bar}</span>
      ))}
    </span>
  );
}

// ── Commands ─────────────────────────────────────────────────────────────────

type Command = { name: string; description: string; action?: string };

const EFFORT_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;
type Effort = typeof EFFORT_LEVELS[number];

const COMMANDS: Command[] = [
  { name: "/help",    description: "Show available commands and tips" },
  { name: "/clear",   description: "Clear the conversation history" },
  { name: "/compact", description: "Summarize and compact context to save tokens" },
  { name: "/effort",  description: "Cycle thinking effort: MINIMAL → LOW → MEDIUM → HIGH → MAX" },
  { name: "/model",   description: "Show current model name" },
  { name: "/cwd",     description: "Show current working directory" },
  { name: "/tools",   description: "List available tools (filesystem, shell…)" },
];

// ── Types ────────────────────────────────────────────────────────────────────

type MsgKind =
  | { kind: "user"; text: string }
  | { kind: "thinking"; chunks: string[]; done: boolean }
  | { kind: "tool_call"; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; name: string; result: string; error?: boolean }
  | { kind: "response"; chunks: string[] }
  | { kind: "system"; text: string }
  | { kind: "error"; text: string };

// ── Sub-components ───────────────────────────────────────────────────────────

function ThinkingBlock({ chunks, done }: { chunks: string[]; done: boolean }) {
  const [open, setOpen] = useState(false);
  const text = chunks.join("");
  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setOpen(o => !o)}>
        <span className={`thinking-expand${open ? " open" : ""}`}>▶</span>
        <span>∴ {done ? "Thought" : "Thinking…"}</span>
        {!open && text && <span style={{ color: "#333", fontSize: 11 }}>({Math.round(text.length / 4)} tokens)</span>}
      </div>
      {open && <div className="thinking-content">{text}</div>}
    </div>
  );
}

function ToolBlock({
  name,
  args,
  result,
  resultError,
}: {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  resultError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  return (
    <div className="tool-block">
      <div className="tool-header" onClick={() => setOpen(o => !o)}>
        <span className="tool-icon">⏵</span>
        <span className="tool-name">{name}</span>
        {!open && <span className="tool-args-inline">({argsStr})</span>}
        {result !== undefined && (
          <span style={{ marginLeft: "auto", color: resultError ? "#884444" : "#448844", fontSize: 11 }}>
            {resultError ? "✗" : "✓"}
          </span>
        )}
      </div>
      {open && (
        <>
          <div style={{ padding: "4px 8px 6px", color: "#555", fontSize: 11, borderTop: "1px solid #1c1c1c" }}>
            {argsStr || "(no args)"}
          </div>
          {result !== undefined && (
            <div className={`tool-result-block ${resultError ? "tool-result-err" : "tool-result-ok"}`}>
              {result}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResponseBlock({ chunks }: { chunks: string[] }) {
  const text = chunks.join("");
  const html = text
    .replace(/\*\*([^\*]+)\*\*/g, "<STRONG>$1</STRONG>")
    .replace(/\*([^\*]+)\*/g, "<EM>$1</EM>")
    .replace(/`([^`]+)`/g, "<CODE>$1</CODE>")
    .replace(/^### (.*?)$/gm, "<H3>$1</H3>")
    .replace(/^## (.*?)$/gm, "<H2>$1</H2>")
    .replace(/^# (.*?)$/gm, "<H1>$1</H1>")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;STRONG&gt;/g, "<strong>")
    .replace(/&lt;\/STRONG&gt;/g, "</strong>")
    .replace(/&lt;EM&gt;/g, "<em>")
    .replace(/&lt;\/EM&gt;/g, "</em>")
    .replace(/&lt;CODE&gt;/g, "<code>")
    .replace(/&lt;\/CODE&gt;/g, "</code>")
    .replace(/&lt;H1&gt;/g, "<h1>")
    .replace(/&lt;\/H1&gt;/g, "</h1>")
    .replace(/&lt;H2&gt;/g, "<h2>")
    .replace(/&lt;\/H2&gt;/g, "</h2>")
    .replace(/&lt;H3&gt;/g, "<h3>")
    .replace(/&lt;\/H3&gt;/g, "</h3>")
    .replace(/\n/g, "<br/>");
  return <div className="msg-response" dangerouslySetInnerHTML={{ __html: html }} />;
}

function UserMsg({ text }: { text: string }) {
  return (
    <div className="msg msg-user">
      <div className="msg-user-text">
        <span className="prompt-arrow">&gt;</span>
        <span>{text}</span>
      </div>
    </div>
  );
}

const SPINNER_VERBS = [
  'Accomplishing','Actioning','Actualizing','Architecting','Baking','Beaming',
  "Beboppin'",'Befuddling','Billowing','Blanching','Bloviating','Boogieing',
  'Boondoggling','Booping','Bootstrapping','Brewing','Bunning','Burrowing',
  'Calculating','Canoodling','Caramelizing','Cascading','Catapulting','Cerebrating',
  'Channeling','Choreographing','Churning','Coalescing','Cogitating','Combobulating',
  'Composing','Computing','Concocting','Considering','Contemplating','Cooking',
  'Crafting','Creating','Crunching','Crystallizing','Cultivating','Deciphering',
  'Deliberating','Determining','Dilly-dallying','Discombobulating','Doing',
  'Doodling','Drizzling','Ebbing','Effecting','Elucidating','Embellishing',
  'Enchanting','Envisioning','Evaporating','Fermenting','Fiddle-faddling',
  'Finagling','Flowing','Flummoxing','Fluttering','Forging','Forming','Frolicking',
  'Generating','Gesticulating','Germinating','Grooving','Harmonizing','Hashing',
  'Hatching','Herding','Hullaballooing','Hyperspacing','Ideating','Imagining',
  'Improvising','Incubating','Inferring','Infusing','Ionizing','Jitterbugging',
  'Kneading','Leavening','Levitating','Lollygagging','Manifesting','Marinating',
  'Meandering','Metamorphosing','Misting','Moonwalking','Moseying','Mulling',
  'Mustering','Musing','Nebulizing','Nesting','Noodling','Nucleating','Orbiting',
  'Orchestrating','Osmosing','Perambulating','Percolating','Perusing',
  'Philosophising','Photosynthesizing','Pollinating','Pondering','Pontificating',
  'Pouncing','Precipitating','Processing','Proofing','Propagating','Puttering',
  'Puzzling','Quantumizing','Razzle-dazzling','Recombobulating','Reticulating',
  'Roosting','Ruminating','Scampering','Schlepping','Scurrying','Seasoning',
  'Shenaniganing','Shimmying','Simmering','Skedaddling','Sketching','Slithering',
  'Smooshing','Spelunking','Spinning','Sprouting','Stewing','Sublimating',
  'Swirling','Swooping','Symbioting','Synthesizing','Tempering','Thinking',
  'Thundering','Tinkering','Tomfoolering','Transfiguring','Transmuting','Twisting',
  'Undulating','Unfurling','Unravelling','Vibing','Waddling','Wandering','Warping',
  'Whirlpooling','Whirring','Whisking','Wibbling','Working','Wrangling','Zesting','Zigzagging',
];

function WorkingIndicator() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [f, setF] = useState(0);
  const [verb, setVerb] = useState(() => SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)]);
  useEffect(() => {
    const t = setInterval(() => setF(i => (i + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setVerb(SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)]), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="working-indicator">
      <span>{frames[f]}</span>
      <span>{verb}…</span>
    </div>
  );
}

// ── Welcome screen ───────────────────────────────────────────────────────────

function Welcome({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="welcome-splash">
      <div className="splash-bird">
        <img src="/logo.svg" width="64" height="64" alt="FreeCode Logo" />
      </div>
      <h1 className="splash-title">FREECODE</h1>
      <p className="splash-subtitle">Your personal agentic coding assistant.</p>
      
      <div className="splash-hints">
        <div className="hint-row"><span className="hint-key">/model</span> Choose your intelligence</div>
        <div className="hint-row"><span className="hint-key">/compact</span> Summarize and shrink context</div>
        <div className="hint-row"><span className="hint-key">/help</span> Review all commands</div>
      </div>
    </div>
  );
}

// ── Model Picker ─────────────────────────────────────────────────────────────

function ModelPicker({ current, onSelect, onClose }: { current: string; onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <div className="dir-overlay" onClick={onClose}>
      <div className="dir-box" onClick={e => e.stopPropagation()}>
        <div className="dir-title">Select model</div>
        {MODELS.map(m => (
          <div
            key={m.id}
            className="dir-recent-row"
            style={{ fontWeight: m.id === current ? "bold" : undefined, color: m.id === current ? "#fff" : undefined }}
            onClick={() => { onSelect(m.id); onClose(); }}
          >
            <span className="dir-recent-arrow">▶</span>
            <span>{m.label}</span>
            <span style={{ marginLeft: "auto", color: "#555", fontSize: 11 }}>{m.id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Directory Picker ─────────────────────────────────────────────────────────

function DirPicker({ onSelect, onBrowse, recents }: { onSelect: (dir: string) => void; onBrowse: () => void; recents: string[] }) {
  const [val, setVal] = useState("");
  // Merge locally stored recents with server recents
  const localRecents = loadRecentDirs();
  const allRecents = Array.from(new Set([...recents, ...localRecents])).slice(0, 10);

  const submit = (dir: string) => {
    const d = dir.trim() || ".";
    saveRecentDir(d);
    onSelect(d);
  };

  return (
    <div className="dir-overlay">
      <div className="dir-box">
        <div className="dir-title">Choose working directory</div>
        <input
          className="dir-input"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(val); }}
          placeholder="C:\path\to\project  (or . for current)"
          autoFocus
        />
        <button className="dir-btn" onClick={() => submit(val)}>Open</button>
        <button className="dir-btn dir-btn-secondary" style={{ marginLeft: 8 }} onClick={onBrowse}>Browse...</button>
        {allRecents.length > 0 && (
          <>
            <div className="dir-recents-label">Recent folders</div>
            {allRecents.map(d => (
              <div key={d} className="dir-recent-row" onClick={() => submit(d)}>
                <span className="dir-recent-arrow">▶</span>
                <span className="dir-recent-text" title={d}>{d}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<MsgKind[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [working, setWorking] = useState(false);
  const [sessionId] = useState<string>(() =>
    typeof window !== "undefined" ? getOrCreateSessionId() : generateSessionId()
  );
  const [model, setModel] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    return localStorage.getItem("freecode:model") || DEFAULT_MODEL;
  });
  const [effort, setEffort] = useState<typeof EFFORT_LEVELS[number]>("MEDIUM");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [serverRecents, setServerRecents] = useState<string[]>([]);
  const [contextPct, setContextPct] = useState<number | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [savedSessions, setSavedSessions] = useState<Record<string, { id: string, name: string, updatedAt: number, messages: MsgKind[], workingDir?: string }>>({});
  const [compactThreshold, setCompactThreshold] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_THRESHOLD;
    return Number(localStorage.getItem(COMPACT_THRESHOLD_KEY) ?? DEFAULT_THRESHOLD);
  });
  const [autoCompact, setAutoCompact] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(AUTO_COMPACT_KEY) !== "false";
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const paletteMatches = (() => {
    if (!input.startsWith("/")) return [];
    if (input.startsWith("/model ")) {
      const search = input.slice(7).toLowerCase();
      return MODELS
        .filter(m => m.id.toLowerCase().includes(search) || m.label.toLowerCase().includes(search))
        .map(m => ({ name: `/model ${m.id}`, description: m.label }));
    }
    return COMMANDS.filter(c => c.name.startsWith(input.toLowerCase()));
  })();
  const paletteOpen = paletteMatches.length > 0;

  // Track pending tool calls so we can attach results
  const pendingToolRef = useRef<Map<string, number>>(new Map());

  // Check onboarding status on mount
  useEffect(() => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setShowOnboarding(true);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleOnboardingComplete = useCallback(async (apiKey: string, settingsFolder: string) => {
    saveApiKey(apiKey);
    saveSettingsFolder(settingsFolder);
    await sendConfigToBackend(apiKey, settingsFolder);
    setShowOnboarding(false);
  }, []);

  const handleServerMessage = useCallback((raw: string) => {
    const msg = JSON.parse(raw);

    // Non-chat protocol messages — handle without touching setMessages
    if (msg.type === "hello") {
      if (msg.recent_dirs) setServerRecents(msg.recent_dirs);
      return;
    }
    if (msg.type === "session") {
      return;
    }
    if (msg.type === "sessions_list") {
      const backendSessions = (msg.sessions ?? []) as Array<{ id: string; name: string; updated_at: string; working_dir: string; model: string }>;
      setSavedSessions(prev => {
        const next = { ...prev };
        for (const s of backendSessions) {
          // Merge backend sessions in — don't overwrite current session's live messages
          if (!next[s.id] || next[s.id].messages.length === 0) {
            next[s.id] = {
              id: s.id,
              name: s.name,
              updatedAt: new Date(s.updated_at ?? 0).getTime(),
              messages: next[s.id]?.messages ?? [],
              workingDir: s.working_dir,
            };
          }
        }
        return next;
      });
      return;
    }

    setMessages(prev => {
      const next = [...prev];

      switch (msg.type) {
        case "thinking": {
          const last = next[next.length - 1];
          if (last?.kind === "thinking" && !last.done) {
            last.chunks.push(msg.chunk ?? "");
          } else {
            next.push({ kind: "thinking", chunks: [msg.chunk ?? ""], done: false });
          }
          break;
        }

        case "tool_call": {
          const idx = next.length;
          pendingToolRef.current.set(msg.tool_name, idx);
          next.push({ kind: "tool_call", name: msg.tool_name, args: msg.tool_args ?? {} });
          break;
        }

        case "tool_result": {
          const toolIdx = pendingToolRef.current.get(msg.tool_name);
          if (toolIdx !== undefined) {
            const block = next[toolIdx];
            if (block?.kind === "tool_call") {
              next[toolIdx] = {
                kind: "tool_result",
                name: block.name,
                args: block.args,
                result: msg.result ?? "",
              } as any;
            }
            pendingToolRef.current.delete(msg.tool_name);
          } else {
            next.push({ kind: "tool_result", name: msg.tool_name, result: msg.result ?? "" });
          }
          break;
        }

        case "response": {
          // Mark any open thinking as done
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].kind === "thinking") { (next[i] as any).done = true; break; }
          }
          const last = next[next.length - 1];
          if (last?.kind === "response") {
            last.chunks.push(msg.chunk ?? "");
          } else {
            next.push({ kind: "response", chunks: [msg.chunk ?? ""] });
          }
          break;
        }

        case "system": {
          const text = msg.message ?? "";
          next.push({ kind: "system", text });
          if (text.startsWith("Working directory: ")) {
            const dir = text.replace("Working directory: ", "").trim();
            setWorkingDir(dir);
          }
          break;
        }

        case "done":
          setWorking(false);
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].kind === "thinking") { (next[i] as any).done = true; break; }
          }
          if (msg.context_pct != null) {
            setContextPct(msg.context_pct);
          }
          break;

        case "error":
          next.push({ kind: "error", text: msg.error ?? "Unknown error" });
          setWorking(false);
          break;
      }

      return next;
    });

    setTimeout(scrollToBottom, 20);
  }, [scrollToBottom]);

  // Persist session messages + working dir
  useEffect(() => {
    if (messages.length > 0) {
      setSavedSessions(prev => {
        const next = { ...prev };
        const name = messages.find(m => m.kind === "user")?.text.slice(0, 30) || "New Session";
        next[sessionId] = {
          id: sessionId,
          name: name.length === 30 ? name + "..." : name,
          updatedAt: Date.now(),
          messages,
          workingDir: workingDir ?? undefined,
        };
        localStorage.setItem("freecode:sessions", JSON.stringify(next));
        return next;
      });
    }
  }, [messages, sessionId, workingDir]);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("freecode:sessions") || "{}");
      setSavedSessions(data);
      if (data[sessionId] && messages.length === 0) {
        setMessages(data[sessionId].messages);
        // Restore working dir from session
        if (data[sessionId].workingDir) {
          setWorkingDir(data[sessionId].workingDir);
          localStorage.setItem("freecode:working_dir", data[sessionId].workingDir);
        }
      }
    } catch {}
  }, [sessionId]);

  // Load workingDir from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("freecode:working_dir");
    if (saved) setWorkingDir(saved);
  }, []);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(COMPACT_THRESHOLD_KEY, String(compactThreshold));
  }, [compactThreshold]);
  useEffect(() => {
    localStorage.setItem(AUTO_COMPACT_KEY, String(autoCompact));
  }, [autoCompact]);
  useEffect(() => {
    localStorage.setItem("freecode:model", model);
  }, [model]);

  // Auto-compact when threshold exceeded
  useEffect(() => {
    if (autoCompact && contextPct != null && contextPct >= compactThreshold) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "user_input", text: "Please summarize our conversation so far to compact the context.", effort, session_id: sessionId }));
      }
    }
  }, [contextPct, autoCompact, compactThreshold, effort, sessionId]);

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let dead = false;

    function connect() {
      const ws = new WebSocket(BACKEND_URL);

      ws.onopen = () => {
        setConnected(true);
        retryDelay = 1000;
        // Re-announce session + working dir to backend after connect/reconnect
        const savedDir = localStorage.getItem("freecode:working_dir");
        const savedSes = (() => { try { return JSON.parse(localStorage.getItem("freecode:sessions") || "{}"); } catch { return {}; } })();
        const sesId = localStorage.getItem(SESSION_ID_KEY) || sessionId;
        const sesDir = savedSes[sesId]?.workingDir || savedDir;
        if (sesDir) {
          ws.send(JSON.stringify({ type: "user_input", text: "__init__", session_id: sesId, working_dir: sesDir, model: localStorage.getItem("freecode:model") || DEFAULT_MODEL }));
          // Request sessions list for this working dir
          ws.send(JSON.stringify({ type: "list_sessions", working_dir: sesDir, session_id: sesId }));
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!dead) retryTimeout = setTimeout(connect, retryDelay = Math.min(retryDelay * 2, 10000));
      };
      ws.onerror = () => { /* onclose fires after, handles retry */ };
      ws.onmessage = e => handleServerMessage(e.data);

      wsRef.current = ws;
    }

    connect();
    return () => {
      dead = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      wsRef.current?.close();
    };
  }, [handleServerMessage]);

  // Reset palette selection when input changes
  useEffect(() => { setPaletteIdx(0); }, [input]);

  const runCommand = useCallback((rawInput: string) => {
    const name = rawInput.split(" ")[0];
    setInput("");
    switch (name) {
      case "/clear":
        setMessages([]);
        break;
      case "/model": {
        const parts = rawInput.split(" ");
        if (parts.length > 1) {
          const newModel = parts[1];
          setModel(newModel);
          setMessages(p => [...p, { kind: "system", text: `Model switched to ${newModel}` }]);
        } else {
          setMessages(p => [...p, { kind: "system", text: `Current model: ${model} (type /model [name] to switch)` }]);
        }
        break;
      }
      case "/cwd":
        setMessages(p => [...p, { kind: "system", text: `Working dir: ${workingDir ?? "."}` }]);
        break;
      case "/tools":
        setMessages(p => [...p, { kind: "system", text: "Available tools: filesystem (ls, read, write, edit, find), shell (run)" }]);
        break;
      case "/help":
        setMessages(p => [...p, { kind: "system", text: COMMANDS.map(c => `${c.name.padEnd(12)} ${c.description}`).join("\n") }]);
        break;
      case "/effort": {
        const next = EFFORT_LEVELS[(EFFORT_LEVELS.indexOf(effort) + 1) % EFFORT_LEVELS.length];
        setEffort(next);
        // Silent — reflected in status bar only, no chat spam
        break;
      }
      case "/compact":
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: "user_input", text: "/compact — please summarize our conversation so far", effort, session_id: sessionId }));
        break;
    }
  }, [effort, setEffort, workingDir, sessionId, model]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    // If palette is open and user presses Enter, select highlighted command
    if (paletteOpen) {
      runCommand(paletteMatches[paletteIdx]?.name ?? text);
      return;
    }

    // Handle slash commands
    if (text.startsWith("/")) {
      runCommand(text);
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setInput("");
    setWorking(true);
    setMessages(prev => [...prev, { kind: "user", text }]);
    setTimeout(scrollToBottom, 20);
    wsRef.current.send(JSON.stringify({ type: "user_input", text, effort, working_dir: workingDir ?? ".", model, session_id: sessionId }));
  }, [input, paletteOpen, paletteMatches, paletteIdx, runCommand, scrollToBottom, model, workingDir, effort, sessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (paletteOpen) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPaletteIdx(i => (i - 1 + paletteMatches.length) % paletteMatches.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPaletteIdx(i => (i + 1) % paletteMatches.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setInput(paletteMatches[paletteIdx]?.name ?? input);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [paletteOpen, paletteMatches, paletteIdx, input, handleSend]);

  const renderMessage = (msg: MsgKind, i: number) => {
    switch (msg.kind) {
      case "user":
        return <UserMsg key={i} text={msg.text} />;

      case "thinking":
        return (
          <div key={i} className="msg msg-assistant">
            <ThinkingBlock chunks={msg.chunks} done={msg.done} />
          </div>
        );

      case "tool_call":
        return (
          <div key={i} className="msg msg-assistant">
            <ToolBlock name={msg.name} args={msg.args} />
          </div>
        );

      case "tool_result":
        return (
          <div key={i} className="msg msg-assistant">
            <ToolBlock
              name={(msg as any).name}
              args={(msg as any).args ?? {}}
              result={msg.result}
              resultError={(msg as any).error}
            />
          </div>
        );

      case "response":
        return (
          <div key={i} className="msg msg-assistant">
            <ResponseBlock chunks={msg.chunks} />
          </div>
        );

      case "system":
        return <div key={i} className="msg-system">{msg.text}</div>;

      case "error":
        return <div key={i} className="msg-error">✗ {msg.text}</div>;
    }
  };

  const handleDirSelect = (dir: string) => {
    setWorkingDir(dir);
    localStorage.setItem("freecode:working_dir", dir);
    saveRecentDir(dir);
    // Request sessions for this project directory
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "list_sessions", working_dir: dir, session_id: sessionId }));
    }
  };

  return (
    <div className="app">
      {/* Onboarding modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        initialApiKey={getApiKey() || ""}
        initialSettingsFolder={getSettingsFolder() || ""}
      />

      {/* Settings panel */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Model picker overlay */}
      {modelPickerOpen && (
        <ModelPicker
          current={model}
          onSelect={(id) => {
            setModel(id);
            setMessages(p => [...p, { kind: "system", text: `Model switched to ${id}` }]);
          }}
          onClose={() => setModelPickerOpen(false)}
        />
      )}

      {/* Directory picker overlay — shown until a dir is chosen */}
      {workingDir === null && (
        <DirPicker
          onSelect={handleDirSelect}
          onBrowse={() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "pick_dir", session_id: sessionId }));
            }
          }}
          recents={serverRecents}
        />
      )}

      {/* Main Layout Area */}
      <div className="main-row">
        {/* Sidebar */}
        <div className={`sidebar-col ${sidebarOpen ? "" : "closed"}`}>
          <div className="sidebar-header">
              <span className="sidebar-title">SESSIONS</span>
              <button className="sidebar-new-btn" title="New Chat" onClick={() => {
                if (working) {
                  if (confirm("Session is still working. Start new chat anyway?")) {
                    localStorage.removeItem(SESSION_ID_KEY);
                    window.location.reload();
                  }
                } else {
                  localStorage.removeItem(SESSION_ID_KEY);
                  window.location.reload();
                }
              }}>+</button>
            </div>
            <input 
              className="sidebar-search" 
              placeholder="Search chats..." 
              value={sessionSearch}
              onChange={e => setSessionSearch(e.target.value)}
            />
            <div className="sidebar-list">
              {Object.values(savedSessions)
                .filter(ses => ses.name.toLowerCase().includes(sessionSearch.toLowerCase()))
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map(ses => (
                  <div 
                    key={ses.id} 
                    className={`sidebar-item ${ses.id === sessionId ? "sidebar-item-active" : ""}`}
                    onClick={() => {
                      if (ses.id !== sessionId) {
                        localStorage.setItem(SESSION_ID_KEY, ses.id);
                        window.location.reload();
                      }
                    }}
                  >
                    <div className="sidebar-item-row">
                      <div className="sidebar-item-name">{ses.id === sessionId ? "Current Chat" : ses.name}</div>
                      <button 
                        className="sidebar-item-del" 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this session?")) {
                            setSavedSessions(prev => {
                              const next = { ...prev };
                              delete next[ses.id];
                              localStorage.setItem("freecode:sessions", JSON.stringify(next));
                              return next;
                            });
                            if (ses.id === sessionId) {
                              localStorage.removeItem(SESSION_ID_KEY);
                              window.location.reload();
                            }
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="sidebar-item-time">{new Date(ses.updatedAt).toLocaleTimeString()}</div>
                  </div>
              ))}
              {Object.keys(savedSessions).length === 0 && (
                <div className="sidebar-empty">No saved sessions</div>
              )}
            </div>
          </div>

        <div className="chat-col">
          {/* Messages area */}
          <div className="messages-area">
            <Welcome show={messages.length === 0} />
            {messages.map(renderMessage)}
            {working && (
              <div className="msg msg-assistant">
                <WorkingIndicator />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Section */}
          <div className="input-outer">
            {!connected ? (
              <div className="input-area input-area-offline">
                <span className="status-dot offline">●</span>
                <span className="input-offline-msg">
                  Disconnected — run <code>start-backend.bat</code> to reconnect
                </span>
              </div>
            ) : (
              <div className="input-container">
                {paletteOpen && (
                  <div className="cmd-palette-floating">
                    {paletteMatches.map((cmd, i) => (
                      <div
                        key={cmd.name}
                        className={`cmd-row${i === paletteIdx ? " cmd-row-active" : ""}`}
                        onMouseEnter={() => setPaletteIdx(i)}
                        onClick={() => runCommand(cmd.name)}
                      >
                        <span className="cmd-name">{cmd.name}</span>
                        <span className="cmd-desc">{cmd.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="input-box">
                  <span className="input-prompt divider">│</span>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={messages.length === 0 ? "What's the plan?" : ""}
                    autoFocus
                  />
                  {working && <span className="input-hint">running ▂▄▆</span>}
                  {!working && input === "" && messages.length > 0 && <span className="input-hint ghost">/ for commands · esc to clear</span>}
                </div>
              </div>
            )}
          </div>

          {/* Context bar */}
          {contextPct != null && (
            <div className={`ctx-bar${contextPct >= compactThreshold ? " ctx-bar-warn" : ""}`}>
              <div className="ctx-bar-track">
                <div className="ctx-bar-fill" style={{ width: `${contextPct}%` }} />
              </div>
              <span className="ctx-bar-label">
                {contextPct.toFixed(0)}% ctx
                {contextPct >= compactThreshold && (
                  <span className="ctx-bar-action" onClick={() => runCommand("/compact")}> · compact</span>
                )}
              </span>
              <label className="ctx-toggle" title="Toggle auto-compact">
                <input type="checkbox" checked={autoCompact} onChange={e => setAutoCompact(e.target.checked)} />
                <span>{autoCompact ? " auto" : " manual"}</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <div className="status-left">
          <span className="status-val clickable sidetoggle" onClick={() => setSidebarOpen(s => !s)} title="Toggle sessions sidebar">
            ☰
          </span>
          <img src="/logo.svg" width="14" height="14" style={{ opacity: 0.5, marginRight: 4 }} alt="" />
          <span className={`status-dot ${connected ? "online" : "offline"}`}>●</span>
          <span className="status-label">freecode v2.0</span>
          <span className="sep">·</span>
          <span className="status-label">model </span>
          <span className="status-val clickable" onClick={() => setModelPickerOpen(true)}>{model}</span>
        </div>
        <div className="status-right">
          <span className="status-val clickable" onClick={() => setShowSettings(true)} title="Open settings">⚙</span>
          <span className="sep">·</span>
          <span className="status-val clickable" onClick={() => setWorkingDir(null)}>
            {shortenPath(workingDir)}
          </span>
          <span className="sep">·</span>
          <span className="status-val clickable effort-cell" onClick={() => runCommand("/effort")}>
            <span className="status-label" style={{ color: "#666", opacity: 0.7 }}>effort </span>
            <EffortIcon effort={effort} />
          </span>
        </div>
      </div>
    </div>
  );
}
