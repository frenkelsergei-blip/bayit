# Third-party notices

Bayit's own code is MIT-licensed (see `LICENSE`). These bundled assets and libraries keep their own licenses.

| What | Where | License |
| --- | --- | --- |
| OpenMoji 17.0.0 emoji graphics | `app/public/assets/icons/openmoji` | **CC BY-SA 4.0**. See `app/public/assets/icons/openmoji/LICENSE.txt`. Credit "OpenMoji (openmoji.org)". Modified versions of these graphics must be shared under the same license. |
| Heebo and Nunito Sans fonts | `app/public/assets/fonts` | SIL Open Font License 1.1 (`OFL.txt` in each folder) |
| Phosphor Icons (`@phosphor-icons/react`) | npm dependency | MIT |
| React, Recharts, Vite | npm dependencies | MIT |
| Auth.js (`@auth/core`, `@auth/d1-adapter`) | npm dependencies | ISC |
| unpdf (bundles Mozilla pdf.js) | npm dependency | MIT (unpdf) / Apache-2.0 (pdf.js) |
| SheetJS Community Edition (`xlsx` 0.20.3, from cdn.sheetjs.com) | npm dependency, reads insurance Excel reports | Apache-2.0 |
| AI provider marks (OpenAI) | `app/public/assets/icons/providers/openai.svg` | Simple Icons 13.21.0 icon data, CC0 1.0 |
| AI provider marks (Claude, Gemini, Grok) | `app/public/assets/icons/providers/{anthropic,gemini,xai}.svg` | LobeHub Icons (`@lobehub/icons-static-svg` 1.102.0), MIT, Copyright (c) LobeHub |

The provider marks only identify the service a household connects to. The trademarks belong to their owners, and Bayit isn't affiliated with or endorsed by them.

## Generated artwork

The Bayit brand, the fictional family portraits, pixel characters and rewards, the 150 Bayit icons, and the money hero illustration were generated for this project with AI image generation from Bayit's own concept references. They depict fictional people. They are provided under this repository's MIT license to the extent any rights exist in them. Provenance notes are in `app/public/assets/ATTRIBUTION.md`.

The screenshots in `docs/images` are concept renders with a fictional family and fictional amounts.

## Website and film

The website in `site/` reuses the generated artwork above and real screenshots of the app with a fictional sample family (`site/assets/shots`).

The film in `site/media` was made for this project. Its frames are drawn by code from Bayit's own logo and screenshots. The narration was synthesised with Microsoft Azure AI Speech neural voices (Ava in English, Hila in Hebrew). The music and sound effects were composed for Bayit in code, without samples or third-party recordings. The film's sources and build scripts aren't in this repository; the rendered files are covered by the project's MIT license.
