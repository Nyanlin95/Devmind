/**
 * Learn Command
 * Add a learning to the accumulated knowledge
 */

import * as path from 'path';
import { jsonSuccess, jsonError, outputJson, isJsonMode } from '../utils/json-output.js';
import * as fs from 'fs/promises';
import { logger, ensureDir, writeFileSafe, readFileSafe } from '../../core/index.js';

interface LearnOptions {
  list?: boolean;
  category?: string;
  output?: string;
  json?: boolean;
}

export async function learn(learning: string, options: LearnOptions): Promise<void> {
  const outputDir = options.output || '.devmind';
  const learningsDir = path.join(outputDir, 'memory', 'learnings');

  // List learnings
  if (options.list) {
    await listLearnings(outputDir);
    return;
  }

  if (!learning) {
    logger.error('Please provide a learning.');
    logger.info('');
    logger.info('Usage:');
    logger.info('  devmind learn "Always use indexes on foreign keys"');
    logger.info('  devmind learn "Batch inserts are 5x faster" --category=performance');
    return;
  }

  const category = options.category || 'general';
  const timestamp = new Date().toISOString();

  // Create learning content
  const content = `## ${timestamp} - ${category}

${learning}

---
`;

  const learningsPath = path.join(outputDir, 'memory', 'LEARN.md');

  try {
    await ensureDir(path.dirname(learningsPath));

    let existing = '';
    try {
      existing = await readFileSafe(learningsPath);
    } catch {
      existing =
        '# Project Learnings\n\n> Accumulated technical learnings, architectural decisions, and discovered patterns.\n\n';
    }

    await writeFileSafe(learningsPath, existing + content);

    logger.success('Learning added successfully!');
    logger.info(`   Category: ${category}`);
    logger.info(`   Content: ${learning}`);
    logger.info(`   File: ${learningsPath}`);
  } catch (error) {
    logger.error('Failed to save learning:');
    logger.error((error as Error).message);
    process.exit(1);
  }
}

async function listLearnings(outputDir: string): Promise<void> {
  const learningsPath = path.join(outputDir, 'memory', 'LEARN.md');

  try {
    const content = await readFileSafe(learningsPath);
    const learnings = content.split('---').filter((l) => l.trim().length > 0);

    logger.info('Accumulated Learnings:');
    logger.info('');

    // Skip header
    const items = learnings.slice(1);

    if (items.length === 0) {
      logger.info('No learnings recorded yet.');
      return;
    }

    items.forEach((item) => {
      const lines = item.trim().split('\n');
      const header = lines[0].replace('## ', '');
      let [datePart, ...catParts] = header.split(' - ');
      const categoryPart = catParts.join(' - '); // Rejoin in case category has " - "
      const text = lines.slice(1).join('\n').trim();

      const currentDate = datePart ? datePart.trim() : 'Unknown Date';
      const currentCategory = categoryPart ? categoryPart.trim() : 'general';
      const currentLearning = text || '(No content)';

      logger.success(`  ${currentDate}`);
      logger.info(`    Category: ${currentCategory}`);
      logger.info(`    ${currentLearning}`);
      logger.info('');
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('No learnings found.');
    } else {
      logger.error('Failed to list learnings:');
      logger.error((error as Error).message);
    }
  }
}
