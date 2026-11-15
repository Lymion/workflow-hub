// Workflow Hub for VS Code: insert snippets, ask the docs guide, capture code and errors.
// Talks only to the hub's engine on your own machine. Never sends your API key anywhere (it has none).
"use strict";

const vscode = require("vscode");
const { findProject, looksLikeError, renderAnswer } = require("./lib");

const OFFLINE = "Workflow Hub isn't running. Open the hub app (or run python -m engine), then try again.";
let status;

function engineUrl() {
  return vscode.workspace.getConfiguration("workflowHub").get("engineUrl", "http://127.0.0.1:8765").replace(/\/+$/, "");
}

async function api(method, path, body) {
  let r;
  try {
    r = await fetch(engineUrl() + path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(OFFLINE);
  }
  if (!r.ok) {
    let msg = `Hub error ${r.status}`;
    try { const j = await r.json(); if (typeof j.detail === "string") msg = j.detail; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

async function currentProject() {
  const file = vscode.window.activeTextEditor?.document.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  try { return findProject(await api("GET", "/projects"), file); } catch { return null; }
}

function selection() {
  const ed = vscode.window.activeTextEditor;
  return ed && !ed.selection.isEmpty ? ed.document.getText(ed.selection) : "";
}

async function insertSnippet() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return vscode.window.showWarningMessage("Open a file first, then insert a snippet at the cursor.");
  let list;
  try { list = await api("GET", "/snippets?inbox=false"); } catch (e) { return vscode.window.showErrorMessage(e.message); }
  if (!list.length) return vscode.window.showInformationMessage("Your snippet library is empty. Save code with “Workflow Hub: Save selection to library”.");
  const pick = await vscode.window.showQuickPick(
    list.map((s) => ({ label: s.title, description: (s.tags || []).join(" · "), detail: s.summary || s.slug, slug: s.slug })),
    { placeHolder: "Search your snippets by name or tag", matchOnDescription: true, matchOnDetail: true },
  );
  if (!pick) return;
  try {
    const s = await api("GET", `/snippets/${pick.slug}`);
    await ed.insertSnippet(new vscode.SnippetString().appendText(s.code), ed.selection.active);
    const p = await currentProject();
    if (p) await api("POST", `/projects/${p.id}/snippets`, { slug: pick.slug }).catch(() => {});
    const changes = (s.change_points || []).map((c) => c.text).slice(0, 2).join("; ");
    vscode.window.setStatusBarMessage(`Inserted ${s.title}${changes ? ` · change: ${changes}` : ""}`, 6000);
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}

const LEVELS = [
  { label: "Point me to the docs", description: "Level 1", level: 1 },
  { label: "Give me a bigger hint", description: "Level 2", level: 2 },
  { label: "Show a tiny snippet", description: "Level 3", level: 3 },
];

async function askHub() {
  const sel = selection();
  const isErr = looksLikeError(sel);
  const question = await vscode.window.showInputBox({ prompt: "Ask the hub's docs guide", value: sel && !isErr ? sel.slice(0, 300) : "", placeHolder: isErr ? "What were you trying to do? (the selected error is attached)" : "e.g. How do I read the HC-SR04 without blocking?" });
  if (!question || question.trim().length < 3) return;
  const lvl = await vscode.window.showQuickPick(LEVELS, { placeHolder: "How much help?" });
  if (!lvl) return;
  const p = await currentProject();
  const doc = vscode.window.activeTextEditor?.document;
  const body = { question, level: lvl.level, project_id: p?.id ?? null, file_text: doc ? doc.getText().slice(0, 12000) : "", error_text: isErr ? sel.slice(0, 8000) : "" };
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Asking the hub…" }, async () => {
    try {
      const res = await api("POST", "/guide/ask", body);
      const panel = vscode.window.createWebviewPanel("workflowHubAnswer", "Hub answer", vscode.ViewColumn.Beside, { enableScripts: false });
      panel.webview.html = renderAnswer(question, res);
    } catch (e) {
      vscode.window.showErrorMessage(e.message);
    }
  });
}

async function saveSelection() {
  const code = selection();
  if (!code) return vscode.window.showWarningMessage("Select some code first.");
  const note = await vscode.window.showInputBox({ prompt: "A short note so you can find it later (optional)" });
  if (note === undefined) return;
  try {
    const doc = vscode.window.activeTextEditor.document;
    await api("POST", "/snippets/capture", { code, note, source: vscode.workspace.asRelativePath(doc.uri) });
    vscode.window.showInformationMessage("Saved to your library inbox. File it from the hub's Library page.");
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}

async function logError() {
  const text = selection();
  if (!text) return vscode.window.showWarningMessage("Select the error text first.");
  try {
    const p = await currentProject();
    const past = await api("POST", "/errors/match", { error_text: text });
    const hit = (past || []).find((e) => e.similarity >= 0.5 && (e.fix || e.cause));
    if (hit) {
      const choice = await vscode.window.showInformationMessage(`You've seen this before. Fix: ${hit.fix || hit.cause}`, "Log it again", "OK");
      if (choice !== "Log it again") return;
    }
    await api("POST", "/errors", { error_text: text, project_id: p?.id ?? null });
    vscode.window.showInformationMessage("Logged. Add the cause and fix in the hub's error log once it's solved.");
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}

async function refreshStatus() {
  try {
    await api("GET", "/health");
    status.text = "$(zap) Hub";
    status.tooltip = "Workflow Hub is running. Click to ask the docs guide.";
  } catch {
    status.text = "$(debug-disconnect) Hub";
    status.tooltip = OFFLINE;
  }
}

function activate(context) {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = "workflowHub.askHub";
  status.show();
  refreshStatus();
  const timer = setInterval(refreshStatus, 30000);
  context.subscriptions.push(
    status,
    { dispose: () => clearInterval(timer) },
    vscode.commands.registerCommand("workflowHub.insertSnippet", insertSnippet),
    vscode.commands.registerCommand("workflowHub.askHub", askHub),
    vscode.commands.registerCommand("workflowHub.saveSelection", saveSelection),
    vscode.commands.registerCommand("workflowHub.logError", logError),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
