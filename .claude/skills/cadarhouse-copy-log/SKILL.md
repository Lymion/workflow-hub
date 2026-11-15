---
name: cadarhouse-copy-log
description: Log every piece of CADARHOUSE marketing copy into the CADARHOUSE Copywriting Log (Google Doc + local backup). Use right after generating any CADARHOUSE copy — Meta ads, captions, website copy, WhatsApp scripts, TikTok scripts, catalogues — and when the user says "log this", "save to the copy log", "mark as winner", "mark as used", "update copy status", or asks "what copy have we used before" / "show past ads".
metadata:
  version: 1.0.0
---

# CADARHOUSE Copy Log

Keeps a running history of all generated copy so the team can track what was written, what went live, and what won.

## Where the log lives
- **Google Doc (main):** "CADARHOUSE — Copywriting Log", file ID `1cvFEbKtdW5qXvkb4grx7rNMwJvjZEDbfdbh9fJ6-em0`
  https://docs.google.com/document/d/1cvFEbKtdW5qXvkb4grx7rNMwJvjZEDbfdbh9fJ6-em0/edit
- **Local backup:** `copy-log.md` in the CADARHOUSE project folder (`Documents\Haykal\Cadarhouse (claude)\copy-log.md`)

## Entry format
Newest entries go at the **top**, under the intro and above older entries.

```
## YYYY-MM-DD · [Campaign name]
Campaign: [e.g. Raya 2027 / Koleksi Luxury / B2B Homestay]
Platform: [FB Ads / IG / TikTok / Website / WhatsApp / Catalogue]
Type: [Primary text / Headline / Caption / Script / Page section]
Status: 🟡 Draft
Variation A: ...
Variation B: ...
Variation C: ...
Notes: [angle used, target audience, register (polished / relaxed)]
```

Status values: 🟡 Draft · 🔵 Used / live · 🟢 Winner · 🔴 Rejected

## Workflow
1. After generating copy, write the entry to the **local backup** `copy-log.md` (create it if missing, with the same heading and intro as the Google Doc).
2. Add the same entry to the **Google Doc**:
   - If a Google Docs editing tool is available (e.g. `update_doc` / `read_doc`), load the `google-workspace` skill and insert the entry at the top of the log, keeping the same file and link.
   - If only Google Drive tools are available, **do not create a new doc**. Tell the user in one line that the entry is saved locally, and that turning on the Google Docs connector lets it sync to the Doc automatically.
3. When the user says copy is used, a winner, or rejected, update that entry's Status in both places.
4. Before writing new copy for a campaign, skim past entries (prefer 🟢 Winners) so new copy builds on what worked and avoids repeating rejected angles.
