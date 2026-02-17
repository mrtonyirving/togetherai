import { getRunOptions, repoPath, toPosixRelative, writeTextFile } from './lib/io.js';
import { loadInferenceMappingModel } from './lib/inference_mapping.js';

const OUTPUT_FILE = repoPath('library', 'taxonomy', 'generated', 'inference.cypher');

function q(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildCypher(model: Awaited<ReturnType<typeof loadInferenceMappingModel>>): string {
  const lines: string[] = [];

  for (const edge of model.relations.isSubtopics) {
    lines.push(
      `MERGE p=(a:Topic {concept: "${q(edge.subtopic)}"})-[:IS_SUBTOPIC]->(b:Topic {concept: "${q(edge.parentTopic)}"}) RETURN p;`
    );
  }

  for (const mapping of model.relations.topicMappings) {
    for (const address of mapping.addresses) {
      lines.push(
        `MERGE p=(r:Reference {address: "${q(address)}"})-[:HAS_TOPIC]->(t:Topic {concept: "${q(mapping.topic)}"}) RETURN p;`
      );
    }
  }

  for (const edge of model.relations.statutoryViolations) {
    lines.push(
      `MERGE p=(a:Reference {address: "${q(edge.actionReference)}"})-[:HAS_BROKEN_RULE]->(b:Reference {address: "${q(edge.statutoryReference)}"}) RETURN p;`
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = getRunOptions(process.argv.slice(2));
  const model = await loadInferenceMappingModel();
  const content = buildCypher(model);
  const result = await writeTextFile(OUTPUT_FILE, content, options);

  if (options.check) {
    if (result.changed) {
      console.error(`Would update ${toPosixRelative(OUTPUT_FILE)}`);
      process.exit(1);
    }
    console.log('generate_cypher.ts check passed.');
    return;
  }

  const status = result.changed ? 'Updated' : 'No changes';
  console.log(`${status} ${toPosixRelative(OUTPUT_FILE)} (${content.trim().split(/\r?\n/).length} statement(s))`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
