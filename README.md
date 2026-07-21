# Palgate Telegram Bot & Web Trigger (Cloudflare Worker)

A serverless, multi-user solution built on Cloudflare Workers to control Palgate smart parking gates and barriers via Telegram or direct web links (Siri / iOS Shortcuts / Widgets).

This project dynamically generates time-based, offline AES tokens to communicate with the Palgate API. It ports the reverse-engineered cryptographic logic of the [pylgate](https://github.com/DonutByte/pylgate) Python library to TypeScript.

---

## ✨ Features

- **Serverless & Ultra-Fast**: Runs entirely on Cloudflare Workers.
- **Telegram Bot Integration**: Clean custom keyboard interface inside Telegram for opening the gate, viewing access logs, and creating invites.
- **Direct Web Links (No Telegram Required)**: Generate unique web token URLs (`/open?token=...`) for users without Telegram or for one-tap triggers from **iOS Shortcuts**, **Siri**, or **Android Home Screen Widgets**.
- **Interactive Invites Sub-Menu**: Generate 1-hour Telegram `/join` codes or direct web link tokens with custom user labels (e.g., *Mom's Phone*).
- **Multi-User Households**: Share access with family members without sharing root account credentials.
- **Access Logs & Cooldowns**: Enforces a 10-second rate-limiting cooldown and tracks who triggered the gate.

---

## 🕹️ Telegram Commands

### Household Commands
- `/start` or `/menu` – Displays the main interactive control keyboard.
- `/create_house` – Creates a new household instance.
- `/link` – Generates a QR code for automatic device pairing via the Palgate mobile app.
- `/join <code>` – Joins an existing household using a temporary 1-hour invite code.

### Web Token Management (Owner Only)
- `/webtoken <Name>` – Creates a direct Web Token link with a custom label (e.g. `/webtoken Mom`).
- `/listtokens` – Lists all active web tokens and their IDs.
- `/revoketoken <token_id>` – Revokes access for a specific web token ID.

---

## 🌐 Direct Web Triggers (iOS Shortcuts & Widgets)

You can trigger gate opening without opening Telegram:

```http
GET https://<YOUR_WORKER_URL>/open?token=<SECURE_WEB_TOKEN>
```

- **In Mobile Browsers**: Serves a sleek, dark-mode confirmation screen ("✅ Gate Opened").
- **For Siri / Automated Scripts**: Pass `Accept: application/json` header to receive a clean JSON payload:
  ```json
  { "success": true, "message": "Gate opened" }
  ```

---

## 📦 Setup & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Create KV Namespaces
Create the required Cloudflare KV namespaces using Wrangler:
```bash
npx wrangler kv:namespace create COOLDOWN
npx wrangler kv:namespace create HOUSEHOLDS
npx wrangler kv:namespace create INVITES
npx wrangler kv:namespace create LOGS
npx wrangler kv:namespace create USERS
```
Copy the generated IDs into your `wrangler.toml` file.

### 3. Add Telegram Bot Secret
```bash
npx wrangler secret put BOT_TOKEN
```

### 4. Deploy the Worker
```bash
npx wrangler deploy
```

### 5. Register Telegram Webhook
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_URL>"
```

---

## 🛠️ Local Development & Testing

### Running Tests
```bash
npm test
```

### Local Dev Server
```bash
npx wrangler dev
```

---

## 🙏 Acknowledgements
- Core cryptography ported from [pylgate](https://github.com/DonutByte/pylgate) by DonutByte ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)).

## 📄 License
MIT License. See [LICENSE](LICENSE) for details.

*Disclaimer: Unofficial open-source project not affiliated with Pal-ES. Use at your own risk.*