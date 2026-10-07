/** Arcus Attribution: private dated issuer archives. No Arcus/Cloudflare calls. */
const FUNDS = {
  BAI: {
    kind: "ishares",
    url: "https://www.ishares.com/us/products/339081/ishares-a-i-innovation-and-tech-active-etf/latest-holdings.csv",
  },
  ARKK: {
    kind: "ark",
    url: "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv",
  },
};

function setup() {
  // Only schedules this project's named collector, never touches other triggers.
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty("ARCHIVE_FOLDER_ID")) {
    const folder = DriveApp.createFolder("Arcus Attribution Archive");
    p.setProperty("ARCHIVE_FOLDER_ID", folder.getId());
  }
  collectHoldings();
  const existing = ScriptApp.getProjectTriggers().filter(
    (t) => t.getHandlerFunction() === "collectHoldings",
  );
  if (!existing.length) {
    [7, 13, 23].forEach((hour) =>
      ScriptApp.newTrigger("collectHoldings")
        .timeBased()
        .atHour(hour)
        .everyDays(1)
        .inTimezone("Africa/Johannesburg")
        .create(),
    );
  }
  console.log(
    "Archive: https://drive.google.com/drive/folders/" +
      p.getProperty("ARCHIVE_FOLDER_ID"),
  );
}

function collectHoldings() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const p = PropertiesService.getScriptProperties();
    const root = DriveApp.getFolderById(p.getProperty("ARCHIVE_FOLDER_ID"));
    const results = [];
    Object.keys(FUNDS).forEach((fund) => {
      try {
        const response = UrlFetchApp.fetch(FUNDS[fund].url, {
          muteHttpExceptions: true,
          followRedirects: true,
        });
        if (response.getResponseCode() !== 200)
          throw new Error("HTTP " + response.getResponseCode());
        const raw = response.getContentText("UTF-8").replace(/^\uFEFF/, "");
        const rows = Utilities.parseCsv(raw.replace(/\r\r\n/g, "\n"));
        const info = validateSnapshot(fund, rows);
        const bytes = Utilities.computeDigest(
          Utilities.DigestAlgorithm.SHA_256,
          raw,
          Utilities.Charset.UTF_8,
        );
        const hash = bytes
          .map((b) => ("0" + ((b + 256) % 256).toString(16)).slice(-2))
          .join("");
        const stem = fund + "_" + info.asOf + "_" + hash.slice(0, 16);
        const timestamp = new Date().toISOString();
        const meta = {
          schemaVersion: 1,
          fund,
          asOf: info.asOf,
          capturedAt: timestamp,
          source: FUNDS[fund].url,
          sha256: hash,
          rows: info.count,
          weightPercent: info.weightPercent,
          dateMeaning: "Issuer-reported date; do not substitute download date.",
        };
        // Deterministic filenames make retries idempotent. A corrected file gets a new hash.
        if (!root.getFilesByName(stem + ".csv").hasNext())
          root.createFile(stem + ".csv", raw, MimeType.CSV);
        if (!root.getFilesByName(stem + ".json").hasNext())
          root.createFile(
            stem + ".json",
            JSON.stringify(meta),
            MimeType.PLAIN_TEXT,
          );
        results.push({
          fund,
          ok: true,
          asOf: info.asOf,
          rows: info.count,
          weightPercent: info.weightPercent,
        });
      } catch (e) {
        results.push({ fund, ok: false, error: String(e.message || e) });
      }
    });
    const health = JSON.stringify(
      { schemaVersion: 1, checkedAt: new Date().toISOString(), results },
      null,
      2,
    );
    const status = root.getFilesByName("collector-status.json");
    if (status.hasNext()) status.next().setContent(health);
    else root.createFile("collector-status.json", health, MimeType.PLAIN_TEXT);
    console.log(health);
    if (results.some((r) => !r.ok))
      throw new Error(
        "Collection incomplete; see collector-status.json. Existing snapshots preserved.",
      );
  } finally {
    lock.releaseLock();
  }
}

function validateSnapshot(fund, rows) {
  const iso = (value) => {
    const str = String(value).replace(/"/g, "").trim();
    let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match)
      return (
        match[3] +
        "-" +
        ("0" + match[1]).slice(-2) +
        "-" +
        ("0" + match[2]).slice(-2)
      );
    match = str.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    if (match && months.indexOf(match[1]) >= 0)
      return (
        match[3] +
        "-" +
        ("0" + (months.indexOf(match[1]) + 1)).slice(-2) +
        "-" +
        ("0" + match[2]).slice(-2)
      );
    throw new Error("Unrecognised holdings date: " + str);
  };
  let asOf, header, body;
  if (FUNDS[fund].kind === "ishares") {
    const dateRow = rows.find((r) => r[0] === "Fund Holdings as of");
    if (!dateRow) throw new Error("Missing issuer holdings date");
    asOf = iso(dateRow[1]);
    const start = rows.findIndex(
      (r) => r[0] === "Ticker" && r.includes("Weight (%)"),
    );
    if (start < 0) throw new Error("Missing holdings columns");
    header = rows[start];
    body = rows
      .slice(start + 1)
      .filter(
        (r) => r.length === header.length && r[1] && r[5] && r[5] !== "-",
      );
  } else {
    header = rows[0];
    body = rows.slice(1).filter((r) => r[1] === fund);
    const dates = [...new Set(body.map((r) => iso(r[0])))];
    if (dates.length !== 1) throw new Error("Missing or mixed holdings dates");
    asOf = dates[0];
  }
  const wi = header.findIndex((h) => h.toLowerCase() === "weight (%)");
  if (wi < 0 || body.length < 5) throw new Error("Incomplete holdings file");
  const values = body.map((r) => Number(String(r[wi]).replace(/[%,]/g, "")));
  if (values.some((v) => !Number.isFinite(v)))
    throw new Error("Invalid weight");
  const weightPercent = values.reduce((a, b) => a + b, 0);
  if (weightPercent < 98 || weightPercent > 102)
    throw new Error("Unexpected total weight: " + weightPercent);
  if (new Date(asOf + "T00:00:00Z").getTime() > Date.now() + 86400000)
    throw new Error("Future holdings date");
  return { asOf, count: body.length, weightPercent };
}

function showStatus() {
  const id =
    PropertiesService.getScriptProperties().getProperty("ARCHIVE_FOLDER_ID");
  console.log(
    id ? "https://drive.google.com/drive/folders/" + id : "Run setup first",
  );
}
