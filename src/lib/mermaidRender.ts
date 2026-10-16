import path from "node:path";
import puppeteer from "puppeteer";

// Renders legacy ```mermaid fences to PNGs on the server, with the same
// headless Chromium the Archify path already uses.
//
// Why not the browser (renderMermaidDiagramsForExport in PrdViewerClient)?
// That path draws Mermaid's SVG onto a <canvas> and reads it back with
// toDataURL -- and Mermaid renders flowchart and state-diagram labels with an
// HTML <foreignObject>, which makes the browser flag the canvas as "tainted"
// and refuse the readback. In a real export of an 11-diagram PRD, exactly the
// 2 sequence diagrams (plain SVG text) survived and all 9 flowchart/state
// diagrams failed. A Puppeteer screenshot is a genuine rasterization of what
// the browser displays, so foreignObject is a non-issue -- and doing it here
// also means the automatic (no-browser) export path can embed them too.
const MERMAID_JS = path.join(process.cwd(), "node_modules", "mermaid", "dist", "mermaid.min.js");

// Same look as the in-app viewer (DocumentPanel's mermaid.initialize), so a
// diagram reads the same wherever it's seen.
const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#2a1414",
    primaryBorderColor: "#e5484d",
    primaryTextColor: "#f2f2f2",
    lineColor: "#8a8a8a",
    secondaryColor: "#1a1a1a",
    tertiaryColor: "#1a1a1a",
    fontSize: "14px",
  },
  flowchart: { curve: "basis" },
  // The source is model-authored text -- keep Mermaid's script-injection
  // protections on even though this page is throwaway.
  securityLevel: "strict",
};

const PER_DIAGRAM_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * One PNG per source, in order; `null` for any diagram that failed to render
 * (bad Mermaid syntax, timeout) so the caller can fall back for just that one.
 * Never throws -- if the browser itself can't start, every entry is null.
 */
export async function renderMermaidSourcesToPng(sources: string[]): Promise<(Buffer | null)[]> {
  if (sources.length === 0) return [];
  const results: (Buffer | null)[] = sources.map(() => null);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    // Wide stage so diagrams render at their natural size rather than being
    // squeezed to a narrow container (they get scaled down to page width when
    // embedded in the .docx anyway).
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#1a1a1a"><div id="stage" style="width:1520px;padding:20px;background:#1a1a1a"></div></body></html>`
    );
    await page.addScriptTag({ path: MERMAID_JS });
    await page.evaluate((config) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).mermaid.initialize(config);
    }, MERMAID_CONFIG);

    for (let i = 0; i < sources.length; i++) {
      try {
        await withTimeout(
          page.evaluate(
            async (source, id) => {
              const stage = document.getElementById("stage") as HTMLElement;
              stage.innerHTML = "";
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { svg } = await (window as any).mermaid.render(`mmd-${id}`, source);
              stage.innerHTML = svg;
            },
            sources[i],
            i
          ),
          PER_DIAGRAM_TIMEOUT_MS,
          `Mermaid diagram ${i + 1}`
        );
        const svgEl = await page.$("#stage svg");
        if (!svgEl) throw new Error("rendered no <svg>");
        results[i] = Buffer.from(await svgEl.screenshot({ type: "png" }));
      } catch (err) {
        console.warn(`Mermaid diagram ${i + 1} could not be rendered server-side:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.warn("Server-side Mermaid rendering unavailable:", err instanceof Error ? err.message : err);
  } finally {
    await browser?.close().catch(() => {});
  }
  return results;
}
