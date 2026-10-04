# 事件综述提示词评测

事件综述由 `industry/prompts/story-digest.md` 生成。它属于读者直接看到的模型输出；修改提示词时，应在**同一批事实与证据输入**上做前后对照，而不是只凭线上页面印象判断。

本仓库提供一个轻量评测脚本：

```bash
node --env-file=.env scripts/eval-story-digests.ts \
  --cases .data/story-digest-cases.jsonl
```

它直接复用当前 production 的：

- `DIGEST_SYSTEM` 与 prompt version；
- `DigestSchema`；
- `buildStoryDigestInput()`；
- `digest` model route；
- receipt / budget 机制。

因此 production 对事实条件、来源证据、增量报道和更正场景的输入规则发生变化时，评测不会维护第二份近似 prompt。

脚本**不会**修改 story、写入 production digest，也不会自动给文风打分。

## 准备案例

真实案例放在不会提交的 `.data/`。仓库中的 `industry/story-digest-eval.example.jsonl` 是纯虚构格式示例。

每行一个事件，包含：

- `story.title`：当前事件标题；
- `story.previousDigest`：增量生成时可选的上一版综述；
- `inputMode`：`incremental` 或 `corrected`；
- `knownArticleIds`：上一版已知报道 id；
- `reports`：报道及其 production digest 所需的事实 / 条件 / 证据字段。

简化示例：

```json
{"caseId":"example","story":{"title":"事件标题","previousDigest":null},"inputMode":"incremental","knownArticleIds":[],"reports":[{"id":"r1","publishedAt":"2026-09-01T09:00:00+08:00","source":"Acme","firstParty":true,"title":"报道标题","summary":"摘要","fact":{"id":1,"subject":"Acme","action":"发布","object":"Atlas","conditions":"有限测试","evidence":"原文证据","structured":null}}]}
```

production 会按时间排序报道，并只把最后 40 篇交给 prompt builder。评测脚本采用同样的 builder，不另外复制这一规则。

### 两种输入模式

- `incremental`：允许带上 `previousDigest`，并通过 `knownArticleIds` 标出新增报道；
- `corrected`：模拟报道内容 / 事实证据被更正或成员变化后的重写，不沿用上一版综述。

## 比较模型

默认跟随当前 `digest` capability 的模型。也可以显式比较多个已配置模型：

```bash
node --env-file=.env scripts/eval-story-digests.ts \
  --cases .data/story-digest-cases.jsonl \
  --models default,deepseek-flash
```

报告写到 `.data/eval/story-digests-*.json`，记录：

- prompt version；
- model；
- 每个 case 的 `title / digest`；
- 与 production 一致、由最后一篇报道标题确定的 `latest`；
- receipt id 与是否复用；
- token usage / provider latency；
- generation error（如有）。

相同渲染输入在一次运行内共享同一个模型请求，避免并发首跑为同一 prompt 重复付费；重复运行仍由 receipt 机制复用已有响应。

## 比较 prompt revision

脚本始终运行当前 checkout 的 production prompt。比较修改前后：

1. 修改前运行一次并保留报告；
2. 修改 `story-digest.md`；
3. 对同一份 cases 再运行一次；
4. 按 `caseId` 人工比较两个报告。

prompt version 随提示词内容哈希变化，因此报告能够指出每次输出对应的 wording。

## 人工比较什么

事件综述没有可靠的单一自动指标。本工具不引入没有人工依据的 LLM-as-a-judge “质量分”。

可人工检查：

- 是否先给核心变化与当前结论，而不是重复时间线；
- 是否出现空泛、公关式表达；
- 条件、适用对象、收费 / 额度 / 地域等限制是否仍绑定在正确对象上；
- 是否忠实使用来源证据；
- 是否加入报道和事实证据中不存在的信息；
- 更正模式是否清除已经失效的旧说法。

CI 只验证 JSONL parsing、case → production input 映射和共享 production contract，不访问真实模型服务。
