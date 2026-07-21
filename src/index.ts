import { handleUpdate, handleDirectOpen } from "./bot";
import type { TelegramUpdate } from "./types";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/open" || url.pathname === "/direct/open") {
      const token = url.searchParams.get("token");
      return await handleDirectOpen(env, token, request);
    }

    if (request.method !== "POST") {
      return new Response("OK");
    }

    try {
      const body: TelegramUpdate = await request.json();
      return await handleUpdate(env, body, ctx);
    } catch (err) {
      console.error("Error:", err);
      return new Response("OK");
    }
  }
};
