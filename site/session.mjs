// Sessions stay in HttpOnly cookies. This module never reads a token.
export function createSessionGuard({fetcher = fetch, endpoint = './session', onLock = () => {}, onUnlock = () => {}} = {}) {
  let pending = null, generation = 0;
  const lock = () => { generation++; onLock(); };
  async function check() {
    if (pending) return pending;
    const current = generation;
    pending = (async () => {
      try {
        const response = await fetcher(endpoint, {credentials:'same-origin', cache:'no-store', redirect:'error'});
        if (response.status !== 204 || current !== generation) { lock(); return false; }
        onUnlock(); return true;
      } catch { lock(); return false; }
      finally { pending = null; }
    })();
    return pending;
  }
  return {check, lock};
}
