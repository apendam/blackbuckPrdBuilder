import { prisma } from "./prisma";
import { ChatMessage } from "./types";
import { costForBreakdown, costForModel } from "./pricing";

function breakdownCost(model: { provider: "anthropic" | "openrouter"; model: string; inputTokens: number; outputTokens: number; cost?: number }): number {
  return model.cost ?? costForModel(model.provider, model.model, model.inputTokens, model.outputTokens);
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CostDashboardData {
  totals: { inputTokens: number; outputTokens: number; cost: number; messageCount: number };
  byModel: { provider: string; model: string; inputTokens: number; outputTokens: number; cost: number }[];
  // A multi-vertical PRD's full cost counts toward every vertical it touches,
  // not split between them -- these rows don't sum to `totals.cost`.
  byVertical: {
    vertical: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    conversationCount: number;
  }[];
  byDay: { date: string; cost: number }[];
  conversations: {
    id: string;
    title: string | null;
    status: string;
    verticals: string[];
    inputTokens: number;
    outputTokens: number;
    cost: number;
    updatedAt: string;
  }[];
}

export async function getCostDashboard(userId: string): Promise<CostDashboardData> {
  const rows = await prisma.conversation.findMany({ where: { userId } });

  const byModelMap = new Map<string, { provider: string; model: string; inputTokens: number; outputTokens: number; cost: number }>();
  const byDayMap = new Map<string, number>();
  const byVerticalMap = new Map<
    string,
    { cost: number; inputTokens: number; outputTokens: number; conversationIds: Set<string> }
  >();
  const conversations: CostDashboardData["conversations"] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let messageCount = 0;

  for (const row of rows) {
    const messages = parseJsonArray<ChatMessage>(row.messages);
    const verticals = parseJsonArray<string>(row.verticals);
    let convInput = 0;
    let convOutput = 0;
    let convCost = 0;

    for (const m of messages) {
      if (m.role !== "assistant" || !m.usage) continue;
      messageCount += 1;
      const byModel = m.usage.byModel ?? [];
      const msgCost = costForBreakdown(byModel);
      convInput += m.usage.inputTokens;
      convOutput += m.usage.outputTokens;
      convCost += msgCost;

      for (const b of byModel) {
        const key = `${b.provider}:${b.model}`;
        const existing =
          byModelMap.get(key) ?? { provider: b.provider, model: b.model, inputTokens: 0, outputTokens: 0, cost: 0 };
        existing.inputTokens += b.inputTokens;
        existing.outputTokens += b.outputTokens;
        existing.cost += breakdownCost(b);
        byModelMap.set(key, existing);
      }

      if (m.at) {
        const date = m.at.slice(0, 10);
        byDayMap.set(date, (byDayMap.get(date) ?? 0) + msgCost);
      }
    }

    totalInput += convInput;
    totalOutput += convOutput;
    totalCost += convCost;

    if (convInput + convOutput > 0) {
      conversations.push({
        id: row.id,
        title: row.title,
        status: row.status,
        verticals,
        inputTokens: convInput,
        outputTokens: convOutput,
        cost: convCost,
        updatedAt: row.updatedAt.toISOString(),
      });

      for (const v of verticals) {
        const existing =
          byVerticalMap.get(v) ?? { cost: 0, inputTokens: 0, outputTokens: 0, conversationIds: new Set<string>() };
        existing.cost += convCost;
        existing.inputTokens += convInput;
        existing.outputTokens += convOutput;
        existing.conversationIds.add(row.id);
        byVerticalMap.set(v, existing);
      }
    }
  }

  conversations.sort((a, b) => b.cost - a.cost);

  const byModel = Array.from(byModelMap.values()).sort((a, b) => b.cost - a.cost);

  const byDay = Array.from(byDayMap.entries())
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byVertical = Array.from(byVerticalMap.entries())
    .map(([vertical, v]) => ({
      vertical,
      cost: v.cost,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      conversationCount: v.conversationIds.size,
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    totals: { inputTokens: totalInput, outputTokens: totalOutput, cost: totalCost, messageCount },
    byModel,
    byVertical,
    byDay,
    conversations,
  };
}
