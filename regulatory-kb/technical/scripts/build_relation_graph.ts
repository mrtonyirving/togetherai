import fs from 'fs-extra';

import { globMarkdown, readStructuredMarkdownDoc } from './lib/structured_markdown.js';
import { getRunOptions, repoPath, toPosixRelative, writeJsonFile } from './lib/io.js';

interface RelationEdge {
  type: string;
  source_jurisdiction: string;
  target_jurisdiction: string;
  source_ref: string;
  source_title: string;
  target_ref: string;
  target_title: string;
  scope?: string;
  origin: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractStringMap(data: unknown): Record<string, string> {
  const record = asRecord(data);
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [String(key), String(value)])
  );
}

async function loadAliases(): Promise<Record<string, string>> {
  const artifactAliasFile = repoPath('technical', 'artifacts', 'relations', 'relation-aliases.json');
  if (await fs.pathExists(artifactAliasFile)) {
    const data = await fs.readJson(artifactAliasFile);
    const aliases = extractStringMap(data);
    if (Object.keys(aliases).length > 0) {
      return aliases;
    }
  }

  const relationTypesDoc = await readStructuredMarkdownDoc(
    repoPath('library', 'relations', 'relation-types.md')
  );
  if (!relationTypesDoc) {
    return {};
  }

  return extractStringMap(relationTypesDoc.metadata.relation_aliases);
}

async function collectMappingRelations(): Promise<RelationEdge[]> {
  const relations: RelationEdge[] = [];
  const files = await globMarkdown(['library/relations/mappings/*.md']);

  for (const file of files) {
    const doc = await readStructuredMarkdownDoc(file);
    if (!doc) {
      continue;
    }

    const jurisdiction = String(doc.metadata.jurisdiction ?? 'unknown');
    const targetJurisdiction = String(doc.metadata.target_jurisdiction ?? 'unknown');
    const mappings = Array.isArray(doc.metadata.mappings) ? doc.metadata.mappings : [];

    for (const rawMapping of mappings) {
      const mapping = asRecord(rawMapping);
      if (!mapping) {
        continue;
      }

      relations.push({
        type: 'implements',
        source_jurisdiction: jurisdiction,
        target_jurisdiction: targetJurisdiction,
        source_ref: String(mapping.national_ref ?? mapping.national ?? ''),
        source_title: String(mapping.national_title ?? ''),
        target_ref: String(mapping.eu_ref ?? mapping.eu ?? ''),
        target_title: String(mapping.eu_title ?? ''),
        scope: String(mapping.scope ?? ''),
        origin: toPosixRelative(file),
      });
    }
  }

  return relations;
}

async function collectOntologyRelations(aliases: Record<string, string>): Promise<RelationEdge[]> {
  const relations: RelationEdge[] = [];
  const files = await globMarkdown(['library/ontologies/document-types/*/jurisdictions/*/*.md']);

  for (const file of files) {
    const doc = await readStructuredMarkdownDoc(file);
    if (!doc) {
      continue;
    }

    const sourceJurisdiction = String(doc.metadata.jurisdiction ?? 'unknown');
    const relationBlocks = Array.isArray(doc.metadata.relations) ? doc.metadata.relations : [];

    for (const rawBlock of relationBlocks) {
      const block = asRecord(rawBlock);
      if (!block) {
        continue;
      }

      const rawType = String(block.type ?? 'unknown');
      const relationType = aliases[rawType] ?? rawType;
      const targetJurisdiction = String(block.target_jurisdiction ?? 'unknown');
      const mappings = Array.isArray(block.mappings) ? block.mappings : [];

      for (const rawMapping of mappings) {
        const mapping = asRecord(rawMapping);
        if (!mapping) {
          continue;
        }

        relations.push({
          type: relationType,
          source_jurisdiction: sourceJurisdiction,
          target_jurisdiction: targetJurisdiction,
          source_ref: String(mapping.from ?? ''),
          source_title: String(mapping.from_title ?? ''),
          target_ref: String(mapping.to ?? ''),
          target_title: String(mapping.to_title ?? ''),
          origin: toPosixRelative(file)
        });
      }
    }
  }

  return relations;
}

function dedupeRelations(relations: RelationEdge[]): RelationEdge[] {
  const seen = new Set<string>();
  const deduped: RelationEdge[] = [];

  for (const edge of relations) {
    const key = `${edge.type}::${edge.source_ref}::${edge.target_ref}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(edge);
  }

  return deduped;
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));

  const aliases = await loadAliases();
  const mappingRelations = await collectMappingRelations();
  const ontologyRelations = await collectOntologyRelations(aliases);
  const allRelations = dedupeRelations([...mappingRelations, ...ontologyRelations]);

  const jurisdictions = [...new Set(
    allRelations.flatMap((edge) => [edge.source_jurisdiction, edge.target_jurisdiction])
  )].sort();
  const relationTypes = [...new Set(allRelations.map((edge) => edge.type))].sort();

  const graph = {
    version: '1.0',
    total_relations: allRelations.length,
    relations: allRelations,
    jurisdictions,
    relation_types: relationTypes
  };

  const outFile = repoPath('technical', 'artifacts', 'relations', 'graph.json');
  const result = await writeJsonFile(outFile, graph, { check: options.check });

  if (options.check) {
    if (result.changed) {
      console.error(`Would update ${toPosixRelative(outFile)}`);
      process.exit(1);
    }
    console.log('build_relation_graph.ts check passed.');
    return;
  }

  const status = result.changed ? 'Updated' : 'No changes';
  console.log(`${status} ${toPosixRelative(outFile)} (${allRelations.length} relation(s))`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
