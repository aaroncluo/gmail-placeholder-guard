// Generates the Chrome Web Store assets into store/assets/:
//   icon-128.png          128x128 store icon (96px artwork + 16px transparent padding,
//                         per the Web Store image guidelines)
//   promo-small-440x280.png  small promo tile (optional on the dashboard)
//   screenshot-1..3.png   1280x800 screenshots of the REAL warning dialog rendered
//                         by the real extension over a dummy-data Gmail-like stage
// Needs a Chromium-based browser that can load unpacked extensions (Edge by
// default, like the browser tests; CHANNEL=chromium|msedge). No real Gmail.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { encodePNG, render, composite } = require("./make-icons.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "store", "assets");
const STAGE = fs.readFileSync(path.join(ROOT, "store", "screenshot-stage.html"), "utf8");
const STAGE_URL = "https://mail.google.com/store-stage/";
const PROFILE = path.join(ROOT, "test", ".chrome-profile-store");

fs.mkdirSync(OUT, { recursive: true });

// --- icon + promo tile -------------------------------------------------------
fs.writeFileSync(path.join(OUT, "icon-128.png"), encodePNG(128, 128, composite(128, 128, render(96), 96)));
console.log("wrote store/assets/icon-128.png");
const ICON_DATA_URL = "data:image/png;base64," + encodePNG(128, 128, render(128)).toString("base64");
const PROMO_HTML = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:440px;height:280px;background:#fff;font-family:"Google Sans",Roboto,Arial,sans-serif;color:#202124}
  .w{display:flex;align-items:center;gap:28px;height:100%;padding:0 36px;box-sizing:border-box}
  img{width:96px;height:96px}
  h1{margin:0 0 8px;font-size:26px;font-weight:500;line-height:1.2}
  p{margin:0;font-size:15px;color:#5f6368;line-height:1.4}
  code{background:#fef7e0;color:#b06000;padding:1px 5px;border-radius:4px;font-size:14px}
</style><div class="w"><img src="${ICON_DATA_URL}" alt=""><div><h1>Placeholder Guard<br>for Gmail</h1>
<p>Catches <code>[unfinished placeholders]</code> before you hit Send.</p></div></div>`;

// --- screenshots -------------------------------------------------------------
(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: process.env.CHANNEL || "msedge",
    headless: !process.env.HEADED,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
  });
  await ctx.route("https://mail.google.com/**", (route) =>
    route.request().url().startsWith(STAGE_URL)
      ? route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: STAGE })
      : route.fulfill({ status: 204, body: "" })
  );
  const page = ctx.pages()[0] || (await ctx.newPage());

  const body = 'div[aria-label="Message Body"][contenteditable]';
  const subject = 'input[name="subjectbox"]';
  const send = '[role="button"].aoO';

  async function stage(subj, html) {
    await page.goto(STAGE_URL);
    await page.fill(subject, subj);
    await page.locator(body).evaluate((el, h) => (el.innerHTML = h), html);
  }
  async function shot(name) {
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log("wrote store/assets/" + name);
  }

  // 1. The warning, blocking a draft with an unfinished placeholder.
  await stage(
    "Reference letter",
    "<div>Dear Dr. Natarajan,</div><div><br></div><div>Thank you for agreeing to write a reference for my application to [Program Name]. The deadline is [Date], and the form is attached.</div><div><br></div><div>Best regards,</div><div>Jordan</div>"
  );
  await page.click(send);
  await page.waitForSelector(".pg-overlay");
  await shot("screenshot-1-warning.png");

  // 2. Subject-line placeholder is caught too.
  await stage(
    "Application for [Role] — Jordan Lee",
    "<div>Hello,</div><div><br></div><div>Please find my application attached. I'm happy to provide anything else you need.</div><div><br></div><div>Thanks,</div><div>Jordan</div>"
  );
  await page.click(send);
  await page.waitForSelector(".pg-overlay");
  await shot("screenshot-2-subject.png");

  // 3. A clean draft: nothing is added to Gmail, Send works as usual.
  await stage(
    "Lunch Thursday?",
    "<div>Hi Sam,</div><div><br></div><div>Noon at the usual place works for me. See you then!</div><div><br></div><div>Jordan</div>"
  );
  await page.hover(send);
  await shot("screenshot-3-clean.png");

  // Small promo tile (optional dashboard asset).
  const promo = await ctx.newPage();
  await promo.setViewportSize({ width: 440, height: 280 });
  await promo.setContent(PROMO_HTML);
  await promo.screenshot({ path: path.join(OUT, "promo-small-440x280.png") });
  console.log("wrote store/assets/promo-small-440x280.png");

  await ctx.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
