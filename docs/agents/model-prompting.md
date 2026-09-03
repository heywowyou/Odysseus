# Per-host model prompting guidance

This document tells each agent host how to run well in this repository: model
identity, effort defaults, and the behavioral deltas from each vendor's own
current guidance that change how a prompt or instruction should be written for
that model. It governs **agent-host** behavior only. The product's own model
layer (OpenAI `gpt-5.4-mini`, temperature 0.2, reasoning effort `none`, used
for every analysis pass) is a separate concern, fixed by trade-off 67 and
`docs/rules/llm-layer-rules.md`; do not try to harmonize the two.

Sources are primary and dated. Re-check them after a model upgrade before
trusting a stale summary here.

## Claude Code (this repo's `codysseus` entry point)

Runs Claude Opus 5 by default, Sonnet 5 when the operator switches with
`/model sonnet` (the repo's standing plan-on-Opus, execute-on-Sonnet
workflow).

**Opus 5.** Default effort `high`. Use `low` and `medium` liberally as the
primary lever for cost and latency wherever quality holds on your own
judgment; step up to `xhigh` for demanding multi-file or long-horizon work.
Give the complete task specification up front rather than drip-feeding
instructions across turns; the model performs best left to run a fully
specified task. Do not add "double-check your answer" or "verify before
responding" instructions, or a separate forced verification step: Opus 5
self-verifies without being told, and these compound into wasted tokens with
no quality gain. The same applies to legacy harness scaffolding that forces
an extra verification pass. Keep thinking enabled and control cost with
effort instead of disabling thinking. Written files (reports, plans, this kind
of document) run long by default; state a length or scope bound explicitly
when one matters, which in this repo it usually does given `AGENTS.md` and
`CLAUDE.md`'s enforced byte ceilings.

Delegate to a subagent only for large, genuinely independent, parallelizable
tracks (a wide multi-file investigation, independent research fan-outs). Do
not delegate work finishable in a handful of tool calls, and never delegate to
verify or double-check your own work. If one subagent suffices, use one.
Deterministic caps exist as `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` and
`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` environment variables (Claude Code
2.1.217+); they are documented here, not set in this repo's committed
settings, so setting them is the operator's call.

Source: <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5> (fetched 2026-09-03).

**Sonnet 5.** Default effort `high`; `xhigh` for the hardest coding and
agentic work. As a rough cross-model calibration, Sonnet 5 at `medium` is
comparable to Sonnet 4.6 at `high`. Sonnet 5 interprets instructions literally
and explicitly, especially at lower effort: it does not silently generalize an
instruction from one item to the rest, and does not infer requests that were
not made. This is the case that matters most for this repo's execute-on-Sonnet
handoffs: a plan written for Sonnet to execute must state scope explicitly
("apply this to every affected file, not just the first") rather than relying
on the model to generalize the pattern. Adaptive thinking is on by default.

Source: <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5> (fetched 2026-09-03).

## Codex

Runs GPT-5.6, in one of three variants: `sol` (flagship capability), `terra`
(balanced intelligence and cost), `luna` (efficient, high-volume). When
migrating a prompt or effort setting from an earlier GPT-5.x generation,
preserve the current reasoning effort as the baseline and test one level
lower on representative tasks before committing to a change; the newer
generation usually needs less thinking for the same answer. `medium` is a
reasonable working default; reserve `high`/`xhigh` for cases where evals show
a real gain, and do not set `max` as a global default.

Write outcome-first prompts: describe the destination, not every step assumed
along the way. Do not add blanket "be concise" or "keep it short" instructions
where they are not load-bearing; GPT-5.6 is already more concise by default
than prior generations, and old brevity instructions now over-correct.

Autonomy boundary that matches this repo's own working agreement in
`AGENTS.md`: make requested in-scope local changes and run non-destructive
validation without asking first; require confirmation for external writes,
destructive actions, or a material expansion of scope. Parallelize
independent reads; keep dependent steps sequential.

`AGENTS.md` itself should stay short and accurate: repo layout, how to run the
project, build/test/lint commands, conventions, and explicit do-not rules. A
short, accurate `AGENTS.md` outperforms a long, vague one.

Source: <https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6> and <https://learn.chatgpt.com/guides/best-practices> (fetched 2026-09-03).

## ZCode

Runs GLM-5.3 or GLM-5.3-Flash. GLM-5.3 (744B-A40B) is the choice for the
hardest text-only, long-horizon engineering tasks. GLM-5.3-Flash (320B-A18B,
hybrid sparse/linear attention, native vision, 1M-token context, 128K output)
is the stronger default for high-volume agent work, visual workflows (UI
recreation from screenshots, document generation with visual validation), and
cost-sensitive production use; it stays close to GLM-5.3 on coding benchmarks
while costing substantially less to serve.

`reasoning_effort` accepts `low`, `high`, or `max`; default `max`. Thinking
cannot be disabled on either model. `clear_thinking` defaults to `false`;
set it `true` for a more conversational, less step-exposed output. Default
sampling is temperature 1, top_p 0.95.

GLM-5.3 was post-trained on terminal-driven agent work: the prompt's job is
to reduce ambiguity, not to inspire. State the goal, the working directory,
the repo layout, the available tools, and success criteria explicitly rather
than leaving them implied.

This repo's ZCode-only subagent-by-default policy (`AGENTS.md`, "Agent
concurrency (ZCode only)") is unaffected by anything above: it is a
repository policy for this host, independent of the underlying model's own
delegation behavior, and stands as written.

Source: <https://docs.z.ai/guides/vlm/glm-5.3-flash> and <https://github.com/zai-org/GLM-5> (fetched 2026-09-03).
