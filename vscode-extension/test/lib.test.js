"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { findProject, looksLikeError, renderAnswer, safeUrl } = require("../lib");

test("finds the deepest project containing the file", () => {
  const projects = [{ id: 1, path: "/home/me/projects" }, { id: 2, path: "/home/me/projects/rover-02" }];
  assert.equal(findProject(projects, "/home/me/projects/rover-02/src/main.cpp").id, 2);
  assert.equal(findProject(projects, "/home/me/projects/rover-020/x.cpp").id, 1);
  assert.equal(findProject(projects, "/tmp/other.cpp"), null);
});

test("matches Windows paths case-insensitively", () => {
  if (process.platform !== "win32") return;
  assert.equal(findProject([{ id: 3, path: "C:\\Users\\Me\\projects\\rover" }], "c:\\users\\me\\Projects\\rover\\src\\main.cpp").id, 3);
});

test("spots error text", () => {
  assert.ok(looksLikeError("src/main.cpp:12: error: 'x' was not declared in this scope"));
  assert.ok(looksLikeError("Brownout detector was triggered"));
  assert.ok(!looksLikeError("How do I read a button?"));
});

test("answer page escapes everything and links only http(s)", () => {
  const html = renderAnswer("<b>q</b>", { status: "sent", cost_rm: 0.0004, cards: [
    { kind: "doc", title: "pulseIn()", url: "https://docs.arduino.cc/x", why: "<script>x</script>", apply_it: "Use a timeout", snippet: "" },
    { kind: "handbook", title: "HC-SR04", url: "#handbook/robotics/parts/hc-sr04", why: "w", apply_it: "a", snippet: "int d;" },
  ], past_errors: [] });
  assert.ok(html.includes("&lt;b&gt;q&lt;/b&gt;") && !html.includes("<script>x"));
  assert.ok(html.includes('<a href="https://docs.arduino.cc/x">pulseIn()</a>'));
  assert.ok(!html.includes('href="#handbook'));
  assert.ok(html.includes("RM0.0004") && html.includes("default-src 'none'"));
  assert.equal(safeUrl("javascript:alert(1)"), null);
});
