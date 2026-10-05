// Optional vision is one capability contract across admin routing and runtime image attachment.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { modelsOverview, switchModel } from "@aihot/backend/admin/models";
import {
  CAPABILITIES,
  capabilityAcceptsModel,
  invalidateModelCache,
  modelFor,
  modelSupportsVision,
} from "@aihot/backend/editorial/models";
import { MODELS } from "@aihot/backend/providers/llm";

after(async () => {
  await sql`DELETE FROM settings WHERE key = 'models.understand'`;
  invalidateModelCache();
  await closeDb();
});

test("content understanding accepts text and vision models while ordinary steps keep their existing boundary", async () => {
  const understand = CAPABILITIES.understand;
  assert.equal(understand.optionalVision, true);
  assert.equal(capabilityAcceptsModel(understand, MODELS["glm-5.3-flash"]!), true);
  assert.equal(capabilityAcceptsModel(understand, MODELS["qwen3-vl-flash"]!), true);
  assert.equal(capabilityAcceptsModel(CAPABILITIES.score, MODELS["glm-5.3-flash-selection"]!), true);
  assert.equal(capabilityAcceptsModel(CAPABILITIES.score, MODELS["qwen3-vl-flash"]!), false);
  assert.equal(capabilityAcceptsModel({ ...understand, vision: true }, MODELS["glm-5.3-flash"]!), false, "required vision wins over optional");

  await switchModel("understand", "qwen3-vl-flash", "optional vision routing test", "test");
  assert.equal(await modelFor("understand"), "qwen3-vl-flash");
  await switchModel("understand", "glm-5.3-flash", "text fallback routing test", "test");
  assert.equal(await modelFor("understand"), "glm-5.3-flash");
  await assert.rejects(
    switchModel("score", "qwen3-vl-flash", "must stay text-only", "test"),
    /vision-only model/,
  );

  const overview = await modelsOverview(1);
  const row = overview.capabilities.find((capability) => capability.key === "understand");
  assert.deepEqual(
    { vision: row?.vision, optionalVision: row?.optionalVision },
    { vision: false, optionalVision: true },
  );
});

test("runtime image attachment is explicit rather than probing presets with unspecified vision support", () => {
  assert.equal(modelSupportsVision("qwen3-vl-flash"), true);
  assert.equal(modelSupportsVision("glm-5.3-flash"), false);
  assert.equal(modelSupportsVision("qwen3.8-flash"), false);
  assert.equal(modelSupportsVision("default"), process.env.LLM_VISION === "true");
});
