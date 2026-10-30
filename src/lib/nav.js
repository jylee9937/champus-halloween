// Mirrors forward screen changes onto browser history so the phone's back gesture steps back
// inside the app instead of leaving the page (and losing the answers held in memory).
// Coupling is deliberately loose: the app decides whether a back step is allowed; history only reports it.

export function createHistoryNav(onBack) {
  const depthOf = state => (Number.isInteger(state?.d) ? state.d : 0);
  let depth = depthOf(history.state);
  history.replaceState({ d: depth }, '');

  addEventListener('popstate', e => {
    const d = depthOf(e.state);
    const wentBack = d < depth;
    depth = d;
    if (wentBack) onBack();
  });

  return {
    push() {
      history.pushState({ d: ++depth }, '');
    },
    back() {
      if (depth > 0) history.back();
      else onBack();
    },
  };
}
