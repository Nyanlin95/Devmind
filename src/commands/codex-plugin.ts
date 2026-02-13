import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger, ensureDir, readFileSafe, writeFileSafe } from '../core/index.js';

interface CodexPluginOptions {
  name?: string;
  force?: boolean;
  json?: boolean;
  project?: boolean;
  noLegacy?: boolean;
}

interface InstallTarget {
  kind: 'user' | 'project' | 'legacy';
  root: string;
  skillDir: string;
  skillPath: string;
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

async function resolveSkillSource(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), 'SKILL.md'),
    path.resolve(process.cwd(), 'integrations', 'openclaw', 'SKILL.md'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveTargets(
  skillName: string,
  project: boolean,
  includeLegacy: boolean,
): InstallTarget[] {
  const homeDir = os.homedir();
  const cwd = process.cwd();
  const userRoot = path.join(homeDir, '.agents', 'skills');

  const targets: InstallTarget[] = [
    {
      kind: 'user',
      root: userRoot,
      skillDir: path.join(userRoot, skillName),
      skillPath: path.join(userRoot, skillName, 'SKILL.md'),
    },
  ];

  if (project) {
    const projectRoot = path.join(cwd, '.agents', 'skills');
    targets.push({
      kind: 'project',
      root: projectRoot,
      skillDir: path.join(projectRoot, skillName),
      skillPath: path.join(projectRoot, skillName, 'SKILL.md'),
    });
  }

  if (includeLegacy) {
    const legacyRoots = new Set<string>();
    const codexHome = process.env.CODEX_HOME;

    if (codexHome && codexHome.trim().length > 0) {
      legacyRoots.add(path.resolve(codexHome, 'skills'));
    }

    legacyRoots.add(path.join(homeDir, '.codex', 'skills'));

    for (const legacyRoot of legacyRoots) {
      const normalized = path.resolve(legacyRoot);
      if (normalized === path.resolve(userRoot)) {
        continue;
      }
      targets.push({
        kind: 'legacy',
        root: normalized,
        skillDir: path.join(normalized, skillName),
        skillPath: path.join(normalized, skillName, 'SKILL.md'),
      });
    }
  }

  return targets;
}

export async function codexPlugin(options: CodexPluginOptions): Promise<void> {
  const skillName = options.name || 'devmind';
  const force = !!options.force;
  const jsonMode = !!options.json;
  const projectInstall = !!options.project;
  const includeLegacy = !options.noLegacy;

  const skillSource = await resolveSkillSource();
  if (!skillSource) {
    const message = 'No SKILL.md found to install for Codex plugin.';
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
  const targets = resolveTargets(skillName, projectInstall, includeLegacy);

  const blockedTargets: string[] = [];
  for (const target of targets) {
    const exists = await fileExists(target.skillPath);
    if (exists && !force) {
      blockedTargets.push(target.skillPath);
    }
  }

  if (blockedTargets.length > 0) {
    const message = `Codex skill already exists. Use --force to overwrite. Conflicts: ${blockedTargets.join(', ')}`;
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: message,
            conflicts: blockedTargets,
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

  for (const target of targets) {
    await ensureDir(target.skillDir);
    await writeFileSafe(target.skillPath, skillContent);
  }

  const installedPaths = targets.map((t) => t.skillPath);
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          success: true,
          skill: skillName,
          source: skillSource,
          installed: installedPaths,
          notes: [
            'Codex app and Codex CLI share user skills under ~/.agents/skills.',
            includeLegacy
              ? 'Legacy mirrors were written for compatibility (CODEX_HOME/.codex).'
              : 'Legacy mirrors were skipped (--no-legacy).',
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  logger.success('Codex skill installed for DevMind.');
  logger.info(`   Skill: ${skillName}`);
  logger.info(`   Source: ${skillSource}`);
  logger.info('   Installed paths:');
  for (const installedPath of installedPaths) {
    logger.info(`   - ${installedPath}`);
  }
  logger.info('Codex app and Codex CLI should pick this up from user skills.');
  logger.info('Restart Codex to pick up new skills.');
}
