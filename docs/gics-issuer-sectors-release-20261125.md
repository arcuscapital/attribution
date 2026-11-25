# GICS sectors for non-Arcus shares — 25 November 2026

Owner request (25 Nov, screenshot of IWV vs XLV, One Day): "when running iwv in portfolio analytics lots of gics unknows. see spreadsheet. update the website database … if we have other such gics problems for other etfs go and get that from the website holdings if possible, if not then let me know git deploy". Source file: the owner's iShares IWV holdings download (as of 24 Nov 2026, from the BlackRock IWV page).

Repository https://github.com/arcuscapital/attribution.git, branch `claude/gics-issuer-sectors` (worktree `C:\Users\Skrom\ArcusGicsIssuers`), starting commit `16e32d6` (live code `55f9489`, version c508e1f6). Application commit **`e2371b1c7f2fcfea6440b7bc580539d9fb8e83de`** (footer text + builder), builder follow-ups `1764eaa` and `75d2f11` (tools only, not deployed code).

Arcus Watchlists is unchanged. Its holdings DB (`arcus-etf-holdings`, account 42dd…) was only read (`SELECT`), never written. Everything written went to the Attribution account 5695cae2becf35e049eb5df3e2849ae2.

## What changed

- **Data (KV `gics:v1`, namespace `HOLDINGS_ARCHIVE` 98da8aed88f9416d84a9497daed06dc5)**: from 745 to **3,265** sectors. All 745 Bloomberg sectors are unchanged (checked key by key). Every value is one of the 11 GICS sector names. New sectors come from, in priority order:
  1. the owner's IWV file (2,568 equities keyed);
  2. issuer sectors already stored with the Arcus allocations: iShares MTUM, XT, VLUE, ARTY, BAI, SOXX, ITA, TEK, IWV; State Street MDY; Fundstrat GRNY; Tema WELD, CANC, LAZR, DISK ("Communication" read as Communication Services);
  3. sector SPDR membership (XLU, XLE, XLY, XLB, XLK, XLI, XLF, XLP, XLV, XLC listed holdings take the fund's sector);
  4. iShares files saved in the PA archive (IJR, IBB, IYK, IYT, Oct 2026);
  5. iShares IXUS (non-US, 23 Nov), IWC (US micro-cap, 24 Nov) and MCHI (China incl. A-shares, 23 Nov) `latest-holdings.csv` files, matched only to holdings still Unknown, by Yahoo symbol plus name check, or by company name. All 165 symbol matches and 92 name matches were reviewed by eye.
  No issuer disagreed with another, and no issuer disagreed with Bloomberg.
- Keys are what the page looks up: the verified listing (as the page resolves it, including PA saved-archive listings), the US ticker an iShares/SPDR identity resolves to (also the spaced form, e.g. `UHAL B`, until it is verified), and for a not-yet-verified foreign listing its exact row id (`fund:identity`, 71 keys), never a bare ticker that could be another company.
- Code: `site/app.mjs` GICS table footer now reads "GICS sectors from Bloomberg for the Arcus share list and from the funds' own holdings files (iShares, State Street) for other shares (date)". Cache key `app.mjs?v=gics-20261125`. No engine, auth, bridge, secret or schedule change.
- `tools/gics-from-issuers.mjs`: rebuilds the map and prints Unknown GICS per fund before and after, using this checkout's own `arcus-source.mjs` and `rise-swix-core.mjs`. Its inputs (KV/D1 exports, issuer CSVs) stay outside Git; the header lists the commands.

## Deployment (account 5695cae2becf35e049eb5df3e2849ae2)

| Time (UTC) | What | ID | Replaces (rollback) |
|---|---|---|---|
| 2026-11-25T10:38:47Z | KV `gics:v1` first write (3,256) | — | `C:\Users\Skrom\ArcusAttributionBackups\gics-v1-before-20261125.json` (745) |
| 2026-11-25T10:39:15Z | Worker **0d6f44ae-5569-4642-9edf-8c0edf535b82**, deployment 04eeb8b9-880a-40ab-bd6c-5a3b60feacd4, tag e2371b1 | | c508e1f6-ea20-4184-a648-e75260ee967f |
| 2026-11-25T10:42:28Z | KV `gics:v1` second write (3,260: OPCH, `UHAL B`, `LEN B`, `GEF B`) | — | same backup |
| 2026-11-25T10:46:49Z | KV `gics:v1` final write (**3,265**: archive listings as the page sees them; borrowed bare symbols dropped) | — | same backup |

`deployments status` confirmed c508e1f6 was still live just before deploying; the KV value was compared byte for byte with what had been read before each write. Final map copy: `C:\Users\Skrom\ArcusAttributionBackups\gics-v1-20261125-issuers.json`.

## Tests and limits

- `node --test tests/*.test.mjs` **251/251**; `python -m unittest discover -s tests -p 'test_*.py'` **21/21 OK**. No new automated test (the change is data plus one sentence). The builder was checked by its own report: Bloomberg values unchanged, all values GICS, look-alike ticker matches listed (5 left, all the same company in a different spelling: WLY, NHI, WAB, JBHT, AOS).
- **Live, owner's signed-in Brave (Brave 158), fresh tab, `app.mjs?v=gics-20261125`:** IWV vs XLV, One Day 24 Nov, USD, Grouping GICS sector: Unknown GICS **0.21 % IWV / 0.15 % XLV**, only cash, money market, collateral, futures and the CONTRA Hologic right (was 28.5 % of IWV). Footer shows the new text. ROBO vs QQQ One Day: Unknown GICS **1.88 %** (Optex, Stratasys, Estun, cash), was about 51 %. Owner's saved selection restored (IWV vs XLV, USD, One Day, No grouping).
- The before/after figures below come from the builder, using the Arcus allocations as of 19–24 Nov and the PA archive (Oct 2026) for funds without one. Portfolios (IBKR, Marlow, EasyAI, EasyGE) use the Oct archive, and JSE sectors still come from the Rise vs Swix report on the page. Desktop only; no Android emulator or phone test.

## Still Unknown, and why

- **Not companies** (Unknown is correct): cash, money-market funds (FGXXX, SALXX, XTSLA), futures, CONTRA/CVR rights, ETFs held inside funds (SQQQ, ARK Bitcoin holdco, Sprott Physical Uranium), private holdings (Anthropic, Shield AI, Securitize, Anthropic SPV in LAZR).
- **No issuer file with GICS found**: Chinese A-share and Korean small caps outside MSCI (BOTT 52 %, KOID 14 %, HUMN 12.5 %, EART, BOTZ, LIT), Kazatomprom GDR, some US-listed foreign names (Icon ICLR, Silicon Motion SIMO, Stratasys SSYS, Leonardo FINMY, Vertical Aerospace EVTL, Hawkeye 360). These need Bloomberg sectors from the owner (add rows to the sheet, or paste ticker → sector).
- **Feed problems, not GICS**: NITE rows arrive with ticker "COMMON STOCKS" and cut names (SpaceX, MGM, AMD), so they never resolve (18.9 % of NITE). Global X rows with ticker "Equity" (SHLD/AIQ Thales, Dassault Aviation, Kraken) are the same kind of parse issue.
- **Wrong saved listings in the PA archive (pre-existing, affects returns too)**: IGPT NEXTDC → `NXT` (Nextpower), Nemetschek → `NEM` (Newmont), Dassault Systèmes → `DSY` (a different US company), Hexagon/Halma/Inficon/Keppel DC → bare `HEXAB`/`HLMA`/`IFCN`/`KDCREIT`; ARKX Airbus → `AIR` (AAR), Thales → `HO`; ARKF Adyen → `ADYEN`. The page reuses these listings, so NEXTDC shows Nextpower's sector and return and Nemetschek shows Newmont's. Their row ids carry the correct sector, ready for when the listings are fixed. Not changed in this release.
- **PA reads two company names as non-listed**: OPTION CARE HEALTH (the word "option" → Derivative) and CVR ENERGY ("CVR" → Corporate action). They now show under Health Care / Energy, but their return is still counted as 0 %. Not changed in this release.

## Rollback

Code (footer text only):
```powershell
cd C:\Users\Skrom\ArcusGicsIssuers
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx wrangler@4.129.0 rollback c508e1f6-ea20-4184-a648-e75260ee967f --config wrangler.jsonc
npx wrangler@4.129.0 deployments status --config wrangler.jsonc
```
Data (back to the 745 Bloomberg sectors; no deploy needed, either code version reads either map):
```powershell
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx --yes wrangler@4.129.0 kv key put gics:v1 --path C:\Users\Skrom\ArcusAttributionBackups\gics-v1-before-20261125.json --namespace-id 98da8aed88f9416d84a9497daed06dc5 --remote
```
Roll back the data before (or with) the code if the footer's "issuer files" wording must not appear without the issuer sectors.

## Unknown GICS per fund, listed holdings only (% of fund)

| Fund | Holdings used | Unknown before (%) | Unknown after (%) | Biggest left |
|---|---|---|---|---|
| BOTT | Arcus 2026-11-24 | 70.2 | 52.1 | 603666 C1(603666.SS) Yijiahe Technology Co Ltd 5.53%; 688165 C1(688165.SS) EFORT Intelligent Robot Co Ltd 5.52%; 199430 KS(199430.KS) KNR Systems Inc 4.91% |
| NITE | Arcus 2026-11-23 | 35.9 | 18.9 | COMMON STOCKS SPACE EXPLORAT-A 10.61%; COMMON STOCKS MGM RESORTS INTE 4.21%; COMMON STOCKS ADV MICRO DEVICE 4.10% |
| URA | PA archive 2026-10-27 | 79.8 | 16.3 | U-U CN(U-U.TO) SPROTT PHYSICAL URANIUM TR 7.83%; KAP LI NAC KAZATOMPROM JSC-GDR REGS 4.83%; BMN AU(BMN.AX) BANNERMAN ENERGY LTD 0.53% |
| EART | PA archive 2026-10-06 | 83.6 | 14.4 | GMEXICOB MM GRUPO MEXICO SAB DE CV-SER B 5.27%; 600392 C1(600392.SS) SHENGHE RESOURCES HOLDINGS-A 1.88%; 600497 C1(600497.SS) YUNNAN CHIHONG ZINC & GERM-A 1.42% |
| KOID | Arcus 2026-11-23 | 46.1 | 14.1 | 688836 UNITREE ROBOTICS (YUSHU TECHNOLOGY CO LTD-A) 3.40%; HEXAB HEXAGON AB-B SHS 2.26%; 603662(603662.SS) KELI SENSING TECHNOLOGY NI-A 2.24% |
| JEDI | Arcus 2026-11-24 | 40.1 | 12.8 | SHIELDAI Shield Ai Ii -ic Llc 8.39%; EVTL Vertical Aerospace Ltd 2.90%; CHRT LN(CHRT.L) Cohort Plc 0.76% |
| HUMN | PA archive 2026-10-28 | 41.0 | 12.5 | CCXI Churchill Capital Corp XI 3.94%; 2692 HK(2692.HK) Shenzhen Zhaowei Machinery & Electronic Co Ltd 2.26%; 002979 C2(002979.SZ) China Leadshine Technology Co Ltd 2.17% |
| LAZR | Arcus 2026-11-23 | 32.5 | 11.1 | ANTHROPIC SPV ANTHROPIC SPV EXPOSURE 11.12% |
| TIME | Arcus 2026-11-19 | 27.2 | 9.4 | FGXXX First American Government Obligs X 5.24%; SQQQ ProShares UltraPro Short QQQ 3.14%; ICLR Icon PLC 0.99% |
| ARKF | Arcus 2026-11-24 | 15.6 | 7.2 | Equity ARK BITCOIN ETF HOLDCO (ARKF) 2.57%; ADYEN ADYEN NV 1.90%; SECZ SECURITIZE CORP 1.22% |
| BOTZ | PA archive 2026-10-27 | 36.4 | 6.1 | 688169 C1(688169.SS) BEIJING ROBOROCK TECHNOLOG-A 0.58%; 688297 C1(688297.SS) AVIC CHENGDU UAS CO LTD-A 0.55%; 002747 C2(002747.SZ) ESTUN AUTOMATION CO LTD-A 0.47% |
| FINX | PA archive 2026-10-06 | 50.9 | 5.4 | HUT CN(HUT.TO) HUT 8 CORP 1.86%; PAYP PAYPAY CORP 1.77%; ZIP AU(ZIP.AX) ZIP CO LTD 0.34% |
| ARKG | Arcus 2026-11-24 | 37.2 | 5.1 | ALMR ALAMAR BIOSCIENCES INC 1.84%; IAM IAMBIC THERAPEUTICS INC 1.43%; FRNM FREENOME INC 0.98% |
| CHAT | Arcus 2026-11-24 | 19.8 | 4.6 | ANT Anthropic PBC 3.52%; KRW SOUTH KOREA WON 1.07%; CNY CHINESE YUAN 0.01% |
| LOUP | Arcus 2026-11-24 | 19.6 | 4.4 | SIMO Silicon Motion Technology Corp 4.36% |
| ARKW | Arcus 2026-10-06 | 17.5 | 4.1 | Equity ARK BITCOIN ETF HOLDCO (ARKW) 3.41%; ETHQ/U 3IQ ETHER STAKING ETF 0.42%; SOLQ/U 3IQ SOLANA STAKING ETF 0.25% |
| UFO | Arcus 2026-11-24 | 66.9 | 3.6 | HAWK Hawkeye 360 Inc 1.05%; TSAT Telesat Corp 0.45%; FTC LN(FTC.L) Filtronic PLC 0.38% |
| QTUM | Arcus 2026-11-24 | 41.8 | 3.6 | HQ Horizon Quantum Holdings Ltd 1.29%; ARQQ Arqit Quantum Inc 1.28%; BTQ Btq Technologies Corp 0.42% |
| FFND | Arcus 2026-11-23 | 38.7 | 3.5 | LSEGY US(LSEGY) LONDON STOCK EX 0.96%; FMX US(FMX) FOMENTO ECON-ADR 0.88%; GALDY US(GALDY) GALDERMA GR-ADR 0.86% |
| AIS | Arcus 2026-11-24 | 22.4 | 3.0 | SIMO Silicon Motion Technology Corp 2.35%; 000977 C2(000977.SZ) IEIT Systems Co Ltd 0.69%; CNY CHINESE YUAN 0.00% |
| LIT | PA archive 2026-10-27 | 80.9 | 2.8 | 300450 C2(300450.SZ) WUXI LEAD INTELLIGENT EQUI-A 1.70%; 002176 C2(002176.SZ) JIANGXI SPECIAL ELECTRIC -A 0.58%; LAR CN(LAR.TO) LITHIUM ARGENTINA AG 0.23% |
| WARP | Arcus 2026-11-23 | 66.7 | 2.7 | HAWK Hawkeye 360 Inc 2.74% |
| ARKX | Arcus 2026-11-24 | 21.9 | 2.5 | HO THALES SA 1.87%; ANT ANTHROPIC PBC-CL A 0.66% |
| ARKQ | Arcus 2026-11-24 | 16.7 | 2.3 | ANT ANTHROPIC PBC-CL A 0.94%; WRD WERIDE INC-ADR 0.81%; KDK KODIAK AI INC 0.54% |
| ARKK | Arcus 2026-11-24 | 20.1 | 2.1 | ANT ANTHROPIC PBC-CL A 1.17%; ARKY ARK ACTIVE AUTOCALL INC ETF 0.98% |
| GPT | Arcus 2026-11-19 | 22.4 | 1.7 | FINMY Leonardo SpA ADR 1.25%; FGXXX First American Government Obligs X 0.42% |
| ROBO | Arcus 2026-11-23 | 51.0 | 1.6 | 6914 JP(6914.T) OPTEX GROUP COMPANY LTD 0.71%; SSYS STRATASYS LTD 0.47%; 002747 C2(002747.SZ) ESTUN AUTOMATION CO LTD. 0.41% |
| WCLD | PA archive 2026-10-05 | 1.5 | 1.5 | WEAV US(WEAV) Weave CommunicationsInc 1.50% |
| PAVE | PA archive 2026-10-27 | 56.0 | 1.4 | AMRZ AMRIZE LTD 1.37% |
| IJR | PA archive 2026-10-26 | 86.1 | 1.3 | XTSLA BLK CSH FND TREASURY SL AGENCY 1.27% |
| IGPT | Arcus 2026-11-23 | 26.8 | 1.2 | HEXAB Hexagon AB 0.37%; DSY Dassault Systemes SE 0.36%; HLMA Halma PLC 0.25% |
| JHAI | Arcus 2026-11-23 | 3.5 | 1.2 | ANT US(ANT) Anthropic, PBC Class A 1.18% |
| KRE | PA archive 2026-10-26 | 95.6 | 1.2 | TCBI TEXAS CAPITAL BANCSHARES INC 1.16% |
| AIQ | Arcus 2026-11-19 | 24.1 | 1.0 | ERIC Telefonaktiebolaget L M Ericsson ADR 0.35%; Equity Amplifon SpA Az nom Post Frazionamento 0.32%; 0100.HK MiniMax Group Inc Ordinary Shares - Class A 0.18% |
| LRNZ | Arcus 2026-10-01 | 13.7 | 0.9 | SALXX STATE STREET INST U.S. GOVERNMENT MMKT ADMN CLASS 0.93% |
| IBKR | PA archive 2026-10-06 | 6.1 | 0.9 | CANC TEMA ONCOLOGY ETF 0.92% |
| MDY | Arcus 2026-11-23 | 72.5 | 0.8 | CASH_USD U.S. Dollar 0.84% |
| AIRR | PA archive 2026-10-26 | 62.0 | 0.6 | AADX Applied Aerospace & Defense, Inc. 0.60% |
| SHLD | Arcus 2026-11-19 | 51.3 | 0.4 | CSG.AS CSG NV 0.26%; Equity Kraken Robotics Inc 0.10%; Equity Equity Long/Short 0.03% |
| IYK | PA archive 2026-10-26 | 46.9 | 0.4 | BF B BROWN FORMAN CLASS B 0.17%; XTSLA BLK CSH FND TREASURY SL AGENCY 0.15%; BF A BROWN FORMAN CLASS A 0.06% |
| EASYGE | PA archive 2026-10-07 | 0.3 | 0.3 | PNG.V KRAKEN ROBOTICS INC 0.31% |
| FCTE | Arcus 2026-11-23 | 50.2 | 0.1 | N/A CASH AND CASH EQUIVALENTS 0.13% |
| IBB | PA archive 2026-10-27 | 57.7 | 0.1 | XTSLA BLK CSH FND TREASURY SL AGENCY 0.12%; CRGX CARGO THERAPEUTICS INC 0.00% |
| IYT | PA archive 2026-10-27 | 78.1 | 0.1 | XTSLA BLK CSH FND TREASURY SL AGENCY 0.05% |
| VONE | Arcus 2026-10-31 | 26.7 | 0.0 | ROKU Roku Inc 0.03%; UWMC-R-W UWM HOLDINGS CORP-RT 0.00% |
| IVEP | Arcus 2026-11-20 | 20.1 | 0.0 | Equity Cash 0.01% |
| XLF | Arcus 2026-11-23 | 41.5 | 0.0 | - POUND STERLING 0.00% |
| VOO | Arcus 2026-10-31 | 23.9 | 0.0 | SKYD/WS SKYDANCE CORP - 31 0.00% |
| QQQ | Arcus 2026-11-23 | 15.7 | 0.0 |  |
| MTUM | Arcus 2026-11-23 | 18.7 | 0.0 |  |
| XLU | Arcus 2026-11-23 | 54.9 | 0.0 |  |
| IWV | Arcus 2026-11-23 | 28.5 | 0.0 | P5N994 Petrocorp Inc Escrow 0.00%; - COHERUS ONCOLOGY INC 0.00%; - VERDERA ENERGY CORP. CONTRA RESTRI 0.00% |
| SLYV | Arcus 2026-11-23 | 88.4 | 0.0 |  |
| XLE | Arcus 2026-11-23 | 12.2 | 0.0 |  |
| XLY | Arcus 2026-11-23 | 28.7 | 0.0 |  |
| XLB | Arcus 2026-11-23 | 49.0 | 0.0 |  |
| XLK | Arcus 2026-11-23 | 7.7 | 0.0 |  |
| XLI | Arcus 2026-11-23 | 42.7 | 0.0 |  |
| XLP | Arcus 2026-11-23 | 51.0 | 0.0 |  |
| XLV | Arcus 2026-11-23 | 36.2 | 0.0 |  |
| RSP | Arcus 2026-11-23 | 60.0 | 0.0 | 2602335D TPG Inc 0.00%; Uninvestible Cash SECURITIES LENDING - BNYM 0.00% |
| XLC | Arcus 2026-11-23 | 35.7 | 0.0 |  |
| QQEW | Arcus 2026-11-23 | 17.7 | 0.0 |  |
| XT | Arcus 2026-11-23 | 38.1 | 0.0 |  |
| VLUE | Arcus 2026-11-23 | 45.3 | 0.0 |  |
| ARTY | Arcus 2026-11-23 | 32.6 | 0.0 |  |
| ROKT | Arcus 2026-11-23 | 35.1 | 0.0 |  |
| THNQ | Arcus 2026-11-23 | 19.5 | 0.0 |  |
| WELD | Arcus 2026-11-23 | 44.6 | 0.0 |  |
| WTAI | Arcus 2026-11-20 | 16.9 | 0.0 |  |
| CANC | Arcus 2026-11-23 | 83.0 | 0.0 |  |
| BAI | Arcus 2026-11-23 | 17.3 | 0.0 |  |
| GRNY | Arcus 2026-11-24 | 15.2 | 0.0 |  |
| IVES | Arcus 2026-11-20 | 16.1 | 0.0 | Equity Cash 0.00% |
| DISK | Arcus 2026-11-23 | 31.1 | 0.0 |  |
| SOXX | Arcus 2026-11-23 | 10.7 | 0.0 |  |
| ITA | Arcus 2026-11-23 | 19.2 | 0.0 |  |
| TEK | Arcus 2026-11-23 | 12.8 | 0.0 |  |
| EASYAI | PA archive 2026-10-07 | 1.1 | 0.0 |  |
| MARLOW | PA archive 2026-10-06 | 0.0 | 0.0 |  |
| XBI | PA archive 2026-10-26 | 80.8 | 0.0 | 2200963D OMNIAB INC 12.5 EARNOUT 0.00%; 2200964D OMNIAB INC 15.00 EARNOUT 0.00% |
| FFLS | PA archive 2026-10-06 | 12.4 | -2.5 | ARCC US(ARCC) ARES CAPITAL COR -2.45% |