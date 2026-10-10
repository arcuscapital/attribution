# Attribution release rules

Keep this repository independent from Arcus Watchlists. Financial archives, credentials, OAuth config and private portfolios must not enter Git or static hosting. The production site must remain password protected; Arcus integration may use only server-verified access.

For each release record both repository URLs/branches/full commits, Cloudflare account/Worker/deployment version and UTC time, tests with evidence/limitations, and compatible authentication/configuration rollback. See `docs/ARCUS-INTEGRATION.md`. Deploy compatible Attribution changes before Arcus; rollback Arcus before Attribution. Preserve the existing desktop collector and calculation engine unless explicitly requested.
