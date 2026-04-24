# Rotorua NZ Chatbot Plugin - Setup Guide

## Prerequisites
- Node.js 18 or later (https://nodejs.org)
- An Anthropic API key (https://console.anthropic.com)

---

## 1. Install dependencies

Open a terminal in this folder and run:

```
npm install
```

---

## 2. Configure environment

Copy `.env.example` to `.env`:

```
copy .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your API key from console.anthropic.com |
| `ADMIN_KEY` | A strong password for the admin panel (you choose this) |
| `PORT` | Port to run on (default: 3000) |

---

## 3. Start the server

```
npm start
```

The server will load `Feb2026.xlsx` automatically on startup.

---

## 4. Test the chatbot

Open: http://localhost:3000/embed-example.html

Click the red button in the bottom-right corner.

---

## 5. Embed on your website

Add these two lines before `</body>` on any page of your website:

```html
<script src="https://YOUR-SERVER/chatbot-widget.js" data-api-url="https://YOUR-SERVER"></script>
```

Replace `https://YOUR-SERVER` with your actual server URL.

---

## 6. Admin panel - refreshing data

Open: http://localhost:3000/admin.html

1. Enter your `ADMIN_KEY` to log in.
2. View the current dataset status (file name, row count, date range).
3. Upload a new `.xlsx` file with the same column structure:
   - Month, Area type, Area, Property, Measure, Value
4. The chatbot uses the new data immediately, no restart needed.

---

## File structure

```
Source data/
├── server.js              Main server
├── package.json
├── .env                   Your credentials (do not share)
├── .env.example           Template
├── Feb2026.xlsx           Initial data file
├── data/                  Uploaded data files go here
├── public/
│   ├── chatbot-widget.js  Embeddable widget script
│   ├── chatbot-widget.css Widget styles
│   └── admin.html         Admin panel
└── embed-example.html     Demo page
```

---

## Deployment notes

For production, deploy the Node.js server to a cloud host (e.g. Azure App Service, AWS, Render.com) and use HTTPS. Update the `data-api-url` in your embed script to your production URL.
