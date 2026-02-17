import { interactivePromptAdapter } from '../cli_prompts.js';
import { loadScaffoldCatalog } from '../scaffold_catalog.js';
import {
  scaffoldConcept,
  scaffoldEnforcementAction,
  scaffoldEnforcementActionFromCliOptions,
  scaffoldProvision
} from './handlers.js';

export function parseCliOptionMap(args: string[]): Map<string, string> {
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const keyToken = args[index];
    if (!keyToken.startsWith('--')) {
      throw new Error(`Unexpected argument '${keyToken}'. Expected --key value pairs`);
    }

    const key = keyToken.slice(2).trim();
    if (!key) {
      throw new Error(`Invalid option '${keyToken}'`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for option '--${key}'`);
    }

    options.set(key, value);
    index += 1;
  }

  return options;
}

export async function runScaffoldCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  let command = argv[0]?.trim().toLowerCase();
  const cliOptions = parseCliOptionMap(argv.slice(1));

  const prompt = interactivePromptAdapter;
  const catalog = await loadScaffoldCatalog();

  if (!command) {
    command = await prompt.select({
      message: 'Scaffold type:',
      choices: [
        { name: 'concept', value: 'concept' },
        { name: 'provision', value: 'provision' },
        { name: 'enforcement-action', value: 'enforcement-action' }
      ]
    });
  }

  if (command === 'concept') {
    if (cliOptions.size > 0) {
      throw new Error(
        'Non-interactive CLI options are currently supported only for enforcement-action'
      );
    }
    await scaffoldConcept(prompt, catalog);
    return;
  }

  if (command === 'provision') {
    if (cliOptions.size > 0) {
      throw new Error(
        'Non-interactive CLI options are currently supported only for enforcement-action'
      );
    }
    await scaffoldProvision(prompt, catalog);
    return;
  }

  if (command === 'enforcement-action') {
    if (cliOptions.size > 0) {
      await scaffoldEnforcementActionFromCliOptions(cliOptions);
      return;
    }
    await scaffoldEnforcementAction(prompt, catalog);
    return;
  }

  throw new Error(`Unknown command '${command}'. Expected concept|provision|enforcement-action`);
}
