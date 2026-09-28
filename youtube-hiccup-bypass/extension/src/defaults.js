// Shared by bridge.js and the popup. page.js keeps its own copy: it runs in the page's world and can't load this.
const YTHB_DEFAULTS = Object.freeze({
  timerBoost: true,
  adFastForward: true,
  stallRecovery: true,
  dismissEnforcement: true,
});
