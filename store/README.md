# store/ — Chrome Web Store publishing materials

| File | Purpose |
| --- | --- |
| `DASHBOARD.md` | **Start here.** Exact files to upload and text to enter in each dashboard field, plus how to host the privacy policy on GitHub Pages. |
| `description.md` | Listing name, summary, detailed description, category. |
| `privacy-policy.html` | Privacy policy to host publicly (GitHub Pages). Written to match the code. |
| `assets/icon-128.png` | Store icon (96 px artwork + 16 px transparent padding). |
| `assets/screenshot-1-warning.png` | 1280×800 — the real warning dialog blocking a `[Program Name]` draft. |
| `assets/screenshot-2-subject.png` | 1280×800 — subject-line `[Role]` placeholder caught. |
| `assets/screenshot-3-clean.png` | 1280×800 — a clean draft; nothing added to Gmail. |
| `assets/promo-small-440x280.png` | Optional small promo tile. |
| `screenshot-stage.html` | Dummy-data Gmail-like page the screenshots are rendered on (not uploaded). |

Regenerate the assets with `npm run store-assets` (the real extension is loaded
into a browser and the real dialog is screenshotted over fictional data; no
real Gmail is involved).

The package to upload is `../dist/gmail-placeholder-guard-<version>.zip`,
built with `npm run package`.
