# Chrome Web Store — what to upload and what to enter

Everything you need is in this `store/` folder plus the ZIP in `dist/`.
Dashboard: <https://chrome.google.com/webstore/devconsole> (one-time $5
developer registration fee if you haven't published before).

## 0. Already done

- Public repository: <https://github.com/aaroncluo/gmail-placeholder-guard>
- Privacy policy (GitHub Pages, from `docs/`):
  **<https://aaroncluo.github.io/gmail-placeholder-guard/privacy.html>**
- Project page: <https://aaroncluo.github.io/gmail-placeholder-guard/>

## 1. Files to upload

| Where | File |
| --- | --- |
| **Package** tab → *Upload new package* | `dist/gmail-placeholder-guard-1.0.2.zip` |
| **Store listing** → *Store icon* (128×128) | `store/assets/icon-128.png` |
| **Store listing** → *Screenshots* (1280×800, up to 5) | `store/assets/screenshot-1-warning.png`, `store/assets/screenshot-2-subject.png`, `store/assets/screenshot-3-clean.png` — upload in this order |
| **Store listing** → *Small promo tile* (440×280, optional) | `store/assets/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | not provided — optional, leave empty |

The ZIP contains only `manifest.json`, `content.js`, `detector.js`,
`styles.css` and `icons/` (verified by SHA-256 against the sources; no tests,
tooling, node_modules or personal data). Store screenshots use fictional
names and addresses only.

## 2. Store listing tab

| Field | Enter |
| --- | --- |
| Title | Taken from the manifest: **Placeholder Guard for Gmail** |
| Summary | Taken from the manifest `description` (shown in the dashboard; edit there if you want the longer summary from `description.md`) |
| Description | Paste the *Detailed description* block from `description.md` |
| Category | Productivity → Tools |
| Language | English |
| Official URL / Homepage URL | `https://aaroncluo.github.io/gmail-placeholder-guard/` |
| Support URL | `https://github.com/aaroncluo/gmail-placeholder-guard/issues` |
| YouTube video | leave empty |

## 3. Privacy tab

**Single purpose description**

```
Warns the user, before a Gmail message is sent, if the draft's subject or body still contains square-bracket placeholders such as [Name], and lets them go back to edit or send anyway.
```

**Permission justification** — the dashboard will list one host permission
(`https://mail.google.com/*`, implied by the content script). Enter:

```
The extension is a content script on mail.google.com. It must run inside the Gmail page to (1) intercept the Send button / Ctrl+Enter before Gmail processes the send, (2) read the subject and body of the draft being sent to check for "[" and "]", and (3) display the warning dialog inside the compose window. No other sites, no API permissions, no background script.
```

**Are you using remote code?** → **No, I am not using remote code.**

**Data usage — "What user data do you plan to collect?"**
Check **Personal communications** (emails) and nothing else.
Be honest here: the extension reads the draft's subject and body in the page.
It does not store or transmit them, which the certifications below cover.

Then tick all three certifications:

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL** → `https://aaroncluo.github.io/gmail-placeholder-guard/privacy.html`

## 4. Distribution tab

| Field | Enter |
| --- | --- |
| Visibility | Public |
| Distribution | All regions |
| Payments | Free |

## 5. Submit

Click **Submit for review**. Items with host permissions on a major site
typically take a few days. If the reviewer asks for a test account: none is
needed — the extension has no login; reviewers can use any Gmail account and
type `[test]` into a draft.

## How the privacy policy is hosted

GitHub Pages serves the `docs/` folder of the `main` branch.
`docs/privacy.html` is a copy of `store/privacy-policy.html`; if you change
the policy, update both (or copy again) and push.

## After publishing — updating

Bump `"version"` in `manifest.json`, run `npm test` and `npm run package`,
upload the new ZIP on the Package tab, and submit. Update
`privacy-policy.html` (and `docs/privacy.html`) first if data handling ever
changes.
