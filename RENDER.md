# Deploying to Render

This repository's Render Blueprint creates two services:

- `smart-dustbin-dashboard`: a static site published from `public/`.
- `smart-dustbin-alert-monitor`: a Node.js background worker running `npm start` (`server.js`) to continuously monitor Firebase and send email alerts.

## Deploy

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, select this repository, and confirm the services from `render.yaml`.
3. Enter the requested values for `FIREBASE_DATABASE_URL`, `GMAIL_SENDER`, `GMAIL_APP_PASSWORD`, and `ALERT_RECIPIENT`. Set these as environment variables on the background worker, not the static site.
4. Deploy the Blueprint. Use the dashboard URL shown by the `smart-dustbin-dashboard` static site.

The background worker is a continuously running service and uses Render's `0.5c-512mb` instance plan; check Render's current pricing before deployment. The static site can be deployed independently if you do not want to run the email monitor.

If you already created a Node.js Web Service and its logs show `node app.js`, redeploy this version: `app.js` now serves the dashboard files from `public/` and listens on Render's `PORT`. Set its build command to `npm ci` and start command to `node app.js`. To enable email alerts for that setup, create a separate Background Worker with build command `npm ci`, start command `npm start`, and the four environment variables above. Do not also create the Blueprint dashboard service if you are keeping the existing Web Service.

The monitor reads `smart_dustbin/garbage` and `smart_dustbin/shutter/status` from Firebase. Gmail requires an app password, not the account's normal password. Check the worker's logs after deployment to confirm Gmail verification and Firebase polling.

The dashboard reads Firebase directly from visitors' browsers. Configure Realtime Database rules to allow only the reads the dashboard needs and deny unauthorized writes. Rotate any credentials that have already been committed to a public repository.

Deploy either the Render background worker or the Vercel scheduled alert function, not both, or the same full-bin readings can trigger duplicate emails.

`npm start` runs the Render background worker. `npm test` runs the scheduled-function tests for the separate Vercel deployment.
