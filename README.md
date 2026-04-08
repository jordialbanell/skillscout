# SkillScout

Paste an Instagram reel, TikTok, or article URL. SkillScout fetches the content, analyzes it with Claude, checks GitHub repos for trust signals, and lets you download `.skill` files for Claude.

## Stack

- **Next.js 14** (App Router)
- **Apify** — Instagram reel scraper + TikTok scraper
- **Claude Haiku** — content analysis and skill extraction
- **GitHub API** — trust scoring for repos

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/skillscout
cd skillscout
npm install
```

### 2. Set environment variables

Copy `.env.example` to `.env.local` and fill in:

```
APIFY_API_TOKEN=       # from console.apify.com
ANTHROPIC_API_KEY=     # from console.anthropic.com
GITHUB_TOKEN=          # optional, but recommended
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push to GitHub
2. Import project at vercel.com
3. Add environment variables in Vercel dashboard
4. Deploy

The `vercel.json` sets API function timeout to 120s (needed for Apify polling).

## How it works

1. **Extract** — Apify scrapes Instagram/TikTok reels (returns caption + transcript). Articles are fetched directly.
2. **Analyze** — Claude Haiku reads the content and extracts skill name, category, key steps, GitHub URLs, and quality signals.
3. **GitHub check** — For each GitHub repo mentioned, the app checks stars, recency, whether `.skill` files exist, and computes a trust score.
4. **Download** — If the repo is trustworthy, download a `.skill` file to install into Claude.
