import { loadInferenceMappingModel } from './lib/inference_mapping.js';

async function main(): Promise<void> {
  const model = await loadInferenceMappingModel();

  console.log('taxonomy mapping validation passed.');
  console.log(
    `concepts=${model.concepts.length} provisions=${model.provisions.length} enforcement_actions=${model.enforcementActions.length}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
