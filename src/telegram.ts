import type { House } from "./types";

export async function setupTelegramMenu(env: any) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: { type: "commands" }
    })
  });

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "menu", description: "Open gate control" },
        { command: "start", description: "Start bot" },
        { command: "help", description: "Help" }
      ]
    })
  });
}

export async function sendMenu(env: any, chatId: number, house: House, userId: string) {
  const isOwner = house?.ownerId === userId;

  const keyboard: { text: string }[][] = [
    [{ text: "🔓 Open Gate" }]
  ];

  if (isOwner) {
    keyboard.push(
      [{ text: "📊 Logs" }, { text: "👥 Invites" }],
      [{ text: "⚙️ Settings" }]
    );
  }

  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🚪 ${house?.deviceName || "Gate Control"}`,
      reply_markup: {
        keyboard: keyboard,
        resize_keyboard: true,
        is_persistent: true
      }
    })
  });
}

export async function sendDeviceSelection(env: any, chatId: number, devices: any[]) {
  const keyboard = devices.map(d => ([{
    text: d.name || d.id,
    callback_data: `select_device:${d.id}`
  }]));

  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "בחר שער:",
      reply_markup: { inline_keyboard: keyboard }
    })
  });
}

export async function sendMessage(env: any, chatId: number, text: string) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
  });
}

export async function editMessage(env: any, chatId: number, messageId: number, text: string) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" })
  });
}

export async function answerCallback(env: any, id: string, text: string) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: id,
      text
    })
  });
}

export async function sendPhoto(env: any, chatId: number, photo: string, caption?: string) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo,
      caption
    })
  });
}

export async function deleteMessage(env: any, chatId: number, messageId: number) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId
    })
  });
}