#!/usr/bin/env python3
"""
Validate all ontology .md files have required frontmatter fields
and that their frontmatter matches the corresponding JSON schema (if one exists).
"""

import json
import sys
from pathlib import Path

import frontmatter
import jsonschema

DOCS_ROOT = Path("docs")
EXIT_CODE = 0


def validate_required_fields(meta: dict, path: Path, required: list[str]):
    global EXIT_CODE
    for field in required:
        if field not in meta:
            print(f"  ERROR: {path} missing required field: {field}")
            EXIT_CODE = 1


def validate_against_schema(meta: dict, path: Path, schema_path: Path):
    global EXIT_CODE
    if not schema_path.exists():
        return
    schema = json.loads(schema_path.read_text())
    try:
        jsonschema.validate(instance=meta, schema=schema)
    except jsonschema.ValidationError as e:
        print(f"  ERROR: {path} fails schema validation: {e.message}")
        EXIT_CODE = 1


def main():
    print("Validating ontology files...")

    ontology_required = ["jurisdiction", "document_type", "version", "fields"]

    for md_file in sorted((DOCS_ROOT / "ontologies").rglob("*.md")):
        if md_file.name == "index.md":
            continue
        if "/examples/" in str(md_file):
            continue

        try:
            post = frontmatter.load(md_file)
        except Exception as e:
            print(f"  ERROR: Cannot parse {md_file}: {e}")
            EXIT_CODE = 1
            continue

        if not post.metadata:
            print(f"  WARNING: {md_file} has no frontmatter")
            continue

        validate_required_fields(post.metadata, md_file, ontology_required)

        # Check for co-located schema
        schema_name = md_file.stem + ".schema.json"
        schema_path = md_file.parent / "schemas" / schema_name
        validate_against_schema(post.metadata, md_file, schema_path)

    print(f"Validation complete. Exit code: {EXIT_CODE}")
    sys.exit(EXIT_CODE)


if __name__ == "__main__":
    main()
