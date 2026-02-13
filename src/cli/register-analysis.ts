import type { Command } from 'commander';
import { withCliErrorHandling } from '../core/index.js';

export function registerAnalysisCommands(program: Command): void {
  program
    .command('analyze')
    .description('Analyze code-to-database usage')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('-p, --path <path>', 'Codebase path to scan', '.')
    .option('--profile', 'Print command phase timings')
    .action(
      withCliErrorHandling('analyze', async (options) => {
        const { analyze } = await import('../commands/analyze.js');
        await analyze(options);
        const { runAutosave } = await import('../commands/autosave.js');
        await runAutosave({
          output: options.output || '.devmind',
          path: options.path || '.',
          source: 'analyze',
          note: 'Completed code-to-database analysis',
          silent: true,
        });
      }),
    );

  program
    .command('status')
    .description('Show context status, freshness, and recommended next command')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('-p, --path <path>', 'Codebase path', '.')
    .option('--json', 'Output as JSON')
    .option('--profile', 'Include timing data')
    .action(
      withCliErrorHandling('status', async (options) => {
        const { status } = await import('../commands/status.js');
        await status(options);
      }),
    );

  program
    .command('audit')
    .description('Audit codebase coverage against recorded learnings')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('-p, --path <path>', 'Codebase path', '.')
    .option('--json', 'Output as JSON')
    .option('--profile', 'Include timing data')
    .action(
      withCliErrorHandling('audit', async (options) => {
        const { audit } = await import('../commands/audit.js');
        await audit(options);
        const { runAutosave } = await import('../commands/autosave.js');
        await runAutosave({
          output: options.output || '.devmind',
          path: options.path || '.',
          source: 'audit',
          note: 'Completed learning audit',
          silent: true,
        });
      }),
    );

  program
    .command('extract')
    .description('Extract learning candidates from code and analysis artifacts')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('-p, --path <path>', 'Codebase path', '.')
    .option('--apply', 'Append extracted learnings to memory/LEARN.md')
    .option('--json', 'Output as JSON')
    .option('--profile', 'Include timing data')
    .action(
      withCliErrorHandling('extract', async (options) => {
        const { extract } = await import('../commands/extract.js');
        await extract(options);
      }),
    );

  program
    .command('design-system')
    .description('Manage design system profile for UI alignment checks')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--init', 'Create default design system profile')
    .option('--force', 'Overwrite existing profile when used with --init')
    .option('--json', 'Output as JSON')
    .action(
      withCliErrorHandling('design-system', async (options) => {
        const { designSystem } = await import('../commands/design-system.js');
        await designSystem(options);
      }),
    );

  program
    .command('retrieve')
    .description('Retrieve focused context using index metadata and AGENTS sections')
    .requiredOption('-q, --query <query>', 'Retrieval query')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--type <type>', 'Section type filter (architecture, database, codebase, etc.)')
    .option('--tags <tags>', 'Comma-separated tag filter')
    .option('--limit <n>', 'Max sections to return', '6')
    .option('--max-words <n>', 'Approximate max words in output', '1400')
    .option('--json', 'Output as JSON')
    .option('--profile', 'Include timing data')
    .action(
      withCliErrorHandling('retrieve', async (options) => {
        const { retrieve } = await import('../commands/retrieve.js');
        await retrieve(options);
      }),
    );

  program
    .command('autosave')
    .description('Persist session journal/context and auto-apply extracted learnings')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('-p, --path <path>', 'Codebase path', '.')
    .option('--source <source>', 'Autosave source label', 'manual')
    .option('--note <note>', 'Autosave note')
    .option('--no-extract', 'Skip extraction/apply step')
    .option('--json', 'Output as JSON')
    .action(
      withCliErrorHandling('autosave', async (options) => {
        const { autosave } = await import('../commands/autosave.js');
        await autosave(options);
      }),
    );

  program
    .command('claude-plugin')
    .description('Generate a local Claude Code plugin package for DevMind skills')
    .option('-o, --output <dir>', 'Plugin output directory', '.claude-plugin')
    .option('--name <name>', 'Plugin name', 'devmind')
    .option('--force', 'Overwrite existing plugin files')
    .option('--json', 'Output as JSON')
    .action(
      withCliErrorHandling('claude-plugin', async (options) => {
        const { claudePlugin } = await import('../commands/claude-plugin.js');
        await claudePlugin(options);
      }),
    );

  program
    .command('codex-plugin')
    .description('Install DevMind skill for Codex CLI and Codex app')
    .option('--name <name>', 'Skill directory name', 'devmind')
    .option('--project', 'Also install a project-local skill under ./.agents/skills')
    .option('--no-legacy', 'Skip compatibility mirror into CODEX_HOME/.codex skill paths')
    .option('--force', 'Overwrite existing skill files')
    .option('--json', 'Output as JSON')
    .action(
      withCliErrorHandling('codex-plugin', async (options) => {
        const { codexPlugin } = await import('../commands/codex-plugin.js');
        await codexPlugin(options);
      }),
    );

  program
    .command('openclaw-plugin')
    .description('Install DevMind skill for OpenClaw')
    .option('--name <name>', 'Skill directory name', 'devmind')
    .option('--project', 'Also install a project-local skill under ./.openclaw/skills')
    .option('--force', 'Overwrite existing skill files')
    .option('--json', 'Output as JSON')
    .action(
      withCliErrorHandling('openclaw-plugin', async (options) => {
        const { openclawPlugin } = await import('../commands/openclaw-plugin.js');
        await openclawPlugin(options);
      }),
    );
}
