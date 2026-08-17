# Sikh ID — central auth API

Central identity + master profile database for the Sikh Group WordPress
network. Handles quick registration, cross-domain SSO, staged profile
completion, automatic reminder emails, and segmented manual campaigns.

## Stack

Node.js / Express, MySQL 8, Redis + BullMQ (queues), Amazon SES (email), PM2, Nginx.

## Local setup

```bash
cp .env.example .env        # fill in real values
mysql -u root -p sikh_id_master < src/db/schema.sql
npm install
npm run dev                 # API on http://localhost:4000
```

In separate terminals, run the background workers:

```bash
npm run worker              # sends auto-reminder emails
npm run campaign-worker     # sends manual segment campaigns
```

To manually trigger a reminder scan (normally run by cron, see below):

```bash
npm run cron
```

## Production deployment (VPS)

1. `git clone` this repo to the server, `cd vps-backend`, `npm ci --production`.
2. Create the MySQL database and run `schema.sql`.
3. Fill in `.env` with real secrets — rotate `JWT_ACCESS_SECRET`,
   `JWT_REFRESH_SECRET`, `SITE_SHARED_SECRET`, and `ADMIN_API_KEY`.
4. `pm2 start ecosystem.config.js && pm2 save`
5. Add a daily cron entry for the reminder scan:
   ```
   0 9 * * * cd /path/to/vps-backend && node src/queue/scheduleReminders.js >> /var/log/sikh-id-reminders.log 2>&1
   ```
6. Point Nginx at two subdomains, both proxying to the same Node process:
   - `auth.thesikhgroup.com` → API (port 4000)
   - `id.thesikhgroup.com` → the dashboard front-end (build separately; the
     screenshot dashboard you already designed is the target UI for this)
7. Issue SSL certs for both via certbot.

See `../DEPLOYMENT-RUNBOOK.md` for the full step-by-step including Nginx
config blocks and the WordPress plugin install.

## API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | /api/v1/auth/register | site secret | Quick sign-up from any WP site |
| POST | /api/v1/auth/login | site secret | Login |
| POST | /api/v1/auth/refresh | — | Exchange refresh token for new access token |
| GET | /api/v1/auth/sso/authorize | bearer | Step 1 of cross-site SSO |
| POST | /api/v1/auth/sso/exchange | site secret | Step 2 of cross-site SSO |
| GET | /api/v1/profile/me | bearer | Full profile + completion status |
| PATCH | /api/v1/profile/about | bearer | Stage 2 (30%) |
| PATCH | /api/v1/profile/professional | bearer | Stage 3 (45%) |
| PUT | /api/v1/profile/interests | bearer | Stage 4 (60%) |
| PUT | /api/v1/profile/group-preferences | bearer | Stage 5 (75%) |
| PATCH | /api/v1/profile/communication-preferences | bearer | Stage 6 (85%) |
| PATCH | /api/v1/profile/community | bearer | Stage 7 (95%) |
| POST | /api/v1/segments/preview | admin key | Dry-run a segment filter |
| POST | /api/v1/segments | admin key | Save a segment |
| GET | /api/v1/segments | admin key | List segments |
| GET | /api/v1/segments/:id/members | admin key | Live segment membership |
| POST | /api/v1/campaigns/send | admin key | Send a campaign to a segment |

Every write to a profile section calls `completionScore.service.js` to
recompute `profile_completion`, so the number shown on the dashboard is
always live — never a cached/stale value.
