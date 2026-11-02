# Deploying to Vercel

The repository root is the Vercel project root. Vercel serves the dashboard files in `public/` and deploys `api/alerts.js` as a serverless function. No build command or output directory is required.

## Setup

1. Import this repository into Vercel and deploy from the repository root.
2. In the Vercel project's Production environment variables, add:
   - `CRON_SECRET`: a long, random secret used to protect the scheduled endpoint.
   - `FIREBASE_DATABASE_URL`: the Realtime Database URL.
   - `GMAIL_SENDER`: the Gmail account used to send alerts.
   - `GMAIL_APP_PASSWORD`: that account's Google app password.
   - `ALERT_RECIPIENT`: the alert destination email address.
3. Redeploy after setting the variables. Vercel Cron Jobs use `CRON_SECRET` as a bearer token when invoking the scheduled endpoint.

The cron runs daily at 03:30 UTC (09:00 India Standard Time). It emails only when the Firebase garbage level is at least 90%, so a bin that remains full receives one reminder per day. The daily schedule works with Vercel Hobby's once-per-day cron limit; more frequent checks require a plan that supports a more frequent schedule and an explicit alert-throttling strategy.

The dashboard reads Firebase directly from the browser. Configure Realtime Database rules so the dashboard can read only what it needs and unauthenticated clients cannot write data. Do not put email credentials or `CRON_SECRET` in frontend code.

The existing root `server.js` is a continuously running local/standalone monitor; Vercel does not run it as a persistent process. Vercel uses the scheduled function under `api/` instead.

## Local checks

Run the API handler tests with `npm test` on Node.js 20 or newer. The scheduled email path also requires valid Vercel environment variables and a working Gmail app password.
