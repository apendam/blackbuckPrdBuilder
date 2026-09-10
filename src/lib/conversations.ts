import { prisma } from "./prisma";
import {
  ChatMessage,
  Phase,
  PhaseState,
  PHASES,
  PhaseLogEntry,
  SkeletonSection,
  SkeletonHistoryEntry,
  VerificationFinding,
} from "./types";
import type { Conversation } from "@/generated/prisma";

export interface ConversationView {
  id: string;
  title: string | null;
  status: string;
  currentPhase: Phase;
  completedPhases: Phase[];
  messages: ChatMessage[];
  verticals: string[];
  phaseLog: PhaseLogEntry[];
  skeletonSections: SkeletonSection[];
  skeletonHistory: SkeletonHistoryEntry[];
  verificationFindings: VerificationFinding[];
  notes: string;
  prdMarkdownPath: string | null;
  googleDocUrl: string | null;
  version: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

function isKnownPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toView(row: Conversation): ConversationView {
  const completedPhases = parseJsonArray<string>(row.completedPhases).filter(isKnownPhase);
  const messages = parseJsonArray<ChatMessage>(row.messages);
  const verticals = parseJsonArray<string>(row.verticals);
  const phaseLog = parseJsonArray<PhaseLogEntry>(row.phaseLog);
  const skeletonSections = parseJsonArray<SkeletonSection>(row.skeletonSections);
  const skeletonHistory = parseJsonArray<SkeletonHistoryEntry>(row.skeletonHistory);
  const verificationFindings = parseJsonArray<VerificationFinding>(row.verificationFindings);
  const currentPhase = isKnownPhase(row.currentPhase) ? row.currentPhase : "objective";

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    currentPhase,
    completedPhases,
    messages,
    verticals,
    phaseLog,
    skeletonSections,
    skeletonHistory,
    verificationFindings,
    notes: row.notes,
    prdMarkdownPath: row.prdMarkdownPath,
    googleDocUrl: row.googleDocUrl,
    version: row.version,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function createConversation(userId: string): Promise<ConversationView> {
  const row = await prisma.conversation.create({ data: { userId } });
  return toView(row);
}

export async function getConversation(
  userId: string,
  id: string
): Promise<ConversationView | null> {
  const row = await prisma.conversation.findFirst({ where: { id, userId } });
  return row ? toView(row) : null;
}

export interface ListFilters {
  query?: string;
  verticals?: string[];
  sort?: "updated" | "created";
}

export async function listConversations(
  userId: string,
  statuses: string[],
  filters: ListFilters = {}
): Promise<ConversationView[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId, status: { in: statuses } },
    orderBy: { [filters.sort === "created" ? "createdAt" : "updatedAt"]: "desc" },
  });
  let views = rows.map(toView);

  if (filters.query) {
    const q = filters.query.toLowerCase();
    views = views.filter((v) => (v.title ?? "").toLowerCase().includes(q));
  }
  if (filters.verticals && filters.verticals.length > 0) {
    const wanted = new Set(filters.verticals);
    views = views.filter((v) => v.verticals.some((vert) => wanted.has(vert)));
  }
  return views;
}

export async function saveConversationTurn(
  userId: string,
  id: string,
  messages: ChatMessage[],
  phaseState: PhaseState,
  extra: {
    title?: string;
    verticals?: string[];
    skeletonSections?: SkeletonSection[];
    skeletonHistory?: SkeletonHistoryEntry[];
    savedPrd?: { path: string };
    googleDocUrl?: string;
    verificationFindings?: VerificationFinding[];
  } = {}
): Promise<ConversationView> {
  const existing = await prisma.conversation.findFirst({ where: { id, userId } });
  const isOutputPhase = phaseState.current === "output" && !!extra.savedPrd;

  let phaseLog = existing ? parseJsonArray<PhaseLogEntry>(existing.phaseLog) : [];
  if (existing && existing.currentPhase !== phaseState.current) {
    phaseLog = [...phaseLog, { phase: phaseState.current, at: new Date().toISOString() }];
  }

  const row = await prisma.conversation.update({
    where: { id, userId },
    data: {
      messages: JSON.stringify(messages),
      currentPhase: phaseState.current,
      completedPhases: JSON.stringify(phaseState.completed),
      phaseLog: JSON.stringify(phaseLog),
      ...(extra.title ? { title: extra.title } : {}),
      ...(extra.verticals ? { verticals: JSON.stringify(extra.verticals) } : {}),
      ...(extra.skeletonSections ? { skeletonSections: JSON.stringify(extra.skeletonSections) } : {}),
      ...(extra.skeletonHistory ? { skeletonHistory: JSON.stringify(extra.skeletonHistory) } : {}),
      ...(extra.savedPrd ? { prdMarkdownPath: extra.savedPrd.path } : {}),
      ...(extra.googleDocUrl ? { googleDocUrl: extra.googleDocUrl } : {}),
      ...(extra.verificationFindings
        ? { verificationFindings: JSON.stringify(extra.verificationFindings) }
        : {}),
      ...(isOutputPhase ? { status: "completed", completedAt: new Date() } : {}),
    },
  });
  return toView(row);
}

export async function setConversationStatus(
  userId: string,
  id: string,
  status: "draft" | "completed" | "archived"
): Promise<void> {
  await prisma.conversation.update({ where: { id, userId }, data: { status } });
}

// Lets the PM rename a PRD directly, independent of the drafting model's own
// set_title tool call -- the model's title is often a fine starting point but
// isn't the last word on it.
export async function setConversationTitle(userId: string, id: string, title: string): Promise<void> {
  await prisma.conversation.update({ where: { id, userId }, data: { title } });
}

export async function updateNotes(userId: string, id: string, notes: string): Promise<void> {
  await prisma.conversation.update({ where: { id, userId }, data: { notes } });
}

// Used by the manual "re-verify" action (POST /api/conversations/:id/verify)
// -- separate from saveConversationTurn since a re-verify doesn't touch
// messages/phaseState, just the findings.
export async function saveVerificationFindings(
  userId: string,
  id: string,
  findings: VerificationFinding[]
): Promise<void> {
  await prisma.conversation.update({
    where: { id, userId },
    data: { verificationFindings: JSON.stringify(findings) },
  });
}

// Used by the manual "Export to Google Doc" action (POST
// /api/conversations/:id/export-google-doc) -- separate from
// saveConversationTurn since this doesn't touch messages/phaseState, just the
// resulting doc URL.
export async function setGoogleDocUrl(userId: string, id: string, url: string): Promise<void> {
  await prisma.conversation.update({
    where: { id, userId },
    data: { googleDocUrl: url },
  });
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  await prisma.conversation.delete({ where: { id, userId } });
}

export async function createRevision(
  userId: string,
  parentId: string
): Promise<ConversationView | null> {
  const parent = await prisma.conversation.findFirst({ where: { id: parentId, userId } });
  if (!parent) return null;

  const row = await prisma.conversation.create({
    data: {
      userId,
      title: parent.title,
      status: "draft",
      currentPhase: "skeleton_revision",
      completedPhases: JSON.stringify(PHASES.slice(0, PHASES.indexOf("skeleton_revision"))),
      messages: parent.messages,
      verticals: parent.verticals,
      skeletonSections: parent.skeletonSections,
      skeletonHistory: parent.skeletonHistory,
      version: parent.version + 1,
      parentId: parent.id,
    },
  });
  return toView(row);
}

// Like createRevision, but for line-level feedback on an already-completed
// PRD rather than a skeleton do-over: lands in full_prd (not
// skeleton_revision), doesn't carry forward prdMarkdownPath/googleDocUrl
// (those are the OLD version's output -- this one gets fresh ones once the
// model re-runs Phase 9 after revising). Requires the parent to actually
// have a saved PRD; there's nothing to comment on otherwise.
export async function createPrdRevision(
  userId: string,
  parentId: string
): Promise<ConversationView | null> {
  const parent = await prisma.conversation.findFirst({ where: { id: parentId, userId } });
  if (!parent || !parent.prdMarkdownPath) return null;

  const row = await prisma.conversation.create({
    data: {
      userId,
      title: parent.title,
      status: "draft",
      currentPhase: "full_prd",
      completedPhases: JSON.stringify(PHASES.slice(0, PHASES.indexOf("full_prd"))),
      messages: parent.messages,
      verticals: parent.verticals,
      skeletonSections: parent.skeletonSections,
      skeletonHistory: parent.skeletonHistory,
      version: parent.version + 1,
      parentId: parent.id,
    },
  });
  return toView(row);
}

export async function createFromTemplate(
  userId: string,
  templateId: string
): Promise<ConversationView | null> {
  const template = await prisma.conversation.findFirst({ where: { id: templateId, userId } });
  if (!template) return null;

  const seed: ChatMessage[] = [
    {
      role: "user",
      content: template.title
        ? `I'd like to write a new PRD, structured similarly to "${template.title}", but for a different topic. I'll describe the new objective now.`
        : "I'd like to write a new PRD, structured similarly to a previous one, but for a different topic.",
    },
  ];

  const row = await prisma.conversation.create({
    data: { userId, messages: JSON.stringify(seed) },
  });
  return toView(row);
}

export async function getVersionChain(
  userId: string,
  id: string
): Promise<ConversationView[]> {
  // Walk to the root ancestor, then fetch the whole family in one go.
  let rootId = id;
  let cursor = await prisma.conversation.findFirst({ where: { id, userId } });
  while (cursor?.parentId) {
    const next = await prisma.conversation.findFirst({
      where: { id: cursor.parentId, userId },
    });
    if (!next) break;
    rootId = next.id;
    cursor = next;
  }

  const family = await prisma.conversation.findMany({
    where: { userId, OR: [{ id: rootId }, { parentId: rootId }] },
    orderBy: { version: "asc" },
  });
  // Family above only covers root + its direct revisions (one level); walk
  // further if any revision itself has revisions (keeps this simple for the
  // common shallow case while still terminating on deep chains).
  const seen = new Map(family.map((r) => [r.id, r]));
  let frontier = family.filter((r) => r.parentId === rootId);
  while (frontier.length > 0) {
    const children = await prisma.conversation.findMany({
      where: { userId, parentId: { in: frontier.map((f) => f.id) } },
    });
    const fresh = children.filter((c) => !seen.has(c.id));
    fresh.forEach((c) => seen.set(c.id, c));
    frontier = fresh;
  }

  return Array.from(seen.values())
    .sort((a, b) => a.version - b.version)
    .map(toView);
}
