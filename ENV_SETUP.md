# Environment Variables Setup Guide

This guide explains how to obtain the required API keys and configure environment variables for Olly Molly.

## Quick Start

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in the required values following the instructions below.

---

## 1. Supabase Configuration

### Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in project details and wait for setup to complete

### Get API Keys

1. In your Supabase project, go to **Settings > API**
2. Copy the following values:

| Environment Variable | Where to Find |
|---------------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (e.g., `https://xxxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (keep this secret!) |

### Run Database Migrations

After setting up Supabase, run the SQL schema in `supabase/schema.sql` via the Supabase SQL Editor:

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste the contents of `supabase/schema.sql`
3. Click "Run"

---

## 2. NextAuth Secret

Generate a secure random secret for authentication:

```bash
# Option 1: Using openssl
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output and set it as `AUTH_SECRET` in your `.env.local`.

---

## 3. Google OAuth Setup

### Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**

### Configure OAuth Consent Screen

If prompted, configure the OAuth consent screen:

1. Select **External** user type
2. Fill in app name, user support email, and developer contact
3. Add scopes: `email`, `profile`, `openid`
4. Add test users if in testing mode

### Create OAuth Client ID

1. Application type: **Web application**
2. Name: `Olly Molly`
3. Authorized JavaScript origins:
   - `http://localhost:1234` (development)
   - `https://your-domain.com` (production)
4. Authorized redirect URIs:
   - `http://localhost:1234/api/auth/callback/google` (development)
   - `https://your-domain.com/api/auth/callback/google` (production)

5. Click **Create** and copy:
   - **Client ID** -> `AUTH_GOOGLE_ID`
   - **Client Secret** -> `AUTH_GOOGLE_SECRET`

---

## 4. Complete Configuration

Your `.env.local` should look like this:

```env
# Authentication Mode
NEXT_PUBLIC_REQUIRE_AUTH=true

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# NextAuth
AUTH_SECRET=your-generated-secret-here

# Google OAuth
AUTH_GOOGLE_ID=123456789-abc.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-xxxxxxxxxxxxx
```

---

## 5. Local Development (No Auth)

For local development without authentication:

```env
NEXT_PUBLIC_REQUIRE_AUTH=false
```

This will skip the login requirement and use local IndexedDB storage.

---

## Troubleshooting

### Google OAuth Errors

- **Error 400: redirect_uri_mismatch**: Check that your redirect URI exactly matches what's configured in Google Cloud Console
- **Error 403: access_denied**: Make sure your email is added as a test user in the OAuth consent screen

### Supabase Connection Errors

- Verify your Supabase project is running (check dashboard)
- Check that the URL and API keys are correct
- Ensure RLS policies are properly configured

### Auth Secret Issues

- Make sure `AUTH_SECRET` is set and is at least 32 characters
- Regenerate the secret if you're seeing JWT errors
