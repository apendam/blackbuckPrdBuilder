/**
 * Full-screen splash shown for the first 3 seconds of every full page load.
 *
 * Deliberately a server component driven only by CSS animation (see
 * `#bb-splash` in globals.css): it is in the initial HTML, so it paints
 * before the app hydrates, and it needs no JS to dismiss itself. After 3s it
 * is `visibility: hidden; pointer-events: none`, so it never blocks the page.
 * Client-side navigations do not remount the root layout, so it does not
 * replay when moving between pages.
 */
export function SplashScreen() {
  return (
    <div id="bb-splash" aria-hidden="true">
      <div className="bb-splash-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/splash.webp"
          alt=""
          width={735}
          height={785}
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <p className="bb-splash-caption font-display lowercase">
        prd builder
        <span className="typing-dot">.</span>
        <span className="typing-dot">.</span>
        <span className="typing-dot">.</span>
      </p>
    </div>
  );
}
