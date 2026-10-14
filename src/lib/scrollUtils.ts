export interface ScrollToTopOptions {
  smooth?: boolean;
}

/**
 * Checks if the user has requested reduced motion in their OS or browser settings.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smoothly (or instantly, when reduced motion is preferred) scrolls the active
 * scroll container to top: 0.
 *
 * Handles:
 * 1. Mobile Safari / iOS PWA / Android Chrome (`window`, `document.documentElement`, `document.body`)
 * 2. Desktop layouts where `<main id="main-content">` has `overflow-y-auto`
 * 3. Graceful degradation in SSR/test environments or older webviews
 */
export function scrollToTop(options: ScrollToTopOptions = {}) {
  if (typeof window === 'undefined') return;

  const reducedMotion = isReducedMotionPreferred();
  const behavior: ScrollBehavior = (options.smooth ?? true) && !reducedMotion ? 'smooth' : 'auto';

  // 1. Primary mobile / viewport window scroll
  try {
    window.scrollTo({ top: 0, behavior });
  } catch {
    // Fallback for older engines that don't support ScrollToOptions object
    try {
      window.scrollTo(0, 0);
    } catch {
      // no-op in headless/mock environments
    }
  }

  // 2. documentElement & document.body fallbacks (certain webviews / older iOS containers)
  if (typeof document !== 'undefined') {
    if (document.documentElement && document.documentElement.scrollTop > 0) {
      try {
        document.documentElement.scrollTo({ top: 0, behavior });
      } catch {
        document.documentElement.scrollTop = 0;
      }
    }

    if (document.body && document.body.scrollTop > 0) {
      try {
        document.body.scrollTo({ top: 0, behavior });
      } catch {
        document.body.scrollTop = 0;
      }
    }

    // 3. Desktop / container scroll element (<main id="main-content">)
    const mainEl = document.getElementById('main-content') || document.querySelector('main');
    if (mainEl && mainEl.scrollTop > 0) {
      try {
        mainEl.scrollTo({ top: 0, behavior });
      } catch {
        mainEl.scrollTop = 0;
      }
    }
  }
}
