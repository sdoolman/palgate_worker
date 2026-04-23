﻿import { handleUpdate } from "./bot";
import type { TelegramUpdate } from "./types";

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
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
