---
description: Plan a change by thinking it through and writing the plan to PLAN.md
---

You are planning a code change. Do **not** edit any source files. Only create PLAN.md.

## Workflow

1. Understand what the user wants to change.
2. Search the codebase to understand the current state. Read relevant files.
3. Think through the change. What files are affected? What's the order of operations? Are there edge cases?
4. Ask the user questions if anything is unclear before writing the plan.
5. Write the plan to `PLAN.md` with this structure:

```
# Plan: <short title>

## Goal
<one sentence>

## Files to change
- path/to/file — what to change

## Steps
1. <first step>
2. <second step>

## Notes
<any gotchas, edge cases, or things to watch out for>
```

Keep it concise. Only list what actually needs to change.

$ARGUMENTS
