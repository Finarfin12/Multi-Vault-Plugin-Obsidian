# [Plugin] Multi-Vault Navigator: a unified workspace for people who live in multiple vaults

**Target forum:** forum.obsidian.md
**Suggested category:** Share & showcase
**Status:** Draft v1 — ready for review before posting
**Last updated:** 2026-06-07

---

Hi everyone,

Like many of you, I keep my notes split across several vaults — a work vault, a personal vault, and a writing vault. Each one has its own purpose, and I don't want to merge them. But the moment I need a note, I always end up asking myself the same question: *which vault did I put this in?*

So I built **Multi-Vault Navigator** to fix that for myself, and I'd love to share it with the community.

**What it does, in one line:** it lets you search, preview, and jump between vaults as if they were one workspace, without ever moving your files.

---

## Why this might be useful to you

- You work across multiple vaults and constantly forget where a note lives.
- You want to *reference* a note from another vault inside the one you're currently in, without copy-pasting it.
- You want a single search bar that knows about everything you've ever written.
- You want all of this to stay 100% local. No sync service, no telemetry, no account.

---

## What's inside

**Cross-Vault Command Center**
A full-screen dashboard with fuzzy search and snippet previews across every vault you've connected. You can pin favorite notes and save frequent searches to the sidebar.

**Read-Only Cross-Vault View**
Click a search result from another vault and it opens in a new tab inside your current vault, rendered in a native-feeling read-only mode. From there you can jump to the source vault or copy a cross-vault link.

**Natural cross-vault links**
Write `[[VaultName::NoteTitle]]` anywhere. The plugin parses it and lets you click straight into the preview. It feels like a normal wikilink, just with a vault prefix.

**Recent Files & Quick Switch**
The 50 most recently modified files across *all* your vaults, in one list. And a quick command to launch any other vault without going through the native vault manager.

**Smart Inbox Router**
Move or copy a note to another vault. The router suggests the most relevant destination based on the tags in your note — useful if you have an inbox vault that fans out into more focused ones.

**Duplicate Note Detector**
Scans every connected vault for notes with identical names, so you can find and merge scattered drafts.

**Plus:** Global Tag Explorer and Cross-Vault Daily Notes for people who keep daily notes in more than one place.

---

## About accessing files outside the vault

Per the [Obsidian Developer Policies](https://docs.obsidian.md/Plugins/Releasing/Developer+policies), I want to be upfront: this plugin reads files outside the active vault. That's the whole point — searching and previewing notes from your *other* vaults wouldn't work otherwise. It uses Node's `fs` module to read markdown from vaults you've either configured manually or that were auto-detected from Obsidian's global config.

Everything happens locally. No files, metadata, or telemetry leave your machine.

Desktop only for now (`isDesktopOnly: true`).

---

## Installation

It's manual install at the moment while I gather feedback before submitting to the community plugins list:

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Drop them into `<your-vault>/.obsidian/plugins/multi-vault-navigator/`.
3. Enable the plugin in Settings → Community plugins (with Safe mode off).

MIT licensed.

---

## What I'd love feedback on

- Does the cross-vault `[[VaultName::NoteTitle]]` syntax feel natural, or would you prefer a different separator?
- Anyone here juggling more than three vaults? I'd like to hear about your workflow and where this plugin falls short.
- Any features you'd expect to see that aren't on the list yet?

Happy to answer questions. If you find a bug or want to suggest something, drop it in this thread or on the repo.

Thanks for reading.

---

## Editor's notes (internal — strip before posting)

- Title chosen: option #2 (descriptive + bracketed plugin tag, forum-convention friendly).
- Open dengan pain point dulu sebelum fitur — lebih relate buat pembaca forum.
- "I built this for myself" tone, bukan marketing speak.
- Disclosure soal `fs` access diangkat ke posisi prominent — forum reviewer Obsidian biasanya nanya soal ini duluan.
- Tutup pakai pertanyaan terbuka, bukan CTA — trigger reply, naikin engagement thread.
- "Desktop only" dan "manual install" disebut eksplisit.

## Pre-publish checklist

- [ ] Update release link / GitHub repo URL di paragraf "Installation" kalo udah ada
- [ ] Verifikasi versi terbaru (manifest.json) match dengan release tag
- [ ] Cek lagi `isDesktopOnly` di manifest — confirm masih true
- [ ] Strip section "Editor's notes" + checklist ini sebelum paste ke forum
