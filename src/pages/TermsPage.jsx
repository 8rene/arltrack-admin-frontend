import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────
// TermsPage.jsx — view the Terms & Conditions (every staff role) and edit
// them (Owner/Admin only — enforced by the backend, mirrored here by canEdit).
//
// Self-contained: the Markdown renderer, editor, viewer and version history
// all live in this one file. Backed by the append-only `termsVersions`
// collection — every save publishes a NEW version (v1, v2, v3 …) and old
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

  const [current, setCurrent] = useState(null);   // newest published version, or null
  const [versions, setVersions] = useState([]);   // history (no content)
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);     // { type: "success" | "error", msg }

  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState("write");        // write | preview
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [changeNote, setChangeNote] = useState("");
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

  const baseTitle = current?.title || "";
  const baseContent = current?.content || "";
  const isDirty = title !== baseTitle || content !== baseContent;
  const bytes = byteLength(content);
  const nextVersion = (current?.version || 0) + 1;

  const startEdit = () => {
    setQuery("");
    setTitle(baseTitle);
    setContent(baseContent);
    setChangeNote("");
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
    if (!window.confirm(`Publish this as version ${nextVersion}?\n\nIt goes live immediately. Previous versions are kept in the history.`)) return;

    setSaving(true);
    setNotice(null);
    try {
      const saved = await api("/api/settings/terms", {
        method: "POST",
        body: JSON.stringify({ title, content, changeNote }),
      });
      setEditMode(false);
      setNotice({ type: "success", msg: `Version ${saved.version} published.` });
      await load();
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to save Terms." });
    } finally {
      setSaving(false);
    }
  };

  const openVersion = async (id) => {
    setViewLoading(true);
    try {
      setViewing(await api(`/api/settings/terms/versions/${id}`));
    } catch (err) {
      setNotice({ type: "error", msg: err.message || "Failed to load that version." });
    } finally {
      setViewLoading(false);
    }
  };

  // Loads an old version into the editor. Nothing is saved until "Publish" —
  // and that creates a brand-new version; the old one is untouched.
  const restoreVersion = (v) => {
    setTitle(v.title);
    setContent(v.content);
    setChangeNote(`Restored from version ${v.version}`);
    setTab("write");
    setViewing(null);
    setNotice(null);
    setEditMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={`w-full px-4 space-y-5 ${isDark ? "dark" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className={`text-xl font-bold ${isDark ? "text-[#F5F5F5]" : "text-arl-dark"}`}>Terms &amp; Conditions</h1>
          <p className={`text-xs mt-0.5 ${muted}`}>
            Shown to customers at signup. Every save publishes a new version; old versions are kept.
          </p>
        </div>
        {current && (
          <span className={`text-xs px-2.5 py-1 rounded-full border ${isDark ? "border-[#4FC3F7]/30 text-[#4FC3F7]" : "border-gray-200 text-gray-600"}`}>
            Current: v{current.version}
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
              <label className={`text-xs font-medium ${text}`}>Title</label>
              <input className={inputCls} value={title} maxLength={150} disabled={saving}
                placeholder="Terms & Conditions" onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-medium ${text}`}>Content</label>
                <div className="flex gap-1">
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
              {tab === "write" ? (
                <textarea className={`${inputCls} font-mono min-h-[400px] leading-relaxed`} value={content}
                  onChange={(e) => setContent(e.target.value)} disabled={saving} spellCheck />
              ) : (
                <div className={`${inputCls} min-h-[400px] max-h-[600px] overflow-y-auto ${text}`}>
                  <Markdown source={content} />
                </div>
              )}
              <p className={`text-[11px] ${bytes > MAX_BYTES ? "text-[#D32F2F]" : muted}`}>
                {bytes.toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes · Markdown: # Heading, **bold**, *italic*, - bullet, 1. numbered, [link](https://…)
              </p>
            </div>

            <div className="space-y-1">
              <label className={`text-xs font-medium ${text}`}>What changed? (optional)</label>
              <input className={inputCls} value={changeNote} maxLength={500} disabled={saving}
                placeholder="e.g. Updated cancellation policy" onChange={(e) => setChangeNote(e.target.value)} />
            </div>

            <div className="flex gap-3 flex-wrap items-center">
              <button className={primaryBtn} onClick={save} disabled={saving || !isDirty || bytes > MAX_BYTES}>
                {saving ? "Publishing…" : `Publish as v${nextVersion}`}
              </button>
              <button className={ghostBtn} onClick={cancelEdit} disabled={saving}>Cancel</button>
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
                  <p className="font-semibold text-base mb-3">{highlight(current.title, q, "title")}</p>
                  <Markdown source={current.content} query={q} />
                </div>
                <p className={`text-[11px] ${muted}`}>
                  Published {fmtDate(current.createdAt)}{current.createdBy?.name ? ` by ${current.createdBy.name}` : ""}
                  {current.changeNote ? ` — ${current.changeNote}` : ""}
                </p>
              </>
            ) : (
              <p className={`text-sm ${muted}`}>
                No Terms &amp; Conditions published yet.{canEdit ? " Click Create Terms to publish version 1." : ""}
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
                    v{v.version}
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
        <div className="fixed inset-0 z-[3000] bg-black/60 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl p-6 ${isDark ? "bg-[#212121] text-[#F5F5F5]" : "bg-white text-gray-700"}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3">
              <h3 className="font-bold">{viewing.title} <span className="text-xs font-normal opacity-60">· v{viewing.version}</span></h3>
              <p className="text-[11px] opacity-60">
                {fmtDate(viewing.createdAt)}{viewing.createdBy?.name ? ` · ${viewing.createdBy.name}` : ""}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto text-sm mb-4 pr-1"><Markdown source={viewing.content} /></div>
            <div className="flex gap-3 justify-end">
              <button className={ghostBtn} onClick={() => setViewing(null)}>Close</button>
              {canEdit && viewing.version !== current?.version && (
                <button className={primaryBtn} onClick={() => restoreVersion(viewing)}>Restore as new version</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}