/**
 * Checkpoint Command
 * Save and restore session checkpoints for AI memory continuity
 */

import * as path from 'path';
import { MemoryInfrastructure, SessionContext } from './memory.js';
import { jsonSuccess, jsonError, outputJson, isJsonMode } from '../utils/json-output.js';
import * as fs from 'fs/promises';
import { logger, readFileSafe, failCommand } from '../../core/index.js';

interface CheckpointOptions {
  restore?: boolean;
  list?: boolean;
  message?: string;
  output?: string;
  json?: boolean;
}

export async function checkpoint(options: CheckpointOptions): Promise<void> {
  const outputDir = options.output || '.devmind';
  const memory = new MemoryInfrastructure();

  // List checkpoints
  if (options.list) {
    await listCheckpoints(outputDir);
    return;
  }

  // Restore checkpoint
  if (options.restore) {
    await restoreCheckpoint(outputDir, memory);
    return;
  }

  // Save checkpoint
  await saveCheckpoint(outputDir, memory, options.message);
}

/**
 * Save current session checkpoint
 */
async function saveCheckpoint(
  outputDir: string,
  memory: MemoryInfrastructure,
  message?: string,
): Promise<void> {
  try {
    // Load current session context
    const contextPath = path.join(outputDir, 'context', 'SESSION_CONTEXT.json');

    // Use safe read
    const contextContent = await readFileSafe(contextPath);
    const context: SessionContext = JSON.parse(contextContent);

    // Save checkpoint
    const checkpointPath = await memory.saveCheckpoint(outputDir, context, message);

    logger.success('Checkpoint saved successfully!');
    logger.info(`   File: ${checkpointPath}`);
    if (message) {
      logger.info(`   Message: ${message}`);
    }
    logger.info(`   Session ID: ${context.sessionId}`);
    logger.info(`   Schema Hash: ${context.schemaHash}`);
  } catch (error) {
    failCommand('Failed to save checkpoint:', error);
    return;
  }
}

/**
 * Restore latest checkpoint
 */
async function restoreCheckpoint(outputDir: string, memory: MemoryInfrastructure): Promise<void> {
  try {
    const context = await memory.restoreLatestCheckpoint(outputDir);

    if (!context) {
      logger.warn('No checkpoints found');
      logger.info('   Run `devmind checkpoint` to create one');
      return;
    }

    logger.success('Checkpoint restored!');
    logger.info('Session Context:');
    logger.info(`   Session ID: ${context.sessionId}`);
    logger.info(`   Timestamp: ${context.timestamp}`);
    logger.info(`   Schema Hash: ${context.schemaHash}`);

    if (context.currentTask) {
      logger.info('Current Task:');
      logger.info(`   ${context.currentTask.description}`);
      logger.info(`   Status: ${context.currentTask.status}`);
      logger.info(`   Progress: ${(context.currentTask.progress * 100).toFixed(0)}%`);

      if (context.currentTask.nextSteps && context.currentTask.nextSteps.length > 0) {
        logger.info('Next Steps:');
        context.currentTask.nextSteps.forEach((step, i) => {
          logger.info(`   ${i + 1}. ${step}`);
        });
      }
    }

    if (context.discoveries && context.discoveries.length > 0) {
      logger.info('Recent Discoveries:');
      context.discoveries.slice(-5).forEach((d) => {
        logger.info(`   - ${d}`);
      });
    }

    if (context.pendingQueries && context.pendingQueries.length > 0) {
      logger.info('Pending Queries:');
      context.pendingQueries.forEach((q) => {
        logger.info(`   - ${q}`);
      });
    }
  } catch (error) {
    failCommand('Failed to restore checkpoint:', error);
    return;
  }
}

/**
 * List all checkpoints
 */
async function listCheckpoints(outputDir: string): Promise<void> {
  try {
    const checkpointsDir = path.join(outputDir, 'memory', 'checkpoints');
    const files = await fs.readdir(checkpointsDir);
    const checkpointFiles = files
      .filter((f) => f.startsWith('checkpoint-') && f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    if (checkpointFiles.length === 0) {
      logger.info('No checkpoints found');
      return;
    }

    logger.info(`Found ${checkpointFiles.length} checkpoint(s):`);
    logger.info('');

    for (const file of checkpointFiles.slice(0, 10)) {
      const filepath = path.join(checkpointsDir, file);
      const content = await readFileSafe(filepath);
      const checkpoint = JSON.parse(content);

      const timestamp = new Date(checkpoint.timestamp).toLocaleString();
      const message = checkpoint.message || 'No message';

      logger.success(`  * ${file}`);
      logger.info(`    Time: ${timestamp}`);
      logger.info(`    Message: ${message}`);
      logger.info(`    Session: ${checkpoint.sessionId}`);
      logger.info('');
    }

    if (checkpointFiles.length > 10) {
      logger.info(`  ... and ${checkpointFiles.length - 10} more`);
    }
  } catch (error) {
    logger.error('Failed to list checkpoints:');
    logger.error((error as Error).message);
  }
}
