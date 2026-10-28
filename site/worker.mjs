import { compare } from "./engine.mjs?v=missing-recovery-20261028";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: compare(data.dataset, data.options) });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
