# Deploy to Vercel with Turso

The site runs as an Express app on Vercel and uses Turso for persistent SQLite-compatible storage. The app keeps using a local SQLite database when run on this computer.

## Prepare the accounts

1. Create a Turso database in your Turso account and create an authentication token for it. Keep the URL and token private.
2. Import the GitHub repository into Vercel.
3. In Vercel, add these environment variables for Production and Preview, then redeploy:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | Your Turso database URL |
   | `TURSO_AUTH_TOKEN` | A token for that database |
   | `JWT_SECRET` | A long, random secret unique to this app |
   | `ADMIN_USERNAME` | The admin login name you choose |
   | `ADMIN_PASSWORD` | A strong, unique admin password |
   | `ADMIN_EMAIL` | The admin email address |
   | `ADMIN_PIN` | A private five-digit withdrawal PIN |
   | `ADMIN_KEY` | A long, random key for admin-only integrations |

The server refuses to start on Vercel if the Turso URL or token is missing. It also refuses production startup without `JWT_SECRET`.

The database tables and indexes are created automatically at startup. A new Turso database starts empty; the ignored local `xplode.db` is not uploaded or copied automatically.

## Local development

```bash
npm ci
npm run dev
```

The local server uses `xplode.db` in the project directory unless `DB_PATH` is set. Copy `.env.example` to `.env` and configure local admin and JWT settings as needed. The `.env` file and SQLite database files are excluded from Git.

## Build behavior

Vercel runs `npm run build`, which copies the site's HTML, CSS, JavaScript, and image assets into `public/` for CDN delivery. `server.js` remains the Express function for API requests.
