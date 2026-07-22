<div align="center">

# Vera

**A local-first AI assistant for macOS. Your machine, your models, your data.**

<img src="https://img.shields.io/badge/platform-macOS-black?style=flat-square" alt="Platform: macOS" />
<img src="https://img.shields.io/badge/built%20with-Rust%20%2B%20Tauri%20v2-orange?style=flat-square" alt="Built with Rust and Tauri v2" />
<img src="https://img.shields.io/badge/models-Ollama-blue?style=flat-square" alt="Models via Ollama" />
<img src="https://img.shields.io/badge/storage-SQLite-lightgrey?style=flat-square" alt="Storage: SQLite" />

[Website](https://vera-sandy.vercel.app) · [Download](../../releases) · [Report an issue](../../issues)

</div>

---

## What is Vera

Vera is a personal AI assistant that runs entirely on your Mac. It talks to local language models through Ollama, stores everything in a local SQLite database, and encrypts its visual capture data with AES-256-GCM before it ever touches the disk.

The idea is simple: an assistant that knows your context should not require sending your life to a server. Vera is built local-first from the ground up, so your data never has to leave your machine.

## Features

- **Local model inference** - Vera connects to Ollama and runs open models directly on your Mac. No API keys, no per-token costs, works offline.
- **Encrypted visual capture** - A frame-based capture system records visual context and encrypts every frame with AES-256-GCM before storage.
- **Local storage** - All data lives in a SQLite database on your machine. You can inspect it, back it up, or delete it at any time.
- **Native app, tiny footprint** - Built with Tauri v2 and a Rust core instead of a bundled browser engine, which keeps the app small and fast.
- **Signed distribution** - Ships as a signed macOS disk image (.dmg).

## How it works

| Layer | Technology | Role |
|-------|-----------|------|
| Interface | Tauri v2 WebView | Native window and UI |
| Core | Rust | App logic, capture pipeline, encryption |
| Storage | SQLite | Local database for all assistant data |
| Encryption | AES-256-GCM | Frame encryption before anything is written to disk |
| Models | Ollama | Local LLM inference |

## Installation

1. Download the latest signed `.dmg` from the [Releases](../../releases) page.
2. Open the disk image and drag Vera into your Applications folder.
3. Install [Ollama](https://ollama.com) and pull a model, for example:

```bash
ollama pull llama3.2
```

4. Launch Vera and pick your model in the settings.

**Requirements:** macOS on Apple Silicon and a working Ollama installation.

## Privacy

Vera is designed around one rule: what happens on your Mac stays on your Mac.

- Model inference runs locally through Ollama.
- All assistant data is stored in a local SQLite database.
- Visual capture frames are encrypted with AES-256-GCM before they are written to disk.
- There are no user accounts and no cloud sync.

## Development

Prerequisites: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) and the Tauri v2 tooling.

```bash
# install dependencies
npm install

# run in development mode
npm run tauri dev

# build a release bundle
npm run tauri build
```

## Status

Vera is an active personal project and ships in iterations. Feedback and bug reports via [Issues](../../issues) are welcome.

## About

Built by Erik Thye, a 15 year old developer from Germany based on the Costa del Sol, using an AI-native workflow: designed and shipped end to end with AI tools like Claude Code, with the full stack (Rust core, encryption, packaging, signing, releases) managed hands-on.

More projects: [github.com/erithy25](https://github.com/erithy25)
