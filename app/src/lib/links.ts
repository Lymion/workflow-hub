/** Where a search hit opens, by kind. Later sessions add handbook and docs links. */
export const SEARCH_LINKS: Record<string, (ref: string) => string> = {
  snippet: (ref) => `#library/snippets/${ref}`,
  error: () => "#library/errors",
};
