import { useState, useEffect, useRef, useCallback } from "react";

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; background: #080A0F; font-family: 'Plus Jakarta Sans', sans-serif; }
  textarea { font-family: 'Plus Jakarta Sans', sans-serif; }
  input { font-family: 'Plus Jakarta Sans', sans-serif; }
  button { font-family: 'Plus Jakarta Sans', sans-serif; }
  @keyframes popIn { from { transform: scale(0.5) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`;

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:           "#080A0F",
  surface:      "#10131A",
  surfaceHigh:  "#181D27",
  border:       "#1E2535",
  text:         "#EEF0F8",
  textSub:      "#7A8499",
  textMuted:    "#3D4556",
  accent:       "#FF6B35",
};

// ─── STORAGE (shared = persists for ALL users) ────────────────────────────────
async function dbGet(key) {
  try {
    const r = await window.storage.get(key, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function dbSet(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), true); return true; }
  catch { return false; }
}

// ─── PASSWORD HASHING ─────────────────────────────────────────────────────────
async function hashPw(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── AUTH FUNCTIONS ───────────────────────────────────────────────────────────
async function registerUser(username, password) {
  const u = username.trim().toLowerCase();
  if (u.length < 3) return { error: "Username must be at least 3 characters" };
  if (password.length < 6) return { error: "Password must be at least 6 characters" };
  if (!/^[a-z0-9_]+$/.test(u)) return { error: "Only letters, numbers and underscore allowed" };

  const reg = (await dbGet("ds:registry")) || {};
  if (reg[u]) return { error: "Username already taken" };

  const hash = await hashPw(password);
  reg[u] = { hash, displayName: username.trim(), createdAt: Date.now() };
  await dbSet("ds:registry", reg);
  const data = makeUserData(u, username.trim());
  await dbSet("ds:user:" + u, data);
  return { ok: true, username: u, displayName: username.trim() };
}

async function loginUser(username, password) {
  const u = username.trim().toLowerCase();
  const reg = (await dbGet("ds:registry")) || {};
  if (!reg[u]) return { error: "Username not found" };
  const hash = await hashPw(password);
  if (reg[u].hash !== hash) return { error: "Incorrect password" };
  const data = (await dbGet("ds:user:" + u)) || makeUserData(u, reg[u].displayName);
  return { ok: true, username: u, displayName: reg[u].displayName, data };
}

// ─── USER DATA MODEL ──────────────────────────────────────────────────────────
function makeUserData(username, displayName) {
  return {
    username, displayName,
    activeTracks: [],
    onboarded: false,
    streaks: {},        // { dsa: 5, "dsa-date": "2025-01-14" }
    xp: 0,
    completedToday: {}, // { "dsa-quick": "2025-01-15" }
    lastDate: null,
  };
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function resetIfNewDay(data) {
  const today = todayStr();
  if (data.lastDate && data.lastDate !== today) {
    data = { ...data, completedToday: {}, lastDate: today };
  } else {
    data = { ...data, lastDate: today };
  }
  return data;
}

// ─── DAILY QUESTIONS ──────────────────────────────────────────────────────────
const TRACK_TOPICS = {
  dsa:        ["Two Pointers","Sliding Window","Binary Search","BFS & DFS","Dynamic Programming","Graphs","Trees & Tries","Heaps","Backtracking","Greedy","Stack & Queue","Linked Lists"],
  sysdesign:  ["Rate Limiting","URL Shortener","Message Queues","Caching","Load Balancing","Database Sharding","CDN Design","Pub/Sub","API Gateway","Distributed Locks"],
  sql:        ["INNER vs OUTER JOINs","Window Functions","Query Optimization","CTEs","Indexing","Transactions","Normalization","Aggregations","Subqueries","Stored Procedures"],
  java:       ["OOP & SOLID","Collections","Concurrency","JVM & GC","Streams & Lambdas","Generics","Exception Handling","Design Patterns","Java 17 Features","Reflection"],
  springboot: ["Dependency Injection","REST Controllers","Spring Data JPA","Spring Security","Transactions","Auto-Configuration","Spring Testing","AOP","Actuator","Caching"],
  ai:         ["LLM Fundamentals","RAG Architecture","Prompt Engineering","Embeddings","LLM Agents","Fine-tuning vs RAG","AI in Production","Evaluation","Multimodal Models","AI Safety"],
};

const FALLBACK = {
  dsa:        { topic:"Two Pointers", question:"Given a sorted array, find two numbers that add up to a target. Explain your approach and complexity.", hint:"Start pointers at both ends, move based on the current sum.", pseudoCode:"left=0, right=len-1\nwhile left < right:\n  s = arr[left]+arr[right]\n  if s==target → return [left,right]\n  if s<target  → left++\n  else         → right--", correctAnswer:"Two pointers from both ends. If sum < target move left pointer right (need bigger value). If sum > target move right pointer left. O(n) time O(1) space — optimal because the array is sorted so we never need to backtrack.", followUp:"How does this change if the array is unsorted?", followUpAnswer:"Sort first in O(n log n) then apply two pointers. Or use a HashMap for O(n) time but O(n) extra space. Choose based on memory constraints.", xp:20 },
  sysdesign:  { topic:"Caching", question:"Explain cache-aside vs write-through caching. When would you pick each?", hint:"Who populates the cache and what happens on a write?", pseudoCode:"// Cache-aside\ndata = cache.get(key)\nif null: data=db.get(key); cache.set(key,data,ttl)\n\n// Write-through\ndb.write(key,val)\ncache.set(key,val)", correctAnswer:"Cache-aside: app checks cache first, fills on miss — can be stale, great for read-heavy. Write-through: every write updates both DB and cache — always fresh but write latency doubles. Use cache-aside for social feeds; write-through for account balances.", followUp:"What is a cache stampede and how do you prevent it?", followUpAnswer:"When a hot cache key expires, thousands of requests hit the DB simultaneously. Fix: probabilistic early expiry, a distributed lock so only one request regenerates it, or background async refresh.", xp:20 },
  sql:        { topic:"Window Functions", question:"Write a query to rank employees by salary within each department. What is the difference between RANK, DENSE_RANK, and ROW_NUMBER?", hint:"PARTITION BY separates groups, ORDER BY sets rank order within each group.", pseudoCode:"SELECT name, dept, salary,\n  RANK()       OVER (PARTITION BY dept ORDER BY salary DESC),\n  DENSE_RANK() OVER (PARTITION BY dept ORDER BY salary DESC),\n  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)\nFROM employees;", correctAnswer:"RANK skips numbers on ties (1,1,3). DENSE_RANK never skips (1,1,2). ROW_NUMBER is always unique even for ties. Use DENSE_RANK when you want top N salary levels, ROW_NUMBER for pagination. Unlike GROUP BY, PARTITION BY keeps every row visible.", followUp:"How is PARTITION BY fundamentally different from GROUP BY?", followUpAnswer:"GROUP BY collapses rows into one aggregate row per group — you lose individual data. PARTITION BY keeps every original row and adds the window function result alongside it. That's why window functions are so powerful for analytics.", xp:20 },
  java:       { topic:"Collections", question:"When would you choose HashMap vs LinkedHashMap vs TreeMap? What are their time complexities?", hint:"Focus on ordering guarantees and what operations each optimises.", pseudoCode:"HashMap:       O(1) avg — no ordering\nLinkedHashMap: O(1) avg — insertion order preserved\nTreeMap:       O(log n) — keys always sorted\n// TreeMap extras: floorKey, ceilingKey, subMap", correctAnswer:"HashMap for fastest lookups with no ordering need. LinkedHashMap when insertion order matters (LRU cache). TreeMap when you need sorted keys or range queries. Never use TreeMap when O(1) from HashMap is sufficient.", followUp:"How do you implement a simple LRU cache using Java built-ins?", followUpAnswer:"Extend LinkedHashMap with accessOrder=true and override removeEldestEntry to return true when size exceeds capacity. This gives O(1) LRU in about 5 lines.", xp:20 },
  springboot: { topic:"Transactions", question:"What does @Transactional guarantee, and name two cases where it silently fails.", hint:"Spring uses proxies — think about what proxy-based AOP cannot intercept.", pseudoCode:"@Transactional\npublic void place(Order o) {\n  repo.save(o); inventory.deduct(); // atomic\n}\n// BROKEN: self-invocation bypasses proxy\npublic void process(Order o) { place(o); }\n// BROKEN: private methods not intercepted", correctAnswer:"@Transactional wraps the method in a DB transaction — commit on success, rollback on RuntimeException. Silent failures: (1) self-invocation — calling a @Transactional method from the same class bypasses Spring's proxy. (2) private methods — the proxy cannot intercept them. Checked exceptions also don't rollback by default.", followUp:"How do you force rollback on a checked exception?", followUpAnswer:"Use @Transactional(rollbackFor = Exception.class). By default only RuntimeException triggers rollback. This is a common production bug — devs assume all exceptions cause rollback but they don't.", xp:20 },
  ai:         { topic:"RAG Architecture", question:"Explain the RAG pipeline and why it is often preferred over fine-tuning for adding new knowledge to an LLM.", hint:"Consider data freshness, cost, auditability, and what each approach actually changes.", pseudoCode:"// BUILD: chunk docs → embed → store in vector DB\n// QUERY:\nvec   = embed(user_query)\ndocs  = vector_db.search(vec, k=5)\nreply = llm(context=docs, query=user_query)", correctAnswer:"RAG retrieves relevant document chunks at inference time and injects them as context. It beats fine-tuning for: live/changing data (no retraining), auditability (show source docs), lower cost (no GPU training), and preventing knowledge cutoff issues. Fine-tuning wins for changing model reasoning style or tone.", followUp:"What is the biggest RAG failure mode and how do you mitigate it?", followUpAnswer:"The retriever fetches irrelevant chunks and the LLM confidently hallucinates. Fix with reranking (cross-encoder re-scores top-k), a 'no context found' escape hatch in the prompt, source citations, and evaluating retrieval quality separately from generation quality.", xp:20 },
};

const DEEP_PLANS = {
  dsa:        ["Arrays & Two Pointers","Sliding Window Patterns","Binary Search Variants","Linked Lists","Trees & BFS/DFS","Mock Interview: 1 Medium Problem"],
  sysdesign:  ["CAP Theorem & Fundamentals","Database Design & Sharding","Caching Deep Dive","Design a URL Shortener","Message Queues & Pub/Sub","Mock: Design Instagram Feed"],
  sql:        ["SQL Foundations & NULLs","JOINs Deep Dive","Window Functions","Query Optimization","CTEs & Recursive Queries","Mock SQL: 3 Timed Problems"],
  java:       ["OOP & SOLID","Collections Internals","Concurrency & Thread Safety","JVM & GC","Java 8–17 Features","Mock: Build a Thread-Safe Queue"],
  springboot: ["Dependency Injection & Beans","Spring MVC & REST","Spring Data JPA & N+1","Spring Security & JWT","Transactions & Testing","Mock: Trace a Request End-to-End"],
  ai:         ["LLM Fundamentals","Prompt Engineering","RAG Deep Dive","LLM Agents & Tool Use","AI in Production","Mock: Design an AI Coding Assistant"],
};

function dayOfYear() {
  const n = new Date();
  return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 86400000);
}

async function generateDailyQuestions(activeTracks) {
  const day = dayOfYear();
  const questions = {};
  for (const id of activeTracks) {
    const topics = TRACK_TOPICS[id] || [];
    const topic = topics[day % topics.length];
    const trackLabel = TRACKS.find(t => t.id === id)?.label || id;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          messages: [{
            role: "user",
            content: `You are an expert software engineering interview coach. Generate ONE focused interview question about "${topic}" for: ${trackLabel}. Rules: answerable in 2-3 minutes, DSA must include pseudocode (NOT full code), correct_answer 3-5 sentences, include follow-up. Respond ONLY with valid JSON (no markdown, no preamble): {"topic":"${topic}","question":"...","hint":"one sentence","pseudoCode":"..." or null,"correctAnswer":"3-5 sentences","followUp":"...","followUpAnswer":"2-3 sentences","xp":20}`
          }],
        }),
      });
      const data = await res.json();
      const text = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      questions[id] = JSON.parse(text);
    } catch {
      questions[id] = FALLBACK[id] || FALLBACK.dsa;
    }
  }
  return { date: todayStr(), questions };
}

async function getOrGenQuestions(activeTracks) {
  const today = todayStr();
  const cached = await dbGet("ds:daily:" + today);
  if (cached) return cached;
  const fresh = await generateDailyQuestions(activeTracks);
  await dbSet("ds:daily:" + today, fresh);
  return fresh;
}

// ─── LEVELS ───────────────────────────────────────────────────────────────────
const LEVELS = [
  { xp: 0,    title: "Beginner Dev",    emoji: "🌱" },
  { xp: 150,  title: "Code Curious",    emoji: "📚" },
  { xp: 400,  title: "Algo Apprentice", emoji: "⚡" },
  { xp: 800,  title: "Pattern Hunter",  emoji: "🎯" },
  { xp: 1500, title: "Interview Ready", emoji: "💼" },
  { xp: 3000, title: "SDE2 Slayer",     emoji: "🔥" },
];

function getLevel(xp) {
  let lv = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.xp) lv = l; }
  const idx = LEVELS.indexOf(lv);
  const next = LEVELS[idx + 1];
  return {
    ...lv,
    progress: next ? Math.min(((xp - lv.xp) / (next.xp - lv.xp)) * 100, 100) : 100,
    nextXp: next?.xp ?? lv.xp,
    nextTitle: next?.title ?? "MAX",
  };
}

// ─── TRACKS ───────────────────────────────────────────────────────────────────
const TRACKS = [
  { id: "dsa",        label: "DSA",           icon: "⚡", color: "#FF6B35", dark: "#C94E1A" },
  { id: "sysdesign",  label: "System Design", icon: "🏗️", color: "#7C3AED", dark: "#5B21B6" },
  { id: "sql",        label: "SQL",           icon: "🗄️", color: "#0EA5E9", dark: "#0369A1" },
  { id: "java",       label: "Java",          icon: "☕", color: "#D97706", dark: "#92400E" },
  { id: "springboot", label: "Spring Boot",   icon: "🌿", color: "#16A34A", dark: "#14532D" },
  { id: "ai",         label: "AI for Devs",   icon: "🤖", color: "#DB2777", dark: "#9D174D" },
];

// ─── MICRO COMPONENTS ─────────────────────────────────────────────────────────
function FlameIcon({ size = 18, lit = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <path d="M12 2C10 5.5 7.5 8 7.5 12a4.5 4.5 0 009 0c0-2.2-.7-4-1.5-5 0 0-.8 1.8-2 1.8-.9 0-1.4-.9-1.4-1.6C11.6 5.8 13.5 3.5 12 2z"
        fill={lit ? "#FF6B35" : "#1E2535"} />
      <path d="M12 22C8.4 22 5.5 19.1 5.5 15.5c0-4 3.5-7.5 3.5-7.5s.5 3 3 3 3-3 3-3 3.5 3.5 3.5 7.5C18.5 19.1 15.6 22 12 22z"
        fill={lit ? "#FF9A6C" : "#141820"} opacity="0.75" />
    </svg>
  );
}

function ProgressBar({ value, color, height = 5 }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{
        width: `${Math.min(Math.max(value, 0), 100)}%`, height: "100%",
        background: `linear-gradient(90deg, ${color}AA, ${color})`,
        borderRadius: 99, transition: "width 0.7s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

function Card({ children, onClick, style: s = {}, glow }) {
  return (
    <div onClick={onClick} style={{
      background: C.surface,
      border: `1px solid ${glow ? glow + "44" : C.border}`,
      borderRadius: 16, padding: "16px 18px",
      cursor: onClick ? "pointer" : "default",
      boxShadow: glow ? `0 0 0 1px ${glow}12` : "none",
      ...s,
    }}>
      {children}
    </div>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color,
      background: color + "1E", padding: "3px 9px",
      borderRadius: 6, letterSpacing: 0.3,
      display: "inline-flex", alignItems: "center",
    }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, color = C.accent, disabled = false, full = false, outline = false }) {
  return (
    <button
      onClick={!disabled ? onClick : undefined}
      style={{
        padding: "12px 20px", borderRadius: 11, fontWeight: 700, fontSize: 14,
        border: outline ? `1.5px solid ${color}55` : "none",
        background: disabled ? C.surfaceHigh : outline ? "transparent" : color,
        color: disabled ? C.textMuted : outline ? color : "#fff",
        cursor: disabled ? "default" : "pointer",
        width: full ? "100%" : "auto",
        opacity: disabled ? 0.5 : 1,
        boxShadow: (!disabled && !outline) ? `0 4px 16px ${color}33` : "none",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", color: C.textSub,
      cursor: "pointer", fontSize: 14, padding: "0 0 20px",
      display: "flex", alignItems: "center", gap: 5,
    }}>
      ← Back
    </button>
  );
}

function TextInput({ label, type = "text", value, onChange, placeholder, error, autoFocus, onKeyDown }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6 }}>
          {label}
        </label>
      )}
      <input
        type={type} value={value} placeholder={placeholder}
        autoFocus={autoFocus} onKeyDown={onKeyDown}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 10,
          border: `1.5px solid ${error ? "#EF4444" : focused ? C.accent : C.border}`,
          background: C.surfaceHigh, color: C.text,
          fontSize: 14, outline: "none", transition: "border-color 0.2s",
          boxSizing: "border-box",
        }}
      />
      {error && <p style={{ margin: "5px 0 0", fontSize: 12, color: "#EF4444" }}>{error}</p>}
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const reset = () => { setError(""); setSuccess(""); };

  const submit = async () => {
    reset();
    if (!name.trim() || !pass) { setError("Please fill all fields"); return; }
    setLoading(true);
    if (mode === "register") {
      const r = await registerUser(name, pass);
      if (r.error) { setError(r.error); setLoading(false); return; }
      setSuccess("Account created! Signing you in…");
      setTimeout(() => onLogin({ username: r.username, displayName: r.displayName, data: makeUserData(r.username, r.displayName) }), 800);
    } else {
      const r = await loginUser(name, pass);
      if (r.error) { setError(r.error); setLoading(false); return; }
      onLogin(r);
    }
  };

  const onKey = e => { if (e.key === "Enter") submit(); };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      {/* glow */}
      <div style={{
        position: "fixed", top: "15%", left: "50%", transform: "translateX(-50%)",
        width: 480, height: 280, background: "#FF6B3506",
        borderRadius: "50%", filter: "blur(80px)", pointerEvents: "none",
      }} />

      <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg,#FF6B35,#FF3D00)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px", boxShadow: "0 12px 40px #FF6B3528",
          }}>
            <FlameIcon size={32} lit />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "0 0 6px", letterSpacing: -0.5 }}>
            Dev<span style={{ color: C.accent }}>Streak</span>
          </h1>
          <p style={{ color: C.textSub, fontSize: 14, margin: 0 }}>
            Daily interview prep — streaks saved forever.
          </p>
        </div>

        {/* Toggle */}
        <div style={{
          display: "flex", background: C.surfaceHigh, borderRadius: 12,
          padding: 4, marginBottom: 20, border: `1px solid ${C.border}`,
        }}>
          {["login", "register"].map(t => (
            <button key={t} onClick={() => { setMode(t); reset(); }} style={{
              flex: 1, padding: "9px", borderRadius: 9, border: "none",
              background: mode === t ? C.accent : "transparent",
              color: mode === t ? "#fff" : C.textSub,
              fontWeight: 700, fontSize: 14, cursor: "pointer",
              transition: "all 0.2s",
            }}>
              {t === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <Card>
          <TextInput
            label="Username" value={name} onChange={v => { setName(v); reset(); }}
            placeholder={mode === "login" ? "your username" : "choose a username (letters/numbers)"}
            autoFocus onKeyDown={onKey}
          />
          <TextInput
            label="Password" type="password" value={pass} onChange={v => { setPass(v); reset(); }}
            placeholder={mode === "login" ? "your password" : "at least 6 characters"}
            error={error} onKeyDown={onKey}
          />
          {success && <p style={{ fontSize: 13, color: "#16A34A", margin: "0 0 12px" }}>✓ {success}</p>}
          <Btn onClick={submit} disabled={loading || !name.trim() || !pass} full color={C.accent}>
            {loading ? "Please wait…" : mode === "login" ? "Sign In →" : "Create Account →"}
          </Btn>
        </Card>

        <p style={{ textAlign: "center", fontSize: 12, color: C.textMuted, marginTop: 20, lineHeight: 1.7 }}>
          Your streaks and XP are stored securely.<br />Log in from any browser to access your data.
        </p>
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({ displayName, onComplete }) {
  const [sel, setSel] = useState(new Set(["dsa", "sql"]));
  const toggle = id => {
    setSel(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "40px 20px 60px" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#FF6B35,#FF3D00)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FlameIcon size={19} lit />
          </div>
          <span style={{ fontWeight: 800, fontSize: 17, color: C.text }}>
            Dev<span style={{ color: C.accent }}>Streak</span>
          </span>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: "0 0 8px", lineHeight: 1.2 }}>
          Welcome, <span style={{ color: C.accent }}>{displayName}</span>! 👋
        </h1>
        <p style={{ color: C.textSub, fontSize: 15, margin: "0 0 30px", lineHeight: 1.65 }}>
          Pick your tracks. Each gets its own daily AI question and independent streak. 🔥
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {TRACKS.map(t => {
            const on = sel.has(t.id);
            return (
              <div key={t.id} onClick={() => toggle(t.id)} style={{
                padding: "18px 16px", borderRadius: 14, cursor: "pointer",
                border: `1.5px solid ${on ? t.color : C.border}`,
                background: on ? t.color + "0F" : C.surface,
                transition: "all 0.18s", transform: on ? "scale(1.03)" : "scale(1)",
              }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: on ? t.color : C.text }}>{t.label}</div>
                {on && (
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: t.color, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
                    <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Btn onClick={() => onComplete([...sel])} disabled={sel.size === 0} full color={C.accent}>
          Start My Streaks — {sel.size} track{sel.size !== 1 ? "s" : ""} selected →
        </Btn>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({ userData, questions, genQ, onNavigate, onLogout }) {
  const { activeTracks, streaks, xp, completedToday, displayName } = userData;
  const level = getLevel(xp);
  const today = todayStr();
  const totalStreak = activeTracks.reduce((a, id) => a + (streaks[id] || 0), 0);
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <p style={{ margin: 0, color: C.textMuted, fontSize: 12 }}>{dateLabel}</p>
          <h2 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 800, color: C.text }}>
            Hey, <span style={{ color: C.accent }}>{displayName}</span> 👋
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#FF6B3510", border: "1px solid #FF6B3522", borderRadius: 18, padding: "7px 12px" }}>
            <FlameIcon size={14} lit />
            <span style={{ fontWeight: 800, fontSize: 14, color: C.accent, fontFamily: "'JetBrains Mono',monospace" }}>{totalStreak}</span>
          </div>
          <button onClick={onLogout} title="Sign out" style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer", color: C.textSub, fontSize: 13 }}>↩</button>
        </div>
      </div>

      {/* XP */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{level.emoji} {level.title}</span>
          <span style={{ fontWeight: 700, fontSize: 12, color: C.accent, fontFamily: "'JetBrains Mono',monospace" }}>{xp} XP</span>
        </div>
        <ProgressBar value={level.progress} color={C.accent} height={5} />
        <p style={{ margin: "5px 0 0", fontSize: 11, color: C.textMuted }}>
          {level.progress < 100 ? `${level.nextXp - xp} XP to ${level.nextTitle}` : "Max level 🏆"}
        </p>
      </Card>

      {/* Questions banner */}
      {genQ ? (
        <Card style={{ marginBottom: 14, borderColor: C.accent + "22" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22 }}>✨</div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: C.accent }}>Generating today's questions…</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: C.textSub }}>AI is crafting fresh questions for your tracks</p>
            </div>
          </div>
        </Card>
      ) : questions && (
        <Card onClick={() => onNavigate("daily")} style={{ marginBottom: 14, borderColor: "#16A34A22", background: "#16A34A06", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 3px", color: "#16A34A", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>TODAY'S AI QUESTIONS READY</p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: C.text, lineHeight: 1.4 }}>
                {(Object.values(questions.questions)[0]?.question || "").slice(0, 55)}…
              </p>
            </div>
            <span style={{ fontSize: 24, marginLeft: 12 }}>🧠</span>
          </div>
        </Card>
      )}

      {/* Streaks */}
      <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: 1, marginBottom: 10 }}>YOUR STREAKS</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeTracks.map(id => {
          const t = TRACKS.find(t => t.id === id);
          if (!t) return null;
          const streak = streaks[id] || 0;
          const qd = completedToday[id + "-quick"] === today;
          const dd = completedToday[id + "-deep"] === today;
          const hasQ = !!questions?.questions?.[id];
          return (
            <div key={id} onClick={() => onNavigate("mode-select", id)} style={{
              background: C.surface, border: `1px solid ${(qd || dd) ? t.color + "44" : C.border}`,
              borderRadius: 14, padding: "13px 15px", display: "flex",
              alignItems: "center", gap: 13, cursor: "pointer",
              transition: "all 0.15s",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: (qd && dd) ? t.color : t.color + "14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
                {(qd && dd) ? "✓" : t.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 5 }}>{t.label}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: qd ? "#16A34A18" : C.surfaceHigh, color: qd ? "#16A34A" : C.textMuted, fontWeight: 600 }}>
                    ⚡ 5min {qd ? "✓" : hasQ ? "ready" : "…"}
                  </span>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: dd ? "#16A34A18" : C.surfaceHigh, color: dd ? "#16A34A" : C.textMuted, fontWeight: 600 }}>
                    🏋 1hr {dd ? "✓" : "○"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: streak > 0 ? t.color + "14" : C.surfaceHigh, padding: "5px 12px", borderRadius: 14, flexShrink: 0 }}>
                <FlameIcon size={14} lit={streak > 0} />
                <span style={{ fontWeight: 800, fontSize: 16, color: streak > 0 ? t.color : C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>{streak}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Boss */}
      <div onClick={() => onNavigate("boss")} style={{ marginTop: 14, background: "linear-gradient(135deg,#14102A,#080A0F)", border: "1px solid #7C3AED28", borderRadius: 16, padding: "18px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, color: "#7C3AED", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>WEEKLY BOSS CHALLENGE</p>
          <p style={{ margin: "4px 0 2px", color: C.text, fontWeight: 700, fontSize: 15 }}>Timed interview gauntlet ⚔️</p>
          <p style={{ margin: 0, color: C.textMuted, fontSize: 12 }}>+50 XP · DSA + SQL + System Design</p>
        </div>
        <div style={{ fontSize: 44 }}>👾</div>
      </div>
    </div>
  );
}

// ─── MODE SELECT ──────────────────────────────────────────────────────────────
function ModeSelect({ trackId, userData, questions, onSelect, onBack }) {
  const t = TRACKS.find(t => t.id === trackId);
  const today = todayStr();
  const qd = userData.completedToday[trackId + "-quick"] === today;
  const dd = userData.completedToday[trackId + "-deep"] === today;
  const todayQ = questions?.questions?.[trackId];

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 18px 80px" }}>
      <BackBtn onClick={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 28 }}>{t.icon}</span>
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: 24, color: C.text }}>{t.label}</h2>
      </div>
      <p style={{ color: C.textSub, fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
        Each session type has its own streak. A 5-min flash still counts. 🔥
      </p>

      {/* 5-min */}
      <Card onClick={!qd && todayQ ? () => onSelect("quick") : undefined}
        style={{ marginBottom: 12, borderColor: qd ? "#16A34A33" : t.color + "33", background: qd ? "#16A34A06" : C.surface, cursor: qd || !todayQ ? "default" : "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <span style={{ fontWeight: 800, fontSize: 17, color: qd ? "#16A34A" : C.text }}>5-Minute Flash</span>
              {qd && <Tag color="#16A34A">DONE ✓</Tag>}
            </div>
            <p style={{ margin: 0, color: C.textSub, fontSize: 13, lineHeight: 1.55 }}>
              {todayQ ? <span>Today: <strong style={{ color: t.color }}>{todayQ.topic}</strong> · Write or speak · Reveal correct answer</span> : "Generating question…"}
            </p>
          </div>
          <div style={{ background: t.color + "14", borderRadius: 10, padding: "7px 12px", textAlign: "center", marginLeft: 12, flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: t.color, fontFamily: "'JetBrains Mono',monospace" }}>+20</div>
            <div style={{ fontSize: 10, color: t.dark, fontWeight: 700 }}>XP</div>
          </div>
        </div>
        {!qd && (
          <div style={{ background: todayQ ? `linear-gradient(135deg,${t.color},${t.dark})` : C.surfaceHigh, borderRadius: 10, padding: "11px", textAlign: "center", color: todayQ ? "#fff" : C.textMuted, fontWeight: 700, fontSize: 14 }}>
            {todayQ ? "Start 5-Min Session →" : "Generating question…"}
          </div>
        )}
      </Card>

      {/* 1-hr */}
      <Card onClick={!dd ? () => onSelect("deep") : undefined}
        style={{ borderColor: dd ? "#16A34A33" : "#7C3AED33", background: dd ? "#16A34A06" : C.surface, cursor: dd ? "default" : "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>🏋️</span>
              <span style={{ fontWeight: 800, fontSize: 17, color: dd ? "#16A34A" : C.text }}>1-Hour Deep Dive</span>
              {dd && <Tag color="#16A34A">DONE ✓</Tag>}
            </div>
            <p style={{ margin: 0, color: C.textSub, fontSize: 13, lineHeight: 1.55 }}>6 structured topics + mock interview challenge</p>
          </div>
          <div style={{ background: "#7C3AED14", borderRadius: 10, padding: "7px 12px", textAlign: "center", marginLeft: 12, flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#7C3AED", fontFamily: "'JetBrains Mono',monospace" }}>+260</div>
            <div style={{ fontSize: 10, color: "#5B21B6", fontWeight: 700 }}>XP</div>
          </div>
        </div>
        {!dd && (
          <div style={{ background: "linear-gradient(135deg,#7C3AED,#5B21B6)", borderRadius: 10, padding: "11px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
            Start 1-Hour Plan →
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── QUICK LESSON ─────────────────────────────────────────────────────────────
function QuickLesson({ trackId, question, onComplete, onBack }) {
  const t = TRACKS.find(t => t.id === trackId);
  const q = question || FALLBACK[trackId] || FALLBACK.dsa;
  const [phase, setPhase] = useState("question"); // question | responding | reveal
  const [ansMode, setAnsMode] = useState(null);   // write | speak
  const [written, setWritten] = useState("");
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [showFU, setShowFU] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const startRec = () => { setRecording(true); setSecs(0); timerRef.current = setInterval(() => setSecs(s => s + 1), 1000); };
  const stopRec = () => { setRecording(false); clearInterval(timerRef.current); setPhase("reveal"); };

  const pct = phase === "reveal" ? 100 : phase === "responding" ? 55 : 15;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 18px 80px" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.textSub, cursor: "pointer", fontSize: 14, padding: 0 }}>←</button>
        <div style={{ flex: 1 }}><ProgressBar value={pct} color={t.color} height={4} /></div>
        <Tag color={t.color}>⚡ 5-min</Tag>
      </div>

      <Tag color={t.color}>{q.topic}</Tag>

      {/* Question card */}
      <div style={{ background: "#08090D", border: `1px solid ${t.color}28`, borderRadius: 16, padding: "20px 18px", margin: "14px 0 20px" }}>
        <p style={{ color: t.color, fontSize: 10, fontWeight: 700, margin: "0 0 10px", letterSpacing: 0.6 }}>TODAY'S QUESTION</p>
        <p style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0, lineHeight: 1.7 }}>{q.question}</p>
        {phase === "question" && q.hint && (
          <p style={{ color: C.textMuted, fontSize: 12, margin: "12px 0 0", fontStyle: "italic" }}>💡 {q.hint}</p>
        )}
      </div>

      {/* Choose mode */}
      {phase === "question" && (
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: C.textSub, marginBottom: 12 }}>How do you want to answer?</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { m: "write", e: "✍️", l: "Write it", s: "Type your answer", c: t.color },
              { m: "speak", e: "🎤", l: "Speak it", s: "Practice out loud", c: "#7C3AED" },
            ].map(opt => (
              <div key={opt.m} onClick={() => { setAnsMode(opt.m); setPhase("responding"); }}
                style={{ background: C.surface, border: `1.5px solid ${opt.c}`, borderRadius: 13, padding: "18px 14px", cursor: "pointer", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.e}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3 }}>{opt.l}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{opt.s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Write mode */}
      {phase === "responding" && ansMode === "write" && (
        <div>
          {q.pseudoCode && (
            <div style={{ background: "#050608", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", marginBottom: 14 }}>
              <p style={{ color: "#7C3AED", fontSize: 10, fontWeight: 700, margin: "0 0 7px", letterSpacing: 0.5 }}>PSEUDOCODE GUIDE</p>
              <pre style={{ color: "#7DD3FC", fontSize: 12.5, margin: 0, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.7 }}>{q.pseudoCode}</pre>
            </div>
          )}
          <p style={{ fontWeight: 600, fontSize: 13, color: C.textSub, marginBottom: 8 }}>Your answer:</p>
          <textarea
            value={written} onChange={e => setWritten(e.target.value)} autoFocus
            placeholder="Explain your approach — pseudocode, bullet points, or prose."
            style={{ width: "100%", minHeight: 120, padding: "13px 15px", borderRadius: 12, border: `1.5px solid ${written.trim().length > 10 ? t.color : C.border}`, background: C.surface, color: C.text, fontSize: 14, resize: "vertical", outline: "none", lineHeight: 1.65, boxSizing: "border-box" }}
          />
          <div style={{ marginTop: 10 }}>
            <Btn onClick={() => setPhase("reveal")} disabled={written.trim().length < 10} full color={t.color}>
              Submit &amp; See Correct Answer →
            </Btn>
          </div>
        </div>
      )}

      {/* Speak mode */}
      {phase === "responding" && ansMode === "speak" && (
        <div style={{ textAlign: "center" }}>
          {q.pseudoCode && (
            <div style={{ background: "#050608", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", marginBottom: 20, textAlign: "left" }}>
              <p style={{ color: "#7C3AED", fontSize: 10, fontWeight: 700, margin: "0 0 7px", letterSpacing: 0.5 }}>REFERENCE</p>
              <pre style={{ color: "#7DD3FC", fontSize: 12.5, margin: 0, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.7 }}>{q.pseudoCode}</pre>
            </div>
          )}
          <p style={{ color: C.textSub, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Explain your approach out loud. Cover logic, time complexity, and edge cases.
          </p>
          {!recording ? (
            <div>
              <div onClick={startRec} style={{ width: 86, height: 86, borderRadius: 43, background: `linear-gradient(135deg,${t.color},${t.dark})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", cursor: "pointer", fontSize: 34, boxShadow: `0 8px 32px ${t.color}40` }}>
                🎤
              </div>
              <p style={{ color: C.textMuted, fontSize: 12 }}>Tap to start speaking</p>
            </div>
          ) : (
            <div>
              <div style={{ width: 86, height: 86, borderRadius: 43, background: "#EF444414", border: "2px solid #EF4444", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 28 }}>⏹</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#EF4444", marginBottom: 18, fontFamily: "'JetBrains Mono',monospace" }}>
                {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
              </div>
              <Btn onClick={stopRec} color="#EF4444">Stop &amp; See Answer</Btn>
            </div>
          )}
        </div>
      )}

      {/* Reveal */}
      {phase === "reveal" && (
        <div>
          {ansMode === "write" && written && (
            <Card style={{ marginBottom: 12 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 11, color: C.textMuted, letterSpacing: 0.5 }}>YOUR ANSWER</p>
              <p style={{ margin: 0, fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>{written}</p>
            </Card>
          )}
          {ansMode === "speak" && (
            <Card style={{ marginBottom: 12, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 13, color: C.textMuted }}>🎤 You spoke for {secs} seconds — great practice!</p>
            </Card>
          )}

          <div style={{ background: "#080F0A", border: "1.5px solid #16A34A28", borderRadius: 14, padding: "17px 19px", marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 11, color: "#16A34A", letterSpacing: 0.5 }}>✅ CORRECT ANSWER</p>
            <p style={{ margin: 0, color: C.text, fontSize: 14, lineHeight: 1.75 }}>{q.correctAnswer}</p>
          </div>

          {q.pseudoCode && (
            <div style={{ background: "#050608", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", marginBottom: 12 }}>
              <p style={{ color: "#7C3AED", fontSize: 10, fontWeight: 700, margin: "0 0 7px", letterSpacing: 0.5 }}>PSEUDOCODE</p>
              <pre style={{ color: "#7DD3FC", fontSize: 12.5, margin: 0, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.7 }}>{q.pseudoCode}</pre>
            </div>
          )}

          {!showFU ? (
            <div style={{ marginBottom: 10 }}>
              <Btn onClick={() => setShowFU(true)} outline color={C.accent} full>🔄 See Follow-Up Question</Btn>
            </div>
          ) : (
            <Card style={{ marginBottom: 12, borderColor: C.accent + "28", background: C.accent + "06" }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 11, color: C.accent, letterSpacing: 0.5 }}>FOLLOW-UP</p>
              <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.5 }}>{q.followUp}</p>
              <p style={{ margin: 0, fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>{q.followUpAnswer}</p>
            </Card>
          )}

          <Btn onClick={() => onComplete(trackId, "quick", 20)} color={t.color} full>
            Complete &amp; Claim +20 XP 🔥
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── DEEP DIVE ────────────────────────────────────────────────────────────────
function DeepDive({ trackId, onComplete, onBack }) {
  const t = TRACKS.find(t => t.id === trackId);
  const plan = DEEP_PLANS[trackId] || [];
  const [done, setDone] = useState(new Set());
  const [viewing, setViewing] = useState(null);
  const xpPer = Math.round(260 / plan.length);
  const allDone = done.size === plan.length;

  if (viewing !== null) {
    const topic = plan[viewing];
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 18px 80px" }}>
        <button onClick={() => setViewing(null)} style={{ background: "none", border: "none", color: C.textSub, cursor: "pointer", fontSize: 14, padding: "0 0 20px" }}>
          ← Back to plan
        </button>
        <div style={{ background: "linear-gradient(135deg,#14102A,#08090F)", border: "1px solid #7C3AED28", borderRadius: 18, padding: "22px 20px", marginBottom: 18 }}>
          <p style={{ color: "#7C3AED", fontSize: 10, fontWeight: 700, margin: "0 0 8px", letterSpacing: 0.5 }}>TOPIC {viewing + 1} / {plan.length}</p>
          <h2 style={{ color: C.text, fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>{topic}</h2>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0, lineHeight: 1.6 }}>Study thoroughly — aim to explain it without notes in 2 minutes.</p>
        </div>
        <Card style={{ marginBottom: 14 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: C.textSub, margin: "0 0 12px" }}>📋 Cover these points:</p>
          {["Core concept and intuition", "Time/space complexity if applicable", "One real-world example", "Common interview trap or gotcha"].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <span style={{ color: "#7C3AED", fontWeight: 800, fontSize: 12, marginTop: 2 }}>→</span>
              <span style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55 }}>{item}</span>
            </div>
          ))}
        </Card>
        <div style={{ background: "#080F0A", border: "1px solid #16A34A18", borderRadius: 12, padding: "13px 15px", marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#16A34A", lineHeight: 1.6 }}>
            <strong>🎯 Challenge:</strong> Explain this topic out loud in 2 minutes without notes. That is real interview readiness.
          </p>
        </div>
        <Btn onClick={() => { setDone(prev => new Set([...prev, viewing])); setViewing(null); }} color="#7C3AED" full>
          ✓ Mark Complete → +{xpPer} XP
        </Btn>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 18px 80px" }}>
      <BackBtn onClick={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 26 }}>{t.icon}</span>
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: 22, color: C.text }}>{t.label} — 1-Hour Plan</h2>
      </div>
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{done.size}/{plan.length} topics</span>
          <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>+260 XP total</span>
        </div>
        <ProgressBar value={(done.size / plan.length) * 100} color="#7C3AED" height={6} />
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {plan.map((topic, i) => {
          const isDone = done.has(i);
          return (
            <div key={i} onClick={() => setViewing(i)} style={{ display: "flex", alignItems: "center", gap: 12, background: isDone ? "#16A34A08" : C.surface, border: `1px solid ${isDone ? "#16A34A28" : C.border}`, borderRadius: 12, padding: "12px 15px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: isDone ? "#16A34A" : C.surfaceHigh, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: isDone ? "#fff" : C.textMuted, flexShrink: 0 }}>
                {isDone ? "✓" : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: isDone ? "#16A34A" : C.text }}>{topic}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>~10 min · +{xpPer} XP</div>
              </div>
              <span style={{ color: C.textMuted, fontSize: 15 }}>→</span>
            </div>
          );
        })}
      </div>
      {allDone && <Btn onClick={() => onComplete(trackId, "deep", 260)} color="#16A34A" full>🎉 Complete Deep Dive! +260 XP</Btn>}
    </div>
  );
}

// ─── STREAKS TAB ──────────────────────────────────────────────────────────────
function StreaksTab({ userData }) {
  const { activeTracks, streaks, completedToday } = userData;
  const today = todayStr();
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 18px 100px" }}>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.text, margin: "0 0 4px" }}>My Streaks 🔥</h2>
      <p style={{ color: C.textSub, fontSize: 13, margin: "0 0 20px" }}>Complete a session each day to keep your streak alive.</p>
      <Card style={{ marginBottom: 20, borderColor: "#3B82F628" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: "#3B82F6", fontSize: 14 }}>❄️ Streak Freezes</p>
            <p style={{ margin: "3px 0 0", color: C.textMuted, fontSize: 12 }}>2 remaining this month — protect a missed day</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1].map(i => (
              <div key={i} style={{ width: 32, height: 32, borderRadius: 9, background: "#3B82F618", border: "1px solid #3B82F628", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>❄️</div>
            ))}
          </div>
        </div>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {activeTracks.map(id => {
          const t = TRACKS.find(t => t.id === id);
          if (!t) return null;
          const streak = streaks[id] || 0;
          const qd = completedToday[id + "-quick"] === today;
          const dd = completedToday[id + "-deep"] === today;
          const fill = streak === 0 ? 0 : Math.min((streak - 1) % 7 + 1, 7);
          return (
            <Card key={id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{t.label}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                      <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: qd ? "#16A34A18" : C.surfaceHigh, color: qd ? "#16A34A" : C.textMuted, fontWeight: 600 }}>5min {qd ? "✓" : "—"}</span>
                      <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: dd ? "#16A34A18" : C.surfaceHigh, color: dd ? "#16A34A" : C.textMuted, fontWeight: 600 }}>1hr {dd ? "✓" : "—"}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, background: t.color + "14", padding: "6px 13px", borderRadius: 16 }}>
                  <FlameIcon size={15} lit={streak > 0} />
                  <span style={{ fontWeight: 800, fontSize: 20, color: t.color, fontFamily: "'JetBrains Mono',monospace" }}>{streak}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 24, borderRadius: 5, marginBottom: 3, background: i < fill ? t.color : C.surfaceHigh }} />
                    <span style={{ fontSize: 9, color: C.textMuted, fontWeight: 600 }}>{d}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── DAILY Q TAB ──────────────────────────────────────────────────────────────
function DailyQTab({ userData, questions }) {
  const [revealed, setRevealed] = useState({});
  const todayQs = questions?.questions || {};
  const dateLabel = questions?.date === todayStr()
    ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : "Loading…";

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px 100px" }}>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.text, margin: "0 0 4px" }}>Today's Questions 🧠</h2>
      <p style={{ color: C.textSub, fontSize: 13, margin: "0 0 20px" }}>AI-generated for {dateLabel}. Resets every midnight.</p>
      {userData.activeTracks.map(id => {
        const t = TRACKS.find(t => t.id === id);
        if (!t) return null;
        const q = todayQs[id];
        const rev = revealed[id];
        if (!q) {
          return (
            <Card key={id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <span style={{ color: C.textMuted, fontSize: 13 }}>Generating {t.label} question…</span>
              </div>
            </Card>
          );
        }
        return (
          <Card key={id} style={{ marginBottom: 14, borderColor: t.color + "1A" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                <Tag color={t.color}>{q.topic}</Tag>
              </div>
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>+{q.xp || 20} XP</span>
            </div>
            <p style={{ color: C.text, fontSize: 14, fontWeight: 600, margin: "0 0 12px", lineHeight: 1.65 }}>{q.question}</p>
            {!rev ? (
              <Btn onClick={() => setRevealed(r => ({ ...r, [id]: true }))} outline color={t.color} full>
                Reveal Answer
              </Btn>
            ) : (
              <div>
                <div style={{ background: "#080F0A", border: "1px solid #16A34A1A", borderRadius: 12, padding: "13px 15px", marginBottom: q.pseudoCode ? 10 : 0 }}>
                  <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 10, color: "#16A34A", letterSpacing: 0.5 }}>✅ ANSWER</p>
                  <p style={{ margin: 0, color: C.text, fontSize: 13, lineHeight: 1.7 }}>{q.correctAnswer}</p>
                </div>
                {q.pseudoCode && (
                  <div style={{ background: "#050608", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                    <p style={{ color: "#7C3AED", fontSize: 10, fontWeight: 700, margin: "0 0 6px" }}>PSEUDOCODE</p>
                    <pre style={{ color: "#7DD3FC", fontSize: 12, margin: 0, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.6 }}>{q.pseudoCode}</pre>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── PROGRESS TAB ─────────────────────────────────────────────────────────────
function ProgressTab({ userData }) {
  const { streaks, xp, activeTracks } = userData;
  const level = getLevel(xp);
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 18px 100px" }}>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.text, margin: "0 0 18px" }}>Progress 📈</h2>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{level.emoji} {level.title}</span>
          <span style={{ fontWeight: 700, color: C.accent, fontFamily: "'JetBrains Mono',monospace" }}>{xp} XP</span>
        </div>
        <ProgressBar value={level.progress} color={C.accent} height={7} />
        <p style={{ margin: "8px 0 0", fontSize: 12, color: C.textMuted }}>
          {level.progress < 100 ? `${level.nextXp - xp} XP until ${level.nextTitle}` : "Max level 🏆"}
        </p>
      </Card>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, letterSpacing: 1, marginBottom: 10 }}>INTERVIEW READINESS</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activeTracks.map(id => {
          const t = TRACKS.find(t => t.id === id);
          if (!t) return null;
          const pct = Math.min(Math.round(((streaks[id] || 0) / 30) * 100), 100);
          return (
            <Card key={id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{t.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{t.label}</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 13, color: t.color, fontFamily: "'JetBrains Mono',monospace" }}>{pct}%</span>
              </div>
              <ProgressBar value={pct} color={t.color} height={5} />
              <p style={{ margin: "5px 0 0", fontSize: 11, color: C.textMuted }}>{streaks[id] || 0} day streak · 30 days = 100%</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── BOSS SCREEN ──────────────────────────────────────────────────────────────
function BossScreen({ onBack }) {
  const [started, setStarted] = useState(false);
  const [timer, setTimer] = useState(3600);
  const ref = useRef(null);
  useEffect(() => {
    if (started) ref.current = setInterval(() => setTimer(t => Math.max(t - 1, 0)), 1000);
    return () => clearInterval(ref.current);
  }, [started]);
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const challenges = [
    { type: "DSA", icon: "⚡", color: "#FF6B35", title: "Serialize & Deserialize Binary Tree", diff: "Hard", time: "25 min" },
    { type: "SQL", icon: "🗄️", color: "#0EA5E9", title: "Running Revenue Total by Month", diff: "Medium", time: "15 min" },
    { type: "System Design", icon: "🏗️", color: "#7C3AED", title: "Design a Push Notification Service", diff: "System", time: "20 min" },
  ];
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 18px 80px" }}>
      <BackBtn onClick={onBack} />
      <div style={{ background: "linear-gradient(135deg,#14102A,#080A0F)", border: "1px solid #7C3AED28", borderRadius: 20, padding: "26px 22px", marginBottom: 22, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>👾</div>
        <h2 style={{ color: C.text, margin: "0 0 5px", fontWeight: 800, fontSize: 22 }}>Weekly Boss Challenge</h2>
        <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 14px" }}>3 challenges · 1 hour · +50 XP</p>
        {started && (
          <div style={{ background: "#FF6B3510", border: "1px solid #FF6B3522", borderRadius: 10, padding: "8px 16px", display: "inline-block" }}>
            <span style={{ color: C.accent, fontWeight: 800, fontSize: 22, fontFamily: "'JetBrains Mono',monospace" }}>{fmt(timer)}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
        {challenges.map((c, i) => (
          <Card key={i} style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: c.color + "12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, flexShrink: 0 }}>
              {c.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.color, marginBottom: 2, letterSpacing: 0.4 }}>{c.type}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{c.title}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{c.diff} · {c.time}</div>
            </div>
          </Card>
        ))}
      </div>
      <Btn onClick={() => setStarted(true)} color={started ? "#16A34A" : "#7C3AED"} full>
        {started ? "Submit Answers → +50 XP" : "Start Timer & Begin ⚔️"}
      </Btn>
    </div>
  );
}

// ─── CELEBRATION ──────────────────────────────────────────────────────────────
function Celebration({ trackId, mode, earnedXp, onDismiss }) {
  const t = TRACKS.find(t => t.id === trackId) || TRACKS[0];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000088", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
      <div style={{ background: C.surface, border: `1px solid ${t.color}44`, borderRadius: 24, padding: "38px 30px", textAlign: "center", maxWidth: 330, width: "90%", animation: "popIn 0.38s cubic-bezier(.34,1.56,.64,1)" }}>
        <div style={{ fontSize: 54, marginBottom: 14 }}>🎉</div>
        <h3 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: "0 0 7px" }}>
          {mode === "quick" ? "Flash Done!" : "Deep Dive Done!"}
        </h3>
        <p style={{ color: C.textSub, fontSize: 14, margin: "0 0 18px" }}>
          {mode === "quick" ? "Question answered & reviewed" : "All 6 topics completed 💪"}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: t.color + "14", border: `1px solid ${t.color}28`, borderRadius: 12, padding: "11px 18px", marginBottom: 11 }}>
          <FlameIcon size={17} lit />
          <span style={{ fontWeight: 800, fontSize: 16, color: t.color }}>{t.label} Streak +1 🔥</span>
        </div>
        <div style={{ background: C.accent + "14", border: `1px solid ${C.accent}28`, borderRadius: 10, padding: "9px 16px", marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.accent, fontFamily: "'JetBrains Mono',monospace" }}>+{earnedXp} XP</span>
        </div>
        <Btn onClick={onDismiss} color={t.color} full>Keep Going! 💪</Btn>
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
function BottomNav({ active, onChange }) {
  const tabs = [
    { id: "home",     label: "Home",     icon: "🏠" },
    { id: "streaks",  label: "Streaks",  icon: "🔥" },
    { id: "progress", label: "Progress", icon: "📊" },
    { id: "daily",    label: "Today's Q",icon: "🧠" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{ flex: 1, padding: "10px 4px 13px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 19, filter: active === t.id ? "none" : "grayscale(1) opacity(0.35)" }}>{t.icon}</span>
          <span style={{ fontSize: 10, fontWeight: active === t.id ? 700 : 500, color: active === t.id ? C.accent : C.textMuted }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]         = useState(true);
  const [authUser, setAuthUser]       = useState(null);  // { username, displayName }
  const [userData, setUserData]       = useState(null);
  const [screen, setScreen]           = useState("home"); // home|mode-select|quick|deep|boss
  const [tab, setTab]                 = useState("home");
  const [activeTrackId, setATID]      = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [questions, setQuestions]     = useState(null);
  const [genQ, setGenQ]               = useState(false);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const session = await dbGet("ds:session");
        if (session?.username) {
          const data = await dbGet("ds:user:" + session.username);
          if (data) {
            setAuthUser({ username: session.username, displayName: session.displayName });
            setUserData(resetIfNewDay(data));
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // ── Persist userData on every change ─────────────────────────────────────
  useEffect(() => {
    if (authUser && userData) {
      dbSet("ds:user:" + authUser.username, userData);
    }
  }, [userData]);

  // ── Generate questions once user is onboarded ─────────────────────────────
  useEffect(() => {
    if (!userData?.onboarded || genQ) return;
    if (questions?.date === todayStr()) return;
    setGenQ(true);
    getOrGenQuestions(userData.activeTracks).then(q => {
      setQuestions(q);
      setGenQ(false);
    });
  }, [userData?.onboarded, (userData?.activeTracks || []).join(",")]);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleLogin = useCallback(({ username, displayName, data }) => {
    dbSet("ds:session", { username, displayName });
    setAuthUser({ username, displayName });
    setUserData(resetIfNewDay(data));
  }, []);

  const handleLogout = useCallback(() => {
    dbSet("ds:session", null);
    setAuthUser(null);
    setUserData(null);
    setQuestions(null);
    setScreen("home");
    setTab("home");
  }, []);

  // ── Onboarding ────────────────────────────────────────────────────────────
  const handleOnboarded = useCallback((tracks) => {
    setUserData(prev => ({ ...prev, activeTracks: tracks, onboarded: true }));
  }, []);

  // ── Complete lesson → update streak + XP ──────────────────────────────────
  const completeLesson = useCallback((trackId, mode, earnedXp) => {
    const today = todayStr();
    const key = trackId + "-" + mode;
    setUserData(prev => {
      if (prev.completedToday[key] === today) return prev;
      const current = prev.streaks[trackId] || 0;
      const lastDate = prev.streaks[trackId + "-date"];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];
      const newStreak = (!lastDate || lastDate === yStr || lastDate === today)
        ? (lastDate === today ? current : current + 1)
        : 1;
      return {
        ...prev,
        xp: prev.xp + earnedXp,
        streaks: { ...prev.streaks, [trackId]: newStreak, [trackId + "-date"]: today },
        completedToday: { ...prev.completedToday, [key]: today },
      };
    });
    setCelebration({ trackId, mode, earnedXp });
    setScreen("home");
    setTab("home");
  }, []);

  // ── Navigate ──────────────────────────────────────────────────────────────
  const navigate = useCallback((target, param) => {
    if (target === "mode-select") { setATID(param); setScreen("mode-select"); }
    else if (target === "boss") { setScreen("boss"); }
    else if (target === "daily") { setTab("daily"); setScreen("home"); }
    else { setTab(target); setScreen("home"); }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const globalStyle = <style>{GLOBAL_CSS}</style>;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {globalStyle}
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#FF6B35,#FF3D00)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <FlameIcon size={30} lit />
          </div>
          <h2 style={{ color: C.text, fontWeight: 800, fontSize: 20, margin: "0 0 6px" }}>Dev<span style={{ color: C.accent }}>Streak</span></h2>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>Loading your profile…</p>
        </div>
      </div>
    );
  }

  if (!authUser) return <div style={{ background: C.bg, minHeight: "100vh" }}>{globalStyle}<AuthScreen onLogin={handleLogin} /></div>;

  if (!userData?.onboarded) return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {globalStyle}
      <Onboarding displayName={userData?.displayName || authUser.displayName} onComplete={handleOnboarded} />
    </div>
  );

  // Sub-screens (no nav bar)
  if (screen === "mode-select") return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {globalStyle}
      <ModeSelect trackId={activeTrackId} userData={userData} questions={questions} onSelect={m => setScreen(m === "quick" ? "quick" : "deep")} onBack={() => setScreen("home")} />
    </div>
  );

  if (screen === "quick") return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {globalStyle}
      <QuickLesson trackId={activeTrackId} question={questions?.questions?.[activeTrackId]} onComplete={completeLesson} onBack={() => setScreen("mode-select")} />
    </div>
  );

  if (screen === "deep") return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {globalStyle}
      <DeepDive trackId={activeTrackId} onComplete={completeLesson} onBack={() => setScreen("mode-select")} />
    </div>
  );

  if (screen === "boss") return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {globalStyle}
      <BossScreen onBack={() => setScreen("home")} />
    </div>
  );

  // Main tabbed app
  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {globalStyle}

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#FF6B35,#FF3D00)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FlameIcon size={16} lit />
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>
            Dev<span style={{ color: C.accent }}>Streak</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {genQ && <span style={{ fontSize: 11, color: C.textMuted, animation: "pulse 1.5s infinite" }}>✨ Generating…</span>}
          <div style={{ background: C.surfaceHigh, borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11 }}>{getLevel(userData.xp).emoji}</span>
            <span style={{ fontWeight: 700, fontSize: 11, color: C.accent, fontFamily: "'JetBrains Mono',monospace" }}>{userData.xp} XP</span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ paddingBottom: 68 }}>
        {tab === "home"     && <Home userData={userData} questions={questions} genQ={genQ} onNavigate={navigate} onLogout={handleLogout} />}
        {tab === "streaks"  && <StreaksTab userData={userData} />}
        {tab === "progress" && <ProgressTab userData={userData} />}
        {tab === "daily"    && <DailyQTab userData={userData} questions={questions} />}
      </div>

      <BottomNav active={tab} onChange={setTab} />

      {celebration && (
        <Celebration
          trackId={celebration.trackId}
          mode={celebration.mode}
          earnedXp={celebration.earnedXp}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
