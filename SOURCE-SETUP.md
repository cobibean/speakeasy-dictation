# Build and use speakeasy. with your own key

This guide applies to the shared desktop source repository. Its default local
edition is OSS/BYOK: you supply a Groq API key, and transcription and optional
cleanup run through your Groq account. No speakeasy. hosted sign-in, subscription,
service credentials or environment file is required. The code is free under
[AGPL-3.0-or-later](LICENSE); provider processing can cost money. Hosted Free,
Standard and Pro allowances do not apply to this edition.

The source includes shared Product client code. It does not include the hosted
backend, database, websites, private repository history, private test fixtures,
or signing and publication tooling. This is a local development build, not a
signed, notarized BYOK installer. Windows and Intel Mac support are not established
by these instructions.

## 1. Prepare your Mac

- Apple Silicon Mac, macOS 14 Sonoma or later; microphone and internet connection.
- Node **24.18.0**, as pinned in `.nvmrc`, and the npm that comes with it. With
  an existing [nvm installation](https://github.com/nvm-sh/nvm#installing-and-updating),
  `nvm install` and `nvm use` in the extracted source directory select this version.
  Otherwise install that exact Node version from [Node.js](https://nodejs.org/en/download).
- Use an arm64 terminal/Node process, not a terminal running under Rosetta.
  `node -p process.arch` should print `arm64`.
- If dependency installation needs to compile a native addon, install Apple's
  Command Line Tools with `xcode-select --install` and a supported Python 3.
  [node-gyp's macOS prerequisites](https://github.com/nodejs/node-gyp#on-macos)
  explain those tools. They are not a signing identity or a paid Apple membership.

Clone `https://github.com/cobibean/speakeasy-dictation.git` into a new writable
folder (or extract a supplied source archive). Open a terminal there; keep the
included lockfile. Do not copy configuration or build output from a hosted build.

Use a clean shell with no `SPEAKEASY_*` overrides, `VITE_DEV_SERVER_URL` or
`ELECTRON_RUN_AS_NODE`. The following prints only matching variable **names**, so
you can identify and unset them without displaying their values:

```sh
node -e 'console.log(Object.keys(process.env).filter(k => k.startsWith("SPEAKEASY_") || ["VITE_DEV_SERVER_URL", "ELECTRON_RUN_AS_NODE"].includes(k)).join("\n"))'
```

No output means none of those process overrides are set. Also keep this fresh
folder free of `.env`, `.env.local`, `.env.product` and `.env.product.local`;
the build reads those files when present. Put your provider key in app settings,
not in any of these files or terminal commands.

## 2. Install, check and build

From the source root, with Node 24.18.0 selected:

```sh
node --version
node -p process.arch
npm ci
npm run typecheck
npm run build:renderer
npm run build:main
```

`npm ci` installs the locked dependencies; internet access is needed. It replaces
an existing `node_modules` in this source folder. Electron downloads its runtime
on first use if the binary is not already present.
The build writes to `dist/`. These checks do not need a provider key and do not
make dictation requests. The generated `dist/main/main/product-public-config.json`
should report `edition: "oss"` and `buildProfile: "oss"`.

The repository exposes these commands and its development watch commands. It does
not expose `npm test`, `npm run build`, packaging, signing or deployment commands;
their private supporting files are intentionally excluded.

## 3. Start the local app and add your key

```sh
npm run dev
```

This rebuilds both parts, downloads Electron's runtime if needed, and starts
Electron. Keep the terminal open while using
the app. Use its menu-bar menu to open **Settings**, then **Account & billing**.
Create an API key in the [Groq console](https://console.groq.com/keys), enter it
in **Groq API key**, and choose **Save changes**. The **Loaded** badge means a key
is saved; a successful transcription is the actual processing check.

The key is stored locally using Electron's encrypted credential storage. Do not
share it in an issue, screenshot, diagnostic note, shell command or source file.
If it is exposed, revoke it in Groq and save a replacement in settings.

Before dictating, review your Groq account's billing, spend controls, model access
and [rate limits](https://console.groq.com/docs/rate-limits). Current source uses
`whisper-large-v3-turbo` for speech and `openai/gpt-oss-120b` for optional cleanup.
Both use your provider account. speakeasy.'s hosted provider retention settings
do not configure your account; review Groq's data controls yourself.

## 4. Allow access and try a short dictation

In macOS **System Settings → Privacy & Security**, allow **Microphone** access
for recording and **Accessibility** access for the global hold key and native
delivery. A development run may appear as Electron in the permission list;
grant the process that macOS actually prompts for. Restart the development app
after changing permissions if the status does not refresh.

Automatic paste also uses macOS Automation to send Command-V through **System
Events**. If macOS asks to allow that control, approve it for the development
process you launched. If you declined, check **Privacy & Security → Automation**
and enable **System Events** under that process. Until access is available,
use clipboard recovery and paste manually.

Click into an ordinary editable field in a text editor. Hold **Right Option**,
speak a short English sentence, then release. The key is configurable in
**Settings → Dictation**. Enable or disable **Polish before paste** and choose a
cleanup strength there. Internet is required, and each capture has a five-minute
maximum. Before submitting or sending the result, read it for accuracy.

Delivery depends on the target app and focus. Keep the original field available
while processing. If automatic paste cannot complete, use the app's clipboard
recovery and paste manually with Command-V. If cleanup fails after transcription,
the raw transcript is retained for delivery/recovery. This source build does not
establish compatibility with every app, secure field or remote session.

## 5. Develop and stop

`npm run dev:watch` runs the main/renderer watchers and restarts Electron as the
compiled main process changes. Run `npm run build:main` once first so the generated
OSS configuration exists. The renderer dev server uses localhost port 5173.
Use the app's **Quit** menu item to close the app and Control-C in the terminal to
stop a running watch loop. Re-run the typecheck and both builds after code changes.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Unsupported Node engine or compilation errors | Confirm `node --version` is `v24.18.0` and architecture is `arm64`; select it before rerunning `npm ci`. Preserve the lockfile. |
| Native addon installation fails | Read the first install error. Check the Command Line Tools/Python prerequisites above and retry `npm ci` in the source folder. |
| Electron binary download fails on first run | Check network/proxy access for Electron downloads, then retry `npm run dev`. Dependency installation still needs npm access; do not disable install scripts. |
| Build asks for Product configuration or app asks for hosted sign-in | Check the clean-shell variables and environment files above, then rerun both builds. Do not obtain hosted credentials to work around an OSS setup error. |
| App does not hear you or detect the key | Check Microphone/Accessibility for the prompted development process and the selected hotkey, then restart. Quit other dictation instances that could share the key. |
| Key is Loaded but processing fails | Check the app error, key validity, model permissions, provider account billing/rate limits and internet. Loaded does not validate the key. |
| Text did not appear in the target field | Use clipboard/manual recovery in the original field; check Accessibility and Automation → System Events for the development process, then try an ordinary text editor. Do not assume an app accepted text solely because a paste command ran. |
| Watch page is blank or port is in use | Stop this watch loop with Control-C, check for another dev server on 5173, then restart. Use `npm run dev` for a built local run. |

For source-build help, contact [speakeasy. support](https://speakeasywords.com/support)
or [support@speakeasywords.com](mailto:support@speakeasywords.com). Include the
source manifest checksum, macOS/Node versions, failing command and a sanitized
error. Exclude keys, account tokens, dictated content and personal information.
See [privacy](https://speakeasywords.com/privacy) for the hosted/BYOK distinction.

## Source identity and licenses

`SOURCE-MANIFEST.json` lists a SHA-256 for each export-owned file except itself.
Public-only contribution docs and CI are outside this manifest.
It identifies the supplied source bytes, not dependencies subsequently installed
by npm or the local build output. The manifest checksum can be obtained
with `shasum -a 256 SOURCE-MANIFEST.json` and compared with the release record.

Keep [LICENSE](LICENSE), font OFL files in [brand fonts](docs/brand-kit/fonts/)
and [renderer fonts](src/renderer/assets/fonts/), and the
[Groq badge notice](src/renderer/assets/brand/THIRD_PARTY.md) with the source.
Third-party fonts, marks and npm packages retain their own license terms.
