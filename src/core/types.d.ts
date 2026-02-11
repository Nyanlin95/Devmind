/**
 * Shared TypeScript types for DevMind packages
 */
export interface DatabaseContext {
  tables: number;
  schema_hash: string;
  last_migration?: string;
  patterns?: string[];
}
export interface CodebaseContext {
  total_files: number;
  total_lines: number;
  modules: number;
  structure_hash: string;
  last_scan?: string;
  active_features?: string[];
}
export interface MemoryContext {
  database?: DatabaseContext;
  codebase?: CodebaseContext;
}
export interface DatabaseSnapshot {
  tables: number;
  schema_hash: string;
  timestamp: string;
}
export interface CodebaseSnapshot {
  total_files: number;
  total_lines: number;
  modules: number;
  structure_hash: string;
  file_tree?: any[];
  timestamp: string;
}
export interface CheckpointData {
  database?: DatabaseSnapshot;
  codebase?: CodebaseSnapshot;
  timestamp: string;
  message?: string;
  context_version?: string;
}
export type LearningCategory =
  | 'database'
  | 'codebase'
  | 'architecture'
  | 'security'
  | 'performance'
  | 'other';
export type LearningSource = 'database' | 'codebase' | 'cross-context';
export interface Learning {
  content: string;
  category: LearningCategory;
  source: LearningSource;
  timestamp: string;
}
export interface GenerateOptions {
  url?: string;
  orm?: 'prisma' | 'drizzle';
  output?: string;
  format?: 'markdown' | 'json';
  mysql?: boolean;
  sqlite?: string;
  prisma?: string | boolean;
  drizzle?: string | boolean;
}
export interface ScanOptions {
  rootPath: string;
  outputDir: string;
  ignore?: string[];
  maxDepth?: number;
}
export interface InitOptions {
  url?: string;
  dir?: string;
}
export interface CheckpointOptions {
  restore?: boolean;
  list?: boolean;
  message?: string;
  output?: string;
  json?: boolean;
}
export interface LearnOptions {
  list?: boolean;
  category?: LearningCategory;
  output?: string;
  json?: boolean;
}
export interface HistoryOptions {
  sessions?: boolean;
  evolution?: boolean;
  output?: string;
  json?: boolean;
}
export interface OutputMetadata {
  generated_at: string;
  devmind_version: string;
  sources: {
    database?: boolean;
    codebase?: boolean;
  };
}
export interface UnifiedIndex {
  metadata: OutputMetadata;
  database?: any;
  codebase?: any;
  memory?: {
    checkpoints: number;
    learnings: number;
    last_checkpoint?: string;
  };
}
//# sourceMappingURL=types.d.ts.map
