# COO Delivery Plan

## Objective
Harden the COO agent against context leakage between internal and external channels.

## Completion Signal
`AGENTS.md` and `agents/coo/prompt.md` explicitly require channel classification and mismatch checks before outbound actions or logging.

## Non-Goals
- Redesigning the whole COO operating model.
- Changing registry schemas or runtime behavior.

## Macro Items
1. Define the leak-prevention rule set for internal vs external channel handling.
2. Apply the rule set in `AGENTS.md` and `agents/coo/prompt.md`.
3. Review the final wording for residual ambiguity.

## Active Item
2. Apply the rule set in `AGENTS.md` and `agents/coo/prompt.md`.
