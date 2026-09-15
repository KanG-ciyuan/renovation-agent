/**
 * Regression tests for the static-file path-traversal defect.
 *
 * Background
 * ----------
 * `createServer()` used to serve static files with
 *
 *     serveFile(res, path.join(publicDir, req.url));
 *
 * `path.join` collapses `..`, and nothing verified that the result was still
 * inside `publicDir`, so `GET /../.env` read the process working file and
 * `GET /../../../../../../../../etc/hosts` read the host filesystem.
 *
 * These tests pin the fix in two layers:
 *   1. unit  — `resolvePublicFile()` rejects traversal-shaped input
 *   2. HTTP  — the running server returns 403 and never leaks file content,
 *              while legitimate assets keep working
 *
 * Run: node --test tests/
 *
 * The HTTP layer deliberately uses raw TCP sockets instead of curl/fetch,
 * because HTTP clients normalise `/../` out of the request line before it is
 * ever sent, which would hide the defect.
 */

"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

const { createServer, resolvePublicFile, publicDir } = require("../app.js");

/** Decode a chunked transfer-encoded body (Node omits Content-Length here). */
function decodeChunked(raw) {
  const lines = raw.split("\r\n");
  let out = "";
  let index = 0;
  while (index < lines.length) {
    const size = parseInt(lines[index], 16);
    if (!Number.isFinite(size) || size === 0) break;
    index += 1;
    out += lines.slice(index, index + size).join("\r\n");
    index += size;
  }
  return out;
}

/** Send a raw request line so the client cannot normalise the path. */
function rawRequest(port, rawPath) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`
      );
    });

    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
    });
    socket.on("end", () => {
      const separator = buffer.indexOf("\r\n\r\n");
      const head = separator === -1 ? buffer : buffer.slice(0, separator);
      const rawBody = separator === -1 ? "" : buffer.slice(separator + 4);
      const chunked = /transfer-encoding:\s*chunked/i.test(head);
      resolve({
        status: Number((head.split("\r\n")[0] || "").split(" ")[1] || 0),
        body: chunked ? decodeChunked(rawBody) : rawBody
      });
    });
    socket.on("error", reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error(`timeout requesting ${rawPath}`));
    });
  });
}

function withServer(run) {
  return async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      await run(port);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Unit layer — resolvePublicFile()
// ---------------------------------------------------------------------------

test("resolvePublicFile accepts the real public assets", () => {
  for (const [requestPath, expected] of [
    ["/index.html", "index.html"],
    ["/style.css", "style.css"],
    ["/client.js", "client.js"],
    ["/index.html?cache=1", "index.html"],
    ["/index.html#top", "index.html"]
  ]) {
    const result = resolvePublicFile(requestPath);
    assert.equal(result.ok, true, `${requestPath} should resolve`);
    assert.equal(result.filePath, path.join(publicDir, expected));
  }
});

test("resolvePublicFile rejects every traversal shape", () => {
  const traversalAttempts = [
    "/../.env",
    "/../app.js",
    "/../../../../../../../../etc/hosts",
    "/./../../.env",
    "/foo/../../.env",
    "/..%2f.env",
    "/%2e%2e/.env",
    "/%2e%2e%2f.env",
    "/%252e%252e%252f.env", // double-encoded: must NOT be decoded twice
    "/..\\..\\.env",
    "/....//....//.env",
    "/../.env/",
    "/../package.json",
    "/../lib/integrations.js"
  ];

  for (const attempt of traversalAttempts) {
    const result = resolvePublicFile(attempt);
    if (result.ok) {
      // The only acceptable "ok" outcome is a path still inside publicDir.
      assert.ok(
        result.filePath === publicDir ||
          result.filePath.startsWith(publicDir + path.sep),
        `${attempt} escaped the public root -> ${result.filePath}`
      );
      // `%252e%252e%252f.env` decodes to the literal name `%2e%2e%2f.env`,
      // which is inside publicDir and simply does not exist. Anything else
      // resolving successfully means traversal succeeded.
      assert.equal(path.basename(result.filePath), "%2e%2e%2f.env");
    } else {
      assert.ok(
        [
          "malformed_encoding",
          "null_byte",
          "traversal_segment",
          "hidden_segment",
          "outside_public_root"
        ].includes(result.reason),
        `unexpected rejection reason for ${attempt}: ${result.reason}`
      );
    }
  }
});

test("resolvePublicFile rejects null bytes and malformed encoding", () => {
  assert.equal(resolvePublicFile("/index.html%00.txt").reason, "null_byte");
  assert.equal(resolvePublicFile("/%").reason, "malformed_encoding");
  assert.equal(resolvePublicFile("/%zz").reason, "malformed_encoding");
});

test("resolvePublicFile refuses dot-prefixed segments inside the root", () => {
  // Defence in depth: even a file that lives inside publicDir must not be
  // reachable through a dot-prefixed name.
  assert.equal(resolvePublicFile("/.env").reason, "hidden_segment");
  assert.equal(resolvePublicFile("/.git/config").reason, "hidden_segment");
});

test("resolvePublicFile never returns a path outside publicDir", () => {
  const probes = [
    "/../.env",
    "/../app.js",
    "/../run-demo.js",
    "/../.env.example",
    "/../../",
    "/..",
    "/%2e%2e/.env",
    "/..%5c..%5c.env"
  ];

  for (const probe of probes) {
    const result = resolvePublicFile(probe);
    if (result.ok) {
      assert.ok(
        result.filePath === publicDir ||
          result.filePath.startsWith(publicDir + path.sep),
        `${probe} escaped -> ${result.filePath}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. HTTP layer — the running server
// ---------------------------------------------------------------------------

test(
  "the server refuses to disclose files outside public/",
  withServer(async (port) => {
    // `app.js` sits one level above public/ and contains this marker, so its
    // presence in a response body would prove disclosure.
    const disclosureProbes = [
      "/../app.js",
      "/../.env",
      "/../../../../../../../../etc/hosts",
      "/../lib/integrations.js",
      "/..%2fapp.js"
    ];

    for (const probe of disclosureProbes) {
      const { status, body } = await rawRequest(port, probe);
      assert.equal(status, 403, `${probe} should be forbidden, got ${status}`);
      assert.ok(
        !body.includes("createServer"),
        `${probe} leaked application source`
      );
      assert.ok(
        !body.includes("COZE_API_TOKEN"),
        `${probe} leaked environment content`
      );
      assert.ok(
        !body.includes("Host Database"),
        `${probe} leaked a system file`
      );
    }
  })
);

test(
  "traversal attempts are rejected before any filesystem read",
  withServer(async (port) => {
    const { status, body } = await rawRequest(port, "/../app.js");
    assert.equal(status, 403);
    assert.ok(body.startsWith("Forbidden:"), `unexpected rejection body: ${body}`);
  })
);

test(
  "legitimate assets still serve after the fix",
  withServer(async (port) => {
    const html = await rawRequest(port, "/");
    assert.equal(html.status, 200);
    assert.ok(html.body.includes("<!DOCTYPE html>"), "index.html should render");

    const css = await rawRequest(port, "/style.css");
    assert.equal(css.status, 200);

    const js = await rawRequest(port, "/client.js");
    assert.equal(js.status, 200);

    const missing = await rawRequest(port, "/does-not-exist.html");
    assert.equal(missing.status, 404);
  })
);

test(
  "the API endpoints are unaffected by the static-file guard",
  withServer(async (port) => {
    const scenarios = await rawRequest(port, "/api/scenarios");
    assert.equal(scenarios.status, 200);
    assert.ok(scenarios.body.includes("scenarios"));

    const body = JSON.stringify({ message: "89平二手房，预算12万，在红谷滩" });
    const analysed = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/api/analyze",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          }
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode, body: data }));
        }
      );
      req.on("error", reject);
      req.end(body);
    });

    assert.equal(analysed.status, 200);
    const parsed = JSON.parse(analysed.body);
    assert.ok(parsed.customerProfile, "analysis result should include a profile");
  })
);
