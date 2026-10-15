/*
 * Gmail Placeholder Guard — bracket detection.
 *
 * Pure functions, no DOM access. Loaded by the content script (as a plain
 * script, exposing `PlaceholderGuardDetector` on the global) and by the unit
 * tests (as a CommonJS module). Nothing here reads, stores or transmits data.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PlaceholderGuardDetector = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // A bracketed placeholder like "[Professor Name]" or "[]" (no nesting, single
  // line, up to 120 chars), or a lone "[" / "]" that never closed/opened.
  var BRACKET_PATTERN = /\[[^\[\]\r\n]{0,120}\]|\[|\]/g;
  var CONTEXT_CHARS = 24;

  /** True when the text contains at least one square bracket. */
  function hasBrackets(text) {
    return typeof text === "string" && /[\[\]]/.test(text);
  }

  /**
   * Returns every bracket occurrence in `text`.
   * Each entry: { match, index, snippet } where `snippet` is the match with a
   * little surrounding context, suitable for showing to the user.
   */
  function findBrackets(text) {
    var results = [];
    if (!hasBrackets(text)) return results;

    BRACKET_PATTERN.lastIndex = 0;
    var m;
    while ((m = BRACKET_PATTERN.exec(text)) !== null) {
      var start = m.index;
      var end = start + m[0].length;
      var snippet = buildSnippet(text, start, end);
      results.push({ match: m[0], index: start, snippet: snippet });
      if (m[0].length === 0) BRACKET_PATTERN.lastIndex++; // safety, never hit
    }
    return results;
  }

  function buildSnippet(text, start, end) {
    var before = text.slice(Math.max(0, start - CONTEXT_CHARS), start);
    var after = text.slice(end, end + CONTEXT_CHARS);
    // Keep the snippet on one line.
    before = before.replace(/\s+/g, " ");
    after = after.replace(/\s+/g, " ");
    var leftCut = start - CONTEXT_CHARS > 0;
    var rightCut = end + CONTEXT_CHARS < text.length;
    var lineBreakBefore = before.lastIndexOf("\n");
    return (
      (leftCut && lineBreakBefore === -1 ? "…" : "") +
      before.replace(/^\s+/, "") +
      text.slice(start, end) +
      after.replace(/\s+$/, "") +
      (rightCut ? "…" : "")
    );
  }

  /**
   * Inspects a draft and returns a report:
   *   { blocked: boolean, items: [{ field: "subject"|"body", match, snippet }] }
   */
  function inspectDraft(draft) {
    var items = [];
    var subject = draft && typeof draft.subject === "string" ? draft.subject : "";
    var body = draft && typeof draft.body === "string" ? draft.body : "";

    findBrackets(subject).forEach(function (hit) {
      items.push({ field: "subject", match: hit.match, snippet: hit.snippet });
    });
    findBrackets(body).forEach(function (hit) {
      items.push({ field: "body", match: hit.match, snippet: hit.snippet });
    });

    return { blocked: items.length > 0, items: items };
  }

  return {
    hasBrackets: hasBrackets,
    findBrackets: findBrackets,
    inspectDraft: inspectDraft
  };
});
