import { prisma } from "./prisma";
import { markdownToDocsRequests, MermaidImage } from "./markdownToDocsRequests";

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

// Makes a Drive file readable enough for Docs' insertInlineImage to fetch it.
// Tries "anyone with the link" first (works on personal accounts and most
// Workspaces); if the org's admin policy blocks external sharing entirely
// (Google's own `publishOutNotPermitted` reason -- confirmed to be
// Blackbuck's actual policy, not a hypothetical), falls back to sharing with
// just the user's own Workspace domain instead of failing outright. That
// respects the org's real policy rather than trying to force public sharing
// anyway, and Docs' image fetch -- acting in the same authenticated context
// as the user inserting the image into their own Doc -- can still resolve a
// domain-shared file.
async function shareDriveFileForDocsAccess(accessToken: string, fileId: string, userId: string): Promise<void> {
  const anyoneRes = await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (anyoneRes.ok) return;

  const anyoneErr = await anyoneRes.json().catch(() => null);
  const reason = (anyoneErr as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason;
  if (reason !== "publishOutNotPermitted") {
    throw new GoogleDocsError(
      `Diagram image uploaded but couldn't be made link-readable (Docs needs this to fetch it): ${anyoneRes.status} ${JSON.stringify(anyoneErr)}`
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const domain = user?.email?.split("@")[1];
  if (!domain) {
    throw new GoogleDocsError(
      "Diagram image uploaded, but public link-sharing is blocked by your Workspace's admin policy, " +
        "and no email domain was on file to fall back to domain-only sharing."
    );
  }

  const domainRes = await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "domain", domain }),
  });
  if (!domainRes.ok) {
    const domainErr = await domainRes.text();
    throw new GoogleDocsError(
      `Diagram image uploaded, but sharing failed both ways: public link-sharing is blocked by your Workspace's ` +
        `admin policy, and domain-restricted sharing to ${domain} also failed: ${domainRes.status} ${domainErr}`
    );
  }
}

// Uploads a rendered Mermaid diagram (PNG) to the PM's own Drive so Google
// Docs' image-insertion API has something to fetch -- insertInlineImage
// needs a publicly-reachable URL, not inline image bytes, and Docs can't
// read a file it doesn't have permission on, so every upload is immediately
// made readable enough (see shareDriveFileForDocsAccess). Uses the same
// `drive.file` scope already granted for creating the Doc itself -- that
// scope covers files this app creates, which is exactly what this is.
async function uploadImageToDrive(userId: string, pngDataUrl: string, filename: string): Promise<string> {
  const accessToken = await getValidAccessToken(userId);
  const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, "");
  const imageBytes = Buffer.from(base64, "base64");

  const boundary = `prdbuilder_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = { name: filename, mimeType: "image/png" };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: image/png\r\n\r\n`,
      "utf-8"
    ),
    imageBytes,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new GoogleDocsError(`Failed to upload diagram image to Drive: ${uploadRes.status} ${errBody}`);
  }
  const { id: fileId } = (await uploadRes.json()) as { id: string };

  await shareDriveFileForDocsAccess(accessToken, fileId, userId);

  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

// Uploads every rendered diagram to Drive up front (in parallel) so the
// image-insertion calls below can reference real URLs. Deliberately never
// throws: an upload or sharing failure for one diagram (an org's Drive
// policy, a transient error, whatever) becomes a `null` for that diagram --
// the same "fall back to raw text for this one" treatment as a diagram that
// never rendered client-side in the first place -- rather than aborting the
// whole export before a single word of text has been written.
async function resolveMermaidImageUrls(
  userId: string,
  renderedImages: (MermaidImage | null | undefined)[] | undefined,
  docTitle: string
): Promise<(MermaidImage | null)[] | undefined> {
  if (!renderedImages || renderedImages.length === 0) return undefined;
  return Promise.all(
    renderedImages.map(async (img, i): Promise<MermaidImage | null> => {
      if (!img) return null;
      try {
        const url = await uploadImageToDrive(userId, img.url, `${docTitle} - diagram ${i + 1}.png`);
        return { ...img, url };
      } catch (err) {
        console.error(`Diagram ${i + 1} upload/share failed, falling back to raw text for it:`, err);
        return null;
      }
    })
  );
}

export async function createGoogleDoc(
  userId: string,
  title: string,
  markdownContent: string,
  renderedMermaidImages?: (MermaidImage | null | undefined)[]
): Promise<{
  url: string;
  hadTables: boolean;
  hadMermaid: boolean;
  hadUnrenderedMermaid: boolean;
  imagesEmbedded: number;
  imagesFailed: number;
}> {
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

  // renderedMermaidImages carries each diagram's own already-rendered PNG
  // data URL in its `url` field at this point -- resolveMermaidImageUrls
  // uploads each to Drive and replaces it with the real, link-readable URL
  // Docs will actually fetch.
  const driveImages = await resolveMermaidImageUrls(userId, renderedMermaidImages, title);

  const { requests, imageRequests, hadTables, hadMermaid, hadUnrenderedMermaid } = markdownToDocsRequests(
    markdownContent,
    driveImages
  );

  // Text and formatting first, on its own -- this batch has no
  // insertInlineImage requests in it, so nothing about image availability
  // can affect whether it succeeds.
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

  // Each diagram image is its own separate batchUpdate call, never bundled
  // with the text call above or with each other -- a batchUpdate is atomic,
  // and insertInlineImage fails whenever Docs can't fetch the URL (an org's
  // sharing policy can make that true for every single image, not just an
  // occasional one). Submitting one at a time means a failure only costs
  // that one diagram. Nothing was written at `docIndex` yet in that case
  // (the main text batch above reserved a blank line there, but the raw
  // Mermaid source itself was deliberately withheld from it -- see
  // markdownToDocsRequests) so on failure this issues its own follow-up
  // insertText + monospace styling at that same index, recovering the
  // raw-source fallback instead of leaving the reserved line blank.
  let imagesEmbedded = 0;
  let imagesFailed = 0;
  for (const { insertRequest, docIndex, fallbackText } of imageRequests) {
    try {
      const imgRes = await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ requests: [insertRequest] }),
      });
      if (!imgRes.ok) throw new Error(`${imgRes.status} ${await imgRes.text()}`);
      imagesEmbedded += 1;
    } catch (err) {
      imagesFailed += 1;
      console.error("Diagram image insertion failed, writing raw-text fallback instead:", err);
      try {
        const fallbackRes = await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            requests: [
              { insertText: { location: { index: docIndex }, text: fallbackText } },
              {
                updateTextStyle: {
                  range: { startIndex: docIndex, endIndex: docIndex + fallbackText.length },
                  textStyle: { weightedFontFamily: { fontFamily: "Courier New" } },
                  fields: "weightedFontFamily",
                },
              },
            ],
          }),
        });
        if (!fallbackRes.ok) {
          console.error(
            `Fallback text insertion also failed for a diagram: ${fallbackRes.status} ${await fallbackRes.text()}`
          );
        }
      } catch (fallbackErr) {
        console.error("Fallback text insertion also failed for a diagram:", fallbackErr);
      }
    }
  }

  return {
    url: `https://docs.google.com/document/d/${documentId}/edit`,
    hadTables,
    hadMermaid,
    // A diagram whose image insertion failed now has its raw-source-text
    // fallback written in (see above) -- from the PM's point of view that's
    // the same "didn't get a real image" outcome as one that was never
    // rendered client-side, so both count here.
    hadUnrenderedMermaid: hadUnrenderedMermaid || imagesFailed > 0,
    imagesEmbedded,
    imagesFailed,
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
