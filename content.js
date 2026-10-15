/*
 * Gmail Placeholder Guard — content script.
 *
 * Intercepts Gmail's Send action (button click, Enter/Space on the focused
 * Send button, and Ctrl/Cmd+Enter) in the *capture phase on window*, which
 * runs before any of Gmail's own listeners. If the draft's subject or body
 * contains square brackets, the event is cancelled and stopped before Gmail
 * ever sees it, and a warning is shown. "Send Anyway" re-triggers the Send
 * button exactly once with a one-shot override.
 *
 * Everything runs locally. No data leaves the page.
 */
(function () {
  "use strict";

  var detector = globalThis.PlaceholderGuardDetector;
  if (!detector) return;

  var OVERLAY_CLASS = "pg-overlay";
  var SELECTOR_BODY =
    '[aria-label="Message Body"][contenteditable="true"],' +
    '[g_editable="true"][contenteditable="true"],' +
    'div[role="textbox"][contenteditable="true"].editable,' +
    'textarea[aria-label="Message Body"]';
  var SELECTOR_SUBJECT = 'input[name="subjectbox"], input[aria-label="Subject"]';
  // Content Gmail nests inside the editable body that is NOT the user's draft.
  var SELECTOR_EXCLUDED_IN_BODY =
    ".gmail_quote, .gmail_quote_container, blockquote, " +
    '[data-smartmail="gmail_signature"], .gmail_signature';

  /** The one warning currently on screen, or null. */
  var activeWarning = null;
  /** Send button allowed to pass through exactly once (after "Send Anyway"). */
  var overrideButton = null;
  var overrideTimer = 0;

  // ---------------------------------------------------------------------------
  // Locating Gmail pieces
  // ---------------------------------------------------------------------------

  function stripBidi(s) {
    return (s || "").replace(/[‎‏‪-‮⁦-⁩]/g, "").trim();
  }

  /** Returns the Send button element if `el` is (inside) one, else null. */
  function sendButtonFrom(el) {
    if (!(el instanceof Element)) return null;
    if (el.closest("." + OVERLAY_CLASS)) return null;
    var btn = el.closest('[role="button"], button');
    if (!btn) return null;
    var label = stripBidi(btn.getAttribute("data-tooltip") || btn.getAttribute("aria-label"));
    var text = stripBidi(btn.textContent);
    // "More send options" (the ▾ next to Send) and "Schedule send" are not sends.
    if (/^(more send options|schedule send)/i.test(label)) return null;
    if (/^send\b/i.test(label) || /^send$/i.test(text)) return btn;
    return null;
  }

  /**
   * Walks up from `el` to the smallest ancestor that contains a draft body.
   * Compose windows are never nested, so the first such ancestor is the
   * compose this element belongs to (and not a sibling compose).
   */
  function composeRootFrom(el) {
    var node = el instanceof Element ? el : null;
    while (node && node !== document.documentElement) {
      if (node.querySelector(SELECTOR_BODY)) return expandToCompose(node);
      node = node.parentElement;
    }
    return null;
  }

  /**
   * In real Gmail the body and the Send button live in one <table class="iN">
   * while the subject/recipients <form> is its *sibling*; the smallest
   * ancestor holding the body therefore misses the subject. Climb further
   * until the subject is included, stopping before another compose's body
   * would be swallowed (and never above <body>).
   */
  function expandToCompose(node) {
    var bodyCount = node.querySelectorAll(SELECTOR_BODY).length;
    var cur = node;
    while (!cur.querySelector(SELECTOR_SUBJECT)) {
      var parent = cur.parentElement;
      if (!parent || cur === document.body) break;
      if (parent.querySelectorAll(SELECTOR_BODY).length !== bodyCount) break;
      cur = parent;
    }
    return cur;
  }

  function composeRootFromFocus(target) {
    var el = target instanceof Element ? target : document.activeElement;
    if (!el) return null;
    // Focus is usually inside the body/subject/recipients of the compose.
    var node = el;
    while (node && node !== document.documentElement) {
      if (node.querySelector(SELECTOR_BODY) && findSendButton(node)) return expandToCompose(node);
      node = node.parentElement;
    }
    return null;
  }

  function findSendButton(root) {
    var candidates = root.querySelectorAll('[role="button"], button');
    for (var i = 0; i < candidates.length; i++) {
      var btn = sendButtonFrom(candidates[i]);
      if (btn) return btn;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Reading the draft (only the parts the user wrote)
  // ---------------------------------------------------------------------------

  function elementText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    var clone = el.cloneNode(true);
    clone.querySelectorAll(SELECTOR_EXCLUDED_IN_BODY).forEach(function (n) {
      n.remove();
    });
    return textWithLineBreaks(clone);
  }

  var BLOCK_TAGS = /^(DIV|P|BR|LI|TR|H[1-6]|PRE|TABLE|UL|OL|BLOCKQUOTE)$/;
  function textWithLineBreaks(node) {
    var out = "";
    (function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.nodeValue;
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      if (n.tagName === "BR") {
        out += "\n";
        return;
      }
      var block = BLOCK_TAGS.test(n.tagName);
      if (block && out && !/\n$/.test(out)) out += "\n";
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (block && !/\n$/.test(out)) out += "\n";
    })(node);
    return out;
  }

  function isRendered(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  /**
   * Reads the draft the user is sending.
   *
   * Real Gmail keeps TWO elements labelled "Message Body" in every compose:
   * a hidden, always-empty <textarea class="Ak"> (plain-text fallback) that
   * comes FIRST in document order, and the contenteditable <div> the user
   * actually types in. Taking the first match would read an empty body and
   * let every placeholder through, so every rendered candidate is read and
   * concatenated (hidden ones only if nothing is rendered at all).
   */
  function readDraft(root) {
    var candidates = Array.prototype.slice.call(root.querySelectorAll(SELECTOR_BODY));
    var rendered = candidates.filter(isRendered);
    var bodies = rendered.length ? rendered : candidates;
    var body = bodies.map(elementText).join("\n");

    var subjects = Array.prototype.slice.call(root.querySelectorAll(SELECTOR_SUBJECT));
    var subject = subjects.map(elementText).join("\n");
    return { subject: subject, body: body };
  }

  // ---------------------------------------------------------------------------
  // Event interception
  // ---------------------------------------------------------------------------

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }

  function isSendShortcut(e) {
    return (e.key === "Enter" || e.keyCode === 13) && (e.ctrlKey || e.metaKey) && !e.altKey;
  }

  /**
   * Shared decision for every send trigger. Returns true when the send was
   * blocked (caller must swallow the event).
   */
  function guardSend(button, root) {
    if (overrideButton && button === overrideButton) {
      clearOverride();
      return false; // explicit "Send Anyway": let this one through.
    }
    if (!root) root = composeRootFrom(button);
    if (!root) return false; // Not a compose we understand — never interfere.
    var report = detector.inspectDraft(readDraft(root));
    if (!report.blocked) return false;
    showWarning(report, button, root);
    return true;
  }

  function onClick(e) {
    if (activeWarning) {
      // The overlay covers the page, but be strict: nothing outside the warning
      // may be clicked while it is up.
      if (!(e.target instanceof Element) || !e.target.closest("." + OVERLAY_CLASS)) swallow(e);
      return;
    }
    var button = sendButtonFrom(e.target);
    if (!button) return;
    if (guardSend(button, null)) swallow(e);
  }

  function onKeyDown(e) {
    if (activeWarning) {
      if (e.key === "Escape") {
        swallow(e);
        goBack();
        return;
      }
      // Keep keyboard sends (and anything else) away from Gmail while blocked.
      if (!(e.target instanceof Element) || !e.target.closest("." + OVERLAY_CLASS) || isSendShortcut(e)) {
        swallow(e);
      }
      return;
    }

    var button = null;
    var root = null;
    if (isSendShortcut(e)) {
      root = composeRootFromFocus(e.target);
      if (!root) return;
      button = findSendButton(root);
      if (!button) return;
    } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      button = sendButtonFrom(e.target);
      if (!button) return;
    } else {
      return;
    }
    if (guardSend(button, root)) swallow(e);
  }

  // Gmail may also react to keypress/keyup; silence them while a warning is up.
  function onOtherKey(e) {
    if (!activeWarning) return;
    if (!(e.target instanceof Element) || !e.target.closest("." + OVERLAY_CLASS) || isSendShortcut(e)) {
      swallow(e);
    }
  }

  function onOtherPointer(e) {
    if (!activeWarning) return;
    if (!(e.target instanceof Element) || !e.target.closest("." + OVERLAY_CLASS)) swallow(e);
  }

  // ---------------------------------------------------------------------------
  // Warning UI
  // ---------------------------------------------------------------------------

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function showWarning(report, button, root) {
    if (activeWarning) return;

    var overlay = el("div", OVERLAY_CLASS);
    var dialog = el("div", "pg-dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "pg-title");
    dialog.setAttribute("aria-describedby", "pg-desc");

    var title = el("h2", "pg-title", "Possible placeholder detected");
    title.id = "pg-title";
    var desc = el(
      "p",
      "pg-desc",
      "Your email contains square brackets that might be unfinished placeholders."
    );
    desc.id = "pg-desc";

    var list = el("ul", "pg-list");
    var shown = {};
    var count = 0;
    report.items.forEach(function (item) {
      var key = item.field + "\u0000" + item.snippet;
      if (shown[key]) return;
      shown[key] = true;
      if (count++ >= 8) return;
      var li = el("li", "pg-item");
      li.appendChild(el("span", "pg-field", item.field === "subject" ? "Subject" : "Body"));
      li.appendChild(el("code", "pg-snippet", item.snippet));
      list.appendChild(li);
    });
    if (count > 8) list.appendChild(el("li", "pg-item pg-more", "…and " + (count - 8) + " more"));

    var actions = el("div", "pg-actions");
    var backBtn = el("button", "pg-btn pg-btn-primary", "Go Back and Edit");
    backBtn.type = "button";
    var sendBtn = el("button", "pg-btn pg-btn-secondary", "Send Anyway");
    sendBtn.type = "button";
    actions.appendChild(sendBtn);
    actions.appendChild(backBtn);

    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(list);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    backBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      goBack();
    });
    sendBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      sendAnyway();
    });
    // Clicking the dim backdrop = go back (never sends).
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) goBack();
    });
    // Simple focus trap.
    dialog.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var focusables = [sendBtn, backBtn];
      var idx = focusables.indexOf(document.activeElement);
      e.preventDefault();
      var next = e.shiftKey ? (idx <= 0 ? focusables.length - 1 : idx - 1) : (idx + 1) % focusables.length;
      focusables[next].focus();
    });

    activeWarning = {
      overlay: overlay,
      button: button,
      root: root,
      previousFocus: document.activeElement
    };
    document.documentElement.appendChild(overlay);
    backBtn.focus();
  }

  function closeWarning() {
    var w = activeWarning;
    activeWarning = null;
    if (!w) return null;
    w.overlay.remove();
    return w;
  }

  function goBack() {
    var w = closeWarning();
    if (!w) return;
    var focusTarget = w.root && w.root.querySelector(SELECTOR_BODY);
    try {
      (focusTarget || w.previousFocus || document.body).focus();
    } catch (err) {
      /* ignore */
    }
  }

  function clearOverride() {
    overrideButton = null;
    if (overrideTimer) {
      clearTimeout(overrideTimer);
      overrideTimer = 0;
    }
  }

  function sendAnyway() {
    var w = closeWarning();
    if (!w) return;
    var button = w.button;
    if (!button || !button.isConnected) {
      // Compose went away (discarded?) — find it again, else do nothing.
      button = w.root && w.root.isConnected ? findSendButton(w.root) : null;
      if (!button) return;
    }
    clearOverride();
    overrideButton = button;
    // One-shot: if for any reason the click below never reaches our handler,
    // the override must not linger and silently let a later send through.
    overrideTimer = setTimeout(clearOverride, 0);
    button.click();
    clearOverride();
  }

  // ---------------------------------------------------------------------------
  // Diagnostics (no visible UI): a data attribute on <html> and one console
  // line, so "is it running on this tab?" can be answered from DevTools.
  // ---------------------------------------------------------------------------

  document.documentElement.setAttribute("data-placeholder-guard", "active");
  console.info("[Placeholder Guard] active on", location.host);

  // ---------------------------------------------------------------------------
  // Wire up — capture phase on window runs before anything Gmail registered.
  // ---------------------------------------------------------------------------

  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keypress", onOtherKey, true);
  window.addEventListener("keyup", onOtherKey, true);
  ["pointerdown", "pointerup", "mousedown", "mouseup", "auxclick", "dblclick", "touchstart", "touchend"].forEach(
    function (type) {
      window.addEventListener(type, onOtherPointer, { capture: true, passive: false });
    }
  );
})();
