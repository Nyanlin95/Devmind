import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger, ensureDir, readFileSafe, writeFileSafe } from '../core/index.js';

interface OpenClawPluginOptions {
  name?: string;
  force?: boolean;
  json?: boolean;
  project?: boolean;
}

interface InstallTarget {
  kind: 'user' | 'project';
  skillDir: string;
  skillPath: string;
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
    path.resolve(process.cwd(), 'integrations', 'openclaw', 'SKILL.md'),
    path.resolve(process.cwd(), 'SKILL.md'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveTargets(skillName: string, includeProject: boolean): InstallTarget[] {
  const homeDir = os.homedir();
  const cwd = process.cwd();
  const userSkillsRoot = path.join(homeDir, '.openclaw', 'skills');
  const targets: InstallTarget[] = [
    {
      kind: 'user',
      skillDir: path.join(userSkillsRoot, skillName),
      skillPath: path.join(userSkillsRoot, skillName, 'SKILL.md'),
    },
  ];

  if (includeProject) {
    const projectRoot = path.join(cwd, '.openclaw', 'skills');
    targets.push({
      kind: 'project',
      skillDir: path.join(projectRoot, skillName),
      skillPath: path.join(projectRoot, skillName, 'SKILL.md'),
    });
  }

  return targets;
}

export async function openclawPlugin(options: OpenClawPluginOptions): Promise<void> {
  const skillName = options.name || 'devmind';
  const force = !!options.force;
  const jsonMode = !!options.json;
  const includeProject = !!options.project;

  const skillSource = await resolveSkillSource();
  if (!skillSource) {
    const message = 'No SKILL.md found to install for OpenClaw plugin.';
    if (jsonMode) {
      console.log(JSON.stringify({ success: false, error: message }, null, 2));
      return;
    }
    logger.error(message);
    return;
  }

  const skillContent = await readFileSafe(skillSource);
  const targets = resolveTargets(skillName, includeProject);
  const conflicts: string[] = [];

  for (const target of targets) {
    if ((await fileExists(target.skillPath)) && !force) {
      conflicts.push(target.skillPath);
    }
  }

  if (conflicts.length > 0) {
    const message = `OpenClaw skill already exists. Use --force to overwrite. Conflicts: ${conflicts.join(', ')}`;
    if (jsonMode) {
      console.log(JSON.stringify({ success: false, error: message, conflicts }, null, 2));
      return;
    }
    logger.warn(message);
    return;
  }

  for (const target of targets) {
    await ensureDir(target.skillDir);
    await writeFileSafe(target.skillPath, skillContent);
  }

  const installed = targets.map((target) => target.skillPath);
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          success: true,
          skill: skillName,
          source: skillSource,
          installed,
          notes: ['Restart OpenClaw session to pick up installed skills.'],
        },
        null,
        2,
      ),
    );
    return;
  }

  logger.success('OpenClaw skill installed for DevMind.');
  logger.info(`   Skill: ${skillName}`);
  logger.info(`   Source: ${skillSource}`);
  logger.info('   Installed paths:');
  for (const installedPath of installed) {
    logger.info(`   - ${installedPath}`);
  }
  logger.info('Restart OpenClaw session to pick up installed skills.');
}
