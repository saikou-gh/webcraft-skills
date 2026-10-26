# Contributing

Contributions that improve portability, evidence quality, browser compatibility, or review accuracy are welcome.

## Repository layout

```text
.claude-plugin/marketplace.json
.agents/plugins/marketplace.json
plugins/webcraft/
  .claude-plugin/plugin.json
  .codex-plugin/plugin.json
  skills/<skill-name>/SKILL.md
scripts/validate.py
```

Keep each skill focused. Put shared workflow and routing in `SKILL.md`, conditional detail in `references/`, deterministic helpers in `scripts/`, and generated-output templates in `assets/`.

## Requirements

- Use Node.js 22.12 or newer for the browser helpers.
- Use lowercase hyphenated skill names matching their directory names.
- Give each description an observable `Use when ...` trigger.
- Use paths relative to the skill; never add a personal home-directory path.
- Do not add telemetry, private endpoints, proprietary platform instructions, credentials, or organization-only assumptions.
- Explain optional dependencies and make `--help` work before those dependencies are installed.
- Keep examples provider-neutral unless a provider is essential to the workflow.

## Validate a change

```bash
python3 scripts/validate.py
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin validate --strict --profile directory plugins/webcraft
node --check plugins/webcraft/skills/asset-inspector/scripts/asset-inspector.js
node --check plugins/webcraft/skills/animation-capture/scripts/capture-animation.js
node --check plugins/webcraft/shared/safe-browser-proxy.js
npm test --prefix plugins/webcraft/skills/asset-inspector/scripts
npm test --prefix plugins/webcraft/skills/animation-capture/scripts
node --test plugins/webcraft/shared/tests/*.test.js
```

When browser scripts change, also run their argument tests and one real capture against a site you are authorized to inspect.

## Releases

Keep the versions in these files aligned:

- `.claude-plugin/marketplace.json`
- `plugins/webcraft/.claude-plugin/plugin.json`
- `plugins/webcraft/.codex-plugin/plugin.json`

Use semantic versioning and tag releases as `vMAJOR.MINOR.PATCH`.
