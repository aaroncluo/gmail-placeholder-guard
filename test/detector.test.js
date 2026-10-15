"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { hasBrackets, findBrackets, inspectDraft } = require("../detector.js");

test("plain text has no brackets", () => {
  assert.equal(hasBrackets("Hi Dr. Smith, thanks for your time (yesterday)."), false);
  assert.deepEqual(findBrackets("Hello world"), []);
  assert.equal(inspectDraft({ subject: "Meeting", body: "See you at 3pm {ok}" }).blocked, false);
});

test("empty / missing input is not blocked", () => {
  assert.equal(inspectDraft({}).blocked, false);
  assert.equal(inspectDraft(null).blocked, false);
  assert.equal(inspectDraft({ subject: "", body: "" }).blocked, false);
});

test("detects a named placeholder", () => {
  const hits = findBrackets("Dear [Professor Name], I hope this finds you well.");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].match, "[Professor Name]");
  assert.equal(hits[0].index, 5);
  assert.match(hits[0].snippet, /Dear \[Professor Name\], I hope/);
});

test("detects empty brackets", () => {
  const hits = findBrackets("Please send it to [] by Friday.");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].match, "[]");
});

test("detects unmatched opening and closing brackets", () => {
  assert.deepEqual(findBrackets("Hello [Name").map((h) => h.match), ["["]);
  assert.deepEqual(findBrackets("Hello Name]").map((h) => h.match), ["]"]);
  assert.deepEqual(findBrackets("a ] b [ c").map((h) => h.match), ["]", "["]);
});

test("detects several placeholders and keeps order", () => {
  const hits = findBrackets("[Greeting] [First] and [Company]");
  assert.deepEqual(hits.map((h) => h.match), ["[Greeting]", "[First]", "[Company]"]);
});

test("bracket pairs do not span lines", () => {
  const hits = findBrackets("start [\nend ]");
  assert.deepEqual(hits.map((h) => h.match), ["[", "]"]);
});

test("subject placeholders are reported with the subject field", () => {
  const r = inspectDraft({ subject: "Application for [Role]", body: "All good here." });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.items.map((i) => i.field), ["subject"]);
  assert.equal(r.items[0].match, "[Role]");
});

test("body placeholders are reported with the body field", () => {
  const r = inspectDraft({ subject: "Hi", body: "Thanks,\n[Your Name]" });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.items, [
    { field: "body", match: "[Your Name]", snippet: "Thanks, [Your Name]" }
  ]);
});

test("subject hits come before body hits", () => {
  const r = inspectDraft({ subject: "[A]", body: "[B]" });
  assert.deepEqual(r.items.map((i) => i.field + ":" + i.match), ["subject:[A]", "body:[B]"]);
});

test("snippets are trimmed with ellipses in long text", () => {
  const long = "x".repeat(100) + "[Name]" + "y".repeat(100);
  const [hit] = findBrackets(long);
  assert.ok(hit.snippet.startsWith("…"));
  assert.ok(hit.snippet.endsWith("…"));
  assert.ok(hit.snippet.includes("[Name]"));
  assert.ok(hit.snippet.length < 70);
});

test("unicode text around brackets is handled", () => {
  const hits = findBrackets("Olá [Nome] — 你好 [名字]");
  assert.deepEqual(hits.map((h) => h.match), ["[Nome]", "[名字]"]);
});
