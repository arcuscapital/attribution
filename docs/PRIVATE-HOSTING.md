# Private Attribution hosting

Account: shaunkrom18@gmail.com, account ID `5695cae2becf35e049eb5df3e2849ae2`.
URL: https://arcus-attribution.arcus-attribution.workers.dev/

Only `site/` assets and `cloudflare/worker.mjs` deploy. No database, holdings,
archives, Google tokens or source-portfolio credentials are uploaded.
`run_worker_first: true` is mandatory: every asset request must pass the server
authentication gate. Do not publish `site/` directly on public GitHub Pages.

The password is represented by a server-only HMAC verifier with a random 256-bit
pepper. A separate random 256-bit key signs 24-hour HttpOnly, Secure, SameSite=Strict
session cookies. The server secrets are `PASSWORD_PEPPER`, `PASSWORD_VERIFIER`
and `SESSION_KEY`. No default password or client-side verifier exists.
Missing secrets or limiter binding fail closed. Login is limited to five attempts
per minute per Cloudflare location across this single-user site. This is not a
global distributed attack quota. Responses are private/no-store. Logout clears
the cookie and browser storage/cache. Rotating SESSION_KEY invalidates all sessions.

Deployment uses the existing Wrangler installation with a separate auth root:
`XDG_CONFIG_HOME=C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth`.
Required permissions include account/user read, Workers, Worker Scripts and
Routes write. The original Arcus CLI login remains untouched. Do not grant D1,
KV, Queues, AI or billing write permissions for this static site.

Run the Node and Python tests, then deploy with `wrangler deploy` from this repo.
Set the three secrets with `wrangler secret bulk` using an ignored private JSON
file. Never commit that file, log its contents, or put the password in a command
argument. `desktop/set-password.py` prompts privately and prepares the verifier
file; upload that file separately through Wrangler. Test unauthenticated direct
JS/HTML paths, incorrect and correct login, expiry and logout after deployment.

The GitHub Pages workflow publishes a redirect only. Source code may be public;
private financial data and secrets must never enter the repository or CI artifact.

## Data setup limits

Google captures 45 ETFs on its existing triggers. The rebuilt collector was
saved and run on 2026-10-07: all 45 sources, including FFLS, succeeded; original
issuer dates and FFLS's incomplete signed allocation were preserved.
WCLD and WTAI currently have manually downloaded issuer files dated
2026-10-05; automatic download was blocked. Their dates remain visible until updated.
UFO, TIME, GPT, KOID and WARP remain pending reliable weighted-source recovery.

The PC schedule runs at 09:30 SAST and sign-in. Its portfolio import makes one
read-only query to the existing Arcus notification database using the old local
CLI authorization. It never triggers the portfolio preparation/feed routes.
Store configuration only in `%LOCALAPPDATA%/ArcusAttribution/settings.json`.
No source credentials are copied into the new Cloudflare account or Google.

PC-off recovery is incomplete until the private Google archive is synced or
downloaded and `archiveFolder` points to that folder. The Google collector being
live does not by itself connect those files to the PC. Portfolio recovery is
limited to records already retained by Arcus (14-day opening records for EasyAI/GE,
current snapshot for all four); IBKR/Marlow daily PC-off history is not guaranteed.
