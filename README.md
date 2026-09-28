# Speakeasy dictation — open-source voice typing for Mac

Talk to your AI coding agent. Hold a key, speak, release — speakeasy. types into
Cursor, Claude Code, Codex, Slack and other ordinary editable text fields. Bring
your own Groq key for free, or use the hosted version for $5/month.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![macOS 14+ Apple Silicon](https://img.shields.io/badge/macOS-14%2B%20Apple%20Silicon-black.svg)](https://speakeasywords.com)
[![GitHub stars](https://img.shields.io/github/stars/cobibean/speakeasy-dictation?style=social)](https://github.com/cobibean/speakeasy-dictation)
![Hosted release](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fem6oteyjbpj4ttnm.public.blob.vercel-storage.com%2Freleases%2Fversion.json&query=%24.version&label=hosted%20release)

## Install

### Hosted app (no API key, 5 free dictations/week)

Download the signed, notarized DMG for Apple Silicon (macOS 14+):
[Speakeasy-latest-arm64.dmg](https://em6oteyjbpj4ttnm.public.blob.vercel-storage.com/releases/Speakeasy-latest-arm64.dmg).

Homebrew installation is not available yet. Use the DMG download above.

Sign in with your email — no API key needed. The Free plan includes 5
successful dictations per week plus unlimited free Practice; Standard is
$5/month for 12 hours and Pro is $9/month for 30 hours. The hosted app
checks for updates; choose **Update and restart** to install an available update.

### Free, bring your own Groq key

Clone [cobibean/speakeasy-dictation](https://github.com/cobibean/speakeasy-dictation)
and build it locally. Paste your own
[Groq](https://groq.com) API key into **Settings → Account & billing → Groq API
key**. You pay Groq directly for usage — no speakeasy. account required.

Follow [the source setup guide](SOURCE-SETUP.md) for prerequisites, a clean
shell, Groq key setup, permissions and troubleshooting. Use Node **24.18.0**
from `.nvmrc` on an Apple Silicon Mac with macOS 14+.

```sh
nvm install
nvm use
npm ci
npm run typecheck
npm run build:renderer
npm run build:main
npm run dev
```

No hosted account or Product environment file is needed. Start with a clean
shell without `SPEAKEASY_*` release overrides. Grant microphone and
accessibility permissions when asked.

This repository provides a local source build. A packaged BYOK installer is a
separate future deliverable.

## Hosted vs. bring-your-own-key

| | Hosted | Bring your own key |
| --- | --- | --- |
| Setup | Signed, notarized DMG download | Build from source |
| Cost | Free tier (5 dictations/week + unlimited Practice), Standard $5/mo, Pro $9/mo | Free software; you pay Groq directly for usage |
| Sign-in | Email sign-in | None |
| Updates | Update and restart | Rebuild from source |
| Data path | Audio goes via the speakeasy. API to Groq | Audio goes straight from your Mac to your Groq account |
| Support | [speakeasywords.com/support](https://speakeasywords.com/support) | GitHub issues |

## How it works

- Hold **Right Option** (configurable), speak, release. speakeasy. transcribes
  with Groq Whisper Large v3 Turbo and types the result into the active text
  field. Internet is required; recordings are up to 5 minutes; English.
- Optional **Polish** (minimal / balanced / strong) uses GPT-OSS 120B to remove
  filler and fix punctuation. If Polish fails, you get the raw transcript.
- If automatic paste isn't safe in the target field, the text stays on your
  clipboard and speakeasy. tells you to paste manually.

## Why another dictation app

- **Open source** under AGPL-3.0 — read the code, audit the data path, build it
  yourself.
- **No $15/month subscription.** BYOK is free (pay Groq directly); hosted plans
  are $5 or $9 a month.
- **Built for long spoken prompts** to coding agents — dictate a full spec into
  Cursor or Claude Code instead of typing it.

## Star this repo if it saves you typing

If speakeasy. saves you a few thousand keystrokes, a star helps others find it.
Issues and PRs welcome. Need help? [speakeasywords.com/support](https://speakeasywords.com/support).

## Source and contributions

This repository contains the shared desktop source, including hosted Product
client code. The default local edition is OSS/BYOK: supply your own Groq API key
in settings and pay any provider usage charges. The hosted service, website,
account return site, database and private repository history are not included.

`npm run dev:watch` enables the development watch loop. Build output goes to
`dist/`. Development runs are for local use. Signing, notarization, release
publication, hosted service deployment, and the packaged BYOK installer are
outside this repository. Compatibility varies by target app; clipboard recovery
is available. The code is free under its license; Groq usage is governed by
your provider account, limits and billing. Hosted Free/Standard/Pro allowances
do not apply.

There is no `npm test` script here; private tests include service and release
fixtures that are not part of this source bundle.

## License and notices

Software: [AGPL-3.0-or-later](LICENSE). Existing source notices are preserved.
Bundled fonts retain SIL OFL 1.1 notices. Brand TTFs live in
`src/renderer/assets/brand/`; their Manrope, Caveat and Newsreader licenses are in
[brand font notices](docs/brand-kit/fonts/). Newsreader's notice also covers the
renderer Newsreader WOFF2s. Fraunces and Spline Sans Mono notices are with the
[renderer fonts](src/renderer/assets/fonts/). The [Groq badge notice](src/renderer/assets/brand/THIRD_PARTY.md)
identifies its source and trademark. Fonts and third-party marks retain their
own terms. npm dependencies are fetched by `npm ci`, not bundled in this repository;
their package license files remain in the installed packages.

`SOURCE-MANIFEST.json` records SHA-256 hashes for export-owned files except the
manifest itself. Public-only contribution docs and CI are outside that manifest.
The repository has its own history, with no private product-repository history.

The private product repository is the source of truth for shared desktop code.
The listed files, including this README, `SOURCE-SETUP.md` and `package.json`,
are export-owned. Maintainers reconcile accepted changes into that source before
updating this repository. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow
and [SECURITY.md](SECURITY.md) for private vulnerability reports.
