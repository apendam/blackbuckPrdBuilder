import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer";

// Archify (https://github.com/tt-a1i/archify, MIT) is vendored under
// vendor/archify/ -- a self-contained Node CLI with zero runtime npm
// dependencies (confirmed: its only devDependencies are dev/build tooling,
// never imported by the renderers themselves). It takes typed JSON IR and
// deterministically compiles it into a self-contained HTML diagram, with its
// own schema/layout/route validation gates built in.
//
// Archify's CLI only ever produces HTML -- there is no headless PNG export
// (the Export menu seen in its README is a client-side, in-browser feature).
// To get a flat image for Google Docs / the PDF export, this module renders
// the HTML with Puppeteer and screenshots the diagram's own <svg> element
// directly, which -- since Archify draws the legend, labels, and all
// diagram chrome as real SVG content, not overlaid HTML -- gives a clean,
// tightly-cropped image with no separate cropping/chrome-hiding step needed
// beyond Archify's own built-in `?embed=1` mode (hides its toolbar/nav/cards).
const ARCHIFY_ROOT = path.join(process.cwd(), "vendor", "archify");
const ARCHIFY_BIN = path.join(ARCHIFY_ROOT, "bin", "archify.mjs");
const DIAGRAMS_PUBLIC_DIR = path.join(process.cwd(), "public", "archify-diagrams");

export type ArchifyDiagramType = "architecture" | "workflow" | "sequence" | "dataflow" | "lifecycle";

export interface ArchifyDiagnostic {
  code: string;
  severity: string;
  message: string;
  subject?: unknown;
  evidence?: unknown;
  supportedFixes?: string[];
}

export interface ArchifyRenderResult {
  ok: boolean;
  /** Public URL path (served from Next's public/), e.g. "/archify-diagrams/<id>.png" */
  pngPath?: string;
  diagnostics?: ArchifyDiagnostic[];
  error?: string;
}

interface ArchifyCliResult {
  ok: boolean;
  json: Record<string, unknown> | null;
  stderr: string;
}

function runArchifyCli(args: string[]): ArchifyCliResult {
  try {
    const stdout = execFileSync(process.execPath, [ARCHIFY_BIN, ...args], {
      encoding: "utf-8",
      timeout: 30_000,
      // Archify's only network call is an optional, infrequent update-check
      // ping (see its README) -- irrelevant and unwanted for a server-side
      // render, and disabling it removes any chance of it slowing a request.
      env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: "1" },
    });
    return { ok: true, json: JSON.parse(stdout), stderr: "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (e.stdout) {
      try {
        return { ok: false, json: JSON.parse(e.stdout), stderr: e.stderr ?? "" };
      } catch {
        // stdout wasn't JSON -- fall through to the generic error below.
      }
    }
    return { ok: false, json: null, stderr: e.stderr ?? e.message ?? "unknown error running archify" };
  }
}

const MIN_VIEWPORT = { width: 640, height: 480 };
const MAX_VIEWPORT = { width: 2200, height: 1800 };

// Archify's SVG scales to fill whatever container width it's given (see the
// diagram-container CSS), so screenshotting at a fixed large viewport left a
// small diagram swimming in empty grid background. Loading once to read the
// SVG's own authored viewBox, then resizing the viewport to roughly that
// aspect ratio before the real screenshot, keeps small and large diagrams
// both tightly framed instead of picking one fixed canvas size for both.
async function screenshotArchifyHtml(htmlPath: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ["--no-sandbox", "--disable-setuid-sandbox"] : [] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    // theme=dark matches this app's existing Mermaid diagrams (DocumentPanel's
    // mermaid.initialize) so a PRD's diagrams look consistent regardless of
    // which renderer produced them. embed=1 hides Archify's toolbar, header,
    // nav, and cards -- see the `data-embed="true"` CSS rules in its output.
    const url = `file://${htmlPath}?embed=1&theme=dark`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 20_000 });

    const svgSelector = ".diagram-container svg";
    await page.waitForSelector(svgSelector, { timeout: 10_000 });
    const viewBox = await page.$eval(svgSelector, (el) => el.getAttribute("viewBox"));
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      const [, , vbWidth, vbHeight] = parts;
      if (Number.isFinite(vbWidth) && Number.isFinite(vbHeight) && vbWidth > 0 && vbHeight > 0) {
        const width = Math.min(MAX_VIEWPORT.width, Math.max(MIN_VIEWPORT.width, Math.round(vbWidth + 96)));
        const height = Math.min(MAX_VIEWPORT.height, Math.max(MIN_VIEWPORT.height, Math.round(vbHeight + 160)));
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        // Resizing the viewport reflows the page -- reload so the SVG's
        // fill-container sizing recomputes against the new dimensions
        // instead of the stale layout from the first, oversized viewport.
        await page.goto(url, { waitUntil: "networkidle0", timeout: 20_000 });
        await page.waitForSelector(svgSelector, { timeout: 10_000 });
      }
    }

    const svgHandle = await page.$(svgSelector);
    if (!svgHandle) throw new Error("Archify diagram SVG never appeared in the rendered HTML.");
    const png = await svgHandle.screenshot({ type: "png" });
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}

// The full pipeline: validate+render the IR (Archify's own `deliver` command
// does both atomically -- "a passing artifact atomically replaces the
// target"), screenshot the result, and save it under public/ so the app can
// reference it by a plain static URL from anywhere (in-app viewer, Google
// Docs upload, PDF/print) without a dedicated serving route.
export async function renderArchifyDiagram(
  type: ArchifyDiagramType,
  ir: Record<string, unknown>,
  diagramId: string
): Promise<ArchifyRenderResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "archify-"));
  const inputPath = path.join(tmpDir, "input.json");
  const htmlPath = path.join(tmpDir, "output.html");

  try {
    fs.writeFileSync(inputPath, JSON.stringify(ir), "utf-8");

    const deliverResult = runArchifyCli(["deliver", type, inputPath, htmlPath, "--json", "--quality", "showcase"]);
    if (!deliverResult.ok || deliverResult.json?.ok !== true) {
      return {
        ok: false,
        diagnostics: deliverResult.json?.diagnostics as ArchifyDiagnostic[] | undefined,
        error:
          (deliverResult.json?.error as string | undefined) ??
          deliverResult.stderr ??
          "Archify failed to render this diagram.",
      };
    }

    const pngBuffer = await screenshotArchifyHtml(htmlPath);
    fs.mkdirSync(DIAGRAMS_PUBLIC_DIR, { recursive: true });
    const pngPath = path.join(DIAGRAMS_PUBLIC_DIR, `${diagramId}.png`);
    fs.writeFileSync(pngPath, pngBuffer);

    return { ok: true, pngPath: `/archify-diagrams/${diagramId}.png` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error rendering the diagram." };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Absolute filesystem path for a previously-rendered diagram's PNG, given the
// same id used to render it -- used server-side (Google Docs upload, e.g.)
// where a public URL isn't useful but the real file on disk is.
export function archifyDiagramFilePath(diagramId: string): string {
  // The id comes from an `archify` fence in PRD text, which is model-authored
  // (and could in principle carry injected content) -- never let it steer the
  // path anywhere outside the diagrams directory. Real ids are
  // `<conversationId>_<timestamp>_<counter>`, so this loses nothing.
  if (!/^[A-Za-z0-9_-]+$/.test(diagramId)) {
    throw new Error(`Invalid archify diagram id: ${JSON.stringify(diagramId)}`);
  }
  return path.join(DIAGRAMS_PUBLIC_DIR, `${diagramId}.png`);
}

// A PNG's IHDR chunk -- the first chunk, always immediately after the fixed
// 8-byte signature -- carries width/height as big-endian uint32s at a fixed
// offset. Reading them directly avoids needing a second sidecar file to keep
// in sync with the PNG whenever the Google Docs export needs to know a
// previously-rendered diagram's pixel size (insertInlineImage's objectSize).
export function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
