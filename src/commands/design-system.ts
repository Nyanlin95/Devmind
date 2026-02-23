import * as path from 'path';
import * as fs from 'fs';
import { logger, ensureDir, readFileSafe, writeFileSafe } from '../core/index.js';

interface DesignSystemOptions {
  output?: string;
  init?: boolean;
  force?: boolean;
  json?: boolean;
}

interface DesignSystemProfile {
  name: string;
  version: string;
  allowedComponentImports: string[];
  tokenSources: string[];
  requiredWrappers: string[];
  bannedRegexRules: Array<{
    id: string;
    pattern: string;
    message: string;
  }>;
  motion?: {
    reducedMotionRequired?: boolean;
    maxDurationMs?: number;
    forbidInfiniteAnimations?: boolean;
  };
}

function isJsonFlagEnabled(
  options: DesignSystemOptions & { opts?: () => { json?: boolean } },
): boolean {
  if (options.json === true) return true;
  try {
    return options.opts?.().json === true;
  } catch {
    return false;
  }
}

function jsonFail(message: string): void {
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
}

function defaultProfile(): DesignSystemProfile {
  return {
    name: 'project-design-system',
    version: '1.0.0',
    allowedComponentImports: ['@/components/ui', '@mui/material', 'antd', '@chakra-ui/react'],
    tokenSources: ['src/styles/tokens.css', 'src/theme', 'tailwind.config.ts'],
    requiredWrappers: ['ThemeProvider'],
    bannedRegexRules: [
      {
        id: 'no-inline-style',
        pattern: 'style\\s*=\\s*\\{\\{',
        message: 'Avoid inline style objects; use design-system tokens/components.',
      },
      {
        id: 'no-raw-hex',
        pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})',
        message: 'Avoid raw hex values in UI code; use design-system tokens.',
      },
    ],
    motion: {
      reducedMotionRequired: true,
      maxDurationMs: 900,
      forbidInfiniteAnimations: true,
    },
  };
}

function profilePath(outputDir: string): string {
  return path.join(outputDir, 'design-system.json');
}

export async function designSystem(options: DesignSystemOptions): Promise<void> {
  const jsonMode = isJsonFlagEnabled(
    options as DesignSystemOptions & { opts?: () => { json?: boolean } },
  );
  const outputDir = options.output || '.devmind';
  const dsPath = profilePath(outputDir);

  if (options.init) {
    if (fs.existsSync(dsPath) && !options.force) {
      const message = `Design system profile already exists: ${dsPath}. Use --force to overwrite.`;
      if (jsonMode) {
        jsonFail(message);
        return;
      }
      logger.warn(`Design system profile already exists: ${dsPath}`);
      logger.info('Use --force to overwrite.');
      return;
    }
    await ensureDir(path.dirname(dsPath));
    const profile = defaultProfile();
    await writeFileSafe(dsPath, JSON.stringify(profile, null, 2));
    if (jsonMode) {
      console.log(JSON.stringify({ initialized: true, file: dsPath }, null, 2));
      return;
    }
    logger.success('Initialized design system profile.');
    logger.info(`File: ${dsPath}`);
    return;
  }

  if (!fs.existsSync(dsPath)) {
    const message = `No design system profile found at ${dsPath}. Run: devmind design-system --init`;
    if (jsonMode) {
      jsonFail(message);
      return;
    }
    logger.warn(`No design system profile found at ${dsPath}`);
    logger.info('Run: devmind design-system --init');
    return;
  }

  const content = await readFileSafe(dsPath);
  const parsed = JSON.parse(content) as DesignSystemProfile;
  if (jsonMode) {
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  logger.info('Design System Profile');
  logger.info(`Name: ${parsed.name}`);
  logger.info(`Version: ${parsed.version}`);
  logger.info(`Allowed imports: ${parsed.allowedComponentImports.join(', ') || '(none)'}`);
  logger.info(`Token sources: ${parsed.tokenSources.join(', ') || '(none)'}`);
  logger.info(`Required wrappers: ${parsed.requiredWrappers.join(', ') || '(none)'}`);
  logger.info(`Banned rules: ${parsed.bannedRegexRules.length}`);
  if (parsed.motion) {
    logger.info(
      `Motion: reducedMotionRequired=${parsed.motion.reducedMotionRequired !== false}, maxDurationMs=${parsed.motion.maxDurationMs ?? 900}, forbidInfiniteAnimations=${parsed.motion.forbidInfiniteAnimations !== false}`,
    );
  }
}
