# Local LLMs on the 2080 Ti + 4× 3060 rig — research findings (2026-06-22)

Deep-research investigation into which open-weight models to run, and how, on a
heterogeneous multi-GPU workstation, oriented toward backing the ledger framework
(and building other projects with it). This is living reference, not an
implementation node — it records what the research established, with confidence
levels and the open questions that need local benchmarking before anything is
committed.

Method: 5 search angles → 21 sources fetched → 93 claims extracted → 25
adversarially verified (19 confirmed, 6 refuted). Confidence tags below reflect
the verification vote. The model landscape (Qwen3-Coder, gpt-oss, Devstral,
GLM-4) moves monthly — quant sizes and SWE-Bench numbers are current to
late-2025/2026 and should be re-checked against HF model cards before committing.

## Hardware framing

- The "RTX 2080 with 11GB" is a **2080 Ti** (base 2080 is 8GB). Either way it is
  **Turing, compute capability 7.5**.
- **FlashAttention v2 will never support Turing** [verified — vLLM issue #4246;
  Dao-AILab FA2 minimum is Ampere/SM80]. vLLM falls back to the XFormers backend
  on that card. **Consequence: the 2080 Ti must not sit in a tensor-parallel
  group with the Ampere 3060s.**
- Treat the rig as **two pools**: a **32GB Ampere pool** (4× 3060 8GB) and an
  **11GB Turing satellite** (2080 Ti). Consumer PCIe, no NVLink, no P2P — slow
  interconnect is the governing constraint.

## Core constraint for ledger

**Claude Code cannot natively target OpenAI-compatible local endpoints.** It only
accepts gateways exposing one of three Anthropic-native formats — Anthropic
Messages (`/v1/messages`), Bedrock InvokeModel, or Vertex rawPredict [verified —
official Claude Code llm-gateway docs]. Backing ledger's `--bare` dispatch path
with a local model therefore **requires a translating proxy**. This is the same
`--bare` / `ANTHROPIC_API_KEY` constraint already documented in the root CLAUDE.md
dispatcher notes, viewed from the local-model side.

## Recommended primary setup

| Element | Choice | Notes |
|---|---|---|
| Model | **Qwen3-Coder-30B-A3B-Instruct** (MoE, 30B total / **3B active**) | Q4_K_M GGUF ~18GB; fits 32GB pool with KV headroom |
| Quality | **50.3% SWE-Bench Verified** [verified — official Qwen card] | up to 54.2% with test-time scaling |
| Runtime | **llama.cpp** (`llama-server`), default `layer` split | OpenAI-compatible server built in |
| GPUs | Four 3060s as one pipeline-parallel pool | auto-splits weights + KV proportionally |

**Why this combination:** llama.cpp's default `layer` mode is pipeline
parallelism that auto-splits weights and KV cache proportionally across
mismatched cards and **tolerates slow interconnect** [verified — official
llama.cpp multi-GPU docs]. The MoE's **3B active params per token** is the right
architecture for a no-NVLink rig where interconnect, not compute, is the
bottleneck — far higher tok/s than a dense 32B at equal VRAM.

**Do not use tensor parallelism here.** llama.cpp's `-sm tensor` is *experimental*
and "much more bottlenecked by GPU interconnect speed"; vLLM's own docs say to
**prefer pipeline parallelism over tensor parallelism when GPUs lack NVLink**
[both verified]. The blog claim that "llama.cpp can't do tensor parallelism so
it's useless for multi-GPU" was **refuted 0-3** — it can, and pipeline mode is the
better choice for this topology regardless.

## Alternative configurations

- **Alt A — dense 32B, higher single-shot quality:** `Qwen2.5-Coder-32B-Instruct`,
  Q4_K_M = **19.85GB** [verified — bartowski HF card]. Q6_K (26.89GB) fits raw but
  leaves only ~5GB across the pool for KV cache — long context gets tight (that
  claim passed only **2-1** for this reason). Q8_0 (34.82GB) does **not** fit.
  Slower than the MoE; pick it when max code quality beats throughput.
- **Alt B — fleet of specialists, one model per card:** independent small models
  per 3060 (7B coder / summarizer / classifier / embedder) as concurrent
  endpoints. Best for ledger's *auxiliary* needs (health scanner, doc
  classification, batch summarization) where parallel throughput beats one big
  brain. On vLLM, budget carefully: `gpu_memory_utilization` is a fraction of
  **total** (not free) memory and each process needs **~5GB CUDA overhead** beyond
  weights [medium confidence — mechanism doc-confirmed; exact numbers from one
  DGX Spark blog, not this rig].
- **Alt C — 2080 Ti as dedicated satellite:** pin an embeddings model (for
  ledger's semantic doc search) plus a small 7B/8B for summarization/classification
  on the Turing card, kept entirely out of the Ampere pool. Cleanest division of
  labor; sidesteps the Turing/FlashAttention problem. Best embedding model is an
  open question — `nomic-embed-text`, `bge-m3`, `Qwen3-Embedding-0.6B/4B` are the
  candidates to benchmark against current MTEB rankings.

## Integration paths (verified)

1. **LiteLLM proxy** — receives Claude Code's Anthropic-format requests on
   `/v1/messages`, translates to the local llama.cpp/vLLM endpoint and back. Point
   the dispatched `claude` subprocess at it with `ANTHROPIC_BASE_URL=http://0.0.0.0:4000`
   and `ANTHROPIC_AUTH_TOKEN=$LITELLM_MASTER_KEY` [verified — LiteLLM + Claude Code
   docs]. ⚠️ **Supply-chain: pin a vetted release — LiteLLM 1.82.7/1.82.8 shipped
   credential-stealing malware.** Never install unpinned.
2. **claude-code-router** — local proxy (`127.0.0.1:3456`) routing *per task type*
   (`default`, `background`, `think`, `longContext`) to different providers incl.
   Ollama / any OpenAI-compatible endpoint [verified — repo + docs]. Most
   promising for ledger: a **per-task-type hybrid** — route `background`/
   classification subtasks to the local 3060 pool while `default`/`think`
   agentic steps stay on real Claude.
3. **Fully-local agent loops** — Aider and OpenCode target OpenAI-compatible
   endpoints natively (no proxy), the pragmatic choice when Claude is not in the
   loop at all.

## Throughput reality

- **No measured tok/s exists** for a 32B split across four 8GB 3060s over
  no-NVLink PCIe — **three separate throughput estimates for this config were
  refuted in voting** (0-3, 1-2, 0-3). Treat online "30-40 tok/s" numbers as
  unverified.
- Honest expectation: **single-digit to low-double-digit tok/s for a dense 32B**
  in pipeline mode (layers run serially per token — no 4× speedup from the split);
  meaningfully better for the 3B-active MoE.
- The cited "~800 tok/s on 8 GPUs" is on homogeneous, likely-NVLinked 3090s and
  **does not transfer** [low confidence, flagged].
- Community reports note possible **garbage output at high context** on non-P2P
  topologies in llama.cpp layer mode — validate actual context lengths, don't
  assume.

## Where local fits vs Claude

**Genuinely useful on this rig:** embeddings/RAG, classification, summarization,
draft/first-pass code, free offline batch iteration, bulk jobs.
**Falls short:** autonomous multi-step agentic coding. Local models are markedly
worse at reliable tool-calling, which is the real risk surface for ledger — the
MCP handshake (the 5 `runner.*` tools the dispatcher depends on) is exactly what a
weaker model breaks. **Use local to offload everything *around* the leaf-workflow,
not to replace Claude inside it.**

## Open questions (need local benchmarking)

1. Actual measured tok/s for Qwen2.5-Coder-32B Q4_K_M and Qwen3-Coder-30B-A3B
   Q4_K_M split across four 3060 8GB over consumer PCIe in llama.cpp layer mode —
   and whether high-context output corruption actually occurs on this rig.
2. Which brief-named models with no surviving claim — gpt-oss-20b/120b, Devstral,
   Codestral, DeepSeek-Coder-V2-Lite, GLM-4 — actually fit at usable quant+context
   in 32GB, and how their agentic-coding scores compare to Qwen3-Coder-30B-A3B.
3. Best embeddings + lightweight-classification model to pin on the 2080 Ti
   (11GB), kept out of any Ampere TP group.
4. Whether speculative decoding with a draft model on the 2080 Ti meaningfully
   accelerates a 32B target on the 3060s given the cross-architecture +
   no-NVLink constraints, and which runtime supports that config.
5. For ledger specifically: can the per-task-type hybrid be wired into the
   `--bare` dispatch path **without breaking the MCP tool contract**, and what
   quality floor do local models hit on autonomous leaf-workflow stages.

## Key sources

- Claude Code LLM gateway — https://code.claude.com/docs/en/llm-gateway (primary)
- llama.cpp multi-GPU docs — https://github.com/ggml-org/llama.cpp/blob/master/docs/multi-gpu.md (primary)
- vLLM parallelism/scaling — https://docs.vllm.ai/en/stable/serving/parallelism_scaling/ (primary)
- vLLM Turing/FlashAttention — https://github.com/vllm-project/vllm/issues/4246 (primary)
- Qwen3-Coder-30B-A3B-Instruct card — https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct (primary)
- Qwen2.5-Coder-32B GGUF quants — https://huggingface.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF (primary)
- LiteLLM ↔ Claude Code — https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models (primary)
- claude-code-router — https://github.com/musistudio/claude-code-router (primary)
