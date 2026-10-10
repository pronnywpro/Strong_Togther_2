# Strong Together

Training-block management for coaches and trainees. Pure static SPA (React + Vite +
TanStack Router) + Supabase (Postgres, Auth, Storage) — no server, no Lovable dependency.

## One-time setup (you only do this once)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New Project (free tier is enough).
Once it's created, open **Project Settings → API** and note down:
- **Project URL**
- **anon / publishable key** (the public one — never use the `service_role` key here, and this app never needs it)

### 2. Run the database schema

Open **SQL Editor** in the Supabase dashboard, paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It creates every table,
policy, function, and storage bucket the app needs — including auto-granting the `admin`
role to `YOUR_EMAIL@example.com` the moment that account first signs in. (Change that email
near the top of the file first if it should be a different address.)

### 3. Turn on Google sign-in

In the Supabase dashboard: **Authentication → Providers → Google** → enable it. You'll need
a Google OAuth Client ID/Secret:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create
   Credentials → OAuth client ID → Web application.
2. Under **Authorized redirect URIs**, paste the callback URL Supabase shows you on that
   same provider settings page (looks like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`).
3. Copy the generated Client ID and Client Secret into the Supabase provider settings and save.

### 4. Configure the app

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from step 1.

### 5. Install and run locally

```bash
npm install
npm run dev
```

### 6. Deploy (Cloudflare Pages, auto-deploy on push)

1. Create a GitHub repo and push this project to it.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com) → Workers & Pages → Create →
   Pages → Connect to Git → pick the repo.
3. Build settings: **Build command** `npm run build`, **Build output directory** `dist`.
4. Add the same two env vars from `.env` under **Settings → Environment variables**
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
5. Deploy. Every future `git push` to the connected branch redeploys automatically — the
   link never changes.

## What's different from a Lovable-hosted app

- Google sign-in is Supabase-native (`supabase.auth.signInWithOAuth`) — no external broker,
  works identically on `localhost` and in production.
- The two actions that need elevated privileges (removing a trainee, deleting a coach
  account) run as Postgres `SECURITY DEFINER` functions callable directly from the browser
  (`coach_remove_trainee`, `admin_delete_user` in `supabase/schema.sql`) — the
  `service_role` key is never used anywhere in this app.
- Admin access is identity-based: whoever signs in with the configured manager email gets
  the `admin` role automatically. There's no shared access code to type in or leak.

<!-- trigger cloudflare rebuild to verify env vars 1788015467 -->
