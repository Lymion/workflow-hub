/** Feature wiring: each roadmap session registers its pages, tabs and command sources here. */
import { api } from "./lib/api";
import { go } from "./lib/router";
import { COMMAND_SOURCES } from "./components/CommandBar";
import { PAGES, SIDEBAR_FOOTERS } from "./pages/registry";
import { Guide } from "./pages/Guide";
import { SettingsPage } from "./pages/Settings";
import { SpendMeter } from "./components/SpendMeter";
import { MODULE_TABS, TRAILING_TABS } from "./pages/project/tabs";
import { PartsTab } from "./pages/project/PartsTab";
import { Library, LIBRARY_SECTIONS } from "./pages/Library";
import { ErrorLog } from "./pages/ErrorLog";
import { SEARCH_LINKS } from "./lib/links";
import { SnippetsTab } from "./pages/project/SnippetsTab";
import { ADD_TO_PROJECT, Handbook } from "./pages/Handbook";
import { PICKERS } from "./pages/NewProject";
import { STACK_PICKER, StackTab, TokensTab } from "./pages/project/AppTabs";

// ---- session 3: snippet library ----
PAGES.library = Library;
TRAILING_TABS.push({ id: "snippets", label: "Snippets", Component: SnippetsTab });

// ---- session 4: error log + one search for everything ----
LIBRARY_SECTIONS.push({ id: "errors", label: "Error log", Component: ErrorLog });
type Hit = { kind: string; ref: string; title: string; excerpt: string };
const KIND = { snippet: ["Snippets", "code"], error: ["Error log", "bug"], doc: ["Docs", "external"], handbook: ["Handbook", "book"] } as const;
COMMAND_SOURCES.push(async (q) =>
  (await api.get<{ results: Hit[] }>(`/search?q=${encodeURIComponent(q)}&limit=8`)).results.map((h) => ({
    id: `${h.kind}:${h.ref}`,
    group: KIND[h.kind as keyof typeof KIND]?.[0] ?? h.kind,
    label: h.title,
    icon: KIND[h.kind as keyof typeof KIND]?.[1] ?? "search",
    run: () => go(SEARCH_LINKS[h.kind]?.(h.ref) ?? "#library"),
  })),
);

// ---- session 5: handbook ----
PAGES.handbook = Handbook;
SEARCH_LINKS.handbook = (ref) => `#handbook/${ref}`;

// ---- session 7: project cart (parts + costs), wizard setup ----
MODULE_TABS.parts = { id: "parts", label: "Parts", Component: PartsTab };
const stackAdd = ADD_TO_PROJECT.fn;
ADD_TO_PROJECT.fn = async (ch, project) => {
  if (ch.section !== "parts" && ch.section !== "boards") return stackAdd(ch, project);
  await api.post(`/projects/${project.id}/parts`, { items: [{ key: ch.key, qty: 1 }] });
  return `${ch.title} added to ${project.name} → Parts. pins.h updated.`;
};

// ---- session 8: docs guide, spend meter, settings ----
PAGES.guide = Guide;
PAGES.settings = SettingsPage;
SIDEBAR_FOOTERS.push(SpendMeter);
SEARCH_LINKS.doc = () => "#guide";

// ---- session 9: app stack picker, Stack tab, Design tokens tab ----
PICKERS.stack = STACK_PICKER;
MODULE_TABS.stack = { id: "stack", label: "Stack", Component: StackTab };
MODULE_TABS["design-tokens"] = { id: "design-tokens", label: "Design tokens", Component: TokensTab };
