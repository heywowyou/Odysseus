# LLM provider alternatives to mistral-medium-latest

Research date: 2026-08-29. All prices are USD per 1M tokens, from the official pages listed in Sources on that date. Any claim that could not be confirmed from a primary source is marked UNVERIFIED.

## Decision context

The project calls chat completions with `responseFormat: { type: 'json_schema', jsonSchema: { name, schemaDefinition, strict: true } }` and validates the answer with Zod. The current model is `mistral-medium-latest` (Mistral Medium 3.5, $1.50 input / $7.50 output per 1M tokens). Candidates are evaluated in this priority order:

1. Strict server-side JSON-schema structured output (OpenAI-style `json_schema` with `strict: true`).
2. High-quality French and English prose (client-facing French report text and cold-outreach emails).
3. No reasoning/thinking token trap: usable with reasoning off, or thinking does not eat the `maxTokens` budget shared with the JSON answer.
4. `temperature` parameter accepted (project uses 0.2).
5. Low price at volume: per-prospect short outputs, and 2 to 3 calls per audit with `maxTokens` 16000.
6. EU/GDPR posture: where data is hosted and processed, whether API data trains models. A con/pro item, not a hard blocker.
7. Small migration: OpenAI-compatible endpoint or official TypeScript SDK.

## Comparison table

| Model | Provider | Input $/1M | Output $/1M | Strict JSON schema | Temperature | EU data posture | One-line verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mistral-medium-latest (baseline) | Mistral | 1.50 | 7.50 | Yes | Yes | EU default | Current baseline, expensive for the output volume |
| mistral-small-latest (Small 4) | Mistral | 0.15 | 0.60 | Yes | Yes | EU default | Cheapest in-house fallback, quality gap unverified |
| mistral-large-latest (Large 3) | Mistral | 0.50 | 1.50 | Yes | Yes | EU default | Cheap flagship, but the project found it broken with the tooling |
| GLM-4.5-Flash / GLM-4.7-Flash | Z.ai | Free | Free | No, json_object only | Yes | China-based vendor | Free but no server-side schema enforcement |
| GLM-4.7-FlashX | Z.ai | 0.07 | 0.40 | No, json_object only | Yes | China-based vendor | Very cheap, same schema limitation |
| GLM-4.5-Air | Z.ai | 0.20 | 1.10 | No, json_object only | Yes | China-based vendor | Cheap paid tier, same schema limitation |
| GLM-4.6 | Z.ai | 0.60 | 2.20 | No, json_object only | Yes | China-based vendor | Strong model, schema gap remains |
| deepseek-v4-flash | DeepSeek | 0.44 peak, 0.22 off-peak | 1.32 peak, 0.66 off-peak | No, json_object only | Yes (not restricted per docs) | China-based vendor | Extremely cheap, thinking defaults on, schema gap |
| Gemini 2.5 Flash | Google | 0.30 | 2.50 (incl. thinking) | Yes, subset of JSON Schema | Yes | Paid tier not used for training | Strong mid tier, thinking budget needs care |
| Gemini 2.5 Flash-Lite | Google | 0.10 | 0.40 (incl. thinking) | Yes, subset of JSON Schema | Yes | Paid tier not used for training | Thinking off by default, cheapest credible full-fit |
| gpt-4.1-mini | OpenAI | 0.40 | 1.60 | Yes, strict | Yes, 0 to 2 | EU residency endpoint available | Cleanest overall fit for this project |
| gpt-4o-mini | OpenAI | 0.15 | 0.60 | Yes, strict | Yes, 0 to 2 | EU residency endpoint available | Older but very cheap and fully compatible |
| gpt-5-mini | OpenAI | 0.25 | 2.00 | Yes, strict | Fixed at 1 (community-documented) | EU residency endpoint available | Strong, but temperature 0.2 is rejected |
| gpt-5-nano | OpenAI | 0.05 | 0.40 | Yes, strict | Fixed at 1 (community-documented) | EU residency endpoint available | Cheapest OpenAI tier, same temperature block |
| Claude Haiku 4.5 | Anthropic | 1.00 | 5.00 | Yes, json_schema via output_config | Yes, 0 to 1 (pre Opus 4.6 model) | US residency option only (1.1x price) | Strong French, but not cheap and a different API shape |
| grok-4.3 | xAI | 1.25 | 2.50 | Yes, schema guaranteed | Yes, 0 to 2 | US-based, no EU option found | Capable but no cheap tier and weakest EU posture |
| qwen3.7-flash | Alibaba Cloud | 0.03 (0 to 32K tier) | 0.13 | json_schema exists but not on Singapore region | Yes | Singapore endpoint, China vendor | json_schema mode unavailable internationally: dealbreaker |
| qwen3.8-flash | Alibaba Cloud | 0.15 | 0.47 | Same Singapore limitation | Yes | Singapore endpoint, China vendor | Same schema limitation |
| MiniMax M3 / M2.x | MiniMax | 0.30 | 1.20 | UNVERIFIED | UNVERIFIED | China-based vendor | Cheap agentic model, capability fit unverified |
| Kimi K2.6 | Moonshot | 0.95 | 4.00 | No, JSON Mode (json_object) | UNVERIFIED | China-based vendor | Priced like the baseline without the schema support |

## Model notes

### Mistral (baseline and in-house alternatives)

- mistral-medium-latest is Mistral Medium 3.5 at $1.50 input / $7.50 output. Mistral Small 4 is $0.15 / $0.60 and Mistral Large 3 is $0.50 / $1.50. (Source: https://mistral.ai/pricing/api)
- The pricing page no longer lists Magistral Small or Magistral Medium, so their current status and price are UNVERIFIED from this page.
- Structured output: the project already uses `json_schema` strict mode against the Mistral API successfully with mistral-medium.
- EU posture: Mistral states that API data is hosted in the EU by default, with a US endpoint only as an explicit opt-in. (Source: https://help.mistral.ai, surfaced via search of mistral.ai domains; the dedicated GDPR page returned 404 during research)
- Pros of staying: zero migration, best-in-class EU posture.
- Cons: the user already finds Medium expensive and Large unreliable with the current tooling; Small is cheap but its French prose quality for client-facing reports is UNVERIFIED and would need a sample test.

### Z.ai GLM family (the "glm flash" question)

- GLM-4.5-Flash and GLM-4.7-Flash are free; GLM-4.7-FlashX is $0.07 / $0.40; GLM-4.5-Air is $0.20 / $1.10; GLM-4.6 is $0.60 / $2.20; GLM-5.3-Flash is $0.075 / $0.25 at a promo discount until 2026-09-09 (list $0.15 / $0.50). There is no text model named "GLM-4.6-Flash"; the 4.6 Flash variant is vision-only (GLM-4.6V-Flash). (Source: https://docs.z.ai/guides/overview/pricing)
- Structured output: the API documents only `response_format: {"type": "json_object"}`. Structure is enforced by putting the schema in the system prompt, and the docs themselves instruct client-side schema validation with fallback handling. There is no server-side `json_schema` strict mode; a GitHub issue on the official SDK reports a passed json_schema object being silently ignored. (Sources: https://docs.z.ai/guides/capabilities/struct-output, https://github.com/zai-org/z-ai-sdk-python/issues/73)
- Thinking can be disabled explicitly per request (`thinking: {"type": "disabled"}` style parameter shown in the GLM-4.6 guide), so the Magistral-style thinking trap is avoidable. (Source: https://docs.z.ai/guides/llm/glm-4.6)
- Temperature is shown in the request examples, so it is supported. (Source: https://docs.z.ai/guides/llm/glm-4.6)
- SDK: official TypeScript SDK and OpenAI-compatible base URL (`https://api.z.ai/api/paas/v4/`). (Source: https://docs.z.ai/guides/llm/glm-4.6)
- Pros: extremely cheap or free, thinking switchable off, OpenAI-compatible.
- Cons: no server-side schema enforcement, which fails criterion 1 at the strictest reading; the project would rely on prompt-side schema plus Zod rejection and retries. Zhipu is a China-based vendor and the international platform gives no EU residency claim found during research, a procurement con for an EAA-compliance product.

### DeepSeek

- Current lineup is deepseek-v4-flash, deepseek-v4-pro, deepseek-v4-flash-vision-exp. V4-flash: input cache miss $0.44 peak / $0.22 off-peak, output $1.32 peak / $0.66 off-peak; cache-hit input $0.014 peak. Off-peak is roughly half price. deepseek-chat / V3.x names no longer appear on the pricing page. (Source: https://api-docs.deepseek.com/quick_start/pricing)
- Structured output: only `{"type": "json_object"}` is documented, with a known issue of occasionally empty content; no json_schema support. (Source: https://api-docs.deepseek.com/guides/json_mode)
- Thinking: all V4 models support both thinking and non-thinking modes, with thinking the default. (Source: https://api-docs.deepseek.com/quick_start/pricing)
- Pros: possibly the cheapest credible quality tier; OpenAI-compatible.
- Cons: json_object only, thinking on by default (needs an explicit off switch plus retesting), data stored in China, so the weakest GDPR posture of any candidate here.

### Google Gemini

- Gemini 2.5 Flash: $0.30 input / $2.50 output, output price explicitly includes thinking tokens. Gemini 2.5 Flash-Lite: $0.10 / $0.40, same note. Both have a free tier. Gemini 3 Flash Preview is $0.50 / $3.00 and 3.x Flash models are free through 2026-12-31. Gemini 2.0 Flash no longer appears on the pricing page. (Source: https://ai.google.dev/gemini-api/docs/pricing)
- Thinking: on 2.5 Flash-Lite thinking is off by default; on 2.5 Flash it is on by default. When thinking is on, "response pricing is the sum of output tokens and thinking tokens", which is the same trap Magistral caused unless you control it. (Sources: https://ai.google.dev/gemini-api/docs/thinking, https://ai.google.dev/gemini-api/docs/pricing)
- Structured output: schema-driven output is supported, but only a subset of the JSON Schema spec; large or deeply nested schemas may be rejected, and Google recommends validating in your application. The OpenAI-compatible layer supports `zodResponseFormat` from the OpenAI SDK. (Sources: https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/gemini-api/docs/openai)
- Temperature: appears throughout the generation config examples; range 0 to 2 per the standard Gemini generationConfig. (Source: https://ai.google.dev/api/generate-content)
- EU posture: for paid services Google does not use prompts or responses to improve products, and processes under a DPA; data "may be stored transiently or cached in any country in which Google or its agents maintain facilities". Free tier is different (data used for improvement). (Source: https://ai.google.dev/gemini-api/terms)
- Pros: Flash-Lite is the cheapest fully schema-capable candidate with thinking off by default; free tier for testing; OpenAI-compatible endpoint means a near drop-in swap; strong multilingual lineage, though French prose quality for this product is UNVERIFIED and needs a sample run.
- Cons: schema support is a subset, so the project schema must be checked against it; on 2.5 Flash the thinking budget must be capped or disabled explicitly to protect the 16000-token output budget; compatibility layer is labelled beta.

### OpenAI

- gpt-4.1-mini: $0.40 / $1.60. gpt-4o-mini: $0.15 / $0.60 (still served). gpt-5-mini: $0.25 / $2.00. gpt-5-nano: $0.05 / $0.40. Cached input is 10 percent of input price. (Source: https://developers.openai.com/api/docs/pricing)
- Structured outputs: `response_format` with `json_schema` and strict mode is the flagship feature of this provider and is guaranteed server-side. (Source: https://developers.openai.com/api/docs/guides/structured-outputs)
- Temperature: the chat completions reference lists temperature 0 to 2 with no model restriction, but parameter support "can differ depending on the model used, particularly for newer reasoning models". GPT-5 family models reject any temperature other than the default 1 with an error like "Only the default (1) value is supported"; this is documented in community reports and issue trackers rather than in the pricing or GPT-5 guide pages. So gpt-4.1-mini and gpt-4o-mini accept temperature 0.2, while gpt-5-mini and gpt-5-nano do not. (Sources: https://developers.openai.com/api/docs/api-reference/chat/create, https://community.openai.com/t/temperature-in-gpt-5-models/1337133)
- Reasoning: on GPT-5 models reasoning effort is controlled by `reasoning.effort` (minimal to high) and reasoning tokens are billed as output tokens. (Source: https://developers.openai.com/api/docs/guides/gpt-5)
- EU posture: API data is not used for training by default; an EU data residency endpoint (`eu.api.openai.com`) exists with regional storage and processing, with a 10 percent uplift on eligible models. (Source: https://developers.openai.com/api/docs/guides/your-data)
- Pros of gpt-4.1-mini: meets every criterion with no caveats; official TypeScript SDK and the request shape the code already uses (OpenAI-style json_schema strict); roughly 3.7x cheaper on input and 4.7x cheaper on output than mistral-medium.
- Cons: none found on the seven criteria. gpt-4o-mini is cheaper still but one generation older; French quality should be sampled before committing either way.

### Anthropic

- Claude Haiku 4.5: $1.00 / $5.00, cache hits at $0.10. Batch is 50 percent off. (Source: https://platform.claude.com/docs/en/about-claude/pricing)
- Structured outputs are now GA: `output_config.format` with `type: "json_schema"`, enforced by constrained decoding, and claude-haiku-4-5 is on the supported model list. Schema support is a subset (no recursive schemas, additionalProperties must be false, array minItems limited to 0 or 1). (Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Temperature: the Messages API marks temperature as deprecated and states "Models released after Claude Opus 4.6 do not support setting temperature"; only 1.0 is accepted on those, others get HTTP 400. Haiku 4.5 predates that cutoff and is not on the newer model list, so it still takes 0 to 1. Note the project would send 0.2, which is in range. (Source: https://platform.claude.com/docs/en/api/messages)
- No thinking-token trap for Haiku 4.5, which is not an extended-thinking-first model; extended thinking is opt-in.
- EU posture: the pricing page documents a US data residency option (`inference_geo: "us"`) at a 1.1x multiplier; no EU residency option appears there. Whether API content trains models was not verified during this session (the commercial terms page timed out); check https://privacy.anthropic.com. Marked UNVERIFIED.
- Pros: excellent French prose reputation, native strict schema, no thinking trap.
- Cons: output at $5.00 is only modestly cheaper than mistral-medium's $7.50 and 3x gpt-4.1-mini; different API shape (no chat.completions), so migration is the largest here; US-only residency is a soft procurement con.

### xAI

- No cheap "mini" tier exists in 2026. Cheapest general options: grok-4.3 at $1.25 / $2.50 (1M context), grok-4.20 non-reasoning variant at the same price, grok-build-0.1 at $1.00 / $2.00, and grok-4.6 at $2.00 / $6.00. (Source: https://docs.x.ai/docs/models)
- Structured outputs: `response_format` with `json_schema` is supported and "the response is guaranteed to match your schema" for supported schema features. (Source: https://docs.x.ai/docs/guides/structured-outputs)
- Temperature is supported, 0 to 2, with no restriction listed for reasoning models (penalties and stop sequences are restricted on reasoning models, temperature is not). (Source: https://docs.x.ai/docs/api-reference)
- EU posture: xAI is US-based; no EU data residency option was found on the docs pages consulted. UNVERIFIED as a formal statement.
- Pros: native strict schema, temperature OK.
- Cons: nothing in the "cheap" band; French prose quality for client-facing text is UNVERIFIED; weakest EU story among Western providers. Not a good fit at this price point.

### Alibaba Qwen

- International (Singapore) Model Studio prices: qwen3.7-flash $0.03 / $0.13 for inputs up to 32K tokens ($0.10 / $0.40 for 32K to 256K), qwen3.8-flash $0.15 / $0.47, qwen3.7-plus $0.40 / $1.60 for inputs up to 256K (list price with a limited-time 20 percent discount), legacy qwen-plus (2025-12-01) $0.40 / $4.00. Tiered pricing bills all tokens at the tier matching total input length. (Source: https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- Structured output: JSON Schema mode exists with `strict: true` and server-side enforcement ("Strictly follows schema: Yes"), but the supported model list is Qwen3.7/3.8 series only, and the doc states "Singapore region models are not supported yet" for json_schema mode. JSON Object mode is broadly supported but not schema-enforced. (Source: https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- Pros: the lowest raw prices in this whole document.
- Cons: the strict schema mode the project depends on is not available on the international endpoint, so using it means the China-region endpoint, which fails criterion 1 and criterion 6 at once. Dealbreaker for now; recheck if Alibaba ships json_schema on Singapore.

### Other cheap-but-strong candidates

- MiniMax M3 (and M2.x): $0.30 / $1.20, prompt-cache reads $0.06. (Source: https://platform.minimax.io/docs/guides/pricing-paygo) Structured output and temperature support: UNVERIFIED in this session. China-based vendor, which is a procurement con.
- Moonshot Kimi K2.6: $0.95 / $4.00 (cache hit $0.16), supports "JSON Mode" (json_object) and thinking or non-thinking modes. (Source: https://platform.kimi.ai/docs/pricing/chat-k26) At that price it is not cheaper enough than the baseline to justify the schema gap and the China-vendor posture. Not recommended.

## Recommendations

1. **gpt-4.1-mini, $0.40 / $1.60.** It is the only candidate that passes every criterion with no asterisks: server-side strict json_schema (the same request shape the code already sends), temperature 0 to 2 accepted, no reasoning-token trap (it is not a reasoning model), EU data residency endpoint available with no training on API data, and an official TypeScript SDK with an OpenAI-compatible contract, so the swap is roughly "change base URL, API key, and model id". At 16000 max output tokens an audit's generation cost drops from about $0.12 to about $0.026 per call at list price, and per-prospect scans get cheaper proportionally. Validate French prose on a handful of real audits before switching fully; gpt-4o-mini at $0.15 / $0.60 is the same shape and even cheaper if its French is good enough for the report voice.
2. **Gemini 2.5 Flash-Lite, $0.10 / $0.40 (free tier available).** Cheapest fully schema-capable option, thinking is off by default so there is no output-budget trap, and the OpenAI-compatible layer accepts `zodResponseFormat`, keeping migration small. Two caveats: the schema must fit Gemini's JSON Schema subset (check nested structures in the project schema), and on regular 2.5 Flash ($0.30 / $2.50) you must explicitly cap or disable thinking because its output price includes thinking tokens. Free tier makes an A/B French-prose test cost nothing.
3. **GLM-4.7-Flash or GLM-4.5-Flash (free) as an experiment only, not a production switch.** The user asked specifically about GLM flash: it is genuinely free, thinking can be switched off per request, and it is OpenAI-compatible, but Z.ai has no server-side json_schema enforcement, only prompt-guided JSON mode with client-side validation. Since the code already validates with Zod, a trial is cheap, but expect more retries and occasional parse failures, and note the China-based vendor posture is hard to sell to French clients buying EAA compliance. If GLM quality impresses, GLM-4.5-Air ($0.20 / $1.10) is the paid fallback with the same schema limitation.

Not recommended for this use case: DeepSeek V4 (json_object only, thinking on by default, China-hosted), GPT-5 mini and nano (reject temperature 0.2 with HTTP 400, community-documented), Claude Haiku 4.5 (good model, wrong price bracket and API shape), Qwen flash (strict schema not available on the international region), xAI (no cheap tier).

## Sources

- https://mistral.ai/pricing/api
- https://help.mistral.ai (EU-default data hosting claim, surfaced via search of mistral.ai domains)
- https://docs.z.ai/guides/overview/pricing
- https://docs.z.ai/guides/capabilities/struct-output
- https://docs.z.ai/guides/llm/glm-4.6
- https://github.com/zai-org/z-ai-sdk-python/issues/73
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/guides/json_mode
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/thinking
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/openai
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/terms
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/api-reference/chat/create
- https://developers.openai.com/api/docs/guides/gpt-5
- https://developers.openai.com/api/docs/guides/your-data
- https://community.openai.com/t/temperature-in-gpt-5-models/1337133
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/api/messages
- https://docs.x.ai/docs/models
- https://docs.x.ai/docs/guides/structured-outputs
- https://docs.x.ai/docs/api-reference
- https://www.alibabacloud.com/help/en/model-studio/model-pricing
- https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output
- https://platform.minimax.io/docs/guides/pricing-paygo
- https://platform.kimi.ai/docs/pricing/chat-k26
