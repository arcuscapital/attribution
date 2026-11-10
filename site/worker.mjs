import { compare } from "./engine.mjs?v=reconciliation2-20261110";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: compare(data.dataset, data.options) });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
