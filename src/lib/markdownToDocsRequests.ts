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
// requires per-cell index tracking that's a project of its own) -- and
// Mermaid code fences are inserted as monospace source with a note, since
// Docs can't render Mermaid. Both are flagged in the PRD Builder's own
// output message to the PM, not silently downgraded.

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

export interface DocsConversionResult {
  requests: Record<string, unknown>[];
  hadTables: boolean;
  hadMermaid: boolean;
}

export function markdownToDocsRequests(markdown: string): DocsConversionResult {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;

  let text = "";
  const styleRanges: StyleRange[] = [];
  const paragraphRanges: ParagraphStyleRange[] = [];
  let hadTables = false;
  let hadMermaid = false;

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
        hadMermaid = hadMermaid || node.lang === "mermaid";
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

  return { requests, hadTables, hadMermaid };
}
