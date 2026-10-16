import fs from "node:fs";
import { prisma } from "./prisma";
import { markdownToDocsRequests, MermaidImage } from "./markdownToDocsRequests";
import { archifyDiagramFilePath, getPngDimensions } from "./archify";
import { markdownToDocxBuffer } from "./markdownToDocx";

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

// Uploads a rendered diagram (PNG bytes) to the PM's own Drive so Google
// Docs' image-insertion API has something to fetch -- insertInlineImage
// needs a publicly-reachable URL, not inline image bytes, and Docs can't
// read a file it doesn't have permission on, so every upload is immediately
// made readable enough (see shareDriveFileForDocsAccess). Uses the same
// `drive.file` scope already granted for creating the Doc itself -- that
// scope covers files this app creates, which is exactly what this is.
// Shared by both diagram sources: Mermaid hands over a client-rendered data
// URL (decoded to bytes just below), Archify hands over bytes already
// sitting on disk from its own server-side render.
async function uploadImageBytesToDrive(userId: string, imageBytes: Buffer, filename: string): Promise<string> {
  const accessToken = await getValidAccessToken(userId);

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
        const base64 = img.url.replace(/^data:image\/png;base64,/, "");
        const url = await uploadImageBytesToDrive(userId, Buffer.from(base64, "base64"), `${docTitle} - diagram ${i + 1}.png`);
        return { ...img, url };
      } catch (err) {
        console.error(`Diagram ${i + 1} upload/share failed, falling back to raw text for it:`, err);
        return null;
      }
    })
  );
}

// Archify diagram fences carry only a small `{id, title}` pointer -- the
// actual PNG was already rendered server-side (render_archify_diagram) and
// sits on disk. This finds every distinct id referenced in the PRD content,
// reads each PNG's bytes and pixel size directly (no browser/client
// involvement needed at all, unlike Mermaid), and uploads it to Drive.
// Same never-throw contract as resolveMermaidImageUrls: a missing file or a
// failed upload/share just omits that id from the returned map, which
// markdownToDocsRequests treats as "fall back to a text note for this one."
const ARCHIFY_FENCE = /```archify\n([\s\S]*?)```/g;

function extractArchifyDiagramIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(ARCHIFY_FENCE)) {
    try {
      const parsed = JSON.parse(match[1]) as { id?: unknown };
      if (typeof parsed.id === "string") ids.add(parsed.id);
    } catch {
      // Malformed fence -- markdownToDocsRequests already treats this as
      // unrenderable on its own; nothing to resolve here.
    }
  }
  return Array.from(ids);
}

async function resolveArchifyImageUrls(
  userId: string,
  markdown: string,
  docTitle: string
): Promise<Map<string, MermaidImage>> {
  const ids = extractArchifyDiagramIds(markdown);
  const resolved = new Map<string, MermaidImage>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const filePath = archifyDiagramFilePath(id);
        const bytes = fs.readFileSync(filePath);
        const { width, height } = getPngDimensions(bytes);
        const url = await uploadImageBytesToDrive(userId, bytes, `${docTitle} - ${id}.png`);
        resolved.set(id, { url, width, height });
      } catch (err) {
        console.error(`Archify diagram ${id} upload/share failed, falling back to a text note for it:`, err);
      }
    })
  );
  return resolved;
}

// Uploads a .docx to Drive with conversion-to-Google-Doc requested, so the
// result is a native Google Doc whose images (and tables, headings, lists)
// came in with the file itself. This is the only image route that works in a
// Workspace whose admin policy blocks public Drive sharing: the Docs API's
// insertInlineImage needs a public URL per image, while a converted upload
// carries the image bytes in its own request body -- nothing is ever shared
// or fetched by URL. Only needs the `drive.file` scope the app already has
// (it creates the file), no new consent.
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

// Thrown ONLY when Drive answered with a definitive non-2xx -- i.e. we know no
// file was created. Anything else (a timeout, a dropped connection, an
// unreadable response) is ambiguous: Drive may have created the Doc even
// though we never heard back, so createGoogleDoc must not "retry" through the
// legacy path in that case or the PM ends up with two copies.
class DriveImportRejectedError extends GoogleDocsError {}

async function uploadDocxAsGoogleDoc(userId: string, title: string, docx: Buffer): Promise<string> {
  const accessToken = await getValidAccessToken(userId);
  const boundary = `prdbuilder_docx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = { name: title, mimeType: GOOGLE_DOC_MIME };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`,
      "utf-8"
    ),
    docx,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);

  // Bounded, so a hung upload can't tie up the request indefinitely -- a
  // large PRD with several full-resolution diagrams is a few hundred KB, so
  // two minutes is generous.
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new DriveImportRejectedError(`Drive rejected the .docx import: ${res.status} ${errBody}`);
  }
  const { id } = (await res.json()) as { id: string };
  return id;
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
  /** True when the higher-fidelity .docx import failed and this Doc came from the legacy text path. */
  usedFallback: boolean;
  fallbackReason?: string;
}> {
  // Primary path: build a real .docx (diagram images embedded in the file
  // itself) and let Drive convert it to a native Google Doc. If the file
  // can't be built, or Drive DEFINITIVELY rejects the import, fall through to
  // the older Docs-API path below rather than failing the export outright, so
  // this is never worse than what shipped before it -- but report that it
  // happened (usedFallback), since the fallback path can't embed diagrams or
  // make real tables and the PM should know they got the degraded version.
  let fallbackReason: string | undefined;
  let docx: Awaited<ReturnType<typeof markdownToDocxBuffer>> | undefined;
  try {
    docx = await markdownToDocxBuffer(markdownContent, title, renderedMermaidImages);
  } catch (err) {
    fallbackReason = `couldn't build the .docx (${err instanceof Error ? err.message : String(err)})`;
    console.error("DOCX build failed, falling back to the Docs API text path:", err);
  }

  if (docx) {
    try {
      const documentId = await uploadDocxAsGoogleDoc(userId, title, docx.buffer);
      return {
        url: `https://docs.google.com/document/d/${documentId}/edit`,
        // `hadTables` means "tables that got downgraded to monospace text" --
        // via .docx they convert to real native tables, so nothing was downgraded.
        hadTables: false,
        hadMermaid: docx.diagramsEmbedded + docx.diagramsFallback > 0,
        hadUnrenderedMermaid: docx.diagramsFallback > 0,
        imagesEmbedded: docx.diagramsEmbedded,
        imagesFailed: docx.diagramsFallback,
        usedFallback: false,
      };
    } catch (err) {
      if (!(err instanceof DriveImportRejectedError)) {
        // Ambiguous failure (timeout / dropped connection): Drive may already
        // have created the Doc. Falling back now could leave the PM with two
        // copies, so surface it instead and let them check before retrying.
        throw new GoogleDocsError(
          `The Google Doc upload didn't confirm (${err instanceof Error ? err.message : String(err)}). ` +
            `It may still have been created -- check your Drive for a Doc titled "${title}" before exporting again, to avoid a duplicate.`
        );
      }
      fallbackReason = err.message;
      console.error("Drive rejected the DOCX import, falling back to the Docs API text path:", err);
    }
  }

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
  // Docs will actually fetch. Archify diagrams need no client-side input at
  // all -- their PNGs already exist on disk from the original render_
  // archify_diagram call, so resolveArchifyImageUrls finds and uploads them
  // independently, just from the markdown content itself.
  const [driveImages, archifyImages] = await Promise.all([
    resolveMermaidImageUrls(userId, renderedMermaidImages, title),
    resolveArchifyImageUrls(userId, markdownContent, title),
  ]);

  const {
    requests,
    imageRequests,
    hadTables,
    hadMermaid,
    hadUnrenderedMermaid,
    hadArchify,
    hadUnrenderedArchify,
  } = markdownToDocsRequests(markdownContent, driveImages, archifyImages);

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
    // Combined across both diagram sources -- the PM-facing signal is just
    // "did this PRD have rich diagrams" / "did any of them fail to embed as
    // a real image," not which renderer produced them.
    hadMermaid: hadMermaid || hadArchify,
    // A diagram whose image insertion failed now has its raw-source-text
    // (Mermaid) or plain text note (Archify) fallback written in (see
    // above) -- from the PM's point of view that's the same "didn't get a
    // real image" outcome as one that was never rendered in the first
    // place, so both count here.
    hadUnrenderedMermaid: hadUnrenderedMermaid || hadUnrenderedArchify || imagesFailed > 0,
    imagesEmbedded,
    imagesFailed,
    usedFallback: true,
    fallbackReason,
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
