import { compare, returnSeries } from "./engine.mjs?v=themes-20261113";
self.onmessage = ({ data }) => {
  try {
    const result = compare(data.dataset, data.options);
    // The chart under the table; a chart problem never blocks the comparison itself.
    try { if (["complete", "partial"].includes(result.status)) result.series = returnSeries(data.dataset, result, data.options); } catch { result.series = null; }
    self.postMessage({ ok: true, result });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
