# Hangi Tracker

A mobile-first PWA for hangboard training, deployed on Cloudflare Workers with a
simple password login.

- Build plan: [docs/PLAN.md](docs/PLAN.md)
- Prompt for the Design Agent: [docs/DESIGN_PROMPT.md](docs/DESIGN_PROMPT.md)
- Design handoff (screens, tokens, assets): [docs/design/](docs/design/README.md)
- Deploy, versions, rollback: [docs/DEPLOY.md](docs/DEPLOY.md)

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply hangi-tracker --local
python3 scripts/add_user.py --local   # then run the printed command
npm run preview                        # http://localhost:8787
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`. A push to `main` deploys (see docs/DEPLOY.md).
