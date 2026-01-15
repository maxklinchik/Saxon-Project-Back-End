Cloudflare Worker + D1 deploy instructions

1. Install Wrangler and authenticate:

```bash
npm install -g wrangler
wrangler login
```

2. Set your Cloudflare account id in `wrangler.toml` (replace YOUR_ACCOUNT_ID).

3. Create a D1 database in your account (or via Wrangler):

```bash
wrangler d1 create bowling_db
```

4. Apply the migration:

```bash
wrangler d1 migrations apply --database bowling_db
```

5. Publish the Worker:

```bash
wrangler publish
```

Notes:
- The example worker code in `src/index.js` includes a tiny `/api/players` stub that uses the `BOWLING_DB` binding. Update and expand endpoints by porting your Express logic.
- Do not commit secrets into `wrangler.toml`. Use `wrangler secret put NAME` for secrets such as `JWT_SECRET`.
