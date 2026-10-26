# Parallel Reviewer Guide

## Contents

- [Reviewer roster](#reviewer-roster)
- [Prompt template](#prompt-template)
- [Finding schema](#finding-schema)
- [Synthesis](#synthesis)

Use this guide only when the agent runtime supports parallel subagents. Otherwise perform the same rubric passes sequentially.

## Reviewer roster

Keep lenses non-overlapping:

| Reviewer | Rubric sections | Run when |
| --- | --- | --- |
| Architecture/framework | A, F | Always; framework checks depend on detected stack |
| Styling/motion | S, M | Always; motion depth depends on project |
| Accessibility | Y | Always |
| Performance | P | Always |
| Security/hygiene | H | Always |

For a small project, combine adjacent lenses. For a monorepo, shard by application only when each reviewer still uses the same evidence schema.

## Prompt template

Provide each reviewer:

```text
You are one specialist on a frontend source-review panel.

Repository: [absolute path]
Scope: [application/package and sampling method]
Detected stack and versions: [stack]
Your rubric sections: [letters]
Rubric: [absolute path resolved from this skill's references/rubric.md]

Exclude generated, dependency, build, coverage, cache, and minified paths.
Read only your rubric sections. Search for their signals, then open every candidate file and confirm context. A search result is not a finding.

Return one JSON object matching the schema below. Do not edit files or write replacement code. Mark runtime performance claims as needs_live_run unless measured evidence proves them.
```

Do not hardcode this skill's installed path; resolve it from the current `SKILL.md` location.

## Finding schema

```json
{
  "findings": [
    {
      "rubric_id": "F2",
      "category": "F",
      "title": "ResizeObserver survives component unmount",
      "severity": "High",
      "file": "src/components/Gallery.tsx",
      "line": 42,
      "snippet": "const observer = new ResizeObserver(update);\nobserver.observe(container);",
      "why": "Each remount leaves an active observer and duplicate updates.",
      "fix_direction": "Disconnect the observer in the component lifecycle cleanup.",
      "source": "https://react.dev/learn/synchronizing-with-effects",
      "needs_live_run": false,
      "confidence": "high"
    }
  ],
  "checked_signals": [
    "addEventListener/setInterval/requestAnimationFrame cleanup",
    "observer and subscription teardown"
  ]
}
```

Every finding needs a real line, excerpt, severity, project-specific impact, and prose fix direction. When no issue is confirmed, return an empty `findings` array and retain the signals examined in `checked_signals`.

## Synthesis

1. Merge findings and de-duplicate by root cause and location.
2. Normalize severity against the main skill.
3. Recheck Critical and High findings in source.
4. Score enabled categories.
5. List the highest-impact fixes first.
6. Preserve limitations and live checks that remain.

Do not let multiple reviewers inflate the score deduction for the same defect.
