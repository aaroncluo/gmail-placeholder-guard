/*
 * Browser tests: load the real extension into Chrome/Chromium (Playwright,
 * using the Chrome already on the machine — no browser download) and drive a
 * simulated Gmail compose UI served at https://mail.google.com/mock/ via a
 * request route, so the content script is injected by Chrome exactly as it is
 * on the real site. No real Gmail traffic, no real email.
 *
 * Run: npm run test:browser   (HEADED=1 to watch it)
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

// EXT=<dir> runs the suite against another copy of the extension (used to
// prove the regression tests fail on the broken 1.0.0 build).
const EXT = path.resolve(process.env.EXT || path.join(__dirname, ".."));
const MOCK_HTML = fs.readFileSync(path.join(__dirname, "mock-gmail.html"), "utf8");
const MOCK_URL = "https://mail.google.com/mock/";
const PROFILE = path.join(__dirname, ".chrome-profile");

let context, page;

// Google Chrome 137+ ignores --load-extension (branded builds dropped it), so
// an installed Chrome cannot host unpacked extensions under automation. Edge
// and Playwright's Chromium can. Override with CHANNEL=chromium|msedge|chrome.
const CHANNEL = process.env.CHANNEL || "msedge";

async function launch(headless) {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  return chromium.launchPersistentContext(PROFILE, {
    channel: CHANNEL,
    headless,
    timeout: 30000,
    // Playwright adds --disable-extensions by default, which would turn off
    // the very extension under test.
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
}

test.before(async () => {
  const headed = !!process.env.HEADED;
  try {
    context = await launch(!headed);
  } catch (err) {
    if (headed) throw err;
    console.log("headless launch failed, retrying headed:", String(err).split("\n")[0]);
    context = await launch(false);
  }
  await context.route("https://mail.google.com/**", (route) => {
    if (route.request().url().startsWith(MOCK_URL)) {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: MOCK_HTML });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  page = context.pages()[0] || (await context.newPage());
});

test.after(async () => {
  await context?.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const sel = {
  body: (id) => `#${id} div[aria-label="Message Body"][contenteditable]`,
  subject: (id) => `#${id} input[name="subjectbox"]`,
  send: (id) => `#${id} [role="button"].aoO`,
  more: (id) => `#${id} [role="button"].hG`,
  overlay: ".pg-overlay",
  back: ".pg-overlay .pg-btn-primary",
  anyway: ".pg-overlay .pg-btn-secondary",
  snippets: ".pg-overlay .pg-snippet",
  fields: ".pg-overlay .pg-field"
};

async function open() {
  await page.goto(MOCK_URL);
  assert.equal(await page.title(), "Mock Gmail");
}
const sent = () => page.evaluate(() => window.__sent);
const overlayVisible = () => page.locator(sel.overlay).isVisible();
async function typeBody(id, html) {
  await page.locator(sel.body(id)).evaluate((el, h) => (el.innerHTML = h), html);
}
async function assertExtensionLoaded() {
  // The content script registers no globals in the page world; verify the
  // extension is present by checking the CSS it injects is applied.
  const ok = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "pg-overlay";
    probe.style.display = "none";
    document.body.appendChild(probe);
    const z = getComputedStyle(probe).zIndex;
    probe.remove();
    return z === "2147483647";
  });
  assert.ok(ok, "extension content script/CSS not injected — check Chrome launched with the extension");
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------
test("extension is injected into mail.google.com", async () => {
  await open();
  await assertExtensionLoaded();
});

test("mock reproduces real Gmail: hidden textarea 'Message Body' precedes the editable div, Send outside <form>", async () => {
  // Guards the fixture itself: these are the properties that made v1.0.0
  // read an empty body on real Gmail and let every placeholder through.
  await open();
  const shape = await page.evaluate(() => {
    const c = document.querySelector("#compose1");
    const bodies = [...c.querySelectorAll('[aria-label="Message Body"]')];
    return {
      order: bodies.map((b) => b.tagName),
      firstHidden: bodies[0].offsetParent === null && bodies[0].offsetHeight === 0,
      sendInForm: !!c.querySelector('[role="button"].aoO').closest("form"),
      subjectInForm: !!c.querySelector('input[name="subjectbox"]').closest("form")
    };
  });
  assert.deepEqual(shape, { order: ["TEXTAREA", "DIV"], firstHidden: true, sendInForm: false, subjectInForm: true });
});

test("REGRESSION (real Gmail failure): [hi] typed into the editable body is blocked despite the hidden textarea", async () => {
  await open();
  await page.fill(sel.subject("compose1"), "test");
  // Type like a user instead of setting innerHTML.
  await page.click(sel.body("compose1"));
  await page.keyboard.type("Hello [hi] there");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await sent(), []);
  assert.deepEqual(await page.locator(sel.snippets).allInnerTexts(), ["Hello [hi] there"]);
});

test("REGRESSION (real Gmail layout): subject [Role] is caught although the subject <form> is a sibling of the body table", async () => {
  await open();
  await page.fill(sel.subject("compose1"), "Application for [Role]");
  await typeBody("compose1", "<div>Please find my CV attached.</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await sent(), []);
  assert.deepEqual(await page.locator(sel.snippets).allInnerTexts(), ["Application for [Role]"]);
});

test("Ctrl+Enter from the subject field and from the body both see the subject", async () => {
  for (const focusSel of [sel.subject("compose1"), sel.body("compose1")]) {
    await open();
    await page.fill(sel.subject("compose1"), "Re: [Course] grade");
    await typeBody("compose1", "<div>clean body</div>");
    await page.focus(focusSel);
    await page.keyboard.press("Control+Enter");
    await page.waitForSelector(sel.overlay);
    assert.deepEqual(await sent(), []);
  }
});

test("diagnostic attribute on <html>, and no visible UI is added to Gmail until a send is blocked", async () => {
  await open();
  assert.equal(await page.getAttribute("html", "data-placeholder-guard"), "active");
  assert.equal(await page.locator("[class^='pg-']").count(), 0, "nothing injected into the page");
});

test("normal email sends immediately with no warning", async () => {
  await open();
  await page.fill(sel.subject("compose1"), "Lunch tomorrow?");
  await typeBody("compose1", "<div>Hi Sam, are you free at noon (12pm)?</div>");
  await page.click(sel.send("compose1"));
  assert.equal(await overlayVisible(), false);
  const s = await sent();
  assert.equal(s.length, 1);
  assert.equal(s[0].id, "compose1");
  assert.equal(s[0].via, "click");
});

test("[Name] in body blocks the send and shows the offending text", async () => {
  await open();
  await page.fill(sel.subject("compose1"), "Hello");
  await typeBody("compose1", "<div>Dear [Professor Name],</div><div>Thanks!</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await sent(), []);
  assert.equal(await page.locator(".pg-title").innerText(), "Possible placeholder detected");
  assert.match(await page.locator(sel.snippets).first().innerText(), /\[Professor Name\]/);
  assert.equal(await page.locator(sel.fields).first().textContent(), "Body");
  // Focus lands on the safe button.
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Go Back and Edit");
});

test("Go Back and Edit never sends; after fixing, the send goes through", async () => {
  await open();
  await typeBody("compose1", "<div>Dear [Name],</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  await page.click(sel.back);
  await page.waitForSelector(sel.overlay, { state: "detached" });
  assert.deepEqual(await sent(), []);
  assert.equal(await page.locator("#compose1").count(), 1, "draft still open");
  await typeBody("compose1", "<div>Dear Alex,</div>");
  await page.click(sel.send("compose1"));
  assert.equal(await overlayVisible(), false);
  assert.equal((await sent()).length, 1);
});

test("[] empty brackets block; Send Anyway sends exactly once with no second warning", async () => {
  await open();
  await typeBody("compose1", "<div>Please RSVP to [] by Friday.</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  assert.match(await page.locator(sel.snippets).first().innerText(), /\[\]/);
  await page.click(sel.anyway);
  await page.waitForSelector(sel.overlay, { state: "detached" });
  await page.waitForTimeout(100);
  const s = await sent();
  assert.equal(s.length, 1, "sent exactly once");
  assert.equal(s[0].id, "compose1");
  assert.equal(await overlayVisible(), false);
});

test("override is one-shot: a later bracketed send still warns", async () => {
  await open();
  await typeBody("compose1", "<div>[a]</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  await page.click(sel.anyway);
  await page.waitForSelector(sel.overlay, { state: "detached" });
  assert.equal((await sent()).length, 1);
  await typeBody("compose2", "<div>[b]</div>");
  await page.click(sel.send("compose2"));
  await page.waitForSelector(sel.overlay);
  assert.equal((await sent()).length, 1);
});

test("unmatched brackets block", async () => {
  for (const body of ["<div>Hello [Name</div>", "<div>Hello Name]</div>"]) {
    await open();
    await typeBody("compose1", body);
    await page.click(sel.send("compose1"));
    await page.waitForSelector(sel.overlay);
    assert.deepEqual(await sent(), []);
  }
});

test("subject placeholder blocks even when the body is clean", async () => {
  await open();
  await page.fill(sel.subject("compose1"), "Application for [Role]");
  await typeBody("compose1", "<div>Please find my CV attached.</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await sent(), []);
  assert.equal(await page.locator(sel.fields).first().textContent(), "Subject");
  assert.match(await page.locator(sel.snippets).first().innerText(), /\[Role\]/);
});

test("multiple drafts: only the draft being sent is inspected", async () => {
  await open();
  await typeBody("compose1", "<div>Dear [Name]</div>");
  await typeBody("compose2", "<div>All clean here.</div>");
  // Clean draft sends although another draft has brackets.
  await page.click(sel.send("compose2"));
  assert.equal(await overlayVisible(), false);
  let s = await sent();
  assert.equal(s.length, 1);
  assert.equal(s[0].id, "compose2");
  // Bracketed draft is blocked and reports only its own text.
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  const snippets = await page.locator(sel.snippets).allInnerTexts();
  assert.deepEqual(snippets, ["Dear [Name]"]);
  assert.equal((await sent()).length, 1);
});

test("replies: quoted history and signature are ignored, typed text is not", async () => {
  await open();
  // compose3 body has [Company]/[Date] in the quote and [Dev] in the signature.
  await page.click(sel.send("compose3"));
  assert.equal(await overlayVisible(), false);
  let s = await sent();
  assert.equal(s.length, 1);
  assert.equal(s[0].id, "compose3");

  await open();
  await page.locator(sel.body("compose3")).evaluate((el) => {
    el.firstChild.textContent = "Sounds good [Time], see you then.";
  });
  await page.click(sel.send("compose3"));
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await page.locator(sel.snippets).allInnerTexts(), ["Sounds good [Time], see you then."]);
  assert.deepEqual(await sent(), []);
});

test("Ctrl+Enter shortcut is intercepted; Send Anyway then sends once", async () => {
  await open();
  await typeBody("compose1", "<div>Hi [First],</div>");
  await page.focus(sel.body("compose1"));
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await sent(), []);
  // While the warning is up, the shortcut must stay blocked too.
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(50);
  assert.deepEqual(await sent(), []);
  await page.click(sel.anyway);
  await page.waitForSelector(sel.overlay, { state: "detached" });
  await page.waitForTimeout(100);
  const s = await sent();
  assert.equal(s.length, 1);
  assert.equal(s[0].id, "compose1");
});

test("Meta+Enter (macOS shortcut) is intercepted", async () => {
  await open();
  await typeBody("compose1", "<div>[x]</div>");
  await page.focus(sel.body("compose1"));
  await page.keyboard.press("Meta+Enter");
  await page.waitForSelector(sel.overlay);
  assert.deepEqual(await sent(), []);
});

test("Ctrl+Enter in a clean draft sends normally", async () => {
  await open();
  await typeBody("compose1", "<div>Clean.</div>");
  await page.focus(sel.body("compose1"));
  await page.keyboard.press("Control+Enter");
  assert.equal(await overlayVisible(), false);
  const s = await sent();
  assert.equal(s.length, 1);
  assert.equal(s[0].via, "shortcut");
});

test("Enter / Space on a focused Send button is intercepted", async () => {
  for (const key of ["Enter", "Space"]) {
    await open();
    await typeBody("compose1", "<div>[y]</div>");
    await page.focus(sel.send("compose1"));
    await page.keyboard.press(key);
    await page.waitForSelector(sel.overlay);
    assert.deepEqual(await sent(), []);
  }
});

test("Escape and clicking the backdrop go back without sending", async () => {
  await open();
  await typeBody("compose1", "<div>[z]</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  await page.keyboard.press("Escape");
  await page.waitForSelector(sel.overlay, { state: "detached" });
  assert.deepEqual(await sent(), []);

  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  await page.mouse.click(5, 5); // backdrop, far from the dialog
  await page.waitForSelector(sel.overlay, { state: "detached" });
  assert.deepEqual(await sent(), []);
  assert.equal(await page.locator("#compose1").count(), 1);
});

test("clicks on the page are blocked while the warning is up", async () => {
  await open();
  await typeBody("compose1", "<div>[q]</div>");
  await typeBody("compose2", "<div>clean</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  // Dispatch directly at compose2's Send (bypassing the overlay geometry).
  await page.locator(sel.send("compose2")).dispatchEvent("click");
  assert.deepEqual(await sent(), []);
  await page.click(sel.back);
});

test("'More send options' and unrelated buttons are not intercepted", async () => {
  await open();
  await typeBody("compose1", "<div>[n]</div>");
  await page.click(sel.more("compose1"));
  assert.equal(await overlayVisible(), false);
  assert.equal(await page.locator(sel.more("compose1")).getAttribute("data-opened"), "1");
  await page.click("#other-button");
  assert.equal(await overlayVisible(), false);
  assert.deepEqual(await sent(), []);
});

test("Gmail receives no click when a send is blocked (interception happens first)", async () => {
  await open();
  await typeBody("compose1", "<div>[k]</div>");
  await page.click(sel.send("compose1"));
  await page.waitForSelector(sel.overlay);
  const events = await page.evaluate(() => window.__events.filter((e) => e.startsWith("click:")));
  assert.deepEqual(events, [], "Gmail's delegated click handler must never see the blocked click");
});
