/** Feature wiring: each roadmap session registers its pages, tabs and command sources here. */
import { api } from "./lib/api";
import { go } from "./lib/router";
import type { SnippetRow } from "./lib/snippets";
import { COMMAND_SOURCES } from "./components/CommandBar";
import { PAGES } from "./pages/registry";
import { TRAILING_TABS } from "./pages/project/tabs";
import { Library } from "./pages/Library";
import { SnippetsTab } from "./pages/project/SnippetsTab";

// ---- session 3: snippet library ----
PAGES.library = Library;
TRAILING_TABS.push({ id: "snippets", label: "Snippets", Component: SnippetsTab });
COMMAND_SOURCES.push(async (q) =>
  (await api.get<SnippetRow[]>(`/snippets?q=${encodeURIComponent(q)}`)).slice(0, 5).map((s) => ({
    id: "s:" + s.slug,
    group: "Snippets",
    label: s.title,
    hint: s.language,
    icon: "code",
    run: () => go(`#library/snippets/${s.slug}`),
  })),
);
