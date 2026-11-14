// Pure helpers (no vscode import) so they can be tested with plain node.
"use strict";

const path = require("path");

/** The hub project whose folder contains this file (deepest match wins). */
function findProject(projects, filePath) {
  if (!filePath) return null;
  const norm = (p) => path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const f = norm(filePath);
  let best = null;
  for (const p of projects || []) {
    const root = norm(p.path);
    if ((f === root || f.startsWith(root + "/")) && (!best || root.length > norm(best.path).length)) best = p;
  }
  return best;
}

/** Looks like compiler or runtime output rather than a question. */
function looksLikeError(text) {
  return /error|exception|traceback|undefined reference|was not declared|failed|panic|guru meditation|brownout/i.test(text || "");
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Only http(s) links are clickable; handbook links (#handbook/…) show as text. */
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

/** The guide's answer as a small HTML page for a webview (no scripts). */
function renderAnswer(question, res) {
  const cards = (res.cards || []).map((c) => {
    const url = safeUrl(c.url);
    const title = url ? `<a href="${escapeHtml(url)}">${escapeHtml(c.title)}</a>` : escapeHtml(c.title);
    return `<section class="card"><div class="kind">${escapeHtml(c.kind === "handbook" ? "Handbook" : "Read this")}</div><h2>${title}</h2>
      <p><b>Why</b> ${escapeHtml(c.why)}</p><p><b>Apply it</b> ${escapeHtml(c.apply_it)}</p>${c.snippet ? `<pre>${escapeHtml(c.snippet)}</pre>` : ""}</section>`;
  }).join("");
  const past = (res.past_errors || []).map((e) => `<section class="card past"><div class="kind">You fixed this before</div><p>${escapeHtml(e.fix || e.cause)}</p><p class="muted">${escapeHtml(e.error_text)}</p></section>`).join("");
  const note = res.message ? `<p class="note">${escapeHtml(res.message)}</p>` : "";
  const cost = typeof res.cost_rm === "number" && res.status === "sent" ? `<p class="muted">Haiku · RM${res.cost_rm.toFixed(4)}</p>` : res.status === "cached" ? `<p class="muted">From cache, no call made</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>body{font:13px/1.5 var(--vscode-font-family);color:var(--vscode-foreground);padding:12px 16px}h1{font-size:15px}h2{font-size:14px;margin:2px 0 6px}
.card{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:10px 12px;margin:10px 0;background:var(--vscode-editorWidget-background)}
.kind{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-textLink-foreground)}.past .kind{color:var(--vscode-testing-iconPassed)}
pre{background:var(--vscode-textCodeBlock-background);padding:8px;border-radius:6px;overflow:auto}.muted{opacity:.7;font-size:12px}.note{opacity:.85}a{color:var(--vscode-textLink-foreground)}</style></head>
<body><h1>${escapeHtml(question)}</h1>${past}${cards || (note ? "" : "<p>No answer.</p>")}${note}${cost}</body></html>`;
}

module.exports = { findProject, looksLikeError, escapeHtml, safeUrl, renderAnswer };
