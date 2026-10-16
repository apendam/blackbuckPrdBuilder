import fs from "node:fs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent } from "mdast";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { archifyDiagramFilePath } from "./archify";
import { renderMermaidSourcesToPng } from "./mermaidRender";

// Converts a PRD's Markdown into a real .docx file, with every diagram image
// embedded INSIDE the file itself.
//
// Why this exists instead of the Docs API's insertInlineImage: that call needs
// a public, unauthenticated URL for each image, and this Workspace's admin
// policy blocks public (and domain-restricted-but-unauthenticated) Drive
// sharing outright -- so every diagram insertion failed with "the provided
// image should be publicly accessible", no matter how the image was produced.
// Uploading a .docx to Drive with conversion-to-Google-Doc turned on sidesteps
// that entirely: the image bytes travel inside the upload body, so nothing has
// to be shared or fetched by URL afterwards. Side benefits of going through
// .docx: GFM tables convert to real native Docs tables (the old text-offset
// approach could only fake them as monospace blocks), and no intermediate
// image files get left behind in the PM's Drive.

// A4 (Blackbuck is India-based) with 1" margins -> 9026 twips / ~601px of
// usable content width. Images and table columns are sized against this.
const PAGE_WIDTH_TWIPS = 11906;
const PAGE_HEIGHT_TWIPS = 16838;
const MARGIN_TWIPS = 1440;
const CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - 2 * MARGIN_TWIPS;
const MAX_IMAGE_WIDTH_PX = 600;
// A4 content height is ~930px; leave room so a tall diagram never overflows a page.
const MAX_IMAGE_HEIGHT_PX = 880;
// List nesting deeper than this is clamped (Word/Docs support 9 levels, 0-8).
const MAX_LIST_LEVEL = 8;

const BODY_FONT = "Arial";
const CODE_FONT = "Courier New";
const CODE_FILL = "F1F1F3";
const LINK_COLOR = "1155CC";

const BULLET_REF = "prd-bullets";
const ORDERED_REF = "prd-ordered";
const ORDERED_NESTED_REF_PREFIX = "prd-ordered-nested-";

// XML 1.0 forbids most C0 control characters (and U+FFFE/U+FFFF) anywhere in
// a document, even escaped -- one stray control character in PRD text (a paste
// artifact, say) would make word/document.xml malformed and get the whole
// upload rejected by Drive. Strip them from everything that lands in the XML.
const XML_ILLEGAL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
function xmlSafe(text: string): string {
  return text.replace(XML_ILLEGAL_CHARS, "");
}

/** A client-rendered Mermaid diagram (legacy PRDs): `url` is a PNG data URL. */
export interface MermaidPngInput {
  url: string;
}

export interface DocxConversionResult {
  buffer: Buffer;
  hadTables: boolean;
  diagramsEmbedded: number;
  /** Diagrams that had no usable image and were written as a text stand-in instead. */
  diagramsFallback: number;
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
}

interface BlockContext {
  /**
   * Set while inside a list: nesting depth (0-based) and whether it's ordered.
   * `ref` is set only for an ordered list that sits under a bullet: it gets
   * its own all-decimal numbering definition (see renderList).
   */
  list?: { level: number; ordered: boolean; instance: number; ref?: string };
  /** Set while inside a blockquote. */
  quote?: boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(bytes: Buffer): boolean {
  return bytes.length > 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function decodePngDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  return isPng(bytes) ? bytes : null;
}

// Every ```mermaid fence's source, in document order (depth-first, so fences
// nested in lists/blockquotes are included) -- the same order renderCode
// visits them in, which is what lets a render result be matched back to its
// fence purely by index.
function collectMermaidSources(nodes: RootContent[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "code" && node.lang === "mermaid") out.push(node.value);
    else if ("children" in node && Array.isArray(node.children)) {
      out.push(...collectMermaidSources(node.children as RootContent[]));
    }
  }
  return out;
}

export async function markdownToDocxBuffer(
  markdown: string,
  title: string,
  mermaidImages?: (MermaidPngInput | null | undefined)[]
): Promise<DocxConversionResult> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;

  // Legacy Mermaid fences are rasterized here on the server (see
  // mermaidRender.ts for why the browser can't reliably do it). The
  // browser-supplied `mermaidImages` are now only a fallback for a diagram the
  // server couldn't render.
  const serverMermaidPngs = await renderMermaidSourcesToPng(collectMermaidSources(tree.children));

  let hadTables = false;
  let diagramsEmbedded = 0;
  let diagramsFallback = 0;
  let mermaidIndex = 0;
  // Each top-level ordered list needs its own numbering instance or every
  // ordered list in the document would keep counting from the previous one.
  let orderedInstanceCounter = 0;
  // An ordered list nested under a BULLET can't use the shared ordered
  // definition: its level index counts the bullet ancestors too, so the shared
  // definition's per-level formats would render its "1." "2." as "i." "ii."
  // (and every such list would share one counter and never restart). Each one
  // instead gets its own all-decimal definition, collected here and emitted
  // into the numbering config after the walk.
  const nestedOrderedRefs: string[] = [];

  function textRun(text: string, style: RunStyle): TextRun {
    return new TextRun({
      text: xmlSafe(text),
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      font: style.code ? CODE_FONT : undefined,
      shading: style.code ? { type: ShadingType.CLEAR, fill: CODE_FILL, color: "auto" } : undefined,
      color: style.link ? LINK_COLOR : undefined,
      underline: style.link ? {} : undefined,
    });
  }

  function renderInline(nodes: PhrasingContent[], style: RunStyle = {}): (TextRun | ExternalHyperlink)[] {
    const out: (TextRun | ExternalHyperlink)[] = [];
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          // A single newline inside a paragraph is a soft break in Markdown
          // (renders as a space), not a line break.
          out.push(textRun(node.value.replace(/\s*\n\s*/g, " "), style));
          break;
        case "inlineCode":
          out.push(textRun(node.value, { ...style, code: true }));
          break;
        case "strong":
          out.push(...renderInline(node.children, { ...style, bold: true }));
          break;
        case "emphasis":
          out.push(...renderInline(node.children, { ...style, italics: true }));
          break;
        case "delete":
          out.push(...renderInline(node.children, { ...style, strike: true }));
          break;
        case "link":
          out.push(
            new ExternalHyperlink({
              link: xmlSafe(node.url),
              children: renderInline(node.children, { ...style, link: true }) as TextRun[],
            })
          );
          break;
        case "break":
          out.push(new TextRun({ break: 1 }));
          break;
        case "image":
          // Remote/inline markdown images can't be embedded without fetching
          // them; keep the alt text so the content isn't silently lost.
          if (node.alt) out.push(textRun(`[${node.alt}]`, { ...style, italics: true }));
          break;
        default:
          if ("children" in node && Array.isArray(node.children)) {
            out.push(...renderInline(node.children as PhrasingContent[], style));
          } else if ("value" in node && typeof node.value === "string") {
            out.push(textRun(node.value, style));
          }
      }
    }
    return out;
  }

  function paragraphFor(children: (TextRun | ExternalHyperlink)[], ctx: BlockContext): Paragraph {
    if (ctx.list) {
      // Ordered lists under a bullet carry their own numbering `ref` (unique
      // per list, so it restarts at 1 and uses decimal at every level); the
      // shared ORDERED_REF needs an `instance` to restart, which a per-list
      // ref doesn't.
      const reference = ctx.list.ordered ? (ctx.list.ref ?? ORDERED_REF) : BULLET_REF;
      return new Paragraph({
        children,
        numbering: {
          reference,
          level: Math.min(ctx.list.level, MAX_LIST_LEVEL),
          instance: ctx.list.ordered && !ctx.list.ref ? ctx.list.instance : undefined,
        },
        // A list inside a blockquote keeps the quote's left rule.
        border: ctx.quote
          ? { left: { style: BorderStyle.SINGLE, size: 12, color: "B0B0B8", space: 8 } }
          : undefined,
        spacing: { after: 60 },
      });
    }
    if (ctx.quote) {
      return new Paragraph({
        children,
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "B0B0B8", space: 8 } },
        spacing: { after: 120 },
      });
    }
    return new Paragraph({ children, spacing: { after: 120 } });
  }

  function diagramFallbackParagraph(label: string, body?: string): Paragraph[] {
    diagramsFallback += 1;
    const out: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: xmlSafe(label), italics: true, color: "6B6B72" })],
        spacing: { before: 120, after: 60 },
      }),
    ];
    if (body) out.push(...codeParagraphs(body));
    return out;
  }

  function imageParagraph(bytes: Buffer, alt: string): Paragraph {
    diagramsEmbedded += 1;
    const natural = pngSize(bytes);
    // Fit inside BOTH limits, keeping aspect ratio -- capping width alone let a
    // tall diagram overflow the page.
    const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / natural.width, MAX_IMAGE_HEIGHT_PX / natural.height);
    const safeAlt = xmlSafe(alt);
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 240 },
      children: [
        new ImageRun({
          type: "png",
          data: bytes,
          transformation: {
            width: Math.max(1, Math.round(natural.width * scale)),
            height: Math.max(1, Math.round(natural.height * scale)),
          },
          altText: { name: safeAlt, description: safeAlt, title: safeAlt },
        }),
      ],
    });
  }

  function codeParagraphs(source: string): Paragraph[] {
    // One paragraph per line, so line breaks and leading indentation survive
    // exactly as written instead of being reflowed like prose.
    return source.replace(/\n$/, "").split("\n").map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line.length ? xmlSafe(line) : " ", font: CODE_FONT, size: 18 })],
          shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: "auto" },
          spacing: { after: 0 },
        })
    );
  }

  function renderCode(node: Extract<RootContent, { type: "code" }>): (Paragraph | Table)[] {
    if (node.lang === "mermaid") {
      const index = mermaidIndex;
      mermaidIndex += 1;
      const clientInput = mermaidImages?.[index];
      const bytes = serverMermaidPngs[index] ?? (clientInput ? decodePngDataUrl(clientInput.url) : null);
      if (bytes) return [imageParagraph(bytes, "Diagram")];
      return diagramFallbackParagraph("[Mermaid diagram source]", node.value);
    }
    if (node.lang === "archify") {
      let id: string | null = null;
      let diagramTitle = "Diagram";
      try {
        const parsed = JSON.parse(node.value) as { id?: unknown; title?: unknown };
        if (typeof parsed.id === "string") id = parsed.id;
        if (typeof parsed.title === "string") diagramTitle = parsed.title;
      } catch {
        // Malformed pointer -- falls through to the text stand-in below.
      }
      if (id) {
        try {
          const bytes = fs.readFileSync(archifyDiagramFilePath(id));
          if (isPng(bytes)) return [imageParagraph(bytes, diagramTitle)];
        } catch {
          // File missing/unreadable or an invalid id -- falls through to the
          // stand-in, but leave a trace so a mysteriously image-less export
          // can be diagnosed (the app resolves this dir from process.cwd()).
          console.warn(`Archify diagram "${id}" has no readable PNG -- writing a text stand-in instead.`);
        }
      }
      return diagramFallbackParagraph(`[Diagram: ${diagramTitle} -- image unavailable]`);
    }
    return codeParagraphs(node.value);
  }

  function renderTable(node: Extract<RootContent, { type: "table" }>): Table {
    hadTables = true;
    const columnCount = Math.max(1, ...node.children.map((row) => row.children.length));
    const columnWidth = Math.floor(CONTENT_WIDTH_TWIPS / columnCount);
    const border = { style: BorderStyle.SINGLE, size: 4, color: "C8C8CE" };
    const borders = { top: border, bottom: border, left: border, right: border };

    const rows = node.children.map((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const cells = Array.from({ length: columnCount }, (_, colIndex) => {
        const cell = row.children[colIndex];
        const runs = cell ? renderInline(cell.children, isHeader ? { bold: true } : {}) : [];
        return new TableCell({
          width: { size: columnWidth, type: WidthType.DXA },
          borders,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: isHeader ? { type: ShadingType.CLEAR, fill: "EDEDF0", color: "auto" } : undefined,
          children: [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: "" })] })],
        });
      });
      return new TableRow({ children: cells, tableHeader: isHeader });
    });

    return new Table({
      width: { size: columnWidth * columnCount, type: WidthType.DXA },
      columnWidths: Array.from({ length: columnCount }, () => columnWidth),
      rows,
    });
  }

  function renderList(node: Extract<RootContent, { type: "list" }>, ctx: BlockContext): (Paragraph | Table)[] {
    const ordered = !!node.ordered;
    const level = ctx.list ? ctx.list.level + 1 : 0;
    // Numbering identity:
    //  - an ordered list under a BULLET gets its own unique all-decimal
    //    definition (see nestedOrderedRefs above) -- restarts at 1, and
    //    isn't forced through the shared definition's letter/roman levels;
    //  - an ordered list under another ordered list inherits its parent's
    //    definition/instance (so sub-levels restart after each parent item);
    //  - a fresh top-level ordered list starts a new instance of the shared
    //    definition, so it restarts at 1 instead of continuing the last list.
    let ref = ctx.list?.ref;
    let instance: number;
    if (ordered && ctx.list && !ctx.list.ordered) {
      ref = `${ORDERED_NESTED_REF_PREFIX}${nestedOrderedRefs.length}`;
      nestedOrderedRefs.push(ref);
      instance = 0;
    } else if (ctx.list) {
      instance = ctx.list.instance;
    } else {
      instance = ordered ? ++orderedInstanceCounter : 0;
    }
    const out: (Paragraph | Table)[] = [];
    for (const item of node.children) {
      const itemCtx: BlockContext = { ...ctx, list: { level, ordered, instance, ref } };
      let usedItemMarker = false;
      for (const child of item.children) {
        if (child.type === "paragraph" && !usedItemMarker) {
          usedItemMarker = true;
          const runs = renderInline(child.children);
          // Task-list items (- [ ] / - [x]) would otherwise lose their
          // checked/unchecked state entirely.
          if (typeof item.checked === "boolean") runs.unshift(textRun(item.checked ? "☑ " : "☐ ", {}));
          out.push(paragraphFor(runs, itemCtx));
        } else if (child.type === "list") {
          out.push(...renderList(child, itemCtx));
        } else {
          out.push(...renderBlock(child, { ...itemCtx, list: undefined }));
        }
      }
    }
    return out;
  }

  function renderBlock(node: RootContent, ctx: BlockContext): (Paragraph | Table)[] {
    switch (node.type) {
      case "heading": {
        const levels = [
          HeadingLevel.HEADING_1,
          HeadingLevel.HEADING_2,
          HeadingLevel.HEADING_3,
          HeadingLevel.HEADING_4,
          HeadingLevel.HEADING_5,
          HeadingLevel.HEADING_6,
        ];
        return [new Paragraph({ heading: levels[Math.min(node.depth, 6) - 1], children: renderInline(node.children) })];
      }
      case "paragraph":
        return [paragraphFor(renderInline(node.children), ctx)];
      case "list":
        return renderList(node, ctx);
      case "code":
        return renderCode(node);
      case "table":
        return [renderTable(node), new Paragraph({ children: [], spacing: { after: 120 } })];
      case "blockquote":
        return node.children.flatMap((child) => renderBlock(child, { ...ctx, quote: true }));
      case "thematicBreak":
        return [
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8C8CE", space: 1 } },
            spacing: { before: 120, after: 120 },
          }),
        ];
      default:
        if ("children" in node && Array.isArray(node.children)) {
          const runs = renderInline(node.children as PhrasingContent[]);
          return runs.length ? [paragraphFor(runs, ctx)] : [];
        }
        if ("value" in node && typeof node.value === "string" && node.value.trim()) {
          return [paragraphFor([textRun(node.value, {})], ctx)];
        }
        return [];
    }
  }

  const children = tree.children.flatMap((node) => renderBlock(node, {}));
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

  // 9 levels (0-8) so deep nesting keeps its hierarchy instead of collapsing
  // into the deepest defined indent.
  const levelCount = MAX_LIST_LEVEL + 1;
  const bulletChars = ["•", "◦", "▪"];
  const orderedFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const levelIndent = (level: number) => ({ left: 720 + level * 360, hanging: 360 });
  const levelsWith = (format: (level: number) => (typeof LevelFormat)[keyof typeof LevelFormat], text: (level: number) => string) =>
    Array.from({ length: levelCount }, (_, level) => ({
      level,
      format: format(level),
      text: text(level),
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: levelIndent(level) } },
    }));

  const doc = new Document({
    title: xmlSafe(title),
    creator: "Blackbuck PRD Builder",
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 22 } },
        heading1: {
          run: { font: BODY_FONT, size: 36, bold: true, color: "000000" },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading2: {
          run: { font: BODY_FONT, size: 30, bold: true, color: "000000" },
          paragraph: { spacing: { before: 320, after: 140 } },
        },
        heading3: {
          run: { font: BODY_FONT, size: 26, bold: true, color: "000000" },
          paragraph: { spacing: { before: 240, after: 100 } },
        },
        heading4: {
          run: { font: BODY_FONT, size: 24, bold: true, color: "000000" },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: levelsWith(
            () => LevelFormat.BULLET,
            (level) => bulletChars[level % bulletChars.length]
          ),
        },
        {
          reference: ORDERED_REF,
          levels: levelsWith(
            (level) => orderedFormats[level % orderedFormats.length],
            (level) => `%${level + 1}.`
          ),
        },
        // One all-decimal definition per ordered list nested under a bullet.
        ...nestedOrderedRefs.map((reference) => ({
          reference,
          levels: levelsWith(
            () => LevelFormat.DECIMAL,
            (level) => `%${level + 1}.`
          ),
        })),
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: { top: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, right: MARGIN_TWIPS },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, hadTables, diagramsEmbedded, diagramsFallback };
}
