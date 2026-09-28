# Contributing to speakeasy.

Start with [SOURCE-SETUP.md](SOURCE-SETUP.md). The supported source-build target
is Apple Silicon with macOS 14+ and Node from `.nvmrc`. Use your own Groq key
only for optional local dictation; never include it in a PR, log or screenshot.

## Make a change

1. Open an issue explaining the user problem, or reference an existing issue.
2. Fork this repository and make a focused change on a branch.
3. Run `npm ci`, `npm run typecheck`, `npm run build:renderer` and
   `npm run build:main` from a clean shell as described in the setup guide.
4. For behavior changes, try the affected workflow locally and report the
   macOS version and result. Distinguish compiled code from native verification.
5. Open a PR describing the change, checks, and remaining limitations.

There is no public `npm test` command yet. Do not copy private fixtures or claim
that successful compilation proves recording, permissions, dictation or insertion.
Provider calls use your account and may cost money; they are not required for CI.

## Shared source ownership

The private product repository is the source of truth for shared desktop code.
`SOURCE-MANIFEST.json` identifies export-owned files. Maintainers reconcile
accepted contributions there before preparing the next source export, preserving
contributor attribution. Direct edits to export-owned files need reconciliation;
they must not be silently overwritten by an export. Sync automation is not yet
implemented.

These files are maintained in this repository and are outside the export manifest:
`CONTRIBUTING.md`, `SECURITY.md`, and the issue/PR templates and source CI workflow
under `.github/`. Changes here do not require copying private product files.

Keep existing license and attribution notices. The desktop software uses
AGPL-3.0-or-later; bundled fonts and third-party marks retain their own terms.
For security concerns, follow [SECURITY.md](SECURITY.md).
