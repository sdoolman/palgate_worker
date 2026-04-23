import type { House, TelegramUpdate } from "./types";
import * as telegram from "./telegram";
import * as pal from "./pal";
import { generateToken } from "./token";

export async function handleUpdate(env: any, update: TelegramUpdate, ctx?: any): Promise<Response> {
  try {
    const message = update.message;
    const callback = update.callback_query;

    const userId = String(message?.from?.id || callback?.from?.id);
    const chatId = message?.chat?.id || callback?.message?.chat?.id;
    const text = message?.text;

    if (!chatId) return new Response("OK");

    if (callback) {
      await telegram.answerCallback(env, callback.id, "");
    }

    const householdId = await env.USERS.get(`user:${userId}`);
    const house: House | null = householdId
      ? JSON.parse(await env.HOUSEHOLDS.get(householdId) || "null")
      : null;

    if (text === "/init_bot") {
      await telegram.setupTelegramMenu(env);
      await telegram.sendMessage(env, chatId, "✅ Telegram menu initialized");
      return new Response("OK");
    }

    if (text === "/start" || text === "/menu") {
      if (!house) {
        await telegram.sendMessage(env, chatId,
          "👋 Welcome!\n\n/create_house to begin\n/join <code> to join"
        );
        return new Response("OK");
      }

      await telegram.sendMenu(env, chatId, house, userId);
      return new Response("OK");
    }

    if (text === "/create_house") {
      const id = crypto.randomUUID();
      const newHouse: House = {
        ownerId: userId,
        apiToken: null,
        deviceId: null,
        deviceName: null,
        phone: null,
      };

      await env.HOUSEHOLDS.put(id, JSON.stringify(newHouse));
      await env.USERS.put(`user:${userId}`, id);

      await telegram.sendMessage(env, chatId,
        "🏠 House created!\n\nNext: /setphone <phone> then /settoken <session_token>"
      );
      return new Response("OK");
    }

    if (text?.startsWith("/setphone")) {
      if (!house) {
        await telegram.sendMessage(env, chatId, "❌ Create house first");
        return new Response("OK");
      }
      if (house.ownerId !== userId) {
        await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      const phoneStr = text.split(" ")[1];
      const phone = parseInt(phoneStr);
      if (isNaN(phone)) {
        await telegram.sendMessage(env, chatId, "❌ Invalid phone");
        return new Response("OK");
      }

      house.phone = phone;
      await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));

      await telegram.sendMessage(env, chatId, "✅ Phone set");
      return new Response("OK");
    }

    if (text?.startsWith("/settoken")) {
      if (!house) {
        await telegram.sendMessage(env, chatId, "❌ Create house first");
        return new Response("OK");
      }
      if (house.ownerId !== userId) {
        await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }
      if (!house.phone) {
        await telegram.sendMessage(env, chatId, "❌ Set phone first: /setphone <phone>");
        return new Response("OK");
      }

      const sessionTokenHex = text.split(" ")[1];
      if (!sessionTokenHex) {
        await telegram.sendMessage(env, chatId, "❌ Provide session token");
        return new Response("OK");
      }

      house.apiToken = sessionTokenHex;

      const dynamicToken = generateToken(sessionTokenHex, house.phone, house.tokenType || "PRIMARY");

      const devices = await pal.fetchDevices(dynamicToken);

      if (!devices || devices.length === 0) {
        await telegram.sendMessage(env, chatId, "❌ No devices found");
        return new Response("OK");
      }

      await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));

      if (devices.length === 1) {
        house.deviceId = devices[0].id;
        house.deviceName = devices[0].name || devices[0].id;

        await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));
        await telegram.sendMenu(env, chatId, house, userId);
        return new Response("OK");
      }

      await telegram.sendDeviceSelection(env, chatId, devices);
      return new Response("OK");
    }

    if (text === "/link") {
      if (!house) {
        await telegram.sendMessage(env, chatId, "❌ Create house first");
        return new Response("OK");
      }
      if (house.ownerId !== userId) {
        await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      const uniqueId = crypto.randomUUID();
      const qrData = encodeURIComponent(JSON.stringify({ id: uniqueId }));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrData}`;

      const photoRes = await telegram.sendPhoto(env, chatId, qrUrl, "📱 Open the Palgate app on your phone, go to 'Device Linking' and scan this QR code.\n\nThe bot will automatically connect once scanned (this may take a few moments).");
      const photoData: any = await photoRes.json().catch(() => ({}));
      const qrMessageId = photoData?.result?.message_id;

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil((async () => {
          try {
            const linkData = await pal.initLink(uniqueId);
            if (!linkData) {
              await telegram.sendMessage(env, chatId, "❌ Linking timed out or failed. Please try /link again.");
              return;
            }

            house.phone = linkData.phone;
            house.apiToken = linkData.token;
            house.tokenType = linkData.type;
            await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));

            const dynamicToken = generateToken(house.apiToken, house.phone, house.tokenType);
            await pal.checkStatus(dynamicToken);
            await pal.checkToken(dynamicToken);

            const devices = await pal.fetchDevices(dynamicToken);
            if (devices && devices.length === 1) {
              house.deviceId = devices[0].id;
              house.deviceName = devices[0].name || devices[0].id;
              await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));
              await telegram.sendMessage(env, chatId, `✅ Successfully linked!\nConnected to: ${house.deviceName}`);
              await telegram.sendMenu(env, chatId, house, userId);
            } else if (devices && devices.length > 1) {
              await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));
              await telegram.sendMessage(env, chatId, "✅ Successfully linked! Please select your gate.");
              await telegram.sendDeviceSelection(env, chatId, devices);
            } else {
              await telegram.sendMessage(env, chatId, "✅ Successfully linked, but no devices found.");
            }
          } catch (err) {
            console.error("Link error:", err);
            await telegram.sendMessage(env, chatId, "❌ An error occurred during linking.");
          } finally {
            if (qrMessageId) {
              await telegram.deleteMessage(env, chatId, qrMessageId).catch(() => {});
            }
          }
        })());
      }
      return new Response("OK");
    }

    if (callback?.data?.startsWith("select_device:")) {
      if (!house || house.ownerId !== userId) return new Response("OK");

      const deviceId = callback.data.split(":")[1];
      const dynamicToken = generateToken(house.apiToken!, house.phone!, house.tokenType || "PRIMARY");
      const devices = await pal.fetchDevices(dynamicToken);
      const device = devices?.find(d => d.id === deviceId);

      house.deviceId = deviceId;
      house.deviceName = device?.name || deviceId;

      await env.HOUSEHOLDS.put(householdId, JSON.stringify(house));

      await telegram.editMessage(env, chatId, callback.message!.message_id,
        `✅ Connected:\n${house.deviceName}`
      );

      await telegram.sendMenu(env, chatId, house, userId);
      return new Response("OK");
    }

    if (text?.startsWith("/join")) {
      const code = text.split(" ")[1];
      const hid = await env.INVITES.get(code);

      if (!hid) {
        await telegram.sendMessage(env, chatId, "❌ Invalid code");
        return new Response("OK");
      }

      await env.USERS.put(`user:${userId}`, hid);

      const joined = JSON.parse(await env.HOUSEHOLDS.get(hid));

      await telegram.sendMenu(env, chatId, joined, userId);
      return new Response("OK");
    }

    if (callback?.data === "open_gate" || text === "🔓 Open Gate") {
      if (!house?.deviceId || !house?.apiToken) {
        if (callback) await telegram.answerCallback(env, callback.id, "❌ Not configured");
        else await telegram.sendMessage(env, chatId, "❌ Not configured");
        return new Response("OK");
      }

      const allowed = await checkCooldown(env, householdId, userId);
      if (!allowed) {
        if (callback) await telegram.answerCallback(env, callback.id, "⏱️ Wait");
        else await telegram.sendMessage(env, chatId, "⏱️ Wait");
        return new Response("OK");
      }

      const dynamicToken = generateToken(house.apiToken, house.phone!, house.tokenType || "PRIMARY");
      const success = await pal.openGate(house, dynamicToken);

      await log(env, householdId, userId, success);

      if (success && house.ownerId !== userId) {
        await telegram.sendMessage(env, parseInt(house.ownerId),
          `🔔 Gate opened by ${userId}`
        );
      }

      const replyMsg = success ? "✅ Gate opened" : "❌ Failed";
      if (callback) {
        await telegram.editMessage(env, chatId, callback.message!.message_id, replyMsg);
      } else {
        await telegram.sendMessage(env, chatId, replyMsg);
      }
      return new Response("OK");
    }

    if (callback?.data === "logs" || text === "📊 Logs") {
      if (!house || house.ownerId !== userId) {
        if (callback) await telegram.answerCallback(env, callback.id, "🚫 Owner only");
        else await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      const list = await env.LOGS.list({
        prefix: `log:${householdId}:`,
        limit: 10
      });

      const logs = await Promise.all(
        list.keys.map((k: { name: any }) => env.LOGS.get(k.name))
      );

      const replyMsg = logs.reverse().join("\n") || "No logs";
      if (callback) {
        await telegram.editMessage(env, chatId, callback.message!.message_id, replyMsg);
      } else {
        await telegram.sendMessage(env, chatId, replyMsg);
      }
      return new Response("OK");
    }

    if (callback?.data === "invite" || text === "👥 Invite") {
      if (!house || house.ownerId !== userId) {
        if (callback) await telegram.answerCallback(env, callback.id, "🚫 Owner only");
        else await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      const code = Math.random().toString(36).substring(2, 8);
      await env.INVITES.put(code, householdId, { expirationTtl: 3600 });

      if (callback) {
        await telegram.editMessage(env, chatId, callback.message!.message_id, `🔑 Invite: ${code}`);
      } else {
        await telegram.sendMessage(env, chatId, `🔑 Invite: ${code}`);
      }
      return new Response("OK");
    }

    if (callback?.data === "settings" || text === "⚙️ Settings") {
      if (!house || house.ownerId !== userId) {
        if (callback) await telegram.answerCallback(env, callback.id, "🚫 Owner only");
        else await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      const replyMsg = `⚙️ Settings\n\nDevice:\n${house.deviceName || "Not set"}\n\nLink automatically with /link\nOr manually: /setphone <phone> then /settoken <session_token>`;
      if (callback) {
        await telegram.editMessage(env, chatId, callback.message!.message_id, replyMsg);
      } else {
        await telegram.sendMessage(env, chatId, replyMsg);
      }
      return new Response("OK");
    }

    return new Response("OK");
  } catch (err) {
    console.error("Error handling update:", err);
    return new Response("OK");
  }
}

// ================= HELPERS =================

async function checkCooldown(env: any, hid: string, uid: string): Promise<boolean> {
  const key = `cooldown:${hid}:${uid}`;
  const last = await env.COOLDOWN.get(key);

  const now = Date.now();
  if (last && now - parseInt(last) < 10000) return false;

  await env.COOLDOWN.put(key, String(now));
  return true;
}

async function log(env: any, hid: string, uid: string, success: boolean) {
  const entry = `${new Date().toLocaleTimeString()} - ${uid} - ${success ? "OK" : "FAIL"}`;
  await env.LOGS.put(`log:${hid}:${Date.now()}`, entry);
}