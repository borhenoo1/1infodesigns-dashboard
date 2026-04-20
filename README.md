# InfoDesigns Marketing Dashboard
## Real-time Meta Ads Dashboard — Netlify Deploy Guide

---

## 📁 Project Structure

```
infodesigns-dashboard/
├── public/
│   └── index.html          ← Dashboard (frontend)
├── netlify/
│   └── functions/
│       └── get-insights.js ← Serverless function (fetches Pipeboard API)
├── netlify.toml            ← Netlify configuration
├── package.json
└── README.md
```

---

## 🚀 Deploy Steps

### Step 1 — Upload to GitHub

1. Go to github.com → New repository
2. Name it: `infodesigns-dashboard`
3. Upload all these files (drag & drop)
4. Click "Commit changes"

### Step 2 — Connect to Netlify

1. Go to app.netlify.com → "Add new site" → "Import from Git"
2. Choose GitHub → Select `infodesigns-dashboard`
3. Build settings (leave as default — Netlify auto-detects)
4. Click "Deploy site"

### Step 3 — Add Environment Variable (IMPORTANT)

In Netlify:
1. Site Settings → Environment Variables → Add variable
2. Key:   `PIPEBOARD_API_KEY`
3. Value: [Your Pipeboard API key — see below]

### Step 4 — Get Pipeboard API Key

1. Go to pipeboard.co → Login
2. Dashboard → API Keys → Create new key
3. Copy the key → Paste in Netlify environment variable

---

## ✅ How It Works

```
Browser → Netlify Function → Pipeboard API → Meta Ads
```

1. Dashboard loads in browser
2. Browser calls `/.netlify/functions/get-insights?period=yesterday`
3. Netlify Function calls Pipeboard API securely (no CORS issues)
4. Data returned to browser → Dashboard updates
5. Auto-refresh every **1 hour** automatically

---

## 🔄 Auto-Refresh

- Data refreshes every **1 hour** automatically
- Day change detection: at midnight, cache clears automatically
- Manual refresh: click "Refresh" button in dashboard

---

## 📊 Account

- Account ID: act_779003545080733 (sponsor 2025)
- Data: Today, Yesterday, 7 days, 30 days, 90 days
