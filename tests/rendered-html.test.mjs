import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Voice Remix studio shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Voice Remix/);
  assert.match(html, /Voice Remix/);
  assert.match(html, /Neon Pulse Loop/);
  assert.match(html, /5 stems/);
  assert.match(html, /59<!-- --> bars/);
  assert.match(html, /LIVE SESSION/);
  assert.match(html, /Talk to the arrangement\./);
  assert.match(html, /Import audio/);
  assert.match(html, /VISUAL EDITOR/);
  assert.match(html, /aria-label="Playback position"/);
  assert.match(html, /type="range"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});
