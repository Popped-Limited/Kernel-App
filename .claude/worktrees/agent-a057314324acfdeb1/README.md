# Yep Kitchen Compliance Portal

SALSA compliance portal — replaces ChecQR.

## Setup (one-time)

### 1. Install Node.js
Download from **https://nodejs.org** — install the LTS version (e.g. 20.x).
After installing, open Terminal and confirm it works:
```
node --version
npm --version
```

### 2. Install dependencies
```
cd ~/yep-compliance
npm install
```

### 3. Set up Supabase schema
1. Go to **https://supabase.com/dashboard/project/dudchdacsrgdnenkqmyo**
2. Click **SQL Editor** in the left menu
3. Paste in the contents of `scripts/schema.sql` and click **Run**
   - If your 6 tables already exist, just run the RLS policy lines at the bottom

### 4. Create the photo storage bucket
1. In Supabase, go to **Storage** → **New bucket**
2. Name: `compliance-photos`
3. Make it **Public** (so photo URLs work in the app)

### 5. Run the seed script
This loads all 19 checklists and their questions into the database:
```
npm run seed
```
Re-running is safe — it won't duplicate anything.

### 6. Set up email alerts (Resend)
1. Create a free account at **https://resend.com**
2. Get your API key
3. Open `.env.local` and replace `re_REPLACE_WITH_YOUR_KEY` with your key
4. Verify `tom@yepkitchen.com` as a sending domain in Resend

### 7. Run locally
```
npm run dev
```
Then open **http://localhost:3000**

---

## Deploying to Vercel

1. Push this folder to a GitHub repo (keep `.env.local` out — it's in `.gitignore`)
2. Connect the repo to **https://vercel.com**
3. Add these environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` → your Vercel URL e.g. `https://yep-compliance.vercel.app`
   - `RESEND_API_KEY`
   - `ALERT_EMAIL` → `tom@yepkitchen.com`
   - `CRON_SECRET` → any random string (e.g. generate one at random.org)
4. Deploy

The Vercel cron job in `vercel.json` will call `/api/alerts` every day at 5pm UTC (6pm BST). It sends an email if any daily checks were missed.

---

## How it works

| Feature | How |
|---|---|
| Staff open a checklist | Scan QR code → mobile-optimised form |
| Photo upload | Taken with phone camera, stored in Supabase Storage |
| Signature capture | Drawn on-screen with finger |
| Manager reviews | Dashboard → click submission → Sign off |
| Missed check alerts | Email sent at 5pm if daily checks not done |
| QR codes | Print page at `/print-qr` — one per checklist |

## Switching alerts to Sam
When Sam is ready, change `ALERT_EMAIL` in Vercel environment variables from `tom@yepkitchen.com` to `sam@yepkitchen.com` and redeploy.

## Adding/editing checklist questions
All questions are in the database — edit them directly in Supabase Table Editor, no code changes needed.

## Tech stack
- **Next.js 14** (App Router)
- **Supabase** (Postgres database + file storage)
- **Tailwind CSS**
- **Resend** (email)
- **Vercel** (hosting + cron jobs)
