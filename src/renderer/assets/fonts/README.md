# Local UI fonts

These `.woff2` files are bundled with the Electron renderer so the packaged app
does not request Google Fonts at runtime.

Source packages:

- `@fontsource-variable/fraunces@5.2.9`
- `@fontsource-variable/newsreader@5.2.10`
- `@fontsource-variable/spline-sans-mono@5.2.8`

Bundled assets:

- `fraunces.woff2`: Latin standard variable normal, `font-weight: 100 900`
- `newsreader.woff2`: Latin standard variable normal, `font-weight: 200 800`
- `newsreader-italic.woff2`: Latin standard variable italic,
  `font-weight: 200 800`
- `spline-sans-mono.woff2`: Latin weight-axis variable normal,
  `font-weight: 300 700`

All three packages declare the `OFL-1.1` license.

The approved cross-surface brand fonts are bundled separately under
`../brand/` for onboarding and later redesign work. Those exact TTF files come
from `docs/brand-kit/fonts/` and include Manrope, Newsreader (roman and italic),
and Caveat. Their SIL Open Font License texts remain in the canonical brand kit.
