import { compare } from "./engine.mjs";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: compare(data.dataset, data.options) });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
