import { Marked } from "marked";

// Raw HTML in markdown is dropped: content is local, but the hub never renders HTML it didn't make.
const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    html: () => "",
    link(href: string, title: string | null | undefined, text: string) {
      const safe = /^(https?:|#|mailto:)/i.test(href) ? href : "#";
      return `<a href="${safe}"${title ? ` title="${title}"` : ""} target="_blank" rel="noopener">${text}</a>`;
    },
  },
});

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: md.parse(text) as string }} />;
}
