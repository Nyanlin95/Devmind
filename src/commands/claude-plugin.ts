import * as path from 'path';
import * as fs from 'fs/promises';
import { logger, ensureDir, readFileSafe, writeFileSafe } from '../core/index.js';

interface ClaudePluginOptions {
  output?: string;
  name?: string;
  force?: boolean;
  json?: boolean;
}

interface ClaudeMarketplace {
  name: string;
  owner: {
    name: string;
    email?: string;
  };
  plugins: Array<{
    name: string;
    source: string;
    description: string;
    version: string;
    author: {
      name: string;
      email?: string;
    };
    repository?: string;
    license?: string;
    keywords?: string[];
    skills?: string[];
  }>;
}

function toDisplayError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion(): Promise<string> {
  try {
    const raw = await readFileSafe(path.resolve(process.cwd(), 'package.json'));
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function buildMarketplace(pluginName: string, version: string): ClaudeMarketplace {
  return {
    name: pluginName,
    owner: {
      name: 'devmind',
    },
    plugins: [
      {
        name: pluginName,
        source: './',
        description:
          'Agent-first context and memory workflow for design system, codebase, and database.',
        version,
        author: {
          name: 'devmind',
        },
        repository: 'https://github.com/Nyanlin95/devmind',
        license: 'Apache-2.0',
        keywords: ['agent', 'context', 'memory', 'design-system', 'database', 'codebase'],
        skills: ['./skills/'],
      },
    ],
  };
}

export async function claudePlugin(options: ClaudePluginOptions): Promise<void> {
  const outputDir = options.output || '.claude-plugin';
  const pluginName = options.name || 'devmind';
  const force = !!options.force;
  const jsonMode = !!options.json;

  const marketPath = path.join(outputDir, 'marketplace.json');
  const skillsDir = path.join(outputDir, 'skills', pluginName);
  const skillPath = path.join(skillsDir, 'SKILL.md');

  const skillSourceCandidates = [
    path.resolve(process.cwd(), 'SKILL.md'),
    path.resolve(process.cwd(), 'integrations', 'openclaw', 'SKILL.md'),
  ];

  const existingMarketplace = await fileExists(marketPath);
  if (existingMarketplace && !force) {
    const message = `Claude plugin already exists at ${marketPath}. Use --force to overwrite.`;
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: message,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    }
    logger.warn(message);
    return;
  }

  await ensureDir(skillsDir);

  let skillSource: string | null = null;
  for (const candidate of skillSourceCandidates) {
    if (await fileExists(candidate)) {
      skillSource = candidate;
      break;
    }
  }

  if (!skillSource) {
    const message = 'No SKILL.md found to package for Claude plugin.';
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: message,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    }
    logger.error(message);
    return;
  }

  const skillContent = await readFileSafe(skillSource);
  await writeFileSafe(skillPath, skillContent);

  const version = await readPackageVersion();
  const marketplace = buildMarketplace(pluginName, version);
  await writeFileSafe(marketPath, JSON.stringify(marketplace, null, 2));

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          success: true,
          plugin: pluginName,
          outputDir,
          marketplace: marketPath,
          skill: skillPath,
          version,
          next: [
            'Use your Claude Code plugin installer with this folder as local plugin source.',
            `Local source: ${path.resolve(outputDir)}`,
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  logger.success('Claude Code plugin package generated.');
  logger.info(`   Plugin: ${pluginName}`);
  logger.info(`   Marketplace: ${marketPath}`);
  logger.info(`   Skill: ${skillPath}`);
  logger.info('Next step: install this local plugin directory in Claude Code.');
  logger.info(`   Local source: ${path.resolve(outputDir)}`);
}
