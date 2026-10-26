#!/usr/bin/env python3
"""Validate the portable WebCraft marketplace without third-party packages."""

from __future__ import annotations

import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "plugins" / "webcraft"
SKILLS = PLUGIN / "skills"

ALLOWED_FRONTMATTER = {
    "name",
    "description",
    "author",
    "allowed-tools",
    "model",
    "context",
    "agent",
    "hooks",
    "disable-model-invocation",
    "user-invocable",
    "argument-hint",
    "version",
}

ABSOLUTE_HOME_RE = re.compile(r"(?<![A-Za-z0-9])/(?:Users|home|data/users)/[^/\s\"']+/")
PRIVATE_URL_RE = re.compile(r"https?://[^/\s)]*(?:internal|intranet|corp|\.local)(?:[./:]|$)", re.IGNORECASE)
TODO_MARKER = "[" + "TODO:"

TEXT_SUFFIXES = {
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".sh",
    ".svg",
    ".toml",
    ".txt",
    ".yaml",
    ".yml",
}
LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")


def fail(errors: list[str], path: Path, message: str) -> None:
    errors.append(f"{path.relative_to(ROOT)}: {message}")


def parse_frontmatter(path: Path, errors: list[str]) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        fail(errors, path, "missing YAML frontmatter")
        return {}
    try:
        end = lines.index("---", 1)
    except ValueError:
        fail(errors, path, "unterminated YAML frontmatter")
        return {}

    values: dict[str, str] = {}
    for line_number, line in enumerate(lines[1:end], start=2):
        if not line.strip() or line.startswith((" ", "\t")):
            continue
        if ":" not in line:
            fail(errors, path, f"invalid frontmatter on line {line_number}")
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"\'')
        if key not in ALLOWED_FRONTMATTER:
            fail(errors, path, f"unsupported frontmatter field {key!r}")
        values[key] = value
    return values


def validate_skills(errors: list[str]) -> None:
    skill_dirs = sorted(path for path in SKILLS.iterdir() if path.is_dir())
    if not skill_dirs:
        fail(errors, SKILLS, "contains no skills")

    names: set[str] = set()
    for skill_dir in skill_dirs:
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.is_file():
            fail(errors, skill_dir, "missing SKILL.md")
            continue
        values = parse_frontmatter(skill_file, errors)
        name = values.get("name", "")
        description = values.get("description", "")
        if name != skill_dir.name:
            fail(errors, skill_file, f"name {name!r} must match directory {skill_dir.name!r}")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
            fail(errors, skill_file, "name must use lowercase hyphen-case")
        if name in names:
            fail(errors, skill_file, f"duplicate skill name {name!r}")
        names.add(name)
        if not description:
            fail(errors, skill_file, "description is required")
        if len(description) > 1024:
            fail(errors, skill_file, "description exceeds 1024 characters")
        if "Use when" not in description:
            fail(errors, skill_file, "description must include an observable 'Use when' trigger")
        if "<" in description or ">" in description:
            fail(errors, skill_file, "description cannot contain angle brackets")


def validate_json_and_versions(errors: list[str]) -> None:
    marketplace_path = ROOT / ".claude-plugin" / "marketplace.json"
    plugin_path = PLUGIN / ".claude-plugin" / "plugin.json"
    codex_marketplace_path = ROOT / ".agents" / "plugins" / "marketplace.json"
    codex_plugin_path = PLUGIN / ".codex-plugin" / "plugin.json"
    try:
        marketplace = json.loads(marketplace_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(errors, marketplace_path, f"invalid JSON: {error}")
        return
    try:
        plugin = json.loads(plugin_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(errors, plugin_path, f"invalid JSON: {error}")
        return
    try:
        codex_marketplace = json.loads(codex_marketplace_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(errors, codex_marketplace_path, f"invalid JSON: {error}")
        return
    try:
        codex_plugin = json.loads(codex_plugin_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(errors, codex_plugin_path, f"invalid JSON: {error}")
        return

    entries = marketplace.get("plugins", [])
    if len(entries) != 1 or entries[0].get("name") != "webcraft":
        fail(errors, marketplace_path, "must publish exactly the webcraft plugin")
    elif entries[0].get("version") != plugin.get("version"):
        fail(errors, marketplace_path, "marketplace and plugin versions differ")
    if marketplace.get("metadata", {}).get("version") != plugin.get("version"):
        fail(errors, marketplace_path, "marketplace metadata and plugin versions differ")
    if codex_plugin.get("version") != plugin.get("version"):
        fail(errors, codex_plugin_path, "Claude and Codex plugin versions differ")
    codex_entries = codex_marketplace.get("plugins", [])
    if len(codex_entries) != 1 or codex_entries[0].get("name") != "webcraft":
        fail(errors, codex_marketplace_path, "must publish exactly the webcraft plugin")
    elif codex_entries[0].get("source", {}).get("path") != "./plugins/webcraft":
        fail(errors, codex_marketplace_path, "webcraft source path is incorrect")
    if plugin.get("skills") not in (["./skills/"], "./skills/"):
        fail(errors, plugin_path, "skills must resolve from ./skills/")
    if codex_plugin.get("skills") not in (["./skills/"], "./skills/"):
        fail(errors, codex_plugin_path, "skills must resolve from ./skills/")
    for manifest_path, manifest in ((plugin_path, plugin), (codex_plugin_path, codex_plugin)):
        if "hooks" in manifest:
            fail(errors, manifest_path, "public plugin must not install hooks")
    if (ROOT / "LICENSE").read_bytes() != (PLUGIN / "LICENSE").read_bytes():
        fail(errors, PLUGIN / "LICENSE", "plugin and repository licenses differ")


def validate_icon(errors: list[str]) -> None:
    path = PLUGIN / "icon.png"
    try:
        data = path.read_bytes()
    except OSError as error:
        fail(errors, path, f"cannot read icon: {error}")
        return
    if len(data) >= 2 * 1024 * 1024:
        fail(errors, path, "icon must be smaller than 2 MiB")
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        fail(errors, path, "icon must be a PNG")
        return
    width, height = struct.unpack(">II", data[16:24])
    if width != height or not 512 <= width <= 2048:
        fail(errors, path, f"icon must be square and 512–2048 px; found {width}x{height}")
    svg_path = PLUGIN / "icon.svg"
    try:
        ET.parse(svg_path)
    except (OSError, ET.ParseError) as error:
        fail(errors, svg_path, f"invalid SVG icon: {error}")

    codex_manifest = json.loads((PLUGIN / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
    interface = codex_manifest.get("interface", {})
    for key in ("composerIcon", "logo"):
        relative = interface.get(key)
        resolved = (PLUGIN / relative).resolve() if relative else None
        if not resolved or not resolved.is_relative_to(PLUGIN) or not resolved.is_file():
            fail(errors, PLUGIN / ".codex-plugin" / "plugin.json", f"{key} path is missing or invalid")


def validate_links(errors: list[str]) -> None:
    for path in ROOT.rglob("*.md"):
        if any(part in {".git", "node_modules"} for part in path.parts):
            continue
        if path.is_symlink():
            fail(errors, path, "Markdown files cannot be symbolic links")
            continue
        text = path.read_text(encoding="utf-8")
        for raw_target in LINK_RE.findall(text):
            target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if target.startswith("file:"):
                fail(errors, path, f"file URI is not portable: {raw_target}")
                continue
            file_part = target.split("#", 1)[0]
            if not file_part:
                continue
            candidate = path.parent / file_part
            if Path(file_part).is_absolute():
                fail(errors, path, f"absolute file link is not portable: {raw_target}")
                continue
            resolved = candidate.resolve()
            if not resolved.is_relative_to(ROOT):
                fail(errors, path, f"relative link escapes the repository: {raw_target}")
            elif candidate.is_symlink():
                fail(errors, path, f"relative link targets a symbolic link: {raw_target}")
            elif not resolved.exists():
                fail(errors, path, f"broken relative link: {raw_target}")


def validate_portability(errors: list[str]) -> None:
    for path in ROOT.rglob("*"):
        if any(part in {".git", "node_modules"} for part in path.parts):
            continue
        if path.is_symlink():
            fail(errors, path, "repository files cannot be symbolic links")
            continue
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if TODO_MARKER in text:
            fail(errors, path, f"contains an unfinished {TODO_MARKER} marker")
        if ABSOLUTE_HOME_RE.search(text):
            fail(errors, path, "contains a machine-specific absolute home path")
        if PRIVATE_URL_RE.search(text):
            fail(errors, path, "contains an apparent private/internal URL")


def main() -> int:
    errors: list[str] = []
    validate_skills(errors)
    validate_json_and_versions(errors)
    validate_icon(errors)
    validate_links(errors)
    validate_portability(errors)

    if errors:
        print("Validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    skill_count = sum(1 for path in SKILLS.iterdir() if path.is_dir())
    print(f"Validated WebCraft marketplace: {skill_count} skills, portable paths, JSON, and links OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
