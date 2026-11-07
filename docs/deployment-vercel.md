# Vercel release configuration

Import `raha-medical/frontend` into Vercel as a Next.js project, repository root `/`. Select the reviewed release branch. `vercel.json` runs clean installation, typecheck and the production build.

Copy `deploy/vercel.env.example` values to the correct Vercel environment and replace domain placeholders:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL=/api/v1` | Same-origin REST requests |
| `API_PROXY_TARGET=https://YOUR-BACKEND.up.railway.app` | Backend origin for Next rewrites; no trailing API path |
| `NEXT_PUBLIC_HUB_URL=https://YOUR-BACKEND.up.railway.app/hubs/live` | Direct SignalR connection to backend |
| `NEXT_PUBLIC_PATIENT_APP_URL=https://YOUR-FRONTEND.vercel.app/patient` | Public URL encoded in waiting display QR |
| `NEXT_PUBLIC_AGENT_MODE=simulate` | Browser printing, no local hardware agent required |

Set backend `Cors__Origins__0` to the exact Vercel origin. Configure preview environments against an isolated backend/database; do not use real patient data in previews. Public values are compiled at build time; redeploy when changing them. Never put database passwords, JWT keys or storage credentials in a `NEXT_PUBLIC_*` value. Local `.env.local` is ignored and must not be uploaded.

The existing `/api/v1` rewrite remains in `next.config.mjs`; realtime connections explicitly use Railway, avoiding dependence on an intermediary for long-lived connections. Use HTTPS for camera scanning and service workers. Verify API health, login, permissions, independent staff tabs, live queue, QR attendance from a real phone, uploads and printing after deployment.

The complete backend/database/storage/bootstrap/backup instructions are in `raha-medical/backend`, `docs/deployment-railway.md`. Current OTP/SMS, push and assistant defaults are sandbox integrations. Online sandbox payments are disabled in Production. A successful Vercel build does not make these integrations live.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
