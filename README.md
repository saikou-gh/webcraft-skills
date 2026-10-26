<p align="center"><img src="plugins/webcraft/icon.png" alt="WebCraft logo" width="160"></p>

# WebCraft Skills

An open, portable plugin for evidence-driven website recreation and frontend review. It works with both Claude Code and Codex, has no telemetry, and does not depend on private services, company infrastructure, or machine-specific paths.

The plugin focuses on the parts of web recreation that benefit from repeatable method: collecting evidence before coding, inventorying assets, capturing animation, rebuilding interactive and 3D experiences, and reviewing the result against the original.

## Install

### Claude Code

```bash
claude plugin marketplace add saikou-gh/webcraft-skills
claude plugin install webcraft@webcraft-skills
```

You can also install directly without adding the marketplace first:

```bash
claude plugin install webcraft --marketplace saikou-gh/webcraft-skills
```

### Codex

```bash
codex plugin marketplace add saikou-gh/webcraft-skills
codex plugin add webcraft@webcraft-skills
```

Restart the agent after installing so it discovers the skills.

## Skills

| Skill | Use it for |
| --- | --- |
| `web-replication` | Rebuild a public or authorized website as clean, independent source code. |
| `asset-inspector` | Inventory images, fonts, media, 3D models, rendering libraries, and network behavior. |
| `animation-capture` | Capture matched frame sequences for load, scroll, hover, and click motion. |
| `web-replica-3d` | Reconstruct Three.js, WebGL, and other 3D experiences from observable evidence. |
| `web-game-replication` | Rebuild browser games with matched mechanics, timing, controls, audio, and mobile input. |
| `reviewing-web-craft` | Audit frontend source quality with a concrete, evidence-based rubric. |
| `web-replica-review` | Compare an original and replica across routes, states, viewports, behavior, and quality. |

Ask naturally; the agent selects the relevant skill. Examples:

```text
Recreate this landing page in the current repo and verify mobile fidelity.
Inspect this site and tell me which assets and rendering libraries it uses.
Capture the menu animation on both sites and compare the timing.
Review this frontend for craft quality, accessibility, and maintainability.
```

The browser helpers used by `asset-inspector` and `animation-capture` require Node.js 22.12 or newer. Their skill instructions include the reproducible install command and runnable examples. Puppeteer's install downloads a compatible browser unless your environment explicitly configures another supported browser.

## Principles

- Observe before implementing.
- Rebuild behavior and structure; do not ship scraped or compiled source.
- Compare matched routes, viewports, and interaction states.
- Keep findings reproducible with screenshots, frame numbers, measurements, or file locations.
- Respect copyright, site terms, robots policies, privacy, and authorization boundaries.
- Keep generated sites independent of the original at runtime unless the user explicitly chooses otherwise and has permission.

## Development

```bash
python3 scripts/validate.py
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin validate --strict --profile directory plugins/webcraft
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for structure and release checks.

## License

MIT. See [LICENSE](LICENSE).

## Maintainer

[saikou-gh](https://github.com/saikou-gh). Use GitHub issues for bugs and feature requests; use private vulnerability reporting for security concerns.
