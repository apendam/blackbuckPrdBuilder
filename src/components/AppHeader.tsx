"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AppHeader({
  userName,
  userEmail,
  onRefreshClick,
  signOutAction,
}: {
  userName?: string | null;
  userEmail?: string | null;
  onRefreshClick?: () => void;
  signOutAction: () => Promise<void>;
}) {
  const initials =
    (userName ?? userEmail ?? "?")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-to-toggle, not hover -- a hover menu closes the instant the
  // cursor crosses the gap between the avatar and the dropdown on its way
  // to an item, which is exactly the "options disappear" bug this replaces.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const menuItemClass =
    "block w-full rounded-md px-2 py-1.5 text-left text-xs text-bb-text hover:bg-bb-surface";

  return (
    <header className="flex h-16 items-center justify-between border-b border-bb-red-dim bg-bb-bg px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-bb-red text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3 16V7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9M3 16h11M3 16a2 2 0 1 0 4 0M14 16a2 2 0 1 0 4 0M14 10h4l3 3v3h-2"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-wide text-bb-text">BLACKBUCK</span>
          <span className="text-sm text-bb-text-secondary">PRD Builder</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onRefreshClick && (
          <button
            onClick={onRefreshClick}
            className="flex items-center gap-1.5 rounded-full border border-bb-border bg-bb-surface px-3 py-1.5 text-xs text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12a9 9 0 0 1 15.4-6.4M21 12a9 9 0 0 1-15.4 6.4M3 4v5h5M21 20v-5h-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Refresh repos
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-bb-surface text-xs font-medium text-bb-text hover:ring-2 hover:ring-bb-border"
          >
            {initials}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-10 w-48 rounded-md border border-bb-border bg-bb-panel p-2 shadow-lg">
              <div className="mb-2 truncate px-2 text-xs text-bb-text-secondary">{userEmail}</div>
              <Link href="/knowledge-base" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                Knowledge Base
              </Link>
              <Link href="/cost-dashboard" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                Cost
              </Link>
              <Link href="/settings" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                Settings
              </Link>
              <div className="my-1 border-t border-bb-border" />
              <form action={signOutAction}>
                <button className={menuItemClass}>Sign out</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
