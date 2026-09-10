import { MODEL_FACING_PHASES } from "./types";
import { KNOWN_REPOS } from "./knowledgeBase";

// Canonical, wire-format-agnostic tool definitions -- one list shared by every
// provider adapter. `schema` is plain JSON Schema, valid as both Anthropic's
// `input_schema` and an OpenAI-compatible `function.parameters` verbatim, so
// there's exactly one place that defines what each tool does and takes,
// regardless of which provider is calling it.
export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "read_reference_file",
    description:
      "Read a file under the prd-builder skill's references/ directory, e.g. 'system-map/README.md' or 'verticals/toll.md' or 'system-map/flows/fastag-onboarding-and-activation.md'.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to references/, e.g. 'verticals/tzf.md'" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_reference_dir",
    description: "List files in a references/ subdirectory, e.g. 'verticals' or 'system-map/flows'.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to references/" },
      },
      required: ["path"],
    },
  },
  {
    name: "read_repo_file",
    description: `Read a file from a live local clone of one of Blackbuck's repos, to re-verify exact current behavior before citing it. Known repos: ${KNOWN_REPOS.join(", ")}.`,
    schema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "One of the known repo names" },
        path: { type: "string", description: "File path relative to the repo root" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "list_repo_files",
    description: "List files/directories inside a repo at a given path, to find the right file before reading it.",
    schema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "One of the known repo names" },
        path: { type: "string", description: "Directory path relative to the repo root, '' for root" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "search_repo",
    description:
      "Grep a live repo clone for every occurrence of a pattern (class name, enum value, method name) and get back every matching file:line in one call -- use this instead of guessing which file to open when you need to know every call site or every meaning of something, not just the first one you find. Especially important for status/enum values, dues/mandate classes, and anything with more than one meaning across the codebase.",
    schema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "One of the known repo names" },
        pattern: { type: "string", description: "Extended regex (grep -E) pattern, e.g. a class or enum name" },
      },
      required: ["repo", "pattern"],
    },
  },
  {
    name: "update_phase_progress",
    description:
      "Report the current PRD-writing phase and which phases are fully complete, so the UI progress sidebar stays accurate. Call this silently every time the phase changes, including entering phase 1.",
    schema: {
      type: "object",
      properties: {
        current_phase: { type: "string", enum: [...MODEL_FACING_PHASES] },
        completed_phases: {
          type: "array",
          items: { type: "string", enum: [...MODEL_FACING_PHASES] },
        },
      },
      required: ["current_phase", "completed_phases"],
    },
  },
  {
    name: "set_title",
    description:
      "Set a short human-readable title for this PRD, as soon as the objective (phase 1) is clear enough to name it -- e.g. 'FASTag Hotlist Replacement Bypass'. Call again later if the scope changes enough that the title no longer fits. Used for the drafts/completed-PRDs dashboard, not shown to the PM as a chat message.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short human-readable title, not kebab-case" },
      },
      required: ["title"],
    },
  },
  {
    name: "save_prd_markdown",
    description:
      "Save the finished PRD as a Markdown file, once the full PRD (phase 8) is confirmed ready and you've reached phase 9's output step. Always call this AND create_google_doc at phase 9 -- they're the two required outputs, not alternatives.",
    schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Full PRD content in Markdown" },
      },
      required: ["content"],
    },
  },
  {
    name: "create_google_doc",
    description:
      "Create a Google Doc with the finished PRD content, at phase 9's output step. Always call this AND save_prd_markdown -- they're the two required outputs, not alternatives. If this fails (e.g. the PM hasn't granted Docs access), tell the PM plainly and still keep the Markdown output -- don't treat a Doc failure as blocking.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Google Doc title, human-readable" },
        content: { type: "string", description: "Full PRD content in Markdown -- converted to Doc formatting" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "set_verticals",
    description:
      "Record the confirmed vertical scope from phase 4, once the PM has confirmed it (after the system-map reverification step). Used for search/filtering on the drafts and completed-PRDs dashboard. Call again if scope changes later.",
    schema: {
      type: "object",
      properties: {
        verticals: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "Sales",
              "Toll",
              "Fuel",
              "TZF",
              "Payments",
              "GPS",
              "Supply",
              "Load Board",
              "Finserve",
              "Frontend",
              "Android",
              "BB Pro",
            ],
          },
        },
      },
      required: ["verticals"],
    },
  },
  {
    name: "save_skeleton",
    description:
      "Save the current skeleton as structured sections/pointers, at phase 6 (initial draft) and again after every phase 7 revision. This drives the PM's skeleton editor UI -- always call this instead of (or in addition to) describing the skeleton in chat text, so the PM can comment on/delete/add individual pointers directly rather than only replying in prose. Send the FULL current skeleton every time, not a diff.",
    schema: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "Section heading, e.g. 'Objective', 'Product Features & Workflow'" },
              pointers: {
                type: "array",
                items: { type: "string" },
                description: "Short bullet-point lines under this heading -- the 1-3 sentence skeleton content, or sub-points once expanded",
              },
            },
            required: ["heading", "pointers"],
          },
        },
      },
      required: ["sections"],
    },
  },
];

// Not included in TOOL_DEFS -- this is only ever offered to the independent
// full_prd_verify pass (see runVerificationPass in claude.ts), never to the
// drafting model, so a drafting turn can't short-circuit by "reporting
// findings" about its own work instead of actually writing the PRD.
//
// `category` is a free string, not a fixed enum: the mismatches this audit
// actually found split into contradictions (PRD claims X, code shows
// not-X), omissions (PRD is silent on something the code makes load-bearing),
// and incomplete citations (PRD names one of several call sites) -- three
// different shapes that don't share a common "claim vs fact" structure. A
// closed enum would force every future mismatch shape into one of these or
// get extended forever; a free label costs nothing and never runs out.
export const REPORT_VERIFICATION_FINDINGS_TOOL: ToolDef = {
  name: "report_verification_findings",
  description:
    "Report what you found after independently re-deriving the PRD's risky sections from the live repos. Call this exactly once, even if you found nothing -- pass an empty findings array in that case. Do not describe your findings in prose instead of calling this.",
  schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string", description: "PRD section this concerns, e.g. '§7.8 Dues Clearance'" },
            category: {
              type: "string",
              description:
                "Free label for the kind of mismatch, e.g. 'contradiction', 'omission', 'incomplete', 'fabrication' (the PRD asserts an existing mechanism that isn't real -- never for a genuinely new/proposed one)",
            },
            summary: {
              type: "string",
              description:
                "One sentence, written for a PM -- describe what the PRODUCT actually does (or doesn't do), not the code. No class/method/API names or code syntax here; put those in `citation` instead.",
            },
            whyItMatters: {
              type: "string",
              description:
                "The concrete, plain-English consequence for a customer, ops user, or the business if this ships as-is. Still no code jargon -- describe the outcome, not the mechanism.",
            },
            citation: {
              type: "string",
              description:
                "The technical anchor: repo/file:line and the specific class/method/enum you checked -- this is the ONE field where code-level detail belongs.",
            },
            prdQuote: {
              type: "string",
              description:
                "The exact PRD sentence or clause this concerns, copied character-for-character from the PRD text you were given -- not a paraphrase. This is how the finding gets anchored/highlighted in the document, so it must be a real, verbatim substring. Make it specific enough (a full clause or sentence, not a 2-3 word fragment) that it's unlikely to repeat elsewhere in the document. If this finding genuinely isn't about one specific passage (e.g. it concerns the PRD's overall structure), leave this empty.",
            },
          },
          required: ["section", "category", "summary", "whyItMatters", "citation", "prdQuote"],
        },
      },
    },
    required: ["findings"],
  },
};

// read_reference_file/list_reference_dir are included specifically so the
// judge can consult references/system-map/ (the code-grounded cross-repo
// capability maps, e.g. what a Gold-like feature is expected to cover) as a
// completeness reference -- NOT the drafting skill's tone/skeleton/vertical
// files, which stay withheld to avoid anchoring the judge on the drafting
// model's own conventions. See buildVerifierSystemPrompt's completeness
// section for the instruction restricting this to system-map/ paths.
export const VERIFICATION_TOOL_DEFS: ToolDef[] = [
  ...TOOL_DEFS.filter((t) =>
    ["read_repo_file", "list_repo_files", "search_repo", "read_reference_file", "list_reference_dir"].includes(t.name)
  ),
  REPORT_VERIFICATION_FINDINGS_TOOL,
];
