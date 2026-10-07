// Local synthetic data only. Never included in the deployed site.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const ids = ["TEST-A", "TEST-B"];
const dataset = {
  manifest: {
    schemaVersion: 1,
    generatedAt: "2026-10-07T08:00:00Z",
    months: ["2026-10"],
    funds: ids.map((id) => ({
      id,
      name: "Synthetic QA fund",
      dates: ["2026-10-01", "2026-10-02"],
      latest: "2026-10-02",
      positions: 2,
    })),
  },
  snapshots: [],
  levels: [],
};
for (const asOf of ["2026-10-01", "2026-10-02"])
  for (const fund of ids)
    dataset.snapshots.push({
      fund,
      asOf,
      positions: [
        {
          id: "X",
          ticker: "X",
          name: "Synthetic technology stock",
          sector: "Technology",
          weight: fund === "TEST-A" ? 0.6 : 0.5,
        },
        {
          id: "Y",
          ticker: "Y",
          name: "Synthetic health stock",
          sector: "Health",
          weight: fund === "TEST-A" ? 0.4 : 0.5,
        },
      ],
    });
for (const [id, values] of Object.entries({
  X: [100, 110, 99],
  Y: [100, 100, 110],
  "TEST-A": [100, 106, 103.88],
  "TEST-B": [100, 105, 105],
  "USDZAR=X": [17, 17.17, 17.34],
}))
  ["2026-10-01", "2026-10-02", "2026-10-05"].forEach((date, i) =>
    dataset.levels.push({
      id,
      date,
      value: values[i],
      currency: id === "USDZAR=X" ? "ZAR" : "USD",
      basis: id === "USDZAR=X" ? "fx" : "verified-total-return",
    }),
  );
const location = path.join(
  os.tmpdir(),
  "arcus-attribution-synthetic-test.json",
);
fs.writeFileSync(location, JSON.stringify(dataset));
console.log(location);
