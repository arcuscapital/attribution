import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import crypto from "node:crypto";
const source = fs.readFileSync(
  new URL("../collector/Code.gs", import.meta.url),
  "utf8",
);
function rows() {
  return [
    [
      "date",
      "fund",
      "company",
      "ticker",
      "cusip",
      "shares",
      "market value ($)",
      "weight (%)",
    ],
    ...Array.from({ length: 5 }, (_, i) => [
      "10/01/2026",
      "ARKK",
      "Name " + i,
      i === 4 ? "" : "ABC" + i,
      "ID" + i,
      "5",
      "50",
      "20%",
    ]),
  ];
}
test("Google parser preserves a dated snapshot with a private holding", () => {
  const context = vm.createContext({ Date, console });
  vm.runInContext(source, context);
  const r = context.validateSnapshot("ARKK", rows());
  assert.equal(r.asOf, "2026-10-01");
  assert.equal(r.count, 5);
  assert.equal(r.weightPercent, 100);
});
test("Google parser rejects mixed dates and incomplete weights", () => {
  const c = vm.createContext({ Date, console });
  vm.runInContext(source, c);
  let r = rows();
  r[1][0] = "10/02/2026";
  assert.throws(() => c.validateSnapshot("ARKK", r));
  r = rows();
  r[1][7] = "1%";
  assert.throws(() => c.validateSnapshot("ARKK", r));
});
test("10 cloud retries archive one copy and retain later same-date revisions", () => {
  const files = new Map(),
    properties = new Map([["ARCHIVE_FOLDER_ID", "test"]]);
  let rowData = rows(),
    raw = JSON.stringify(rowData),
    fetches = 0;
  const folder = {
    getFilesByName(name) {
      return {
        hasNext: () => files.has(name),
        next: () => ({ setContent: (value) => files.set(name, value) }),
      };
    },
    createFile(name, body) {
      files.set(name, body);
    },
  };
  const context = vm.createContext({
    Date,
    console: { log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key),
        setProperty: (key,value) => properties.set(key,value),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }),
    },
    DriveApp: { getFolderById: () => folder },
    MimeType: { CSV: "csv", PLAIN_TEXT: "text" },
    UrlFetchApp: {
      fetch(url) {
        fetches++;
        if (url.includes("ishares")) return { getResponseCode: () => 503 };
        return { getResponseCode: () => 200, getContentText: () => raw };
      },
    },
    Utilities: {
      parseCsv: () => rowData,
      computeDigest: (_, s) => [
        ...crypto.createHash("sha256").update(s).digest(),
      ],
      DigestAlgorithm: { SHA_256: 1 },
      Charset: { UTF_8: 1 },
    },
  });
  vm.runInContext(source, context);
  for (let i = 0; i < 10; i++)
    assert.throws(() => context.collectHoldings(), /incomplete/);
  assert.equal([...files.keys()].filter((k) => k.endsWith(".csv")).length, 1);
  assert.equal(fetches, 20);
  rowData = rows();
  rowData[1][2] = "Revised name";
  raw = JSON.stringify(rowData);
  assert.throws(() => context.collectHoldings());
  assert.equal([...files.keys()].filter((k) => k.endsWith(".csv")).length, 2);
  const health = JSON.parse(files.get("collector-status.json"));
  assert.equal(health.results[0].ok, false);
  assert.equal(health.results[1].ok, true);
});
