import type { House, Device } from "./types";

const BASE_URL = "https://api1.pal-es.com/v1/bt";
const USER_AGENT = "okhttp/4.9.3";

function getHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  if (token) headers["X-Bt-Token"] = token;
  return headers;
}

export async function fetchDevices(token: string): Promise<Device[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/devices`, { headers: getHeaders(token) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.devices || [];
  } catch (e) {
    console.error("fetchDevices error:", e);
    return null;
  }
}

export async function openGate(house: House, token: string): Promise<boolean> {
  if (!token || !house.deviceId) return false;
  try {
    const res = await fetch(`${BASE_URL}/device/${house.deviceId}/open-gate?openBy=100&outputNum=1`, {
      headers: getHeaders(token),
    });
    return res.ok;
  } catch (e) {
    console.error("openGate error:", e);
    return false;
  }
}

export async function initLink(uuid: string): Promise<{ phone: number, token: string, type: "PRIMARY" | "SECONDARY" | "SMS" } | null> {
  try {
    const res = await fetch(`${BASE_URL}/un/secondary/init/${uuid}`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    
    const data = await res.json();
    if (data.status !== "ok" || data.err) {
      console.error("initLink API error:", data);
      return null;
    }

    const sec = parseInt(data.secondary, 10);
    let type: "PRIMARY" | "SECONDARY" | "SMS" = "SECONDARY";
    if (sec === 1) type = "PRIMARY";
    else if (sec === 0) type = "SMS";

    return {
      phone: parseInt(data.user.id, 10),
      token: data.user.token,
      type
    };
  } catch (e) {
    console.error("initLink network error:", e);
    return null;
  }
}

export async function checkStatus(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/secondary/status`, { headers: getHeaders(token) });
    return res.ok;
  } catch (e) {
    console.error("checkStatus error:", e);
    return false;
  }
}

export async function checkToken(token: string): Promise<boolean> {
  try {
    const ts = Math.floor(Date.now() / 1000);
    const res = await fetch(`${BASE_URL}/user/check-token?ts=${ts}&ts_diff=0`, { headers: getHeaders(token) });
    return res.ok;
  } catch (e) {
    console.error("checkToken error:", e);
    return false;
  }
}