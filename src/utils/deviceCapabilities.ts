/**
 * Detect low-power devices (mobile, WebView, small screens) at import time.
 * Device type doesn't change at runtime so a module-level constant suffices.
 */

function detectLowPower(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;

  // Mobile UA patterns (iPadOS 13+ reports as Macintosh, detect via touch)
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

  // WebView fingerprints (dApp browsers, in-app browsers)
  const webView =
    /wv|WebView/i.test(ua) ||
    /FBAN|FBAV|Instagram|Twitter|Line\//i.test(ua) ||
    // MetaMask, Trust, Coinbase, etc.
    /MetaMask|Trust\/|CoinbaseBrowser/i.test(ua) ||
    // iOS WKWebView (no Safari in UA but has AppleWebKit)
    (/AppleWebKit/i.test(ua) && !/Safari/i.test(ua));

  // Small touch screen (use screen dimensions — viewport can be resized)
  const screenW = window.screen?.width ?? window.innerWidth;
  const screenH = window.screen?.height ?? window.innerHeight;
  const smallScreen = screenW <= 768 || screenH <= 600;
  const touchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const smallTouch = smallScreen && touchScreen;

  // Low device pixel ratio (< 1 indicates a truly low-end device)
  const lowDPR = window.devicePixelRatio < 1;

  return mobileUA || isIPad || webView || smallTouch || (lowDPR && touchScreen);
}

export const IS_LOW_POWER: boolean = detectLowPower();
