export function AppHeader() {
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
        <div className="flex items-center gap-1.5 rounded-full border border-bb-border bg-bb-surface px-3 py-1 text-xs text-bb-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-bb-green" />
          Session Active
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bb-surface text-xs font-medium text-bb-text">
          AP
        </div>
      </div>
    </header>
  );
}
