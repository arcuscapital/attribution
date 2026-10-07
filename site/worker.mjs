import { compare } from "./engine.mjs?v=research-20261007";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ ok: true, result: compare(data.dataset, data.options) });
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
};
