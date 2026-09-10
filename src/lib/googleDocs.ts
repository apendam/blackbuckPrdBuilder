import { prisma } from "./prisma";
import { markdownToDocsRequests } from "./markdownToDocsRequests";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DOCS_API = "https://docs.googleapis.com/v1/documents";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

class GoogleDocsError extends Error {}

async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    throw new GoogleDocsError(
      "No Google account linked. Sign in with Google first."
    );
  }
  if (!account.access_token) {
    throw new GoogleDocsError("No Google access token on file. Try signing out and back in.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const stillValid = account.expires_at && account.expires_at - 60 > nowSec;
  if (stillValid) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new GoogleDocsError(
      "Google access token expired and no refresh token is on file. Sign out and sign back in, " +
        "granting Docs/Drive access, to fix this."
    );
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleDocsError("AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET not configured.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GoogleDocsError(`Failed to refresh Google access token: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    },
  });

  return data.access_token;
}

export async function createGoogleDoc(
  userId: string,
  title: string,
  markdownContent: string
): Promise<{ url: string; hadTables: boolean; hadMermaid: boolean }> {
  const accessToken = await getValidAccessToken(userId);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const createRes = await fetch(DOCS_API, {
    method: "POST",
    headers,
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new GoogleDocsError(`Failed to create Google Doc: ${createRes.status} ${body}`);
  }
  const { documentId } = (await createRes.json()) as { documentId: string };

  const { requests, hadTables, hadMermaid } = markdownToDocsRequests(markdownContent);

  const updateRes = await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requests }),
  });
  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new GoogleDocsError(
      `Doc created but failed to fill in content: ${updateRes.status} ${body}`
    );
  }

  return {
    url: `https://docs.google.com/document/d/${documentId}/edit`,
    hadTables,
    hadMermaid,
  };
}

export interface DocComment {
  id: string;
  content: string;
  author: string;
  resolved: boolean;
  createdTime: string;
}

function extractDocId(docUrl: string): string | null {
  const match = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Native Google Docs comments, read back via the Drive API so the PM can see
// open review comments without leaving the app -- the `drive.file` scope
// covers files this app created, which is the only kind of doc we ever pass
// here. Comments themselves are still authored/resolved in the Doc; this is
// read-only visibility, not a competing comment system.
export async function getDocComments(userId: string, docUrl: string): Promise<DocComment[]> {
  const fileId = extractDocId(docUrl);
  if (!fileId) {
    throw new GoogleDocsError("Could not parse a Google Doc ID from the saved URL.");
  }
  const accessToken = await getValidAccessToken(userId);
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}/comments?fields=comments(id,content,resolved,author(displayName),createdTime)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new GoogleDocsError(`Failed to fetch Doc comments: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    comments?: {
      id: string;
      content: string;
      resolved?: boolean;
      author?: { displayName?: string };
      createdTime: string;
    }[];
  };
  return (data.comments ?? []).map((c) => ({
    id: c.id,
    content: c.content,
    author: c.author?.displayName ?? "Unknown",
    resolved: c.resolved ?? false,
    createdTime: c.createdTime,
  }));
}
