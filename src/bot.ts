import type { House, TelegramUpdate } from "./types";
import * as telegram from "./telegram";
import * as pal from "./pal";
import { generateToken } from "./token";

function normalizeText(text?: string): string {
  if (!text) return "";
  return text.replace(/[^\w\s]/gi, "").trim().toLowerCase();
}

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function handleUpdate(env: any, update: TelegramUpdate, ctx?: any, request?: Request): Promise<Response> {
  try {
    const message = update.message;
    const callback = update.callback_query;

    const userId = String(message?.from?.id || callback?.from?.id);
    const chatId = message?.chat?.id || callback?.message?.chat?.id;
    const text = message?.text;
    const normText = normalizeText(text);

    if (!chatId) return new Response("OK");

    if (callback) {
      await telegram.answerCallback(env, callback.id, "");
    }

    const householdId = await env.USERS.get(`user:${userId}`);
    const house: House | null = householdId
      ? JSON.parse(await env.HOUSEHOLDS.get(householdId) || "null")
      : null;

    const isOwner = Boolean(house && String(house.ownerId) === String(userId));

    if (text === "/init_bot") {
      await telegram.setupTelegramMenu(env);
      await telegram.sendMessage(env, chatId, "✅ Telegram menu initialized");
      return new Response("OK");
    }

    if (text === "/start" || text === "/menu" || normText === "start" || normText === "menu") {
      if (!house) {
        await telegram.sendMessage(env, chatId,
          "👋 Welcome!\n\n/create_house to begin\n/join <code> to join"
        );
        return new Response("OK");
      }

      await telegram.sendMenu(env, chatId, house, userId);
      return new Response("OK");
    }

    if (text === "/create_house" || normText === "create house") {
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
      if (!isOwner) {
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
      if (!isOwner) {
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
      if (!isOwner) {
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
      if (!house || !isOwner) return new Response("OK");

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

    if (callback?.data === "open_gate" || normText.includes("open gate")) {
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

      if (success && !isOwner) {
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

    if (callback?.data === "logs" || normText.includes("log")) {
      if (!house || !isOwner) {
        if (callback) await telegram.answerCallback(env, callback.id, "🚫 Owner only");
        else await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      // Fetch up to 100 keys to capture all recent logs
      const list = await env.LOGS.list({
        prefix: `log:${householdId}:`,
        limit: 100
      });

      if (!list.keys || list.keys.length === 0) {
        const replyMsg = `📊 <b>Access Logs:</b>\n\nNo logs recorded yet.`;
        if (callback) await telegram.editMessage(env, chatId, callback.message!.message_id, replyMsg);
        else await telegram.sendMessage(env, chatId, replyMsg);
        return new Response("OK");
      }

      // Sort keys descending by timestamp so newest logs appear first
      const sortedKeys = list.keys.sort((a: { name: string }, b: { name: string }) => {
        const partsA = a.name.split(":");
        const partsB = b.name.split(":");
        const tsA = parseInt(partsA[partsA.length - 1] || "0");
        const tsB = parseInt(partsB[partsB.length - 1] || "0");
        return tsB - tsA;
      });

      // Take top 10 newest keys
      const newestKeys = sortedKeys.slice(0, 10);

      const logs = await Promise.all(
        newestKeys.map(async (k: { name: string }) => {
          const val = await env.LOGS.get(k.name);
          if (!val) return null;
          if (!val.match(/^\d{4}-\d{2}-\d{2}/)) {
            const ts = k.name.split(":")[2];
            if (ts && !isNaN(parseInt(ts))) {
              const d = new Date(parseInt(ts));
              const formattedDate = d.toISOString().replace("T", " ").substring(0, 19);
              return `${formattedDate} UTC - ${val}`;
            }
          }
          return val;
        })
      );

      const replyMsg = `📊 <b>Access Logs (Recent 10):</b>\n\n` + (logs.filter(Boolean).join("\n") || "No logs");
      if (callback) {
        await telegram.editMessage(env, chatId, callback.message!.message_id, replyMsg);
      } else {
        await telegram.sendMessage(env, chatId, replyMsg);
      }
      return new Response("OK");
    }

    if (callback?.data === "invite" || normText.includes("invite")) {
      if (!house || !isOwner) {
        if (callback) await telegram.answerCallback(env, callback.id, "🚫 Owner only");
        else await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }

      const inlineKeyboard = [
        [{ text: "📲 Telegram Join Code", callback_data: "create_telegram_invite" }],
        [{ text: "🔗 Create Web Link", callback_data: "create_web_link" }],
        [{ text: "📋 Active Web Links", callback_data: "list_web_links" }]
      ];

      return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "👥 <b>Invites & Web Access Links</b>\n\nSelect an option below to manage guest access:",
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inlineKeyboard }
        })
      });
    }

    if (callback?.data === "create_telegram_invite") {
      if (!house || !isOwner) return new Response("OK");
      const code = Math.random().toString(36).substring(2, 8);
      await env.INVITES.put(code, householdId, { expirationTtl: 3600 });
      await telegram.sendMessage(env, chatId, `🔑 <b>Telegram Invite Code:</b> <code>${code}</code>\n\nValid for 1 hour. Guest should send: <code>/join ${code}</code>`);
      return new Response("OK");
    }

    if (callback?.data === "create_web_link") {
      if (!house || !isOwner) return new Response("OK");
      const token = crypto.randomUUID().replace(/-/g, "");
      const label = "Web Guest";
      await env.USERS.put(`webtoken:${token}`, JSON.stringify({ householdId, label, createdBy: userId, createdAt: Date.now() }));
      const host = request?.headers?.get("host") || "palgate.stav973.workers.dev";
      const proto = request?.headers?.get("x-forwarded-proto") || "https";
      const linkUrl = `${proto}://${host}/open?token=${token}`;
      await telegram.sendMessage(env, chatId, `🔑 <b>Web Token Link created!</b>\n\nLink:\n${linkUrl}\n\nToken ID: <code>${token}</code>\n\n<i>To assign a custom name, use: /webtoken <Name></i>`);
      return new Response("OK");
    }

    if (callback?.data === "list_web_links") {
      if (!house || !isOwner) return new Response("OK");
      const list = await env.USERS.list({ prefix: "webtoken:" });
      if (!list.keys || list.keys.length === 0) {
        await telegram.sendMessage(env, chatId, "No active web tokens found.");
        return new Response("OK");
      }
      let msg = "🔑 <b>Active Web Tokens:</b>\n\n";
      for (const key of list.keys) {
        const tokenVal = await env.USERS.get(key.name);
        if (tokenVal) {
          try {
            const parsed = JSON.parse(tokenVal);
            if (parsed.householdId === householdId) {
              const tokenStr = key.name.replace("webtoken:", "");
              msg += `• <b>${escapeHtml(parsed.label)}</b>\n  ID: <code>${tokenStr}</code>\n\n`;
            }
          } catch(e) {}
        }
      }
      await telegram.sendMessage(env, chatId, msg);
      return new Response("OK");
    }

    if (text?.startsWith("/webtoken")) {
      if (!house || !isOwner) {
        await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }
      const label = text.substring("/webtoken".length).trim() || "Web Guest";
      const token = crypto.randomUUID().replace(/-/g, "");
      await env.USERS.put(`webtoken:${token}`, JSON.stringify({ householdId, label, createdBy: userId, createdAt: Date.now() }));
      const host = request?.headers?.get("host") || "palgate.stav973.workers.dev";
      const proto = request?.headers?.get("x-forwarded-proto") || "https";
      const linkUrl = `${proto}://${host}/open?token=${token}`;
      await telegram.sendMessage(env, chatId, `🔑 <b>Web Token created for ${escapeHtml(label)}</b>!\n\nLink:\n${linkUrl}\n\nToken ID: <code>${token}</code>`);
      return new Response("OK");
    }

    if (text === "/listtokens") {
      if (!house || !isOwner) {
        await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }
      const list = await env.USERS.list({ prefix: "webtoken:" });
      if (!list.keys || list.keys.length === 0) {
        await telegram.sendMessage(env, chatId, "No active web tokens found.");
        return new Response("OK");
      }
      let msg = "🔑 <b>Active Web Tokens:</b>\n\n";
      for (const key of list.keys) {
        const tokenVal = await env.USERS.get(key.name);
        if (tokenVal) {
          try {
            const parsed = JSON.parse(tokenVal);
            if (parsed.householdId === householdId) {
              const tokenStr = key.name.replace("webtoken:", "");
              msg += `• <b>${escapeHtml(parsed.label)}</b>\n  ID: <code>${tokenStr}</code>\n\n`;
            }
          } catch(e) {}
        }
      }
      await telegram.sendMessage(env, chatId, msg);
      return new Response("OK");
    }

    if (text?.startsWith("/revoketoken")) {
      if (!house || !isOwner) {
        await telegram.sendMessage(env, chatId, "🚫 Owner only");
        return new Response("OK");
      }
      const targetToken = text.split(" ")[1]?.trim();
      if (!targetToken) {
        await telegram.sendMessage(env, chatId, "❌ Usage: /revoketoken <token_id>");
        return new Response("OK");
      }
      await env.USERS.delete(`webtoken:${targetToken}`);
      await telegram.sendMessage(env, chatId, `✅ Token <code>${targetToken}</code> revoked successfully.`);
      return new Response("OK");
    }

    // Household Info & Settings command (available for all household members, with owner command options)
    if (callback?.data === "settings" || callback?.data === "info" || text === "/settings" || text === "/info" || normText.includes("setting") || normText.includes("info")) {
      if (!house) {
        await telegram.sendMessage(env, chatId, "❌ Create house first with /create_house or join with /join <code>");
        return new Response("OK");
      }

      const roleStr = isOwner ? "👑 Owner" : "👤 Member";
      const deviceName = escapeHtml(house.deviceName || "Not set");
      const deviceId = escapeHtml(house.deviceId || "Not set");
      const phone = escapeHtml(house.phone || "Not set");

      let replyMsg = `ℹ️ <b>Household & Gate Info</b>\n\n`;
      replyMsg += `<b>Device:</b> <b>${deviceName}</b>\n`;
      replyMsg += `<b>Device ID:</b> <code>${deviceId}</code>\n`;
      replyMsg += `<b>Phone:</b> <code>${phone}</code>\n`;
      replyMsg += `<b>Role:</b> ${roleStr}\n`;
      replyMsg += `<b>House ID:</b> <code>${householdId}</code>\n`;

      if (isOwner) {
        replyMsg += `\n<b>Owner Commands:</b>\n`;
        replyMsg += `• Scan QR Link: /link\n`;
        replyMsg += `• Create Web Link: /webtoken &lt;Name&gt;\n`;
        replyMsg += `• List Web Links: /listtokens\n`;
        replyMsg += `• Set Phone: <code>/setphone &lt;phone&gt;</code>\n`;
        replyMsg += `• Set Token: <code>/settoken &lt;session_token&gt;</code>`;
      }

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

// ================= HELPERS & WEB HANDLERS =================

export async function handleDirectOpen(env: any, token: string | null, request: Request): Promise<Response> {
  const acceptHeader = request?.headers?.get("accept") || "";
  const wantsJson = acceptHeader.includes("application/json");

  if (!token) {
    if (wantsJson) return new Response(JSON.stringify({ success: false, message: "No access token provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
    return renderHtmlResponse("❌ Missing Token", "No access token provided in request.", 400);
  }

  const tokenDataJson = await env.USERS.get(`webtoken:${token}`);
  if (!tokenDataJson) {
    if (wantsJson) return new Response(JSON.stringify({ success: false, message: "Invalid or revoked token" }), { status: 403, headers: { "Content-Type": "application/json" } });
    return renderHtmlResponse("❌ Invalid Token", "This access link is invalid or has been revoked.", 403);
  }

  let tokenData: any;
  try {
    tokenData = JSON.parse(tokenDataJson);
  } catch (e) {
    if (wantsJson) return new Response(JSON.stringify({ success: false, message: "Error parsing token data" }), { status: 500, headers: { "Content-Type": "application/json" } });
    return renderHtmlResponse("❌ Error", "Failed to parse token data.", 500);
  }

  const { householdId, label } = tokenData;
  const houseJson = await env.HOUSEHOLDS.get(householdId);
  if (!houseJson) {
    if (wantsJson) return new Response(JSON.stringify({ success: false, message: "Household configuration missing" }), { status: 404, headers: { "Content-Type": "application/json" } });
    return renderHtmlResponse("❌ Household Not Found", "Associated household configuration missing.", 404);
  }
  const house: House = JSON.parse(houseJson);

  if (!house.deviceId || !house.apiToken) {
    if (wantsJson) return new Response(JSON.stringify({ success: false, message: "Gate device or API token not set up" }), { status: 400, headers: { "Content-Type": "application/json" } });
    return renderHtmlResponse("❌ Gate Not Configured", "Gate device or API token not set up.", 400);
  }

  const allowed = await checkCooldown(env, householdId, `web:${token}`);
  if (!allowed) {
    if (wantsJson) return new Response(JSON.stringify({ success: false, message: "Cooldown active, please wait 10 seconds" }), { status: 429, headers: { "Content-Type": "application/json" } });
    return renderHtmlResponse("⏳ Cooldown Active", "Please wait 10 seconds before opening the gate again.", 429);
  }

  const dynamicToken = generateToken(house.apiToken, house.phone!, house.tokenType || "PRIMARY");
  const success = await pal.openGate(house, dynamicToken);

  const userLabel = label || `web:${token.substring(0, 6)}`;
  await log(env, householdId, userLabel, success);

  if (success && house.ownerId) {
    await telegram.sendMessage(
      env,
      parseInt(house.ownerId),
      `🔔 Gate opened via Web Link by <b>${escapeHtml(userLabel)}</b>`
    ).catch(() => {});
  }

  if (wantsJson) {
    return new Response(JSON.stringify({ success, message: success ? "Gate opened" : "Failed to open gate" }), {
      status: success ? 200 : 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (success) {
    return renderHtmlResponse("✅ Gate Opened", `Parking gate triggered successfully for <b>${escapeHtml(userLabel)}</b>.`, 200);
  } else {
    return renderHtmlResponse("❌ Gate Opening Failed", "Failed to open parking gate. Please try again.", 500);
  }
}

function renderHtmlResponse(title: string, message: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
    .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 90%; width: 360px; border: 1px solid #334155; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; font-size: 1rem; line-height: 1.5; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function checkCooldown(env: any, hid: string, uid: string): Promise<boolean> {
  const key = `cooldown:${hid}:${uid}`;
  const last = await env.COOLDOWN.get(key);

  const now = Date.now();
  if (last && now - parseInt(last) < 10000) return false;

  await env.COOLDOWN.put(key, String(now));
  return true;
}

async function log(env: any, hid: string, uid: string, success: boolean) {
  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").substring(0, 19);
  const entry = `${dateStr} UTC - ${uid} - ${success ? "OK" : "FAIL"}`;
  await env.LOGS.put(`log:${hid}:${Date.now()}`, entry);
}