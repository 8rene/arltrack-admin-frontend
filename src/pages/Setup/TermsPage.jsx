import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

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
  let paraLvl = 0; // indent steps of the paragraph's first line (2 spaces = 1 step)
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" "), level: paraLvl }); para = []; paraLvl = 0; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ type: "hr" }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: "h", level: m[1].length, text: m[2] }); continue; }
    // Items indented with spaces/tabs (2 spaces = 1 step, up to 3 steps) become nested lists.
    const lvl = Math.min(3, Math.floor(raw.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length / 2));
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (list && lvl === 0 && list.type !== "ul") flushList();
      if (!list) list = { type: "ul", items: [] };
      list.items.push({ text: m[1], level: lvl, type: "ul" }); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list && lvl === 0 && list.type !== "ol") flushList();
      if (!list) list = { type: "ol", items: [] };
      list.items.push({ text: m[1], level: lvl, type: "ol" }); continue;
    }
    flushList();
    if (!para.length) paraLvl = Math.min(3, Math.floor(raw.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length / 2));
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
};

// Turns the flat list items (each with an indent level) into a tree.
const nestItems = (items) => {
  const root = [];
  const stack = [{ level: -1, children: root }];
  items.forEach((it) => {
    const node = { text: it.text, type: it.type, level: it.level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ level: it.level, children: node.children });
  });
  return root;
};

const renderList = (nodes, type, key, q, depth, parentLevel = -1) => {
  const Tag = type;
  // A list that starts further in than one step (e.g. indented bullets with nothing above them) is shifted in by the extra steps.
  const extra = Math.max(0, nodes[0].level - parentLevel - 1);
  const style = type === "ol" ? (depth % 2 ? "list-[lower-alpha]" : "list-decimal") : depth % 2 ? "list-[circle]" : "list-disc";
  return (
    <Tag key={key} style={extra ? { marginLeft: `${extra * 1.5}rem` } : undefined} className={`${style} pl-5 space-y-1 ${depth ? "mt-1" : ""}`}>
      {nodes.map((n, j) => (
        <li key={j}>
          {renderInline(n.text, `${key}-${j}`, q)}
          {n.children.length > 0 && renderList(n.children, n.children[0].type, `${key}-${j}c`, q, depth + 1, n.level)}
        </li>
      ))}
    </Tag>
  );
};

const HEADING_CLS = { 1: "text-lg font-bold mt-4 mb-2", 2: "text-base font-bold mt-4 mb-1.5", 3: "text-sm font-bold mt-3 mb-1" };

// Section headings (##) are numbered 1, 2, 3 … in order, so "Section 10" in the text matches what is shown.
// A heading that already starts with a typed number is left as it is.
const Markdown = ({ source, query = "" }) => {
  let n = 0;
  return (
    <div className="space-y-3 leading-relaxed">
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h") {
          const Tag = `h${b.level + 1}`;
          const num = b.level === 2 && !/^\d+[.)]\s/.test(b.text) ? `${++n}. ` : "";
          return <Tag key={k} className={HEADING_CLS[b.level]}>{num}{renderInline(b.text, k, query)}</Tag>;
        }
        if (b.type === "hr") return <hr key={k} className="my-3 opacity-30" />;
        if (b.type === "ul" || b.type === "ol") return renderList(nestItems(b.items), b.type, k, query, 0);
        return <p key={k} style={b.level ? { textIndent: `${b.level * 2}rem` } : undefined}>{renderInline(b.text, k, query)}</p>; // indented only when the text starts with spaces
      })}
    </div>
  );
};

// ── Bordered boxes and Label / Value fields (same look as the booking details window) ──
const Box = ({ title, isDark, children }) => (
  <section className={`border rounded-2xl overflow-hidden ${isDark ? "border-[#4FC3F7]/20 bg-[#212121]/40" : "border-gray-200 bg-white shadow-sm"}`}>
    <div className={`px-4 py-2.5 border-b ${isDark ? "border-[#4FC3F7]/20 bg-[#1A5F7A]/50" : "bg-gray-50"}`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/80" : "text-gray-600"}`}>{title}</h3>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const Field = ({ label, value, isDark }) => (
  <div className="min-w-0">
    <p className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? "text-[#F5F5F5]/50" : "text-gray-400"}`}>{label}</p>
    <div className={`text-sm font-medium mt-0.5 break-words ${isDark ? "text-[#F5F5F5]" : "text-gray-800"}`}>{value || "—"}</div>
  </div>
);

// Version, when it was published, by whom, and what changed.
const VersionFields = ({ v, isCurrent, isDark }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
    <Field isDark={isDark} label="Version" value={`v${verLabel(v.version)}${isCurrent ? " (current)" : ""}`} />
    <Field isDark={isDark} label="Published" value={v.createdAt ? fmtDate(v.createdAt) : null} />
    <Field isDark={isDark} label="Published by" value={v.createdBy?.name} />
    <Field isDark={isDark} label="Changes" value={v.changeNote} />
  </div>
);

// ── Page ────────────────────────────────────────────────────────────────
export default function TermsPage() {
  // In-page confirm dialog (replaces the browser's confirm/alert popups). `await askConfirm({...})` gives true / false.
  const [dlg, setDlg] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setDlg({ ...opts, resolve }));
  const closeDlg = (value) => { dlg.resolve(value); setDlg(null); };
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
  const [versionInput, setVersionInput] = useState("");   // next version, typed by the editor
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
  const fieldLabel = `text-[11px] font-medium uppercase tracking-wide ${muted}`;
  const text = isDark ? "text-[#F5F5F5]" : "text-gray-700";
  const primaryBtn = `px-5 py-2.5 rounded-xl shadow text-sm font-medium transition-all disabled:opacity-50 ${
    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-primary hover:bg-[#16526a] text-white"
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

  const baseContent = (current?.content || "").replace(/\r\n/g, "\n");
  const isDirty = content !== baseContent;
  const bytes = byteLength(content);
  const currentCents = current ? toCents(current.version) : 0;
  const nextVer = versionInput.trim();
  // Next version: 2 decimals, at least 1.00, and always higher than the current one.
  const versionOk = /^\d+\.\d{2}$/.test(nextVer) && toCents(nextVer) >= 100 && toCents(nextVer) > currentCents;
  const versionError = !nextVer ? "Enter the next version."
    : current ? `Must have 2 decimals and be higher than v${fmtVer(current.version)}.`
    : "Must have 2 decimals, at least 1.00.";
  // Quick version buttons. Minor fix = +0.10 (1.00 → 1.10). Major fix = next whole number (1.10 → 2.00).
  // Works in whole cents so there are no decimal rounding errors. With nothing published yet, both give 1.00.
  const centsToVer = (c) => (c / 100).toFixed(2);
  const bumpMinor = () => setVersionInput(current ? centsToVer(currentCents + 10) : "1.00");
  const bumpMajor = () => setVersionInput(current ? centsToVer((Math.floor(currentCents / 100) + 1) * 100) : "1.00");
  const tooBig = bytes > MAX_BYTES;
  // Why the Publish button is disabled (shown next to it so nobody has to guess).
  const publishBlock = !isDirty ? "Change the text first."
    : !versionOk ? versionError
    : tooBig ? "The text is too long."
    : "";
  const diff = useMemo(
    () => (editMode && showDiff && current ? diffLines(baseContent, content) : undefined),
    [editMode, showDiff, current, baseContent, content]
  );

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
    setVersionInput("");
    setShowDiff(false);
    setTab("write");
    setNotice(null);
    setViewing(null);
    setEditMode(true);
  };

  const cancelEdit = async () => {
    if (isDirty && !(await askConfirm({ title: "Discard changes", message: "Discard your unsaved changes?", confirmLabel: "Discard", cancelLabel: "Keep editing", tone: "warning" }))) return;
    setEditMode(false);
    setNotice(null);
  };

  const save = async () => {
    if (!content.trim()) return setNotice({ type: "error", msg: "Terms content cannot be empty." });
    if (!isDirty) return setNotice({ type: "error", msg: "No changes to save." });
    if (bytes > MAX_BYTES) return setNotice({ type: "error", msg: "Terms are too long." });
    if (!versionOk) return setNotice({ type: "error", msg: versionError });
    if (!(await askConfirm({ title: "Publish Terms", message: `Publish this as version ${versionInput.trim()}?\n\nIt goes live immediately. Previous versions are kept in the history.`, confirmLabel: "Publish" }))) return;

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
    setContent(String(v.content || "").replace(/\r\n/g, "\n"));
    setChangeNote(`Restored from version ${fmtVer(v.version)}`);
    setVersionInput("");
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
    requestAnimationFrame(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(r.s, r.e); });
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
  // Indent / Outdent: moves the selected line(s) one step (2 spaces) in or out. On a bullet or numbered line this makes a sub-item.
  const shiftIndent = (dir) => applyEdit(({ value, s, e }) => {
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", e);
    if (end === -1) end = value.length;
    const block = value.slice(start, end).split("\n")
      .map((l) => (!l.trim() ? l : dir > 0 ? `  ${l}` : l.replace(/^( {1,2}|\t)/, ""))).join("\n");
    return { value: value.slice(0, start) + block + value.slice(end), s: start, e: start + block.length };
  });
  // "Section heading", "• bullet list", "1. numbered list" on the line(s) the cursor is in.
  const prefixLines = (kind) => applyEdit(({ value, s, e }) => {
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", e);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split("\n");
    const has = { h: /^##\s+/, ul: /^\s*[-*]\s+/, ol: /^\s*\d+[.)]\s+/ }[kind];
    const nonEmpty = lines.filter((l) => l.trim());
    const remove = nonEmpty.length > 0 && nonEmpty.every((l) => has.test(l));
    let n = 0;
    const out = lines.map((l) => {
      if (!l.trim()) return l;
      const ind = kind === "h" ? "" : l.match(/^[ \t]*/)[0];
      const bare = l.slice(ind.length).replace(LINE_RX, "");
      if (remove) return ind + bare;
      n += 1;
      return ind + (kind === "h" ? "## " : kind === "ul" ? "- " : `${n}. `) + bare;
    });
    if (!nonEmpty.length) out[0] = kind === "h" ? "## " : kind === "ul" ? "- " : "1. ";
    const block = out.join("\n");
    const pos = nonEmpty.length ? start + block.length : start + block.length;
    return { value: value.slice(0, start) + block + value.slice(end), s: nonEmpty.length ? start : pos, e: pos };
  });

  const onEditorKey = (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (ev.key.toLowerCase() === "b") { ev.preventDefault(); wrap("**", "bold text"); }
  };

  const tbBtn = `px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
    isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/80 hover:bg-[#4FC3F7]/10" : "border-gray-200 text-gray-600 hover:bg-gray-50"
  }`;

  return (
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1 className={`text-2xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>Terms &amp; Conditions</h1>
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

      <div className={`${card} space-y-4`}>
        {loading ? (
          <p className={`text-sm text-center ${muted}`}>Loading Terms…</p>
        ) : editMode ? (
          <div className="space-y-4">
            <Box isDark={isDark} title="Edit the text">
              <div className="space-y-2">
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
                <div className={`${tab === "write" ? "flex" : "hidden lg:flex"} flex-wrap items-center gap-1.5`}>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => prefixLines("h")} title="Turn the line into a section heading (numbered automatically)">Section heading</button>
                  <button type="button" className={`${tbBtn} font-bold`} disabled={saving} onClick={() => wrap("**", "bold text")} title="Bold (Ctrl+B)">B</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => prefixLines("ul")} title="Bullet list">• List</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => prefixLines("ol")} title="Numbered list">1. List</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => shiftIndent(1)} title="Indent: make the line a sub-item (move it in)">Indent →</button>
                  <button type="button" className={tbBtn} disabled={saving} onClick={() => shiftIndent(-1)} title="Outdent: move the line back out">← Outdent</button>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className={tab === "write" ? "" : "hidden lg:block"}>
                    <p className={`hidden lg:block mb-1 ${fieldLabel}`}>Text</p>
                    <textarea ref={taRef} className={`${inputCls} font-mono min-h-[400px] leading-relaxed`} value={content}
                      onChange={(e) => setContent(e.target.value)} onKeyDown={onEditorKey} disabled={saving} spellCheck />
                  </div>
                  <div className={tab === "preview" ? "" : "hidden lg:block"}>
                    <p className={`hidden lg:block mb-1 ${fieldLabel}`}>Preview</p>
                    <div className={`${inputCls} min-h-[400px] max-h-[600px] overflow-y-auto ${text}`}>
                      {content.trim() ? <Markdown source={content} /> : <p className={muted}>Nothing to preview yet.</p>}
                    </div>
                  </div>
                </div>
                <p className={`text-[11px] ${bytes > MAX_BYTES ? "text-[#D32F2F]" : muted}`}>
                  {bytes.toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes · Headings are numbered in order, so do not type the numbers. Indent a bullet to make a sub-bullet.
                </p>
              </div>
            </Box>

            <Box isDark={isDark} title="Version change">
              <div className="grid gap-4 grid-cols-2 max-w-md">
                <Field isDark={isDark} label="Current version" value={current ? `v${fmtVer(current.version)}` : "None yet"} />
                <div>
                  <p className={fieldLabel}>Next version</p>
                  <input className={`${inputCls} mt-0.5`} value={versionInput} inputMode="decimal" disabled={saving}
                    onChange={(e) => setVersionInput(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" className={tbBtn} disabled={saving} onClick={bumpMinor}
                  title="Small fix: adds 0.10 to the current version">Minor fix{current ? ` → v${centsToVer(currentCents + 10)}` : ""}</button>
                <button type="button" className={tbBtn} disabled={saving} onClick={bumpMajor}
                  title="Big change: moves to the next whole version">Major fix{current ? ` → v${centsToVer((Math.floor(currentCents / 100) + 1) * 100)}` : ""}</button>
              </div>
              {nextVer && !versionOk && <p className="mt-2 text-[11px] text-[#D32F2F]">{versionError}</p>}
            </Box>

            <Box isDark={isDark} title="Describe changes (optional)">
              <input className={inputCls} value={changeNote} maxLength={500} disabled={saving}
                onChange={(e) => setChangeNote(e.target.value)} />
            </Box>

            {current && (
              <div className="space-y-2">
                <button type="button" className={`text-xs underline ${text}`} onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? "Hide changes" : "Review changes compared to the current version"}
                </button>
                {showDiff && (diff === null ? (
                  <p className={`text-xs ${muted}`}>Too long to compare line by line. Use the preview instead.</p>
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
                {saving ? "Publishing…" : `Publish as v${nextVer || "?"}`}
              </button>
              <button className={ghostBtn} onClick={cancelEdit} disabled={saving}>Cancel</button>
              {publishBlock && !saving && <span className={`text-xs ${muted}`}>{publishBlock}</span>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {current ? (
              <>
                <Box isDark={isDark} title="Version information">
                  <VersionFields v={current} isCurrent isDark={isDark} />
                </Box>
                <Box isDark={isDark} title="Terms">
                  <div className="flex items-center gap-2 mb-3">
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
                  <div ref={viewRef} className={`text-sm ${text}`}>
                    <Markdown source={current.content} query={q} />
                  </div>
                </Box>
              </>
            ) : (
              <p className={`text-sm ${muted}`}>
                No Terms &amp; Conditions published yet.{canEdit ? " Click Create Terms to publish version 1.00." : ""}
              </p>
            )}
            {canEdit && <button className={primaryBtn} onClick={startEdit}>{current ? "Edit Terms" : "Create Terms"}</button>}
          </div>
        )}

        {/* Version history */}
        {!loading && versions.length > 0 && (
          <Box isDark={isDark} title="Version history">
            <div className={`divide-y ${isDark ? "divide-[#4FC3F7]/10" : "divide-gray-100"}`}>
              {versions.map((v) => (
                <div key={v.termsVersionID} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0 flex-wrap">
                  <div className="flex-1 min-w-[260px]">
                    <VersionFields v={v} isCurrent={v.version === current?.version} isDark={isDark} />
                  </div>
                  <button className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-arl-primary text-white hover:bg-[#16526a] transition-colors disabled:opacity-50"
                    onClick={() => openVersion(v.termsVersionID)} disabled={viewLoading}>View</button>
                </div>
              ))}
            </div>
          </Box>
        )}
      </div>

      {/* Older-version viewer */}
      {viewing && (
        <div className="fixed inset-0 z-[3000] bg-black/40 flex items-center justify-center p-4" onClick={closeViewing}>
          <div className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-xl ${isDark ? "bg-[#212121] text-[#F5F5F5]" : "bg-white text-gray-700"}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-3">
              <h3 className="font-bold">Terms &amp; Conditions</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
              {fromBookingID && (
                <div className={`flex items-center justify-between gap-3 flex-wrap rounded-xl border px-3 py-2 text-xs ${
                  isDark ? "border-[#4FC3F7]/30 bg-[#1A5F7A] text-[#F5F5F5]" : "border-teal-200 bg-teal-50 text-teal-800"
                }`}>
                  <span>This is the version the customer agreed to for booking <strong>{fromBookingID}</strong>.</span>
                  {effectiveRole !== "Driver" && (
                    <button type="button" className="underline font-medium" onClick={backToBooking}>Back to booking</button>
                  )}
                </div>
              )}
              <Box isDark={isDark} title="Version information">
                <VersionFields v={viewing} isCurrent={viewing.version === current?.version} isDark={isDark} />
              </Box>
              <Box isDark={isDark} title="Terms">
                <div className="text-sm"><Markdown source={viewing.content} /></div>
              </Box>
            </div>
            <div className={`flex flex-col gap-1.5 px-6 py-4 border-t ${isDark ? "border-[#4FC3F7]/20" : "border-gray-100"}`}>
              {canEdit && viewing.version !== current?.version && (
                <button
                  className={`w-full px-3 py-1.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                    isDark ? "bg-[#4FC3F7] hover:bg-[#4FC3F7]/90 text-[#212121]" : "bg-arl-primary hover:bg-[#16526a] text-white"
                  }`}
                  onClick={() => restoreVersion(viewing)}>Restore as new version</button>
              )}
              <button
                className={`w-full py-1.5 rounded-xl border text-sm transition-all ${canEdit && viewing.version !== current?.version ? "mt-1.5" : ""} ${
                  isDark ? "border-[#4FC3F7]/20 text-[#F5F5F5]/70 hover:bg-[#212121]/40" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
                onClick={closeViewing}>Close</button>
            </div>
          </div>
        </div>
      )}
      {dlg && (
        <div className="fixed inset-0 bg-black/40 z-[2200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="font-bold text-lg text-gray-800">{dlg.title}</h2>
            <p className="text-sm text-gray-600 whitespace-pre-line break-words">{dlg.message}</p>
            <div className="flex gap-3 justify-end pt-1">
              {!dlg.hideCancel && (
                <button autoFocus={dlg.tone === "danger"} onClick={() => closeDlg(false)}
                  className="px-4 py-2 border rounded-xl text-sm">{dlg.cancelLabel || "Cancel"}</button>
              )}
              <button autoFocus={dlg.tone !== "danger"} onClick={() => closeDlg(true)}
                className={`px-4 py-2 text-white rounded-xl text-sm transition-colors ${
                  dlg.tone === "danger" ? "bg-red-600 hover:bg-red-700"
                  : dlg.tone === "warning" ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-arl-primary hover:bg-[#16526a]"}`}>
                {dlg.confirmLabel || (dlg.hideCancel ? "OK" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}