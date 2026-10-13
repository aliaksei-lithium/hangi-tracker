# Deploy

Production: https://hangi-tracker.aliaksei-zhynhiarouski.workers.dev

## How it works

- Every push and pull request runs CI: lint, typecheck, tests, build.
- A push to `main` also deploys, after CI passes: it applies new D1 migrations, then
  runs `wrangler deploy`. Each deploy is a new Worker version, tagged with the short
  commit hash and the first line of the commit message.
- Work happens on other branches. Merge (or fast-forward) into `main` to release.
- The app shows its version (package version and commit) at the bottom of Settings.

## One-time setup (owner)

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → template
   "Edit Cloudflare Workers". Add the permission Account → D1 → Edit. Limit it to
   your account.
2. Save the token in GitHub (the command asks for the value; it is not shown):

   ```
   gh secret set CLOUDFLARE_API_TOKEN
   ```

The variable `CLOUDFLARE_ACCOUNT_ID` is already set in the repository.

## Roll back

```
npx wrangler deployments list
npx wrangler rollback            # back to the previous version
npx wrangler versions list       # to pick an older one: npx wrangler rollback <version-id>
```

A rollback does not undo D1 migrations. Keep migrations additive (new tables and
columns), so an older Worker version still works with the newer database.

## Users

`python3 scripts/add_user.py`, then run the printed `wrangler d1 execute ... --remote`
command. Every user needs a different password (login is password only).
