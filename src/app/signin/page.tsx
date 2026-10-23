export default function SignInPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-bb-bg px-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-bb-text bg-bb-panel p-10 text-center shadow-[-8px_8px_0_0_var(--bb-red)]">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-bb-red">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 16V7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9M3 16h11M3 16a2 2 0 1 0 4 0M14 16a2 2 0 1 0 4 0M14 10h4l3 3v3h-2"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="font-display bb-caps mb-3 text-4xl font-medium leading-[1.05] tracking-tight text-bb-text">
          BLACKBUCK PRD Builder
        </h1>
        <p className="bb-tagline bb-caps mb-8 text-sm text-bb-text-secondary">
          Sign-in is handled by Cloudflare Access.
        </p>

        <p className="text-xs text-bb-text-tertiary">
          If you can read this, the request reached the app without a valid Cloudflare Access session, or your
          account is not a @blackbuck.com address. Reload the page to sign in through your company login, then try
          again.
        </p>
      </div>
    </div>
  );
}
