# Placeholder Guard for Gmail

A tiny Chrome extension (Manifest V3) that stops you from sending a Gmail
message that still contains square-bracket placeholders such as
`[Professor Name]`, `[Company]` or `[]`.

When you click **Send** (or press Ctrl/Cmd+Enter), the extension inspects the
draft's **subject and body** *before* Gmail processes the send. If it finds a
`[` or `]`, the send is cancelled and a small dialog appears:

> **Possible placeholder detected**
> Your email contains square brackets that might be unfinished placeholders.

with the offending text and two buttons:

- **Go Back and Edit** — closes the warning; nothing is sent.
- **Send Anyway** — sends the email exactly once, with no second warning.

If there are no brackets, Gmail sends normally — no delay, no popup.

Everything runs locally inside the Gmail tab. The extension requests **no
Chrome permissions**, has no background script, no network access, and never
stores or transmits anything.

The extension adds nothing visible to Gmail until it blocks a send. To check
it is running on a tab, see *Troubleshooting*.

## Install (Load unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (toggle, top right).
3. Click **Load unpacked** and choose this folder (`gmail-placeholder-guard`,
   the one containing `manifest.json`).
4. Open or reload <https://mail.google.com>.

That's it — there is nothing to configure.

Works the same way in Microsoft Edge (`edge://extensions`) and other
Chromium browsers.

## Try it in your own Gmail

Each of these can be tested with a draft addressed to yourself.

| Draft | Expected |
| --- | --- |
| Body: `Hi Sam, lunch at noon?` | Sends immediately, no dialog. |
| Body: `Dear [Professor Name],` → Send | Dialog appears, nothing sent. **Go Back and Edit** returns you to the draft. |
| Body: `RSVP to [] please` → Send → **Send Anyway** | Dialog appears; the email is sent once, no second dialog. |
| Body: `Hello [Name` (unmatched) | Dialog appears. |
| Subject: `Application for [Role]`, clean body | Dialog appears, labelled *Subject*. |
| Two compose windows, one with brackets | The clean one sends; the other is blocked and shows only its own text. |
| Reply to a thread whose quoted history contains brackets | Sends — quoted history and your signature are ignored; only what you typed is checked. |
| Ctrl+Enter (Cmd+Enter on Mac) in a bracketed draft | Dialog appears. |
| Press **Esc** on the dialog | Same as Go Back; nothing sent. |

## Troubleshooting

- **Is it running on this tab?** Open DevTools on the Gmail tab (F12 →
  Console) and filter for `Placeholder Guard`: the script logs
  `[Placeholder Guard] active on mail.google.com` once when it loads. In the
  console, `document.documentElement.dataset.placeholderGuard` is `"active"`.
- **It isn't** → check `chrome://extensions`: the extension must be enabled,
  and after any change to its files you must click its **Reload** (↻)
  button, then **reload the Gmail tab** (an already-open tab does not pick
  up the reloaded script). Also make sure you are in the same Chrome
  *profile* where you loaded it (each profile has its own extensions).

## Version history

- **1.0.1** — Fixes two bugs that made 1.0.0 fail on real Gmail even though
  the extension was loaded and intercepting correctly:
  1. Real Gmail has **two** elements labelled *Message Body* per compose: a
     hidden, always-empty `<textarea class="Ak">` (plain-text fallback) that
     comes first in the DOM, and the `contenteditable` div you type in.
     1.0.0 read the first match → empty body → "no brackets" → send allowed.
  2. The Send button and body sit in a `<table class="iN">` whose *sibling*
     is the `<form>` holding Subject/To. 1.0.0 treated the smallest ancestor
     containing the body as "the compose", which excluded the subject, so
     subject placeholders were never seen.
  Also adds a console diagnostic line (no visible UI). The test
  fixture now mirrors the real compose markup (captured 2026-10-15) and the
  new regression tests fail against 1.0.0. Verified end-to-end in a live
  Gmail account (Chrome 155, 2026-10-15): `[hi]` in body blocked, `[Role]`
  in subject blocked, Ctrl+Enter blocked, Go Back keeps the draft, Send
  Anyway sends exactly once, clean mail and a clean reply whose *quoted*
  history contains brackets both send normally.
- **1.0.0** — Initial release.

## How the interception works

Gmail attaches its own event handlers through delegation. The content script
registers listeners for `click` and `keydown` **on `window`, in the capture
phase**, which the browser runs before any handler Gmail has registered on the
document or on the button itself. When a send trigger is detected and the draft
contains brackets, the event is cancelled with `preventDefault()` and stopped
with `stopImmediatePropagation()`, so Gmail never receives it. The warning is
shown; while it is up, all clicks and keystrokes outside the dialog are also
swallowed, so no other path can fire a send.

**Send Anyway** closes the dialog, marks the Send button with a one-shot
override and clicks it programmatically; the override is consumed by that one
click (and cleared on the next tick regardless), so a later send is inspected
again.

Send triggers covered:

- clicking the Send button (`data-tooltip`/`aria-label` starting with "Send",
  excluding "More send options" and "Schedule send");
- Enter or Space while the Send button is focused;
- Ctrl+Enter / Cmd+Enter while focus is anywhere inside the compose.

The draft is located by walking up from the trigger to the nearest container
that holds an editable message body, then expanding upward until the subject
field is included — but never far enough to swallow another compose's body —
so each compose window, inline reply or forward is inspected on its own. All
rendered "Message Body" elements inside that container are read (Gmail keeps
a hidden empty textarea alongside the real editor), the quoted history and
signature are stripped, and the subject input is read directly.

Verified against real Gmail (2026-10-15) by observing the event sequence on a
real Send click (`pointerdown → mousedown → pointerup → mouseup → click`) and
on Ctrl+Enter (`keydown`), and confirming that cancelling `click` / `keydown`
at window-capture prevents Gmail's send attempt entirely.

## Known limitations

Please read these before relying on the extension.

- **Gmail's DOM is not a public API.** Detection of the Send button, subject
  (`input[name=subjectbox]`) and body (`aria-label="Message Body"`
  contenteditable) relies on the attributes Gmail uses today. If Google
  changes them, the extension fails *open* (Gmail sends normally) rather than
  blocking you. It does not fail silently in a harmful way, but it may stop
  protecting you until updated.
- **Only the Gmail web UI at `mail.google.com`.** It does not cover the Gmail
  mobile apps, Gmail in other clients, Google Chat, or other Google domains.
- **Send paths that bypass the page's events are not interceptable** from a
  content script: *Schedule send*, *Undo send* recall, drafts sent from another
  device, Smart Compose/auto-send features, or anything a different extension
  triggers directly. "Send and archive" is intercepted because its label starts
  with "Send".
- **Signature and quoted text are intentionally skipped.** Brackets inside your
  saved signature (`gmail_signature`) or the quoted conversation
  (`.gmail_quote` / `blockquote`) do not trigger a warning. Brackets you type
  into the reply itself do.
- **Attachments and recipient names are not inspected.**
- **Square brackets only.** `{Name}`, `<Name>`, `<<Name>>` and `___` are not
  detected by design (reliability over heuristics).
- The warning dialog is injected into the Gmail page; Gmail's own CSS could in
  principle affect its appearance, though it uses isolated class names.

## Development

The extension itself has zero dependencies. Dev tooling uses Node ≥ 18.

```bash
npm install            # playwright-core only, for the browser tests
npm run test:unit      # bracket-detection unit tests (node:test)
npm run test:browser   # loads the extension into a real browser and drives a
                       # simulated Gmail compose at https://mail.google.com/mock/
npm run icons          # regenerate icons/ (pure Node, no deps)
npm run package        # builds dist/gmail-placeholder-guard-<version>.zip
```

The browser tests use the Chromium-based browser already on the machine via
Playwright's `channel` option (default `msedge`, override with
`CHANNEL=chromium` after `npx playwright install chromium`, or `HEADED=1` to
watch). **Google Chrome 137+ cannot be used for this**: branded Chrome
dropped support for `--load-extension`, so the extension would silently not
load under automation. Loading it manually in Chrome via *Load unpacked* is
unaffected.

The simulated Gmail page lives in `test/mock-gmail.html` and mirrors the
compose markup the extension depends on. The test serves it at a
`mail.google.com` URL through a request route, so Chrome injects the content
script exactly as it does on the real site — no real Gmail traffic, no real
email.

## Files

```
manifest.json      MV3 manifest (content script only, no permissions)
detector.js        bracket detection (pure, shared with unit tests)
content.js         Gmail integration: interception + warning dialog
styles.css         dialog styling
icons/             16/32/48/128 px icons (generated by tools/make-icons.js)
test/              unit tests, browser tests, simulated Gmail page
tools/             icon generator and ZIP packager
dist/              Web Store ZIP (after npm run package)
```

## Privacy

The extension **does read** the subject and body of the draft you are sending
— that is its job — at the moment you send it, inside the Gmail page, to look
for `[` and `]`. It does not store that text, does not transmit it (no network
requests, no server), reads no other mail, and declares no Chrome API
permissions; its only access is the content script on `mail.google.com`.
Full policy: [store/privacy-policy.html](store/privacy-policy.html).

## Publishing

Chrome Web Store materials (icon, screenshots, listing text, privacy policy,
dashboard field guide) are in [store/](store/README.md).

## Version history (continued)

- **1.0.2** — Renamed to "Placeholder Guard for Gmail" (Google branding
  guidelines disallow starting a third-party name with a Google trademark);
  store assets added. No functional change.
