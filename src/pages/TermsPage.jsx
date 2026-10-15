import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────
// TermsPage.jsx — view the Terms & Conditions (every staff role) and edit
// them (Owner/Admin only — enforced by the backend, mirrored here by canEdit).
//
// Self-contained: the Markdown renderer, editor, viewer and version history
// all live in this one file. Backed by the append-only `termsVersions`
// collection — every save publishes a NEW version (v1.00, v1.01, v2.00 …) and old
// versions are kept. There is no built-in/default text: until someone
// publishes version 1, the page just says nothing is published yet.
// ─────────────────────────────────────────────────────────────────────────

const API = process.env.REACT_APP_API_URL;
const MAX_BYTES = 90000; // keep in sync with backend terms.service.js

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

async function api(path, options) {
  const res = await fetch(`${API}${path}`, { ...options, headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Request failed.");
  return json.data;
}

// Versions look like 1.00 / 1.01 / 2.00 (old whole numbers 1, 2 show as 1.00, 2.00).
const fmtVer = (v) => Number(v).toFixed(2);
// Same, but safe for a missing/odd value (old customer-app records can carry a non-numeric version).
const verLabel = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? fmtVer(v) : "—");
const toCents = (v) => Math.round(Number(v) * 100);
// Quick picks for the editor: small fix = +0.01 (1.00 -> 1.01), major = next whole number (1.05 -> 2.00).
const minorOf = (v) => (v ? fmtVer((toCents(v) + 1) / 100) : "1.00");
const majorOf = (v) => (v ? fmtVer(Math.floor(toCents(v) / 100) + 1) : "1.00");

// Line-by-line comparison (what was added / removed) so the editor can review before publishing.
// Returns null when the texts are too big to compare quickly.
const diffLines = (oldText, newText) => {
  const a = String(oldText || "").replace(/\r\n/g, "\n").split("\n");
  const b = String(newText || "").replace(/\r\n/g, "\n").split("\n");
  let st = 0;
  while (st < a.length && st < b.length && a[st] === b[st]) st++;
  let ea = a.length, eb = b.length;
  while (ea > st && eb > st && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(st, ea), B = b.slice(st, eb);
  const n = A.length, m = B.length;
  if ((n + 1) * (m + 1) > 3000000) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: "-", l: A[i++] });
    else out.push({ t: "+", l: B[j++] });
  }
  while (i < n) out.push({ t: "-", l: A[i++] });
  while (j < m) out.push({ t: "+", l: B[j++] });
  return out;
};
const byteLength = (s) => new TextEncoder().encode(s || "").length;
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—";

// ── Tiny safe Markdown renderer ─────────────────────────────────────────
// Builds React elements (never dangerouslySetInnerHTML), so typed HTML or
// scripts show as plain text and can't run.
// Supports: # ## ### headings, paragraphs, - / 1. lists, **bold**, *italic*,
// [text](https://link), --- divider.
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

// Wraps every match of the search query in <mark> (case-insensitive).
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const highlight = (str, q, key) => {
  if (!q) return str;
  return str.split(new RegExp(`(${escapeRe(q)})`, "gi")).map((p, i) =>
    i % 2 === 1
      ? <mark key={`${key}-m${i}`} className="bg-yellow-300 text-black rounded px-0.5">{p}</mark>
      : p
  );
};

const renderInline = (text, keyPrefix, q) =>
  text.split(INLINE).map((part, i) => {
    if (!part) return null;
    const key = `${keyPrefix}-${i}`;
    let m;
    if ((m = part.match(/^\*\*([^*]+)\*\*$/))) return <strong key={key}>{highlight(m[1], q, key)}</strong>;
    if ((m = part.match(/^\*([^*]+)\*$/))) return <em key={key}>{highlight(m[1], q, key)}</em>;
    if ((m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/))) {
      return SAFE_URL.test(m[2])
        ? <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline">{highlight(m[1], q, key)}</a>
        : <span key={key}>{highlight(m[1], q, key)}</span>;
    }
    return <React.Fragment key={key}>{highlight(part, q, key)}</React.Fragment>;
  });

const parseBlocks = (source) => {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ type: "hr" }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: "h", level: m[1].length, text: m[2] }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
};

const HEADING_CLS = { 1: "text-lg font-bold mt-4 mb-2", 2: "text-base font-bold mt-4 mb-1.5", 3: "text-sm font-bold mt-3 mb-1" };

const Markdown = ({ source, query = "" }) => (
  <div className="space-y-3 leading-relaxed">
    {parseBlocks(source).map((b, i) => {
      const k = `b${i}`;
      if (b.type === "h") { const Tag = `h${b.level + 1}`; return <Tag key={k} className={HEADING_CLS[b.level]}>{renderInline(b.text, k, query)}</Tag>; }
      if (b.type === "hr") return <hr key={k} className="my-3 opacity-30" />;
      if (b.type === "ul") return <ul key={k} className="list-disc pl-5 space-y-1">{b.items.map((t, j) => <li key={j}>{renderInline(t, `${k}-${j}`, query)}</li>)}</ul>;
      if (b.type === "ol") return <ol key={k} className="list-decimal pl-5 space-y-1">{b.items.map((t, j) => <li key={j}>{renderInline(t, `${k}-${j}`, query)}</li>)}</ol>;
      return <p key={k}>{renderInline(b.text, k, query)}</p>;
    })}
  </div>
);

// ── Page ────────────────────────────────────────────────────────────────
export default function TermsPage() {
  const { isDark } = useTheme();
  const { effectiveRole } = useAuth();
  // Everyone can read; only Owner/Admin see edit controls (backend enforces it too).
  const canEdit = effectiveRole === "Owner" || effectiveRole === "Admin";

  // Deep link from a booking: /terms?version=<id>&bookingID=<id> opens that exact version.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const versionParam = searchParams.get("version");
  const fromBookingID = searchParams.get("bookingID");

  const [current, setCurrent] = useState(null);   // newest published version, or null
  const [versions, setVersions] = useState([]);   // history (no content)
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);     // { type: "success" | "error", msg }

  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState("write");        // write | preview
  const [content, setContent] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [versionInput, setVersionInput] = useState("1.00"); // version the editor will publish as
  const [bumpKind, setBumpKind] = useState("minor");        // minor | major | custom
  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");         // search box (view mode)
  const [matchCount, setMatchCount] = useState(0);
  const viewRef = useRef(null);

  const [viewing, setViewing] = useState(null);   // an older version open in the modal
  const [viewLoading, setViewLoading] = useState(false);

  const card = `rounded-2xl border p-6 ${
    isDark ? "bg-[#1A5F7A] border-[#4FC3F7]/20 shadow-[0_4px_24px_rgba(79,195,247,0.08)]" : "bg-white border-gray-100 shadow-soft"
  }`;
  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 ${
    isDark ? "bg-[#212121] border-[#4FC3F7]/20 text-[#F5F5F5] focus:ring-[#4FC3F7]/40" : "bg-white border-gray-200 text-arl-dark focus:ring-arl-dark/20"
  }`;
  const muted = isDark ? "text-[#F5F5F5]/50" : "text-gray-400";
  const text = isDark ? "text-[#F5F5F5]" : "text-gray-700";
  const primaryBtn = `px-5 py-2.5 rounded-xl shadow text-sm font-medium transition-all disabled:opacity-50 ${
    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-dark hover:opacity-90 text-white"
  }`;
  const ghostBtn = `px-5 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-50 transition-all ${
    isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/70 hover:bg-[#212121]/40" : "border-gray-200 text-gray-600 hover:bg-gray-50"
  }`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, list] = await Promise.all([api("/api/settings/terms"), api("/api/settings/terms/versions")]);
      setCurrent(cur);
      setVersions(list);
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to load Terms." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Count the highlighted matches actually on screen and jump to the first one.
  const q = query.trim().length >= 2 ? query.trim() : "";
  useEffect(() => {
    const marks = viewRef.current ? viewRef.current.querySelectorAll("mark") : [];
    setMatchCount(marks.length);
    if (marks.length) marks[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }, [q, current, editMode]);

  const baseContent = current?.content || "";
  const isDirty = content !== baseContent;
  const bytes = byteLength(content);
  const currentCents = current ? toCents(current.version) : 0;
  const versionOk = /^\d+\.\d{2}$/.test(versionInput.trim()) &&
    toCents(versionInput) >= 100 && toCents(versionInput) > currentCents;
  const versionError = versionOk ? "" : current
    ? `Must be 2 decimals and higher than the current version (${fmtVer(current.version)}).`
    : "Must be 2 decimals, at least 1.00.";
  // A major update (whole number goes up) must explain itself, because customers and staff read this in the history.
  const isMajor = !!current && versionOk && Math.floor(toCents(versionInput) / 100) > Math.floor(currentCents / 100);
  const noteOk = !isMajor || changeNote.trim().length > 0;
  const tooBig = bytes > MAX_BYTES;
  // Why the Publish button is disabled (shown next to it so nobody has to guess).
  const publishBlock = !isDirty ? "Change the text first."
    : !versionOk ? versionError
    : !noteOk ? "Describe what changed — required for a major update."
    : tooBig ? "The text is too long."
    : "";
  const diff = useMemo(
    () => (editMode && showDiff && current ? diffLines(baseContent, content) : undefined),
    [editMode, showDiff, current, baseContent, content]
  );

  const pickBump = (kind) => {
    setBumpKind(kind);
    if (kind === "minor") setVersionInput(minorOf(current?.version));
    else if (kind === "major") setVersionInput(majorOf(current?.version));
  };

  // Browser warning if the tab is closed or refreshed with unpublished changes.
  useEffect(() => {
    if (!(editMode && isDirty && !saving)) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editMode, isDirty, saving]);

  const startEdit = () => {
    setQuery("");
    setContent(baseContent);
    setChangeNote("");
    setVersionInput(minorOf(current?.version));
    setBumpKind("minor");
    setShowDiff(false);
    setTab("write");
    setNotice(null);
    setViewing(null);
    setEditMode(true);
  };

  const cancelEdit = () => {
    if (isDirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditMode(false);
    setNotice(null);
  };

  const save = async () => {
    if (!content.trim()) return setNotice({ type: "error", msg: "Terms content cannot be empty." });
    if (!isDirty) return setNotice({ type: "error", msg: "No changes to save." });
    if (bytes > MAX_BYTES) return setNotice({ type: "error", msg: "Terms are too long." });
    if (!versionOk) return setNotice({ type: "error", msg: versionError });
    if (!noteOk) return setNotice({ type: "error", msg: "Describe what changed — required for a major update." });
    if (!window.confirm(`Publish this as version ${versionInput.trim()}?\n\nIt goes live immediately. Previous versions are kept in the history.`)) return;

    setSaving(true);
    setNotice(null);
    try {
      const saved = await api("/api/settings/terms", {
        method: "POST",
        body: JSON.stringify({ content, changeNote, version: versionInput.trim(), baseVersion: current ? current.version : 0 }), // no title: it is always "Terms & Conditions"
      });
      setEditMode(false);
      setNotice({ type: "success", msg: `Version ${fmtVer(saved.version)} published.` });
      await load();
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to save Terms." });
    } finally {
      setSaving(false);
    }
  };

  const openVersion = useCallback(async (id) => {
    setViewLoading(true);
    try {
      setViewing(await api(`/api/settings/terms/versions/${encodeURIComponent(id)}`));
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to load that version." });
    } finally {
      setViewLoading(false);
    }
  }, []);

  // Arrived from a booking's "Terms & Conditions" link → open that version straight away.
  useEffect(() => {
    if (versionParam) openVersion(versionParam);
  }, [versionParam, openVersion]);

  // Closing the viewer also drops the deep-link params, so a refresh doesn't reopen it.
  const closeViewing = () => {
    setViewing(null);
    if (searchParams.has("version") || searchParams.has("bookingID")) {
      setSearchParams((prev) => { prev.delete("version"); prev.delete("bookingID"); return prev; }, { replace: true });
    }
  };

  // Drivers can't open Bookings, so they don't get the button.
  const backToBooking = () => navigate(`/bookings?open=${encodeURIComponent(fromBookingID)}`);

  // Loads an old version into the editor. Nothing is saved until "Publish" —
  // and that creates a brand-new version; the old one is untouched.
  const restoreVersion = (v) => {
    setContent(v.content);
    setChangeNote(`Restored from version ${fmtVer(v.version)}`);
    setVersionInput(minorOf(current?.version));
    setBumpKind("minor");
    setShowDiff(false);
    setTab("write");
    closeViewing();
    setNotice(null);
    setEditMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  // ── Formatting toolbar ────────────────────────────────────────────────
  // The admin never has to type Markdown symbols: these buttons add them around the
  // selected text (or at the cursor), and pressing a button again on the same text removes them.
  const taRef = useRef(null);

  const applyEdit = (fn) => {
    const ta = taRef.current;
    if (!ta || saving) return;
    const r = fn({ value: ta.value, s: ta.selectionStart, e: ta.selectionEnd });
    setContent(r.value);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.s, r.e); });
  };

  // **bold** / *italic* around the selection (or a placeholder word); again = remove.
  const wrap = (mark, placeholder, openOverride) => applyEdit(({ value, s, e }) => {
    const sel = value.slice(s, e);
    // The text is already wrapped by markers just outside the selection (what the button leaves selected) → remove them.
    const soloStar = mark === "*" && (value[s - 2] === "*" || value[e + 1] === "*");
    if (sel && !soloStar && value.slice(s - mark.length, s) === mark && value.slice(e, e + mark.length) === mark) {
      return { value: value.slice(0, s - mark.length) + sel + value.slice(e + mark.length), s: s - mark.length, e: e - mark.length };
    }
    const plainItalic = mark === "*" && sel.startsWith("**");
    if (!plainItalic && sel.length > mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
      const inner = sel.slice(mark.length, -mark.length);
      return { value: value.slice(0, s) + inner + value.slice(e), s, e: s + inner.length };
    }
    const inner = sel || placeholder;
    const open = openOverride ?? mark;
    const close = mark;
    const out = value.slice(0, s) + open + inner + close + value.slice(e);
    return { value: out, s: s + open.length, e: s + open.length + inner.length };
  });

  const LINE_RX = /^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+)/;
  // "Section heading", "• bullet list", "1. numbered list" on the line(s) the cursor is in.
  const prefixLines = (kind) => applyEdit(({ value, s, e }) => {
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", e);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split("\n");
    const has = { h: /^##\s+/, ul: /^[-*]\s+/, ol: /^\d+[.)]\s+/ }[kind];
    const nonEmpty = lines.filter((l) => l.trim());
    const remove = nonEmpty.length > 0 && nonEmpty.every((l) => has.test(l));
    let n = 0;
    const out = lines.map((l) => {
      if (!l.trim()) return l;
      const bare = l.replace(LINE_RX, "");
      if (remove) return bare;
      n += 1;
      return (kind === "h" ? "## " : kind === "ul" ? "- " : `${n}. `) + bare;
    });
    if (!nonEmpty.length) out[0] = kind === "h" ? "## " : kind === "ul" ? "- " : "1. ";
    const block = out.join("\n");
    const pos = nonEmpty.length ? start + block.length : start + block.length;
    return { value: value.slice(0, start) + block + value.slice(end), s: nonEmpty.length ? start : pos, e: pos };
  });

  // Whole line in bold = the highlighted pill customers see (e.g. "₱100.00 per hour …").
  const highlightLine = () => applyEdit(({ value, s, e }) => {
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", e);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split("\n");
    const isPill = (l) => /^\*\*[^*]+\*\*$/.test(l.trim());
    const nonEmpty = lines.filter((l) => l.trim());
    const remove = nonEmpty.length > 0 && nonEmpty.every(isPill);
    const out = lines.map((l) => {
      if (!l.trim()) return l;
      const bare = l.trim().replace(/^\*\*|\*\*$/g, "").replace(/\*/g, "");
      return remove ? bare : `**${bare}**`;
    });
    const block = out.join("\n");
    return { value: value.slice(0, start) + block + value.slice(end), s: start, e: start + block.length };
  });

  // New "Label — value" line (shown to customers as a label/value row, like the refund table).
  const insertRow = () => applyEdit(({ value, s, e }) => {
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const lineEnd0 = value.indexOf("\n", e);
    const lineEnd = lineEnd0 === -1 ? value.length : lineEnd0;
    const onBlank = !value.slice(lineStart, lineEnd).trim();
    const at = onBlank ? lineStart : lineEnd;
    const row = "- **Label** — Value";
    const ins = (onBlank ? "" : "\n") + row;
    const from = at + (onBlank ? 0 : 1) + 4; // inside **Label**
    return { value: value.slice(0, at) + ins + value.slice(onBlank ? lineEnd : at), s: from, e: from + 5 };
  });

  const insertLink = () => {
    const url = window.prompt("Link address (must start with https:// or mailto:)", "https://");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) { setNotice({ type: "error", msg: "A link must start with https:// or mailto:" }); return; }
    applyEdit(({ value, s, e }) => {
      const label = value.slice(s, e) || "link text";
      const md = `[${label}](${url.trim()})`;
      return { value: value.slice(0, s) + md + value.slice(e), s: s + 1, e: s + 1 + label.length };
    });
  };

  // {{…}} = a number from Settings that customers always see up to date.
  const insertLive = (token) => applyEdit(({ value, s, e }) => ({
    value: value.slice(0, s) + token + value.slice(e), s: s + token.length, e: s + token.length,
  }));

  const onEditorKey = (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    if (k === "b") { ev.preventDefault(); wrap("**", "bold text"); }
    if (k === "i") { ev.preventDefault(); wrap("*", "italic text"); }
  };

  const tbBtn = `px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
    isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/80 hover:bg-[#4FC3F7]/10" : "border-gray-200 text-gray-600 hover:bg-gray-50"
  }`;

  return (
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className={`text-xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>Terms &amp; Conditions</h1>
          <p className={`text-xs mt-0.5 ${muted}`}>
            Shown to customers. Every save publishes a new version and old versions are kept, so you can always look back at what customers agreed to.
          </p>
        </div>
        {current && (
          <span className={`text-xs px-2.5 py-1 rounded-full border ${isDark ? "border-[#4FC3F7]/30 text-[#4FC3F7]" : "border-gray-200 text-gray-600"}`}>
            Current: v{fmtVer(current.version)}
          </span>
        )}
      </div>

      {notice && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm ${
          notice.type === "success"
            ? isDark ? "bg-[#1A5F7A] text-[#4FC3F7] border-[#4FC3F7]/30" : "bg-green-50 text-green-700 border-green-200"
            : "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/30"
        }`}>{notice.msg}</div>
      )}

      {/* Current terms: view or edit */}
      <div className={`${card} space-y-4`}>
        {loading ? (
          <p className={`text-sm text-center ${muted}`}>Loading Terms…</p>
        ) : editMode ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={`block text-xs font-medium ${text}`}>1. Edit the text</label>
                <div className="flex gap-1 lg:hidden">
                  {["write", "preview"].map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                      className={`text-xs px-3 py-1 rounded-lg capitalize ${
                        tab === t
                          ? isDark ? "bg-[#4FC3F7] text-[#212121]" : "bg-arl-dark text-white"
                          : isDark ? "text-[#F5F5F5]/60" : "text-gray-500"
                      }`}>{t}</button>
                  ))}
                </div>
              </div>
              {(
                <div className={`${tab === "write" ? "flex" : "hidden lg:flex"} flex-wrap items-center gap-1.5`}>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => prefixLines("h")} title="Turn the line into a section heading (numbered automatically for customers)">Section heading</button>
                  <button type="button" className={`${tbBtn} font-bold`} disabled={saving} onClick={() => wrap("**", "bold text")} title="Bold (Ctrl+B)">B</button>
                  <button type="button" className={`${tbBtn} italic`} disabled={saving} onClick={() => wrap("*", "italic text")} title="Italic (Ctrl+I)">I</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => prefixLines("ul")} title="Bullet list">• List</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => prefixLines("ol")} title="Numbered list">1. List</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={insertLink} title="Add a link">Link</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={highlightLine} title="Show this whole line as a highlighted badge (e.g. a fee or penalty amount)">Highlight line</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={insertRow} title="Add a Label / Value row (like the refund table)">Label — Value</button>
                  <select className={tbBtn} disabled={saving} value="" onChange={(ev) => { if (ev.target.value) insertLive(ev.target.value); }}
                    title="Insert a number from Settings that stays up to date">
                    <option value="">Insert live value…</option>
                    <option value="{{depositText}}">Deposit amount</option>
                    <option value="{{serviceFeePercent}}">Service fee %</option>
                    <option value="{{gatewayFeePercent}}">Gateway fee %</option>
                    <option value="{{fullRefundHours}}">Full-refund window (hours)</option>
                  </select>
                </div>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className={tab === "write" ? "" : "hidden lg:block"}>
                  <p className={`hidden lg:block text-[11px] mb-1 ${muted}`}>What you type</p>
                  <textarea ref={taRef} className={`${inputCls} font-mono min-h-[400px] leading-relaxed`} value={content}
                    onChange={(e) => setContent(e.target.value)} onKeyDown={onEditorKey} disabled={saving} spellCheck />
                </div>
                <div className={tab === "preview" ? "" : "hidden lg:block"}>
                  <p className={`hidden lg:block text-[11px] mb-1 ${muted}`}>Live preview</p>
                  <div className={`${inputCls} min-h-[400px] max-h-[600px] overflow-y-auto ${text}`}>
                    {content.trim() ? <Markdown source={content} /> : <p className={muted}>Nothing to preview yet.</p>}
                  </div>
                </div>
              </div>
              <p className={`text-[11px] ${bytes > MAX_BYTES ? "text-[#D32F2F]" : muted}`}>
                {bytes.toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes · Select text and use the buttons above. Section numbers and live values are filled in for customers, so the preview shows the plain text.
              </p>
            </div>

            <div className="space-y-2">
              <label className={`block text-xs font-medium ${text}`}>
                2. What kind of change is this?{current ? ` (current version is v${fmtVer(current.version)})` : ""}
              </label>
              {current ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { k: "minor", title: "Small fix", desc: "Typos, wording, formatting", ver: minorOf(current.version) },
                    { k: "major", title: "Major update", desc: "Policy, fee or rule changes", ver: majorOf(current.version) },
                    { k: "custom", title: "Custom number", desc: "Pick the number yourself", ver: null },
                  ].map((o) => (
                    <button key={o.k} type="button" disabled={saving} onClick={() => pickBump(o.k)}
                      className={`text-left rounded-xl border px-3 py-2 transition-colors ${text} ${
                        bumpKind === o.k
                          ? isDark ? "border-[#4FC3F7] bg-[#212121]" : "border-arl-dark bg-gray-50"
                          : isDark ? "border-[#4FC3F7]/20" : "border-gray-200"
                      }`}>
                      <div className="text-sm font-semibold">
                        {o.title}{o.ver && <span className="font-normal opacity-60"> · v{o.ver}</span>}
                      </div>
                      <div className={`text-[11px] ${muted}`}>{o.desc}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={`text-xs ${muted}`}>This will be the first published version: v1.00.</p>
              )}
              {current && bumpKind === "custom" && (
                <div className="space-y-1">
                  <input className={`${inputCls} !w-28`} value={versionInput} inputMode="decimal" disabled={saving}
                    placeholder="e.g. 1.05" onChange={(e) => setVersionInput(e.target.value)} />
                  <p className={`text-[11px] ${muted}`}>Two decimals, higher than v{fmtVer(current.version)}. Example: 1.05 or 2.00.</p>
                </div>
              )}
              {!versionOk && bumpKind === "custom" && <p className="text-[11px] text-[#D32F2F]">{versionError}</p>}
            </div>

            <div className="space-y-1">
              <label className={`block text-xs font-medium ${text}`}>
                3. Describe the change{isMajor ? " (required for a major update)" : " (optional)"}
              </label>
              <input className={inputCls} value={changeNote} maxLength={500} disabled={saving}
                placeholder="e.g. Updated cancellation policy" onChange={(e) => setChangeNote(e.target.value)} />
            </div>

            {current && (
              <div className="space-y-2">
                <button type="button" className={`text-xs underline ${text}`} onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? "Hide changes" : "Review changes compared to the current version"}
                </button>
                {showDiff && (diff === null ? (
                  <p className={`text-xs ${muted}`}>Too long to compare line by line. Use the live preview instead.</p>
                ) : (() => {
                  const shown = (diff || []).filter((d) => d.l.trim() !== "");
                  const added = shown.filter((d) => d.t === "+").length;
                  const removed = shown.length - added;
                  if (!shown.length) return <p className={`text-xs ${muted}`}>No visible changes yet.</p>;
                  return (
                    <div className="space-y-1">
                      <p className={`text-[11px] ${muted}`}>{added} line{added === 1 ? "" : "s"} added · {removed} removed</p>
                      <div className={`max-h-64 overflow-y-auto rounded-xl border text-xs font-mono ${isDark ? "border-[#4FC3F7]/20" : "border-gray-200"}`}>
                        {shown.map((d, i) => (
                          <div key={i} className={`px-3 py-1 whitespace-pre-wrap break-words ${
                            d.t === "+"
                              ? isDark ? "bg-green-500/15 text-green-200" : "bg-green-50 text-green-800"
                              : isDark ? "bg-[#D32F2F]/15 text-red-200" : "bg-red-50 text-red-700"
                          }`}>{d.t === "+" ? "+ " : "− "}{d.l}</div>
                        ))}
                      </div>
                    </div>
                  );
                })())}
              </div>
            )}

            <div className="flex gap-3 flex-wrap items-center">
              <button className={primaryBtn} onClick={save} disabled={saving || !!publishBlock}>
                {saving ? "Publishing…" : `Publish as v${versionInput.trim() || "?"}`}
              </button>
              <button className={ghostBtn} onClick={cancelEdit} disabled={saving}>Cancel</button>
              {publishBlock && !saving && <span className={`text-xs ${muted}`}>{publishBlock}</span>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {current ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    className={inputCls}
                    placeholder="Search these terms…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {q && (
                    <span className={`text-xs whitespace-nowrap ${muted}`}>
                      {matchCount === 0 ? "No matches" : `${matchCount} match${matchCount === 1 ? "" : "es"}`}
                    </span>
                  )}
                </div>
                <div ref={viewRef} className={`rounded-xl border p-5 text-sm ${text} ${isDark ? "border-[#4FC3F7]/20 bg-[#212121]/40" : "border-gray-100 bg-gray-50"}`}>
                  <Markdown source={current.content} query={q} />
                </div>
                <p className={`text-[11px] ${muted}`}>
                  Published {fmtDate(current.createdAt)}{current.createdBy?.name ? ` by ${current.createdBy.name}` : ""}
                  {current.changeNote ? ` — ${current.changeNote}` : ""}
                </p>
              </>
            ) : (
              <p className={`text-sm ${muted}`}>
                No Terms &amp; Conditions published yet.{canEdit ? " Click Create Terms to publish version 1.00." : ""}
              </p>
            )}
            {canEdit && <button className={primaryBtn} onClick={startEdit}>{current ? "Edit Terms" : "Create Terms"}</button>}
          </div>
        )}
      </div>

      {/* Version history */}
      {!loading && versions.length > 0 && (
        <div className={`${card} space-y-3`}>
          <h2 className={`font-semibold text-sm ${text}`}>Version history</h2>
          <div className={`rounded-xl border divide-y ${isDark ? "border-[#4FC3F7]/20 divide-[#4FC3F7]/10" : "border-gray-100 divide-gray-100"}`}>
            {versions.map((v) => (
              <div key={v.termsVersionID} className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${text}`}>
                    v{fmtVer(v.version)}
                    {v.version === current?.version && <span className={`ml-2 text-[10px] ${isDark ? "text-[#4FC3F7]" : "text-green-600"}`}>CURRENT</span>}
                  </p>
                  <p className={`text-[11px] ${muted}`}>
                    {fmtDate(v.createdAt)}{v.createdBy?.name ? ` · ${v.createdBy.name}` : ""}{v.changeNote ? ` · ${v.changeNote}` : ""}
                  </p>
                </div>
                <button className={`text-xs underline ${isDark ? "text-[#4FC3F7]" : "text-arl-dark"}`}
                  onClick={() => openVersion(v.termsVersionID)} disabled={viewLoading}>View</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Older-version viewer */}
      {viewing && (
        <div className="fixed inset-0 z-[3000] bg-black/60 flex items-center justify-center p-4" onClick={closeViewing}>
          <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl p-6 ${isDark ? "bg-[#212121] text-[#F5F5F5]" : "bg-white text-gray-700"}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3">
              <h3 className="font-bold">Terms &amp; Conditions <span className="text-xs font-normal opacity-60">· v{verLabel(viewing.version)}</span></h3>
              <p className="text-[11px] opacity-60">
                {viewing.legacy
                  ? "Older record from before versions were managed here (read-only)"
                  : <>{fmtDate(viewing.createdAt)}{viewing.createdBy?.name ? ` · ${viewing.createdBy.name}` : ""}</>}
              </p>
            </div>
            {fromBookingID && (
              <div className={`mb-3 flex items-center justify-between gap-3 flex-wrap rounded-xl border px-3 py-2 text-xs ${
                isDark ? "border-[#4FC3F7]/30 bg-[#1A5F7A] text-[#F5F5F5]" : "border-teal-200 bg-teal-50 text-teal-800"
              }`}>
                <span>This is the version the customer agreed to for booking <strong>{fromBookingID}</strong>.</span>
                {effectiveRole !== "Driver" && (
                  <button type="button" className="underline font-medium" onClick={backToBooking}>Back to booking</button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto text-sm mb-4 pr-1"><Markdown source={viewing.content} /></div>
            <div className="flex gap-3 justify-end">
              <button className={ghostBtn} onClick={closeViewing}>Close</button>
              {canEdit && (viewing.legacy || viewing.version !== current?.version) && (
                <button className={primaryBtn} onClick={() => restoreVersion(viewing)}>Restore as new version</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}