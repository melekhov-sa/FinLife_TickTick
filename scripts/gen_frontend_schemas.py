"""
Generate Zod schemas + TypeScript types from Pydantic request models.

Usage:
    .venv/Scripts/python.exe scripts/gen_frontend_schemas.py

Output:
    frontend/schemas/api.generated.ts

This script imports Pydantic V2 models, calls .model_json_schema(),
and converts the JSON Schema to Zod v4 schema definitions.
"""

from __future__ import annotations

import json
import sys
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# ── Registry: all Pydantic request models to export ──────────────────────────

MODELS: list[tuple[str, str, str]] = [
    # (import_path, class_name, exported_ts_name)
    ("app.api.v2.tasks",   "CreateTaskRequest",         "CreateTaskRequest"),
    ("app.api.v2.tasks",   "UpdateTaskRequest",         "UpdateTaskRequest"),
    ("app.api.v2.finance", "CreateTransactionRequest",  "CreateTransactionRequest"),
    ("app.api.v2.habits",  "CreateHabitRequest",        "CreateHabitRequest"),
    ("app.api.v2.habits",  "UpdateHabitRequest",        "UpdateHabitRequest"),
    ("app.api.v2.events",  "CreateEventRequest",        "CreateEventRequest"),
    ("app.api.v2.events",  "UpdateOccurrenceRequest",   "UpdateOccurrenceRequest"),
]

OUTPUT = ROOT / "frontend" / "schemas" / "api.generated.ts"


# ── JSON Schema → Zod conversion ────────────────────────────────────────────

def json_schema_to_zod(
    schema: dict[str, Any],
    required_fields: set[str],
    field_name: str,
) -> str:
    """Convert a single JSON Schema property to a Zod expression."""

    # Handle anyOf (Pydantic's way of expressing nullable types)
    if "anyOf" in schema:
        # Pydantic V2: anyOf: [{type: "string"}, {type: "null"}]
        non_null = [s for s in schema["anyOf"] if s.get("type") != "null"]
        has_null = any(s.get("type") == "null" for s in schema["anyOf"])
        if non_null:
            base = _simple_type_to_zod(non_null[0])
            if has_null:
                base += ".nullish()"
            return base
        return "z.unknown()"

    base = _simple_type_to_zod(schema)

    # If field is not required, make it optional
    if field_name not in required_fields:
        if schema.get("type") == "null":
            return "z.unknown().optional()"
        # Fields with defaults are optional in terms of the form
        if "default" in schema:
            default = schema["default"]
            if default is None:
                base += ".nullish()"
            elif isinstance(default, bool):
                base += f".default({'true' if default else 'false'})"
            elif isinstance(default, str):
                base += f'.default("{default}")'
            elif isinstance(default, (int, float)):
                base += f".default({default})"
        else:
            base += ".optional()"

    return base


def _simple_type_to_zod(schema: dict[str, Any]) -> str:
    """Convert a simple type schema to base Zod expression."""
    t = schema.get("type", "string")

    if t == "string":
        return "z.string()"
    elif t == "integer":
        return "z.number().int()"
    elif t == "number":
        return "z.number()"
    elif t == "boolean":
        return "z.boolean()"
    elif t == "null":
        return "z.null()"
    elif t == "array":
        items = schema.get("items", {})
        return f"z.array({_simple_type_to_zod(items)})"
    else:
        return "z.unknown()"


def model_to_zod(model_cls: type) -> tuple[str, list[str]]:
    """
    Convert a Pydantic model to Zod schema source code.
    Returns (zod_schema_str, list_of_required_field_names).
    """
    js = model_cls.model_json_schema()
    properties: dict[str, Any] = js.get("properties", {})
    required: set[str] = set(js.get("required", []))

    fields: list[str] = []
    for name, prop in properties.items():
        zod_expr = json_schema_to_zod(prop, required, name)
        fields.append(f"  {name}: {zod_expr},")

    schema_body = "\n".join(fields)
    return f"z.object({{\n{schema_body}\n}})", sorted(required)


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    import importlib

    lines: list[str] = []
    lines.append("/**")
    lines.append(f" * AUTO-GENERATED from Pydantic models — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(" * Do not edit manually. Regenerate with:")
    lines.append(" *   pnpm gen:api   (or: .venv/Scripts/python.exe scripts/gen_frontend_schemas.py)")
    lines.append(" */")
    lines.append("")
    lines.append('import { z } from "zod";')
    lines.append("")

    meta_entries: list[str] = []

    for import_path, class_name, ts_name in MODELS:
        mod = importlib.import_module(import_path)
        model_cls = getattr(mod, class_name)

        zod_str, required_fields = model_to_zod(model_cls)

        # Schema constant
        schema_var = f"{ts_name}Schema"
        lines.append(f"export const {schema_var} = {zod_str};")
        lines.append("")

        # Inferred type
        lines.append(f"export type {ts_name} = z.infer<typeof {schema_var}>;")
        lines.append("")

        # Required fields list
        req_var = f"{ts_name}Required"
        req_list = ", ".join(f'"{f}"' for f in required_fields)
        lines.append(f"export const {req_var}: readonly string[] = [{req_list}] as const;")
        lines.append("")

        meta_entries.append(
            f'  {ts_name}: {{ schema: {schema_var}, required: {req_var} }}'
        )

    # Meta registry
    lines.append("/** Registry of all schemas for programmatic access */")
    lines.append("export const API_SCHEMAS = {")
    lines.append(",\n".join(meta_entries))
    lines.append("} as const;")
    lines.append("")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK Generated {OUTPUT.relative_to(ROOT)} ({len(MODELS)} schemas)")


if __name__ == "__main__":
    main()
