import test from "node:test";
import assert from "node:assert/strict";
import { handleDirectOpen } from "../src/bot";

// Mock KV Store implementation for isolated unit testing
class MockKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
    const keys: { name: string }[] = [];
    for (const k of this.store.keys()) {
      if (!options?.prefix || k.startsWith(options.prefix)) {
        keys.push({ name: k });
      }
    }
    return { keys };
  }
}

function createMockEnv() {
  return {
    USERS: new MockKV(),
    HOUSEHOLDS: new MockKV(),
    COOLDOWN: new MockKV(),
    LOGS: new MockKV(),
    INVITES: new MockKV(),
    BOT_TOKEN: "mock_bot_token"
  };
}

test("handleDirectOpen: returns 400 HTML response when token is missing", async () => {
  const env = createMockEnv();
  const req = new Request("https://palgate.example.com/open");
  const res = await handleDirectOpen(env, null, req);

  assert.equal(res.status, 400);
  const text = await res.text();
  assert.match(text, /Missing Token/);
});

test("handleDirectOpen: returns 400 JSON response when token is missing and Accept is application/json", async () => {
  const env = createMockEnv();
  const req = new Request("https://palgate.example.com/open", {
    headers: { Accept: "application/json" }
  });
  const res = await handleDirectOpen(env, null, req);

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.message, "No access token provided");
});

test("handleDirectOpen: returns 403 HTML response when token is invalid or revoked", async () => {
  const env = createMockEnv();
  const req = new Request("https://palgate.example.com/open?token=invalid123");
  const res = await handleDirectOpen(env, "invalid123", req);

  assert.equal(res.status, 403);
  const text = await res.text();
  assert.match(text, /Invalid Token/);
});

test("handleDirectOpen: returns 403 JSON response for invalid token with application/json header", async () => {
  const env = createMockEnv();
  const req = new Request("https://palgate.example.com/open?token=invalid123", {
    headers: { Accept: "application/json" }
  });
  const res = await handleDirectOpen(env, "invalid123", req);

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.equal(data.message, "Invalid or revoked token");
});
