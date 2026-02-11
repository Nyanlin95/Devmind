/**
 * History Command
 * View session history and schema evolution
 */

import * as path from 'path';
import { logger, readFileSafe } from '../../core/index.js';

interface HistoryOptions {
  sessions?: boolean;
  evolution?: boolean;
  codebaseEvolution?: boolean;
  unified?: boolean;
  output?: string;
}

export async function history(options: HistoryOptions): Promise<void> {
  const outputDir = options.output || '.devmind';

  // Show schema evolution
  if (options.evolution) {
    await showSchemaEvolution(outputDir);
    return;
  }

  // Show codebase evolution
  if (options.codebaseEvolution) {
    await showCodebaseEvolution(outputDir);
    return;
  }

  // Show unified history
  if (options.unified) {
    await showUnifiedHistory(outputDir);
    return;
  }

  // Default: show session history
  await showSessionHistory(outputDir);
}

interface HistoryEntry {
  date: string;
  title: string;
  content: string;
  source: 'schema' | 'codebase';
}

/**
 * Parse evolution file into entries
 */
async function parseEvolutionFile(
  filePath: string,
  source: 'schema' | 'codebase',
): Promise<HistoryEntry[]> {
  try {
    const content = await readFileSafe(filePath);
    const entries: HistoryEntry[] = [];
    const lines = content.split('\n');

    let currentEntry: Partial<HistoryEntry> | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const match = line.match(/^## (\d{4}-\d{2}-\d{2}) - (.+)$/);
      if (match) {
        // Save previous entry
        if (currentEntry) {
          currentEntry.content = currentContent.join('\n').trim();
          entries.push(currentEntry as HistoryEntry);
        }

        // Start new entry
        currentEntry = {
          date: match[1],
          title: match[2],
          source,
        };
        currentContent = [];
      } else if (currentEntry) {
        currentContent.push(line);
      }
    }

    // Save last entry
    if (currentEntry) {
      currentEntry.content = currentContent.join('\n').trim();
      entries.push(currentEntry as HistoryEntry);
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Show unified history
 */
async function showUnifiedHistory(outputDir: string): Promise<void> {
  const schemaPath = path.join(outputDir, 'memory', 'schema-evolution.md');
  const codebasePath = path.join(outputDir, 'memory', 'codebase-evolution.md');

  const schemaEntries = await parseEvolutionFile(schemaPath, 'schema');
  const codebaseEntries = await parseEvolutionFile(codebasePath, 'codebase');

  const allEntries = [...schemaEntries, ...codebaseEntries].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  logger.info('Unified History (Timeline):');
  logger.info('===========================');

  if (allEntries.length === 0) {
    logger.info('No history found.');
    return;
  }

  let unifiedContent = '# Unified Project History\n\n';

  for (const entry of allEntries) {
    const icon = entry.source === 'schema' ? '🗄️' : '💻';
    const sourceLabel = entry.source === 'schema' ? 'Database' : 'Codebase';

    logger.info(`\n${icon} [${entry.date}] ${entry.title} (${sourceLabel})`);
    logger.info('-'.repeat(40));
    logger.info(entry.content);

    unifiedContent += `## ${entry.date} - ${entry.title} [${sourceLabel}]\n\n${entry.content}\n\n---\n\n`;
  }

  // Save unified history file
  const unifiedPath = path.join(outputDir, 'memory', 'unified-history.md');
  const { writeFileSafe } = await import('../../core/index.js'); // Dynamic import to avoid circular dep if any, though core is safe
  await writeFileSafe(unifiedPath, unifiedContent);
  logger.info(`\nSaved to: ${unifiedPath}`);
}

/**
 * Show session history
 */
async function showSessionHistory(outputDir: string): Promise<void> {
  try {
    const historyPath = path.join(outputDir, 'memory', 'session-history.md');
    const content = await readFileSafe(historyPath);

    logger.info('Session History:');
    logger.info('');
    logger.info(content);
  } catch (error) {
    logger.error('Failed to load session history:');
    logger.error((error as Error).message);
  }
}

/**
 * Show schema evolution
 */
async function showSchemaEvolution(outputDir: string): Promise<void> {
  try {
    const evolutionPath = path.join(outputDir, 'memory', 'schema-evolution.md');
    const content = await readFileSafe(evolutionPath);

    logger.info('Schema Evolution:');
    logger.info('');
    logger.info(content);
  } catch (error) {
    logger.error('Failed to load schema evolution:');
    logger.error((error as Error).message);
  }
}

/**
 * Show codebase evolution
 */
async function showCodebaseEvolution(outputDir: string): Promise<void> {
  try {
    const evolutionPath = path.join(outputDir, 'memory', 'codebase-evolution.md');
    const content = await readFileSafe(evolutionPath);

    logger.info('Codebase Evolution:');
    logger.info('');
    logger.info(content);
  } catch (error) {
    logger.error('Failed to load codebase evolution:');
    logger.error((error as Error).message);
  }
}
