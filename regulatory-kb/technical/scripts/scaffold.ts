import { runScaffoldCli } from './lib/scaffold/cli.js';

runScaffoldCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
