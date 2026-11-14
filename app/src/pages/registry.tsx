/** Extra top-level pages and sidebar widgets, added session by session. */
export type PageProps = { params: string[] };

export const PAGES: Record<string, (p: PageProps) => JSX.Element> = {};

export const SIDEBAR_FOOTERS: (() => JSX.Element | null)[] = [];
