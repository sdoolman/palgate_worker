export interface House {
  ownerId: string;
  apiToken: string | null;
  deviceId: string | null;
  deviceName: string | null;
  phone: number | null;
  tokenType?: "PRIMARY" | "SECONDARY" | "SMS";
}

export interface Device {
  id: string;
  name?: string;
}

export interface TelegramMessage {
  from?: { id: number };
  chat: { id: number };
  text?: string;
}

export interface TelegramCallback {
  id: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}

export interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallback;
}