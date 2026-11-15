export type SnippetRow = { slug: string; title: string; category: string; language: string; tags: string[]; inbox: boolean; preview: string };
export type Snippet = SnippetRow & { readme: string; code: string; files: string[]; change_points: { line: number; text: string }[]; source: string };

export const LANGS = ["cpp", "tsx", "ts", "python", "js", "rust", "sql", "bash", "css", "yaml", "json", "text"];

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
