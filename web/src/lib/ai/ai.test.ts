import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { z } from "zod";
import {
  buildDisclosure,
  chatJson,
  chatText,
  getAiStatus,
  getConsent,
  getRecentAiCalls,
  messagesFromDisclosure,
  redactForAi,
  setConsent,
} from "./index";
import { aiBaseUrl, DEFAULT_AI_BASE_URL } from "./config";
import type { ChatJsonRequest } from "./types";
import { closeTestDb, installTestDb } from "../testing/test-db";
import type { DatabaseSync } from "node:sqlite";

const ENV_KEYS = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_EFFORT", "AI_FALLBACK_API_KEY", "AI_FALLBACK_BASE_URL", "AI_FALLBACK_MODEL", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "TRACK_AI_DISABLED", "TRACK_PUBLIC_URL"] as const;
let oldEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;
let db: DatabaseSync;

const successfulResponse = () =>
  new Response(
    JSON.stringify({
      model: "cx/gpt-6-luna",
      choices: [{ message: { content: JSON.stringify({ answer: "local fake result" }) } }],
      usage: { prompt_tokens: 21, completion_tokens: 5 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const makeRequest = (messages: ChatJsonRequest<{ answer: string }>["messages"] = [
  { role: "user", content: "A fake test prompt with no personal data." },
]): ChatJsonRequest<{ answer: string }> => ({
  feature: "dreamer",
  purpose: "test fake output validation",
  messages,
  schema: z.object({ answer: z.string() }),
});

function configureAndConsent(): void {
  process.env.AI_API_KEY = "test-not-a-real-key";
  process.env.AI_BASE_URL = "https://ai.example.test/v1";
  setConsent(db, "dreamer", true);
}

describe("shared AI client", () => {
  beforeEach(() => {
    oldEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    db = installTestDb();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = oldEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    closeTestDb();
  });

  it("keeps consent off until explicitly granted and bounds its scope", () => {
    const initial = getConsent(db, "dreamer");
    assert.equal(initial.enabled, false);
    assert.deepEqual(initial.scope, { allowDailyCycle: false, maxExcerptChars: 280 });

    const enabled = setConsent(db, "dreamer", true, {
      allowDailyCycle: true,
      maxExcerptChars: 99_999,
    });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.scope.allowDailyCycle, true);
    assert.equal(enabled.scope.maxExcerptChars, 2_000);
    assert.ok(enabled.grantedAt);

    const revoked = setConsent(db, "dreamer", false);
    assert.equal(revoked.enabled, false);
    assert.equal(revoked.scope.allowDailyCycle, true);
    assert.ok(revoked.revokedAt);
  });

  it("does not call the provider without a configured key", async () => {
    setConsent(db, "dreamer", true);
    let calls = 0;
    const result = await chatJson(makeRequest(), {
      db,
      fetch: async () => {
        calls++;
        return successfulResponse();
      },
    });
    assert.deepEqual(result, {
      ok: false,
      code: "not_configured",
      message: "The AI provider is not configured on this server.",
    });
    assert.equal(calls, 0);
  });

  it("requires explicit feature consent before a provider call", async () => {
    process.env.AI_API_KEY = "test-not-a-real-key";
    let calls = 0;
    const result = await chatJson(makeRequest(), {
      db,
      fetch: async () => {
        calls++;
        return successfulResponse();
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "no_consent");
    assert.equal(calls, 0);
  });

  it("blocks calls when the global kill switch is set", async () => {
    configureAndConsent();
    process.env.TRACK_AI_DISABLED = "1";
    let calls = 0;
    const result = await chatJson(makeRequest(), {
      db,
      fetch: async () => {
        calls++;
        return successfulResponse();
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "disabled");
    assert.equal(calls, 0);
    assert.equal(getAiStatus(db).killSwitch, true);
  });

  it("maps timeouts to a fixed error without exposing exception text", async () => {
    configureAndConsent();
    const timeout = Object.assign(new Error("fake provider body or key must not leak"), { name: "TimeoutError" });
    const result = await chatJson(makeRequest(), { db, fetch: async () => Promise.reject(timeout) });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "timeout");
      assert.equal(result.message.includes("fake provider"), false);
    }
    const calls = getRecentAiCalls(db);
    assert.equal(calls[0]?.errorCode, "timeout");
  });

  it("retries a 429 with bounded backoff, sends JSON mode, and returns usage", async () => {
    configureAndConsent();
    process.env.TRACK_PUBLIC_URL = "https://track.example.test/path";
    const seen: { url: string; init: RequestInit }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      seen.push({ url: String(input), init: init ?? {} });
      if (seen.length === 1) return new Response("private provider error", { status: 429 });
      return successfulResponse();
    };

    const result = await chatJson(makeRequest(), { db, fetch: fakeFetch, now: new Date("2026-01-01T00:00:00.000Z") });

    assert.equal(seen.length, 2);
    assert.equal(seen[0]?.url, "https://ai.example.test/v1/chat/completions");
    assert.equal(seen[1]?.init.redirect, "error");
    assert.equal((seen[1]?.init.signal as AbortSignal).aborted, false);
    assert.equal((seen[1]?.init.headers as Record<string, string>)["HTTP-Referer"], "https://track.example.test");
    assert.equal((seen[1]?.init.headers as Record<string, string>)["X-Title"], "Track");
    const body = JSON.parse(String(seen[1]?.init.body)) as { response_format: { type: string } };
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.deepEqual(result, {
      ok: true,
      data: { answer: "local fake result" },
      model: "cx/gpt-6-luna",
      usage: { promptTokens: 21, completionTokens: 5 },
    });
    assert.equal(getRecentAiCalls(db)[0]?.ok, true);
  });

  it("returns a rate-limited error after the bounded retry count", async () => {
    configureAndConsent();
    let calls = 0;
    const result = await chatJson(makeRequest(), {
      db,
      fetch: async () => {
        calls++;
        return new Response("sensitive upstream details", { status: 429 });
      },
    });
    assert.equal(calls, 3);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "rate_limited");
    assert.equal(getRecentAiCalls(db)[0]?.errorCode, "rate_limited");
  });

  it("retries 5xx responses and validates returned JSON with the supplied schema", async () => {
    configureAndConsent();
    let calls = 0;
    const recovered = await chatJson(makeRequest(), {
      db,
      fetch: async () => {
        calls++;
        return calls === 1 ? new Response("hidden provider body", { status: 503 }) : successfulResponse();
      },
    });
    assert.equal(recovered.ok, true);
    assert.equal(calls, 2);

    const invalid = await chatJson(makeRequest(), {
      db,
      fetch: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 42 }) } }] }),
          { status: 200 },
        ),
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "invalid_output");
  });

  it("pins the model: a per-request model is ignored", async () => {
    configureAndConsent();
    let sentModel = "";
    const result = await chatJson({ ...makeRequest(), model: "some/other-model" }, {
      db,
      fetch: async (_url, init) => {
        sentModel = (JSON.parse(String(init?.body)) as { model: string }).model;
        return successfulResponse();
      },
    });
    assert.equal(sentModel, "cx/gpt-6-luna");
    assert.equal(result.ok, true);
  });

  it("always asks the primary model for extra-high effort", async () => {
    configureAndConsent();
    let body: { reasoning_effort?: string } = {};
    await chatJson(makeRequest(), { db, fetch: async (_u, init) => { body = JSON.parse(String(init?.body)); return successfulResponse(); } });
    assert.equal(body.reasoning_effort, "xhigh");
  });

  it("falls back to the second provider when the primary fails, without the effort setting", async () => {
    configureAndConsent();
    process.env.AI_FALLBACK_API_KEY = "test-fallback-key";
    process.env.AI_FALLBACK_BASE_URL = "https://fallback.example.test/api/v1";
    process.env.AI_FALLBACK_MODEL = "fallback/free-model";
    const seen: { url: string; model: string; effort?: string }[] = [];
    const result = await chatJson(makeRequest(), {
      db,
      fetch: async (url, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string; reasoning_effort?: string };
        seen.push({ url: String(url), model: body.model, effort: body.reasoning_effort });
        return String(url).startsWith("https://ai.example.test") ? new Response("down", { status: 500 }) : successfulResponse();
      },
    });
    assert.equal(result.ok, true);
    assert.equal(seen[seen.length - 1]?.url, "https://fallback.example.test/api/v1/chat/completions");
    assert.equal(seen[seen.length - 1]?.model, "fallback/free-model");
    assert.equal(seen[seen.length - 1]?.effort, undefined);
    assert.ok(seen.some((c) => c.model === "cx/gpt-6-luna"), "primary was tried first");
  });

  it("does not use the fallback when consent is missing", async () => {
    process.env.AI_API_KEY = "test-not-a-real-key";
    process.env.AI_FALLBACK_API_KEY = "test-fallback-key";
    let calls = 0;
    const result = await chatJson(makeRequest(), { db, fetch: async () => { calls++; return successfulResponse(); } });
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
  });

  it("works on the fallback alone when no primary key is set", async () => {
    process.env.AI_FALLBACK_API_KEY = "test-fallback-key";
    setConsent(db, "dreamer", true);
    const result = await chatJson(makeRequest(), { db, fetch: async () => successfulResponse() });
    assert.equal(result.ok, true);
  });

  it("only accepts an https base URL without credentials, else falls back", () => {
    process.env.AI_BASE_URL = "http://insecure.example.test/v1";
    assert.equal(aiBaseUrl(), DEFAULT_AI_BASE_URL);
    process.env.AI_BASE_URL = "https://user:pw@ai.example.test/v1";
    assert.equal(aiBaseUrl(), DEFAULT_AI_BASE_URL);
    process.env.AI_BASE_URL = "https://ai.example.test/v1/";
    assert.equal(aiBaseUrl(), "https://ai.example.test/v1");
  });

  it("redacts direct identifiers and token URLs before truncating", () => {
    const source =
      "mail fake.person@example.test, phone +1 (555) 123-4567, token https://example.test/cb?access_token=abc123, @fake_handle, id 1234567890123, date 2026-11-15";
    const redacted = redactForAi(source, 2_000);
    for (const privateValue of ["fake.person@example.test", "+1 (555) 123-4567", "access_token=abc123", "@fake_handle", "1234567890123"])
      assert.equal(redacted.includes(privateValue), false, `redacted ${privateValue}`);
    assert.match(redacted, /2026-11-15/);
    assert.equal(redactForAi("abcdefghij", 4), "abcd");
  });

  it("builds the outgoing message from the exact disclosure shown to the user", async () => {
    configureAndConsent();
    const purpose = "Label the fake journal excerpt and identify a possible theme.";
    const model = getAiStatus(db).defaultModel;
    const excerpt = redactForAi("I want to build a fake weekly review for fake.user@example.test", 280);
    const disclosure = buildDisclosure("dreamer", purpose, model, [
      { id: "fake-journal-17", label: "Journal entry · 2026-11-14", text: excerpt },
    ]);
    const messages = messagesFromDisclosure(disclosure);
    const outgoingBody: { value?: Record<string, unknown> } = {};
    const fakeFetch: typeof fetch = async (_input, init) => {
      outgoingBody.value = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return successfulResponse();
    };
    const result = await chatJson({ ...makeRequest(messages), purpose, model }, { db, fetch: fakeFetch });

    assert.equal(result.ok, true);
    assert.equal(outgoingBody.value?.model, disclosure.model);
    const sentMessages = outgoingBody.value?.messages as { role: string; content: string }[];
    assert.equal(sentMessages.length, 1);
    assert.deepEqual(JSON.parse(sentMessages[0]!.content), JSON.parse(JSON.stringify(disclosure)));
    assert.equal(JSON.stringify(outgoingBody).includes("fake.user@example.test"), false);
    assert.equal(disclosure.totalChars, excerpt.length);
  });

  it("accepts plaintext Markdown for specialist agents without forcing JSON mode", async () => {
    configureAndConsent();
    let requestBody: Record<string, unknown> = {};
    const result = await chatText({
      feature:"dreamer",purpose:"Chief delegated planning",
      messages:[{role:"user",content:"Create a useful plan."}],maxTokens:3500,effort:"low",
    },{db,fetch:async (_url,init)=>{
      requestBody=JSON.parse(String(init?.body));
      return new Response(JSON.stringify({choices:[{message:{content:"## Plan\\nA practical, grounded plan with milestones and tests."}}],usage:{prompt_tokens:9,completion_tokens:22}}),{status:200});
    }});
    assert.equal(result.ok,true);
    if(result.ok)assert.match(result.data,/practical/);
    assert.equal("response_format" in requestBody,false);
    assert.equal(requestBody.reasoning_effort,"low");
    assert.equal(requestBody.max_tokens,3500);
    assert.equal(getRecentAiCalls(db)[0]?.ok,true);
  });

  it("unwraps JSON-wrapped prose and supports text content arrays", async () => {
    configureAndConsent();
    const requests=[
      JSON.stringify({choices:[{message:{content:'\`\`\`json\\n{"report":"This is a long and useful report for the task."}\\n\`\`\`'}}]}),
      JSON.stringify({choices:[{message:{content:[{type:"text",text:"Markdown text with actionable steps."}]}}]}),
    ];
    for(const response of requests){
      const result=await chatText({feature:"dreamer",purpose:"text response",messages:[{role:"user",content:"test"}]},{db,fetch:async()=>new Response(response,{status:200})});
      assert.equal(result.ok,true);
      if(result.ok)assert.match(result.data,/(report|Markdown text)/);
    }
  });

  it("refuses empty or missing text without leaking response contents", async()=>{
    configureAndConsent();
    const result=await chatText({feature:"dreamer",purpose:"text",messages:[{role:"user",content:"test"}]},{db,fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:" "}}]}),{status:200})});
    assert.equal(result.ok,false);
    if(!result.ok)assert.equal(result.code,"invalid_output");
  });

  it("records no prompt or response content in the usage log", async () => {
    configureAndConsent();
    const bodySecret = "fake response text that must never be saved";
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: bodySecret }) } }] }),
        { status: 200 },
      );
    const result = await chatJson(makeRequest(), { db, fetch: fakeFetch });
    assert.equal(result.ok, true);
    const columns = (db.prepare("PRAGMA table_info(ai_calls)").all() as { name: string }[]).map((row) => row.name);
    assert.deepEqual(columns, [
      "id", "feature", "model", "at", "prompt_tokens", "completion_tokens", "ok", "error_code",
    ]);
    const serialized = JSON.stringify(getRecentAiCalls(db));
    assert.equal(serialized.includes(bodySecret), false);
    assert.equal(serialized.includes("fake test prompt"), false);
  });
});
