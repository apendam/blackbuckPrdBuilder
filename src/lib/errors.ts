// Turns a raw API/network error message into a short, actionable label +
// explanation. Pattern-matched against provider error text since neither the
// Anthropic SDK error shape nor a plain fetch failure reaches the client as
// anything more structured than a message string by the time it gets here
// (see route.ts's catch block). Client-safe -- no server-only imports.
export interface FriendlyError {
  title: string;
  detail: string;
}

export function classifyApiError(rawMessage: string): FriendlyError {
  const msg = rawMessage.toLowerCase();

  if (msg.includes("credit balance") || msg.includes("insufficient_quota") || msg.includes("insufficient credits")) {
    return {
      title: "Out of API credits",
      detail:
        "The AI provider account behind this app is out of credits. Add credits in that provider's billing console, then try again -- nothing you entered was lost.",
    };
  }
  if (msg.includes("rate_limit") || msg.includes("rate limit") || msg.includes("429")) {
    return {
      title: "Rate limited",
      detail: "Too many requests right now. Wait a moment and try again -- nothing you entered was lost.",
    };
  }
  if (msg.includes("invalid api key") || msg.includes("authentication_error") || msg.includes("401")) {
    return {
      title: "API key problem",
      detail:
        "The configured API key looks invalid, expired, or missing. This needs fixing in the app's environment configuration, not something you can retry your way past.",
    };
  }
  if (msg.includes("overloaded") || msg.includes("529") || msg.includes("503")) {
    return {
      title: "Provider temporarily overloaded",
      detail: "The AI provider is overloaded right now. Try again in a bit -- nothing you entered was lost.",
    };
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network error")) {
    return {
      title: "Connection problem",
      detail: "Couldn't reach the server. Check your connection and try again -- nothing you entered was lost.",
    };
  }
  return { title: "Something went wrong", detail: rawMessage };
}
