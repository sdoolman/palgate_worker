# Palgate Telegram Bot (Cloudflare Worker)

A serverless Telegram bot built on Cloudflare Workers to control Palgate smart gates and barriers. 

This project dynamically generates time-based, offline AES tokens to communicate with the Palgate API. It ports the reverse-engineered cryptographic logic of the [pylgate](https://github.com/DonutByte/pylgate) Python library to TypeScript.

## ✨ Features
- **Serverless & Fast**: Runs entirely on Cloudflare Workers. No dedicated servers needed.
- **Device Linking**: Connects to your Palgate account automatically via QR Code scanning.
- **Multi-User Households**: Create a "House", invite members via shortcodes, and share gate access securely without sharing your root API tokens.
- **Persistent Telegram UI**: Provides a clean, custom keyboard interface inside Telegram.
- **Access Logs & Cooldowns**: Tracks who opened the gate and prevents spamming the API.

## 🚀 Prerequisites
- A [Cloudflare](https://dash.cloudflare.com/) account.
- [Node.js](https://nodejs.org/) installed.
- A Telegram Bot Token (Get it from [@BotFather](https://t.me/BotFather)).

## 📦 Setup & Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Create KV Namespaces
This bot uses Cloudflare KV to store users, households, invites, and logs. Create the required namespaces using Wrangler:

```bash
npx wrangler kv:namespace create COOLDOWN
npx wrangler kv:namespace create HOUSEHOLDS
npx wrangler kv:namespace create INVITES
npx wrangler kv:namespace create LOGS
npx wrangler kv:namespace create USERS
```

Copy the generated `id`s and paste them into the corresponding sections of your `wrangler.toml` file.

### 3. Add Telegram Bot Token
Securely add your Telegram bot token to your Cloudflare Worker environment:
```bash
npx wrangler secret put BOT_TOKEN
```

### 4. Deploy the Worker
```bash
npx wrangler deploy
```

### 5. Set the Telegram Webhook
Once deployed, Cloudflare will provide you with a `.workers.dev` URL. You need to tell Telegram to send messages to this URL:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_URL>"
```

## 🕹️ Usage

1. Send `/start` or `/init_bot` to your bot in Telegram.
2. Send `/create_house` to register a new household.
3. Send `/link` to generate a Device Linking QR Code. Open the official Palgate app on your phone, navigate to Device Linking, and scan the code.
4. The bot will automatically authenticate and setup a persistent Telegram menu to open your gate!

To share access with family or friends, click **👥 Invite** to generate a shortcode they can use with `/join <code>`.

## 🛠️ Local Development & Testing

### Testing Token Generation
If you want to manually test the AES token generation logic without deploying the bot, you can use the built-in test script:

1. Open `src/test-token.ts` and add your test `sessionToken` and `phone`.
2. Run the script using `tsx`:
```bash
npx tsx src/test-token.ts
```

### Local Worker Testing
You can simulate the Cloudflare Worker environment locally:
```bash
npx wrangler dev
```
*(Note: Webhooks from Telegram will not reach your localhost automatically without a tunnel like Cloudflare Tunnels or Ngrok).*

## 🙏 Acknowledgements
- The core token generation cryptography was ported from [pylgate](https://github.com/DonutByte/pylgate) by DonutByte, which is licensed under the [Creative Commons Attribution 3.0 Unported License](https://creativecommons.org/licenses/by/3.0/).

## 📄 License
This project is licensed under the MIT License. See the LICENSE file for details. 

*Disclaimer: This is an unofficial, open-source project and is not affiliated with, endorsed by, or associated with Pal-ES. Use at your own risk. The authors are not responsible for any misuse, damage, or Terms of Service violations.*