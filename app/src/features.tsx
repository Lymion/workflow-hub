/** Feature wiring: each roadmap session registers its pages, tabs and command sources here. */
import { api } from "./lib/api";
import { go } from "./lib/router";
import { COMMAND_SOURCES } from "./components/CommandBar";
import { PAGES } from "./pages/registry";
import { TRAILING_TABS } from "./pages/project/tabs";
import { Library, LIBRARY_SECTIONS } from "./pages/Library";
import { ErrorLog } from "./pages/ErrorLog";
import { SEARCH_LINKS } from "./lib/links";
import { SnippetsTab } from "./pages/project/SnippetsTab";

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
