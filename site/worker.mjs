import { compare } from "./engine.mjs?v=weighted-excel-20261014";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: compare(data.dataset, data.options) });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
