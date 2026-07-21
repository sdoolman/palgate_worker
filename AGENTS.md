# AGENTS.md - Developer & AI Agent Guide

Welcome! This document provides an architectural overview, data schema specifications, and development guidelines for working with the **Palgate Worker** repository.

---

## 🏗️ Architecture Overview

The system is a serverless application deployed to **Cloudflare Workers**. It serves two primary functions:
1. **Telegram Webhook Bot**: Handles user interactions, household creation, device pairing, access logs, and gate opening via Telegram chat & custom keyboard controls.
2. **Direct Web Token Trigger**: Exposes a lightweight HTTP GET endpoint (`/open?token=<KEY>`) allowing users without Telegram (or automated workflows like iOS Shortcuts, Siri, or Android Home Screen Widgets) to open the parking gate with a single tap.

### System Diagram
```
[ Telegram App ] ──── POST / ────► ┌────────────────────────────────────────┐
                                   │     Cloudflare Worker (src/index.ts)    │
[ Web / iOS / Siri ] ── GET /open ─► └───────────────────┬────────────────────┘
                                                       │
                                  ┌────────────────────┴───────────────────┐
                                  ▼                                        ▼
                         [ Cloudflare KV ]                        [ PalGate API ]
                         - HOUSEHOLDS                             - Dynamic AES Token
                         - USERS                                  - Open Gate Command
                         - COOLDOWN / LOGS
```

---

## 🗄️ Cloudflare KV Data Schemas

The application relies on 5 Cloudflare KV namespace bindings:

### 1. `HOUSEHOLDS`
Stores household configuration and PalGate session tokens.
* **Key Format**: `<householdUUID>` (e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479`)
* **Value Schema (JSON)**:
  ```json
  {
    "ownerId": "123456789",
    "phone": 972500000000,
    "apiToken": "6aef...",
    "tokenType": "PRIMARY",
    "deviceId": "gate_device_id_123",
    "deviceName": "Main Entrance Gate"
  }
  ```

### 2. `USERS`
Maps both Telegram Users and Direct Web Tokens to their corresponding Household ID.
* **Telegram Mapping Key**: `user:<telegramId>` (e.g. `user:123456789`)
  * **Value**: Plain string `householdUUID`
* **Web Token Key**: `webtoken:<random32Hex>` (e.g. `webtoken:a1b2c3d4e5f6...`)
  * **Value Schema (JSON)**:
    ```json
    {
      "householdId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "label": "Mom's Phone",
      "createdBy": "123456789",
      "createdAt": 1721590000000
    }
    ```

### 3. `COOLDOWN`
Enforces a 10-second rate-limiting cooldown per household/user.
* **Key Format**: `cooldown:<householdId>:<userId>`
* **Value**: String timestamp (`Date.now()`)

### 4. `LOGS`
Stores access history.
* **Key Format**: `log:<householdId>:<timestamp>`
* **Value**: String format (`HH:MM:SS - <userId/label> - OK/FAIL`)

### 5. `INVITES`
Temporary 1-hour invite codes for household join requests.
* **Key Format**: `<6CharString>` (e.g. `x7k9p2`)
* **Value**: Plain string `householdId` (with `expirationTtl: 3600`)

---

## 🔌 HTTP Routes & Endpoints

| Method | Route | Description | Expected Output |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | Telegram Webhook endpoint. Expects standard `TelegramUpdate` body. | `200 OK` |
| `GET` | `/open?token=<KEY>` | Direct web trigger endpoint. Looks up `webtoken:<KEY>` in KV, checks cooldown, triggers PalGate API, and notifies owner. | Mobile HTML response (or JSON if `Accept: application/json` is passed) |
| `GET` | `/direct/open?token=<KEY>` | Alias for `/open?token=<KEY>`. | Same as `/open` |

---

## 🔐 Cryptographic Token Logic (`src/token.ts` & `src/aes.ts`)

PalGate requires time-sensitive dynamic AES tokens:
1. `step1`: Decrypts the session token using PalGate's master key (`T_C_KEY`) and phone number.
2. `step2`: Encrypts state containing state version `2570` and UNIX timestamp (`ts + 2`).
3. Outputs a 23-byte hex token sent via `X-Bt-Token` HTTP header to PalGate's API endpoints (`https://api1.pal-es.com/v1/bt`).

---

## 📁 Source Code Map

* `src/index.ts`: Worker entry point (`fetch` handler and route dispatch).
* `src/bot.ts`: Main Telegram update dispatcher, command logic, web token logic (`handleDirectOpen`), and helpers (`checkCooldown`, `log`).
* `src/telegram.ts`: Telegram Bot API wrapper methods (`sendMessage`, `sendMenu`, `editMessage`, `sendPhoto`). Uses `parse_mode: "HTML"`.
* `src/pal.ts`: PalGate HTTP API client (`fetchDevices`, `openGate`, `initLink`).
* `src/token.ts` & `src/aes.ts`: PalGate token generation algorithms.
* `src/types.ts`: TypeScript interfaces (`House`, `TelegramUpdate`, etc.).

---

## 🛠️ Testing & Deployment

### Local Development
```bash
npx wrangler dev
```

### Type Checking & Vitest Unit Tests
```bash
npx tsc --noEmit
npm test
```

### Deploying to Cloudflare
```bash
npx wrangler deploy
```
