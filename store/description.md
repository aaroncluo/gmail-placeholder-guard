# Store listing text

Copy these into the Chrome Web Store dashboard (see DASHBOARD.md for where).

## Name (max 45 chars)

```
Free Placeholder Guard for Gmail
```

## Summary (max 132 chars)

```
Never accidentally send "Hi [Name]" again. Catch embarrassing placeholders before your emails are sent. 100% free and automatic.
```

(128 characters — this is also the manifest `description`, so the dashboard
picks it up from the package automatically)

## Detailed description (max 16,000 chars; plain text, no HTML)

```
Ever sent "Hi [Name]"? This free extension makes sure you never do it again.

When you click Send in Gmail (or press Ctrl+Enter / ⌘+Enter), Free Placeholder Guard checks the subject and body of the draft you're sending for square brackets — [Name], [Company], [Date], or an empty [] — the kind of placeholder left behind in a template. If it finds one, it stops the send before Gmail processes it and shows you exactly what it found, with two choices:

• Go Back and Edit — return to your draft; nothing is sent.
• Send Anyway — send once, with no second prompt.

If there are no brackets, nothing happens: Gmail sends as usual, with no delay and no popup.

WHAT IT CHECKS
• The subject line and the body of the draft being sent.
• Only what you typed — quoted earlier messages and your signature are ignored.
• Each compose window, reply or forward on its own.
• Clicking Send, pressing Enter/Space on the Send button, and the Ctrl/⌘+Enter shortcut.

PRIVACY
The check runs entirely inside the Gmail page in your browser, at the moment you send. The extension reads the draft you are sending to look for brackets; it does not store it, does not send it anywhere, and makes no network requests. It requests no Chrome permissions beyond running on mail.google.com. No account, no sign-in, no AI, no analytics. Full policy: see the privacy policy link on this listing.

KEEP IN MIND
• Gmail's page structure is not a public API. If Google changes it, the extension is designed to fail open — Gmail keeps working normally — but it may stop warning until it is updated.
• Only square brackets are checked, by design. {Name}, <Name> and ___ are not.
• Scheduled sends and sends from other devices are not covered.
• Works in the Gmail web app at mail.google.com (desktop browsers).

Free forever: no account, no subscription, no upsell.

Free Placeholder Guard is independent and not affiliated with or endorsed by Google. Gmail is a trademark of Google LLC.
```

## Category

Productivity → **Tools** (or "Workflow & Planning" if "Tools" is unavailable in the current dashboard)

## Language

English
