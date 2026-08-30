import { signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex h-screen items-center justify-center bg-bb-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-bb-border bg-bb-panel p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-bb-red">
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
        <h1 className="mb-1 text-lg font-bold text-bb-text">BLACKBUCK PRD Builder</h1>
        <p className="mb-6 text-sm text-bb-text-secondary">
          Sign in with your Blackbuck Google account to continue.
        </p>

        {error === "AccessDenied" && (
          <div className="mb-4 rounded-md border border-bb-red bg-bb-red-dim px-3 py-2 text-xs text-bb-text">
            That account isn&apos;t a @blackbuck.com address. Sign in with your Blackbuck email.
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-bb-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bb-red-hover"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
