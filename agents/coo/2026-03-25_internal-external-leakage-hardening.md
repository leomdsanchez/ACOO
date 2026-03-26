Objective

Prevent the COO agent from sending or logging internal-only discussion into external client channels by mistake.

In Scope

- Update global repo guidance in `AGENTS.md`.
- Update `agents/coo/prompt.md` with explicit internal/external channel classification rules.
- Add explicit stop conditions for ambiguous or mismatched channel targets.

Out of Scope

- Runtime enforcement code.
- Registry schema changes.
- Rewriting unrelated COO behavior.

Deliverable

- Tightened prompt and repo instructions that force internal/external classification before send, reply, or log actions.

Acceptance Gate

- `AGENTS.md` explicitly requires channel classification and anti-leakage behavior.
- `agents/coo/prompt.md` explicitly blocks internal context from being sent to external channels without deliberate reframing.
- The prompt requires logging the channel classification and recipient role for critical actions.

Slice Plan

1. Create planning artifact.
2. Add global repo rule.
3. Add COO-specific rules for classification, outbound actions, and logging.
4. Review for ambiguities and regressions.

Current Slice

2. Add global repo rule.

Findings

- Current prompt says to register whether contact is internal or external, but it does not force that classification before sending or logging.
- Current instructions do not explicitly forbid carrying internal financial/legal/strategy context into external channels.

Remaining Failures

- Medium: prompt still allows ambiguous outbound behavior until edits are applied and reviewed.

Decision

- Proceed with minimal textual hardening in `AGENTS.md` and `agents/coo/prompt.md`.

Closure

- Open.
