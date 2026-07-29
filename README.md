<div align="center">

# Vera

**Finds the API keys you left visible in your screen recording — before you publish it.**

<img src="https://img.shields.io/badge/platform-macOS-black?style=flat-square" alt="Platform: macOS" />
<img src="https://img.shields.io/badge/built%20with-Rust%20%2B%20Tauri%20v2-orange?style=flat-square" alt="Built with Rust and Tauri v2" />
<img src="https://img.shields.io/badge/OCR-Apple%20Vision-blue?style=flat-square" alt="OCR via Apple Vision" />
<img src="https://img.shields.io/badge/network-none-lightgrey?style=flat-square" alt="No network access" />

[Website](https://vera-sandy.vercel.app) · [Download](../../releases) · [Report an issue](../../issues)

</div>

---

## What is Vera

You record a demo, a tutorial or a conference talk. Somewhere in those twelve
minutes your terminal shows an `OPENAI_API_KEY`, or a `.env` file is open for
four seconds, or a connection string with the password in it scrolls past.

Vera reads the finished recording on your Mac and gives you a list: what was
visible, when, and for how long. You rotate the key or cut the segment, then
publish.

It does not record anything itself, and it never uploads your file.

## What it looks for

Twenty provider key formats — OpenAI, Anthropic, AWS, GitHub, Google, Stripe,
Slack, SendGrid, GitLab, npm, Hugging Face, Linear, Figma, Twilio, Supabase —
plus four things recognised from context: PEM private-key blocks, database
connection strings with an embedded password, JSON Web Tokens, and assigned
secrets such as `PASSWORD=…` or `Authorization: Bearer …`.

The detector list in the app is read from the engine itself, so it is always
what actually runs.

## Why not just run gitleaks on a transcript

Because the text was never read correctly. OCR on video returns `sk-pr0j-AbCl`
for `sk-proj-AbC1` depending on the font and the resolution, and exact patterns
find none of that.

So Vera splits every pattern in two:

| Part | How it is matched |
|------|-------------------|
| Prefix (`sk-proj-`) | fuzzily, in a confusion space built from the glyphs monospace fonts genuinely collide |
| Body | never exactly — only its length, character set and randomness |

A single misread character changes none of those three, which is exactly why
the key is still found.

The other half of the problem is silence. Your screen is covered in things that
look like secrets: git SHAs, UUIDs, bundler hashes, semver, IP addresses,
`data:` URIs. And you record *tutorials*, so it is also covered in
`sk-your-api-key-here` and `AKIAIOSFODNN7EXAMPLE`. All of that is recognised and
ignored — a scanner that cries wolf on your own example keys is one you stop
opening.

## How it works

| Layer | Technology | Role |
|-------|-----------|------|
| Interface | Tauri v2 WebView, React 19 | Native window and UI |
| Sampling & OCR | Swift, AVFoundation + Vision | Walks the file, skips unchanged frames, reads the text |
| Detection | Rust (`src-tauri/core`) | OCR-tolerant matching, negative filters, aggregation |
| Storage | SQLite | Your sampling rate and your name. That is the whole list. |

Frames are decoded into memory and released; none is written to disk.

## Installation

1. Download the latest signed `.dmg` from the [Releases](../../releases) page.
2. Open the disk image and drag Vera into your Applications folder.
3. Launch it and drop in a recording.

There is nothing to configure, no account to make and no model to download.

**Requirements:** macOS 12 or newer on Apple Silicon. Reads `.mov`, `.mp4` and
`.m4v`.

## Privacy

- Your recording is read on your Mac and is never uploaded.
- Vera makes **no network requests while scanning**. The only connection it
  ever opens is the update check, which sends a version number.
- Nothing is stored: no recordings, no frames, no OCR text, no findings, not
  even a scan history. Close the window and the results are gone.
- A finding carries the credential's type, its timestamp and a **masked**
  preview. The value itself is discarded before the result reaches the UI, and
  a test asserts it.

## What it deliberately does not do

- **It does not blur or edit your video.** Finding the frame is the hard part;
  you already have an editor for the rest, and re-encoding would cost you
  quality for nothing.
- **It does not watch your screen.** Earlier versions of Vera were a different
  product and did. That subsystem was removed, not switched off.
- **It does not guarantee a clean video.** It recognises the formats it knows
  about, in the frames it sampled. It will not catch a password typed into a
  form, or a key that flashes up between two samples. Treat it as a good last
  check, not a guarantee.

## Development

Prerequisites: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) and the
Tauri v2 tooling. Building the app requires macOS, because the two sidecars are
Swift.

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # build a release bundle
```

The detection engine has no platform dependencies and can be worked on
anywhere:

```bash
cd src-tauri && cargo test          # engine + pipeline tests, any OS
cd src-tauri && cargo check --lib   # type-checks off macOS too
npx tsc --noEmit && npm run build   # frontend
```

## Status

An active personal project, shipped in iterations. Feedback and bug reports via
[Issues](../../issues) are welcome.

## About

Built by Erik Thye, a 15 year old developer from Germany based on the Costa del
Sol, using an AI-native workflow: designed and shipped end to end with AI tools
like Claude Code, with the full stack (Rust core, detection engine, packaging,
signing, releases) managed hands-on.

More projects: [github.com/erithy25](https://github.com/erithy25)
