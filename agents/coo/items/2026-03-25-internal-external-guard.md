# Internal External Guard

## Objective
Prevent the COO from sending, summarizing, or logging internal-only context into an external channel by mistake.

## In Scope
- `AGENTS.md`
- `agents/coo/prompt.md`
- Rules for classifying `interno` vs `externo`
- Rules for blocking outbound actions on channel mismatch

## Out of Scope
- Broader prompt refactors
- Runtime or database changes
- Historical cleanup of existing threads

## Deliverable
Prompt and repo instructions updated with explicit anti-leakage guardrails.

## Acceptance Gate
- Internal vs external classification is mandatory before outbound action.
- The agent must stop on channel/context mismatch.
- Logging rules distinguish internal evidence from external communication.

## Slice Plan
1. Inspect current instructions and identify missing guardrails.
2. Add explicit anti-leakage rules to prompt and repo instructions.
3. Review wording for ambiguity and finalize.

## Current Slice
3. Review wording for ambiguity and finalize.

## Findings
- The current prompt says to register whether a contact is internal or external, but it does not force a pre-send classification of the target channel.
- The current repo instructions do not warn about leaking internal summaries into external channels.
- Added mandatory target-channel classification before sends, replies, and log updates.
- Added explicit stop conditions for internal-source to external-destination mismatch.
- Added explicit separation between internal summary and external message in the COO prompt.

## Remaining Failures
- `low`: none accepted.

## Decision
Edits applied and wording redundancies reduced after review.

## Closure
Closed with only accepted `low` residual risk removed in final wording pass.
