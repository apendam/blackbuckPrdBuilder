import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent } from "mdast";

// Converts Markdown into a Google Docs API batchUpdate request list.
//
// Google Docs indices are 1-based, counted over the WHOLE document body.
// The approach: build the entire plain-text body first while recording
// style ranges (bold/italic/code/headings/bullets) against the offsets
// we compute along the way, then emit one insertText request followed by
// style requests referencing those same offsets. Because insertText runs
// first in the batch and nothing after it shifts indices, the precomputed
// ranges stay valid.
//
// Known simplification: GFM tables are rendered as a monospace
// pipe-delimited block rather than real Docs tables (the Docs table API
// requires per-cell index tracking that's a project of its own) -- flagged
// in the PRD Builder's own output message to the PM, not silently downgraded.
//
// Mermaid diagrams: Docs can't render Mermaid source directly, and rendering
// it to an image requires a real browser (mermaid.js needs DOM/canvas text
// measurement) -- something this function, running server-side with no
// browser, can't do itself. So it accepts already-rendered images from a
// caller that DOES have a browser (the manual "Export to Google Doc" button,
// which renders each diagram via the same mermaid.render() DocumentPanel
// already uses, converts to PNG, and uploads to Drive before calling here).
// When no image is supplied for a given diagram -- the automatic
// create_google_doc tool call during a chat turn has no browser at all, so
// this is the normal case there -- it falls back to inserting the raw
// Mermaid source as monospace text, same as before.

interface StyleRange {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

interface ParagraphStyleRange {
  start: number;
  end: number;
  namedStyleType?: "HEADING_1" | "HEADING_2" | "HEADING_3" | "NORMAL_TEXT";
  bullet?: "DISC" | "NUMBER";
}

// One entry per Mermaid code fence found in the document, in document order.
// `null` (or a short array) means "no rendered image available for this
// diagram -- use the raw-source text fallback."
export interface MermaidImage {
  url: string;
  /** Natural pixel size of the rendered image, used to size it sensibly in
   * the Doc (capped to a page-friendly width) rather than at native
   * resolution, which for a 2x-scaled render would be enormous. */
  width: number;
  height: number;
}

interface ImageInsertPoint {
  /** Offset into `text` (before the +OFFSET applied later) where the image goes. */
  index: number;
  image: MermaidImage;
  /** The raw-source-text fallback that WOULD have been written here had no
   * image been available -- kept so the caller can still fall back to it if
   * the image insertion itself fails later (e.g. an org's sharing policy
   * blocks Docs from fetching the URL), rather than leaving a bare blank
   * line where a diagram was supposed to be. */
  fallbackText: string;
}

// One attempt to embed a diagram image, paired with everything the caller
// needs to recover if the insertInlineImage call itself fails: the same
// document index (so a follow-up insertText lands exactly where the image
// was supposed to go) and the raw Mermaid source to write there instead.
export interface ImageAttempt {
  insertRequest: Record<string, unknown>;
  docIndex: number;
  fallbackText: string;
}

export interface DocsConversionResult {
  /** Text + formatting only -- submit this as its own batchUpdate first; it never depends on images. */
  requests: Record<string, unknown>[];
  /** One entry per diagram, descending index order -- submit each `insertRequest` as its OWN
   * separate batchUpdate call, catching failures per-image, never bundled with `requests` or each
   * other. On failure, issue a follow-up insertText at `docIndex` using `fallbackText`. */
  imageRequests: ImageAttempt[];
  hadTables: boolean;
  hadMermaid: boolean;
  /** True if at least one Mermaid diagram fell back to raw-text (no image supplied for it). */
  hadUnrenderedMermaid: boolean;
}

export function markdownToDocsRequests(
  markdown: string,
  mermaidImages?: (MermaidImage | null | undefined)[]
): DocsConversionResult {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;

  let text = "";
  const styleRanges: StyleRange[] = [];
  const paragraphRanges: ParagraphStyleRange[] = [];
  const imageInsertPoints: ImageInsertPoint[] = [];
  let hadTables = false;
  let hadMermaid = false;
  let hadUnrenderedMermaid = false;
  let mermaidIndex = 0;

  function appendInline(nodes: PhrasingContent[]) {
    for (const node of nodes) {
      const start = text.length;
      switch (node.type) {
        case "text":
          text += node.value;
          break;
        case "inlineCode":
          text += node.value;
          styleRanges.push({ start, end: text.length, code: true });
          break;
        case "strong":
          appendInline(node.children);
          styleRanges.push({ start, end: text.length, bold: true });
          break;
        case "emphasis":
          appendInline(node.children);
          styleRanges.push({ start, end: text.length, italic: true });
          break;
        case "link":
          appendInline(node.children);
          break;
        case "break":
          text += "\n";
          break;
        default:
          if ("children" in node && Array.isArray(node.children)) {
            appendInline(node.children as PhrasingContent[]);
          }
      }
    }
  }

  function appendBlock(node: RootContent, listContext?: { ordered: boolean }) {
    switch (node.type) {
      case "heading": {
        const start = text.length;
        appendInline(node.children);
        text += "\n";
        const level = Math.min(node.depth, 3);
        paragraphRanges.push({
          start,
          end: text.length,
          namedStyleType: (`HEADING_${level}` as "HEADING_1" | "HEADING_2" | "HEADING_3"),
        });
        break;
      }
      case "paragraph": {
        const start = text.length;
        appendInline(node.children);
        text += "\n";
        if (listContext) {
          paragraphRanges.push({
            start,
            end: text.length,
            bullet: listContext.ordered ? "NUMBER" : "DISC",
          });
        }
        break;
      }
      case "list": {
        for (const item of node.children) {
          for (const child of item.children) {
            appendBlock(child, { ordered: !!node.ordered });
          }
        }
        break;
      }
      case "code": {
        if (node.lang === "mermaid") {
          hadMermaid = true;
          const image = mermaidImages?.[mermaidIndex];
          mermaidIndex += 1;
          if (image) {
            // Reserve a blank line as the anchor point -- the actual image
            // is a separate insertInlineImage request emitted after the
            // main insertText, since Docs images aren't plain text. The
            // raw-source fallback text is computed but NOT written here --
            // it travels with the image-insert point instead, so the caller
            // can still fall back to it if the image insertion itself fails
            // later, rather than the reserved blank line staying empty.
            const imgIndex = text.length;
            text += "\n";
            imageInsertPoints.push({
              index: imgIndex,
              image,
              fallbackText: "[Mermaid diagram source]\n" + node.value + "\n",
            });
            break;
          }
          hadUnrenderedMermaid = true;
        }
        const start = text.length;
        const label = node.lang === "mermaid" ? "[Mermaid diagram source]\n" : "";
        text += label + node.value + "\n";
        styleRanges.push({ start, end: text.length, code: true });
        break;
      }
      case "table": {
        hadTables = true;
        const start = text.length;
        for (const row of node.children) {
          const cells = row.children.map((cell) => {
            const before = text.length;
            appendInline(cell.children);
            const cellText = text.slice(before);
            text = text.slice(0, before);
            return cellText;
          });
          text += cells.join(" | ") + "\n";
        }
        text += "\n";
        styleRanges.push({ start, end: text.length, code: true });
        break;
      }
      case "thematicBreak":
        text += "---\n";
        break;
      case "blockquote":
        for (const child of node.children) appendBlock(child);
        break;
      default:
        if ("children" in node && Array.isArray(node.children)) {
          const start = text.length;
          appendInline(node.children as PhrasingContent[]);
          if (text.length > start) text += "\n";
        }
    }
  }

  for (const node of tree.children) {
    appendBlock(node);
  }
  if (!text.endsWith("\n")) text += "\n";

  // Docs body starts at index 1.
  const OFFSET = 1;
  const requests: Record<string, unknown>[] = [
    { insertText: { location: { index: OFFSET }, text } },
  ];

  for (const p of paragraphRanges) {
    const range = { startIndex: p.start + OFFSET, endIndex: p.end + OFFSET };
    if (p.namedStyleType) {
      requests.push({
        updateParagraphStyle: {
          range,
          paragraphStyle: { namedStyleType: p.namedStyleType },
          fields: "namedStyleType",
        },
      });
    }
    if (p.bullet) {
      requests.push({
        createParagraphBullets: {
          range,
          bulletPreset:
            p.bullet === "NUMBER" ? "NUMBERED_DECIMAL_ALPHA_ROMAN" : "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
    }
  }

  for (const s of styleRanges) {
    if (s.start === s.end) continue;
    const range = { startIndex: s.start + OFFSET, endIndex: s.end + OFFSET };
    if (s.bold) {
      requests.push({ updateTextStyle: { range, textStyle: { bold: true }, fields: "bold" } });
    }
    if (s.italic) {
      requests.push({ updateTextStyle: { range, textStyle: { italic: true }, fields: "italic" } });
    }
    if (s.code) {
      requests.push({
        updateTextStyle: {
          range,
          textStyle: { weightedFontFamily: { fontFamily: "Courier New" } },
          fields: "weightedFontFamily",
        },
      });
    }
  }

  // Image insertions are returned SEPARATELY from `requests`, one request
  // object per diagram, in descending index order -- deliberately NOT
  // bundled into the same batchUpdate as the text. A Docs batchUpdate is
  // atomic: if any single request in it fails (and insertInlineImage
  // fails whenever Docs can't fetch the URL -- an org's Drive-sharing
  // policy is entirely capable of blocking every single image, not just an
  // occasional one), the WHOLE batch is rejected and NONE of it is written,
  // including all the otherwise-fine text. The caller submits `requests`
  // in its own batchUpdate first (guaranteed to succeed on its own merits),
  // then attempts each image as its own independent batchUpdate call,
  // catching failures per-image rather than letting one bad image take the
  // whole document down with it. Still descending-index order across those
  // separate calls: each insertion shifts everything after it in the
  // now-already-committed document, so processing right-to-left keeps
  // every not-yet-attempted image's index valid regardless of how many
  // earlier ones succeeded, failed, or were skipped.
  const PX_TO_PT = 0.75; // CSS px -> points, both at the standard 96px/72pt-per-inch ratio
  const MAX_WIDTH_PT = 450; // fits within a standard Docs page's content width with margins
  const sortedImages = [...imageInsertPoints].sort((a, b) => b.index - a.index);
  const imageRequests: ImageAttempt[] = sortedImages.map(({ index, image, fallbackText }) => {
    let widthPt = image.width * PX_TO_PT;
    let heightPt = image.height * PX_TO_PT;
    if (widthPt > MAX_WIDTH_PT) {
      const scale = MAX_WIDTH_PT / widthPt;
      widthPt *= scale;
      heightPt *= scale;
    }
    const docIndex = index + OFFSET;
    return {
      insertRequest: {
        insertInlineImage: {
          location: { index: docIndex },
          uri: image.url,
          objectSize: {
            width: { magnitude: widthPt, unit: "PT" },
            height: { magnitude: heightPt, unit: "PT" },
          },
        },
      },
      docIndex,
      fallbackText,
    };
  });

  return { requests, imageRequests, hadTables, hadMermaid, hadUnrenderedMermaid };
}
