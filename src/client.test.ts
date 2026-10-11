// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";

import { JiraClient, type JiraSession } from "./client.js";
import { JiraAuthError, JiraError } from "./errors.js";

// Shape mirrors a real Jira Server/DC subtask response.
const SUBTASK = {
  key: "PROJ-123",
  fields: {
    summary: "Backend. Profile API endpoint",
    status: { name: "In Review" },
    issuetype: { name: "Sub-task", subtask: true },
    parent: { key: "PROJ-100", fields: { summary: "Add user profiles" } },
  },
};

/** Start a throwaway HTTP server on a random port; returns its base URL. */
async function listen(
  t: TestContext,
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

test("login and getIssue work over real HTTP and replay the cookie", async (t: TestContext) => {
  let sentCookie: string | undefined;
  const base = await listen(t, (req, res) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    if (req.method === "POST" && pathname === "/rest/auth/1/session") {
      res.setHeader("Set-Cookie", "JSESSIONID=ABC123; Path=/; HttpOnly");
      res.end("{}");
      return;
    }
    if (req.method === "GET" && pathname === "/rest/api/2/issue/PROJ-123") {
      sentCookie = req.headers.cookie;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(SUBTASK));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  const client = new JiraClient();

  const session = await client.login(base, "alice", "secret");
  assert.equal(session.baseUrl, base);
  assert.equal(session.cookie, "JSESSIONID=ABC123");

  const issue = await client.getIssue(session, "PROJ-123");
  assert.deepEqual(issue, {
    key: "PROJ-123",
    summary: "Backend. Profile API endpoint",
    status: "In Review",
    issueType: "Sub-task",
    parent: { key: "PROJ-100", summary: "Add user profiles", issueType: null },
    description: null,
    comments: [],
    attachments: [],
    subtasks: [],
    raw: SUBTASK,
  });
  assert.equal(sentCookie, "JSESSIONID=ABC123");
});

test("the session alone decides the host, with no ambient override", async (t: TestContext) => {
  let hitA = false;
  let hitB = false;
  const reply = (res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(SUBTASK));
  };
  const baseA = await listen(t, (_req, res) => {
    hitA = true;
    reply(res);
  });
  const baseB = await listen(t, (_req, res) => {
    hitB = true;
    reply(res);
  });
  const client = new JiraClient();

  // A stale `JIRA_URL` in the environment must not redirect anything: the base
  // URL is a parameter now, never ambient state.
  process.env.JIRA_URL = baseB;
  t.after(() => {
    delete process.env.JIRA_URL;
  });

  await client.getIssue({ baseUrl: baseA, cookie: "JSESSIONID=x" }, "PROJ-123");
  assert.equal(hitA, true);
  assert.equal(hitB, false);

  // Reaching the other host is done by handing over a different session.
  await client.getIssue({ baseUrl: baseB, cookie: "JSESSIONID=x" }, "PROJ-123");
  assert.equal(hitB, true);
});

test("a trailing slash on the session base URL does not double up", async (t: TestContext) => {
  let seenPath: string | undefined;
  const base = await listen(t, (req, res) => {
    seenPath = req.url;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(SUBTASK));
  });
  const client = new JiraClient();
  await client.getIssue(
    { baseUrl: `${base}/`, cookie: "JSESSIONID=x" },
    "PROJ-123",
  );
  assert.equal(
    seenPath,
    "/rest/api/2/issue/PROJ-123?fields=summary,status,issuetype,parent",
  );
});

test("getIssue surfaces a 401 as JiraAuthError and other errors as null", async (t: TestContext) => {
  const base = await listen(t, (req, res) => {
    res.statusCode = (req.url ?? "").includes("/EXPIRED-1") ? 401 : 404;
    res.end("{}");
  });
  const session: JiraSession = { baseUrl: base, cookie: "JSESSIONID=x" };
  const client = new JiraClient();
  await assert.rejects(
    () => client.getIssue(session, "EXPIRED-1"),
    JiraAuthError,
  );
  assert.equal(await client.getIssue(session, "MISSING-1"), null);
});

test("getIssue strict turns a non-2xx into a thrown JiraError carrying the status", async (t: TestContext) => {
  const base = await listen(t, (_req, res) => {
    res.statusCode = 500;
    res.end("boom");
  });
  const session: JiraSession = { baseUrl: base, cookie: "JSESSIONID=x" };
  const client = new JiraClient();
  await assert.rejects(
    () => client.getIssue(session, "X-1", { strict: true }),
    (err: unknown) => err instanceof JiraError && err.status === 500,
  );
});

test("getJson replays the cookie and maps statuses to errors", async (t: TestContext) => {
  let sentCookie: string | undefined;
  const base = await listen(t, (req, res) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    if (pathname === "/rest/api/2/myself") {
      sentCookie = req.headers.cookie;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ name: "alice" }));
      return;
    }
    res.statusCode = pathname === "/unauth" ? 401 : 404;
    res.end("{}");
  });
  const session: JiraSession = { baseUrl: base, cookie: "JSESSIONID=tok" };
  const client = new JiraClient();

  assert.deepEqual(
    await client.getJson<{ name: string }>(session, "/rest/api/2/myself"),
    {
      name: "alice",
    },
  );
  assert.equal(sentCookie, "JSESSIONID=tok");
  await assert.rejects(() => client.getJson(session, "/unauth"), JiraAuthError);
  await assert.rejects(
    () => client.getJson(session, "/missing"),
    (err: unknown) => err instanceof JiraError && err.status === 404,
  );
});

test("login reports bad credentials and a non-Server endpoint", async (t: TestContext) => {
  // /rest/auth/1/session → 401 (bad password); any other path → 404 (wrong host).
  const base = await listen(t, (req, res) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    res.statusCode = pathname === "/rest/auth/1/session" ? 401 : 404;
    res.end("{}");
  });
  const client = new JiraClient();
  await assert.rejects(
    () => client.login(base, "alice", "bad"),
    /wrong username\/password/,
  );
  await assert.rejects(
    () => client.login(`${base}/wrong`, "alice", "x"),
    /Jira Cloud|wrong URL|not found/,
  );
});

test("login surfaces a CAPTCHA wall distinctly from a bad password", async (t: TestContext) => {
  const base = await listen(t, (_req, res) => {
    res.statusCode = 401;
    res.setHeader(
      "X-Authentication-Denied-Reason",
      "AUTH_DENIED_PASSWORD_RESET,CAPTCHA_CHALLENGE",
    );
    res.end("{}");
  });
  const client = new JiraClient();
  await assert.rejects(() => client.login(base, "alice", "secret"), /CAPTCHA/);
});

test("login strips a trailing slash from the base URL it returns", async (t: TestContext) => {
  const base = await listen(t, (_req, res) => {
    res.setHeader("Set-Cookie", "JSESSIONID=TRIMMED; Path=/");
    res.end("{}");
  });
  const client = new JiraClient();
  const session = await client.login(`${base}/`, "alice", "secret");
  assert.equal(session.baseUrl, base);
  assert.equal(session.cookie, "JSESSIONID=TRIMMED");
});
