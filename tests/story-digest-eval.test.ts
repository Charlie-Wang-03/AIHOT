import test from "node:test";
import assert from "node:assert/strict";
import { parseDigestEvalJsonl, toProductionDigestInput } from "../scripts/eval-story-digests-core.ts";
import {
  DIGEST_PROMPT_VERSION,
  DigestSchema,
  buildStoryDigestInput,
} from "@aihot/backend/events/digest";

const row = () => ({
  caseId: "case-a",
  story: { title: "Atlas 测试扩大", previousDigest: "上一版综述" },
  inputMode: "incremental",
  knownArticleIds: ["old"],
  reports: [
    {
      id: "new",
      publishedAt: "2026-09-02T09:00:00+08:00",
      source: "B",
      firstParty: false,
      title: "测试扩大",
      summary: "仍属于有限测试",
      fact: {
        id: 2,
        subject: "Acme",
        action: "扩大",
        object: "Atlas 测试",
        conditions: "仍属于有限测试",
        evidence: "当前仍属于有限测试",
        structured: { conditions: [{ text: "有限测试", quote: "当前仍属于有限测试" }], evidence: "扩大测试" },
      },
    },
    {
      id: "old",
      publishedAt: "2026-09-01T09:00:00+08:00",
      source: "A",
      firstParty: true,
      title: "首次开放",
      summary: "首批客户获得资格",
      fact: {
        id: 1,
        subject: "Acme",
        action: "开放",
        object: "Atlas",
        conditions: "首批客户",
        evidence: "首批客户开始试用",
        structured: null,
      },
    },
  ],
});

test("digest eval JSONL parses evidence-bound cases and rejects duplicate ids", () => {
  const one = JSON.stringify(row());
  const parsed = parseDigestEvalJsonl(one);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.reports[0]!.fact.conditions, "仍属于有限测试");
  assert.throws(() => parseDigestEvalJsonl(`${one}\n${one}`), /duplicate digest eval caseId/);
});

test("story digest evaluator feeds the production input builder with facts and evidence", () => {
  const parsed = parseDigestEvalJsonl(JSON.stringify(row()))[0]!;
  const input = toProductionDigestInput(parsed);
  assert.deepEqual(input.reports.map((report) => report.id), ["old", "new"], "reports use production chronological order");
  assert.equal(input.latest, "测试扩大");
  const user = buildStoryDigestInput(input.story, input.reports, {
    corrected: input.corrected,
    knownArticleIds: input.knownArticleIds,
  });
  assert.match(user, /上一版综述/);
  assert.doesNotMatch(user, /【新】报道 old/);
  assert.match(user, /【新】报道 new/);
  assert.match(user, /事实 2/);
  assert.match(user, /仍属于有限测试/);
  assert.match(user, /当前仍属于有限测试/);
  assert.match(DIGEST_PROMPT_VERSION, /^story-digest@[0-9a-f]{10}$/);

  const parsedOutput = DigestSchema.parse({ title: "Atlas", digest: "这是一个长度足够的事件综述。", latest: "模型不负责它" });
  assert.deepEqual(Object.keys(parsedOutput).sort(), ["digest", "title"], "latest is deterministic production state, not model output");
});

test("corrected mode uses the production rewrite path and does not carry the previous digest", () => {
  const value = row();
  value.inputMode = "corrected";
  const parsed = parseDigestEvalJsonl(JSON.stringify(value))[0]!;
  const input = toProductionDigestInput(parsed);
  const user = buildStoryDigestInput(input.story, input.reports, {
    corrected: input.corrected,
    knownArticleIds: input.knownArticleIds,
  });
  assert.match(user, /经过更正/);
  assert.doesNotMatch(user, /上一版综述：/);
  assert.doesNotMatch(user, /【新】/);
});
