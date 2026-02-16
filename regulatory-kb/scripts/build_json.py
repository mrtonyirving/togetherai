#!/usr/bin/env python3
"""
Walk docs/ tree, parse YAML frontmatter from .md files,
and produce consolidated JSON files in dist/.

Output structure:
  dist/
    ontologies/
      enforcement-actions.json   # All enforcement action ontologies
      guidelines.json
      directives.json
      regulations.json
    relations.json
    sources.json
"""

import json
import sys
from pathlib import Path

import frontmatter

DOCS_ROOT = Path("docs")
DIST_ROOT = Path("dist")

ONTOLOGY_TYPES = ["enforcement-actions", "guidelines", "directives", "regulations"]


def extract_frontmatter(md_path: Path) -> dict | None:
    """Parse a markdown file and return its frontmatter as a dict."""
    try:
        post = frontmatter.load(md_path)
        if post.metadata:
            meta = dict(post.metadata)
            meta["_source_file"] = str(md_path)
            return meta
    except Exception as e:
        print(f"  WARNING: Could not parse {md_path}: {e}", file=sys.stderr)
    return None


def build_ontologies():
    """Extract ontology frontmatter, grouped by document type."""
    for doc_type in ONTOLOGY_TYPES:
        type_dir = DOCS_ROOT / "ontologies" / doc_type
        if not type_dir.exists():
            continue

        entries = []
        for md_file in sorted(type_dir.glob("*.md")):
            if md_file.name == "index.md":
                continue
            meta = extract_frontmatter(md_file)
            if meta:
                entries.append(meta)

        out_path = DIST_ROOT / "ontologies" / f"{doc_type}.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False))
        print(f"  {out_path} ({len(entries)} entries)")


def build_collection(subdir: str, output_name: str):
    """Extract frontmatter from all .md files in a docs subdirectory."""
    source_dir = DOCS_ROOT / subdir
    if not source_dir.exists():
        return

    entries = []
    for md_file in sorted(source_dir.rglob("*.md")):
        if md_file.name == "index.md":
            continue
        meta = extract_frontmatter(md_file)
        if meta:
            entries.append(meta)

    out_path = DIST_ROOT / f"{output_name}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False))
    print(f"  {out_path} ({len(entries)} entries)")


def main():
    print("Building JSON from frontmatter...")
    DIST_ROOT.mkdir(exist_ok=True)

    build_ontologies()
    build_collection("relations", "relations")
    build_collection("sources", "sources")

    print("Done.")


if __name__ == "__main__":
    main()
