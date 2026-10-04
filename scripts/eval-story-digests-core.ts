import { z } from "zod";
import type { DigestReport } from "@aihot/backend/events/digest";

const ReportSchema = z.object({
  id: z.string().min(1),
  publishedAt: z.string().datetime({ offset: true }),
  source: z.string().min(1),
  firstParty: z.boolean().default(false),
  title: z.string().min(1),
  summary: z.string().nullable().default(null),
  fact: z.object({
    id: z.number().int().positive(),
    subject: z.string().nullable().default(null),
    action: z.string().nullable().default(null),
    object: z.string().nullable().default(null),
    conditions: z.string().nullable().default(null),
    evidence: z.string().nullable().default(null),
    structured: z.unknown().optional(),
  }),
});

const CaseSchema = z.object({
  caseId: z.string().min(1),
  story: z.object({
    title: z.string().min(1),
    previousDigest: z.string().nullable().default(null),
  }),
  inputMode: z.enum(["incremental", "corrected"]).default("incremental"),
  knownArticleIds: z.array(z.string().min(1)).default([]),
  reports: z.array(ReportSchema).min(1),
});

export type DigestEvalCase = z.infer<typeof CaseSchema>;

export function parseDigestEvalJsonl(text: string): DigestEvalCase[] {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try {
      return CaseSchema.parse(JSON.parse(line));
    } catch (error) {
      throw new Error(`invalid digest eval JSONL line ${index + 1}: ${String(error)}`);
    }
  });
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.caseId)) throw new Error(`duplicate digest eval caseId: ${row.caseId}`);
    seen.add(row.caseId);
  }
  return rows;
}

export function toProductionDigestInput(row: DigestEvalCase): {
  story: { title: string; digest: string | null };
  reports: DigestReport[];
  corrected: boolean;
  knownArticleIds: string[];
  latest: string;
} {
  const reports = row.reports.map((report): DigestReport => ({
    id: report.id,
    title: report.title,
    summary: report.summary,
    source_name: report.source,
    first_party: report.firstParty,
    at: new Date(report.publishedAt),
    fact_id: report.fact.id,
    fact_subject: report.fact.subject,
    fact_action: report.fact.action,
    fact_object: report.fact.object,
    fact_conditions: report.fact.conditions,
    evidence: report.fact.evidence,
    structured_fact: report.fact.structured ?? null,
  })).sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  return {
    story: { title: row.story.title, digest: row.story.previousDigest },
    reports,
    corrected: row.inputMode === "corrected",
    knownArticleIds: row.knownArticleIds,
    latest: reports[reports.length - 1]!.title,
  };
}
