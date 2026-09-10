// Client-safe: no filesystem/node imports here, so this can be imported
// from client components (e.g. the repo-refresh picker) as well as server code.
export const KNOWN_REPOS = [
  "fms_toll",
  "toll-gold",
  "tzf-activation-web-sdk",
  "tzf-ops-portal",
  "tzf-fastag",
  "tzf-full-kyc-sdk-web",
  "TZF-portal",
  "ppi-wallet",
  "boss_help_desk",
  "bb-supply-fo-android",
  "blackbuck-pro-app",
  "fms-inbound-payment",
  "fms-outbound-payment-service",
  "fms_rmm",
] as const;

export type RepoName = (typeof KNOWN_REPOS)[number];
