/**
 * Template Generator - Enhanced Version
 * Generates CLAUDE.md and AGENTS.md from schema information with full relationship support
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PostgresSchemaInfo,
  MySQLSchemaInfo,
  SQLiteSchemaInfo,
  PrismaSchemaInfo,
  DrizzleSchemaInfo,
} from '../extractors/index.js';

// ============================================================================
// Unified Schema Types
// ============================================================================

export interface UnifiedColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isForeignKey: boolean;
  referencesTable?: string;
  referencesColumn?: string;
  onDelete?: string;
  onUpdate?: string;
  description?: string;
}

export interface UnifiedIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  isPrimaryKey: boolean;
}

export interface UnifiedRelationInfo {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
  onDelete?: string;
  onUpdate?: string;
}

export interface UnifiedTableInfo {
  name: string;
  description?: string;
  columns: UnifiedColumnInfo[];
  indexes: UnifiedIndexInfo[];
  relations: UnifiedRelationInfo[];
  primaryKey: string[];
}

export interface UnifiedSchemaInfo {
  tables: UnifiedTableInfo[];
  databaseType: 'postgresql' | 'mysql' | 'sqlite' | 'prisma' | 'drizzle' | 'mongodb' | 'firebase';
  schemaName?: string;
  source?: string;
}

// ============================================================================
// Template Data Types
// ============================================================================

interface TemplateData {
  timestamp: string;
  databaseType: string;
  schemaName: string;
  source: string;
  tables: TableTemplateData[];
  relationships: RelationshipTemplateData[];
  cardinalitySummary: string;
  businessRules: BusinessRule[];
  conventions: string[];
  ownershipRules: string;
  typeMappings: TypeMapping[];
  performanceTips: string[];
  version: string;
}

interface TableTemplateData {
  name: string;
  description: string;
  columns: ColumnTemplateData[];
  indexes: IndexTemplateData[];
  relations: string[];
  primaryKey: string;
  foreignKeyCount: number;
  columnList: string;
  usagePattern: string;
}

interface ColumnTemplateData {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isKey: boolean;
  description: string;
}

interface IndexTemplateData {
  name: string;
  columns: string[];
  unique: boolean;
  purpose: string;
}

interface RelationshipTemplateData {
  fromTable: string;
  toTable: string;
  cardinality: string;
  onDelete?: string;
  description: string;
}

interface BusinessRule {
  name: string;
  description: string;
  rule: string;
  examples: string[];
}

interface TypeMapping {
  dbType: string;
  tsType: string;
  notes?: string;
}

// ============================================================================
// Type Mappings
// ============================================================================

const TYPE_MAPPINGS: TypeMapping[] = [
  // PostgreSQL
  { dbType: 'uuid', tsType: 'string', notes: 'UUID v4' },
  { dbType: 'text', tsType: 'string' },
  { dbType: 'varchar', tsType: 'string' },
  { dbType: 'integer', tsType: 'number' },
  { dbType: 'bigint', tsType: 'number' },
  { dbType: 'boolean', tsType: 'boolean' },
  { dbType: 'timestamp', tsType: 'Date' },
  { dbType: 'jsonb', tsType: 'Record<string, unknown>' },
  // MySQL
  { dbType: 'int', tsType: 'number' },
  { dbType: 'datetime', tsType: 'Date' },
  { dbType: 'enum', tsType: 'string', notes: 'Enum values' },
  // SQLite
  { dbType: 'INTEGER', tsType: 'number' },
  { dbType: 'TEXT', tsType: 'string' },
  { dbType: 'REAL', tsType: 'number' },
  { dbType: 'BLOB', tsType: 'Buffer' },
  // Prisma
  { dbType: 'String', tsType: 'string' },
  { dbType: 'Int', tsType: 'number' },
  { dbType: 'Boolean', tsType: 'boolean' },
  { dbType: 'DateTime', tsType: 'Date' },
];

// ============================================================================
// Unified Schema Converter
// ============================================================================

export class UnifiedSchemaConverter {
  static fromPostgres(schema: PostgresSchemaInfo): UnifiedSchemaInfo {
    return {
      tables: schema.tables.map((table) => ({
        name: table.name,
        description: table.description || undefined,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          default: col.default,
          isPrimaryKey: table.primaryKey.includes(col.name),
          isUnique: table.indexes.some((i) => i.unique && i.columns.includes(col.name)),
          isForeignKey: table.foreignKeys.some((fk) => fk.column === col.name),
          referencesTable: table.foreignKeys.find((fk) => fk.column === col.name)?.referencesTable,
          referencesColumn: table.foreignKeys.find((fk) => fk.column === col.name)
            ?.referencesColumn,
          onDelete: table.foreignKeys.find((fk) => fk.column === col.name)?.onDelete || undefined,
          description: col.description || undefined,
        })),
        indexes: table.indexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          isPrimaryKey: idx.isPrimaryKey,
        })),
        relations: table.foreignKeys.map((fk) => ({
          fromTable: table.name,
          fromColumn: fk.column,
          toTable: fk.referencesTable,
          toColumn: fk.referencesColumn,
          cardinality: 'N:1' as const,
          onDelete: fk.onDelete || undefined,
        })),
        primaryKey: table.primaryKey,
      })),
      databaseType: 'postgresql',
      schemaName: schema.schemaName,
    };
  }

  static fromMySQL(schema: MySQLSchemaInfo): UnifiedSchemaInfo {
    return {
      tables: schema.tables.map((table) => ({
        name: table.name,
        description: table.comment || undefined,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          default: col.default,
          isPrimaryKey: table.primaryKey.includes(col.name),
          isUnique: table.indexes.some((i) => i.unique && i.columns.includes(col.name)),
          isForeignKey: table.foreignKeys.some((fk) => fk.column === col.name),
          referencesTable: table.foreignKeys.find((fk) => fk.column === col.name)?.referencesTable,
          referencesColumn: table.foreignKeys.find((fk) => fk.column === col.name)
            ?.referencesColumn,
          onDelete: table.foreignKeys.find((fk) => fk.column === col.name)?.onDelete || undefined,
          description: col.comment || undefined,
        })),
        indexes: table.indexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          isPrimaryKey: idx.isPrimaryKey,
        })),
        relations: table.foreignKeys.map((fk) => ({
          fromTable: table.name,
          fromColumn: fk.column,
          toTable: fk.referencesTable,
          toColumn: fk.referencesColumn,
          cardinality: 'N:1' as const,
          onDelete: fk.onDelete || undefined,
        })),
        primaryKey: table.primaryKey,
      })),
      databaseType: 'mysql',
      schemaName: schema.databaseName,
    };
  }

  static fromSQLite(schema: SQLiteSchemaInfo): UnifiedSchemaInfo {
    return {
      tables: schema.tables.map((table) => ({
        name: table.name,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          default: col.default,
          isPrimaryKey: table.primaryKey.includes(col.name),
          isUnique: table.indexes.some((i) => i.unique && i.columns.includes(col.name)),
          isForeignKey: table.foreignKeys.some((fk) => fk.from === col.name),
          referencesTable: table.foreignKeys.find((fk) => fk.from === col.name)?.table,
          referencesColumn: table.foreignKeys.find((fk) => fk.from === col.name)?.to,
          onDelete: table.foreignKeys.find((fk) => fk.from === col.name)?.onDelete,
        })),
        indexes: table.indexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          isPrimaryKey: idx.isPrimaryKey,
        })),
        relations: table.foreignKeys.map((fk) => ({
          fromTable: table.name,
          fromColumn: fk.from,
          toTable: fk.table,
          toColumn: fk.to,
          cardinality: 'N:1' as const,
          onDelete: fk.onDelete || undefined,
        })),
        primaryKey: table.primaryKey,
      })),
      databaseType: 'sqlite',
    };
  }

  static fromPrisma(schema: PrismaSchemaInfo): UnifiedSchemaInfo {
    return {
      tables: schema.tables.map((table) => ({
        name: table.name,
        description: table.description || undefined,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.isOptional,
          default: col.defaultValue,
          isPrimaryKey: table.primaryKey.includes(col.name),
          isUnique: col.isUnique,
          isForeignKey: col.isRelation,
          referencesTable: col.isRelation ? col.type : undefined,
          onDelete: col.onDelete || undefined,
        })),
        indexes: table.indexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          isPrimaryKey: false,
        })),
        relations: table.relations.map((rel) => ({
          fromTable: rel.fromTable,
          fromColumn: rel.fromFields[0] || '',
          toTable: rel.toTable,
          toColumn: rel.toFields[0] || '',
          cardinality:
            rel.type === 'one-to-one'
              ? '1:1'
              : rel.type === 'one-to-many'
                ? '1:N'
                : rel.type === 'many-to-one'
                  ? 'N:1'
                  : 'N:M',
          onDelete: rel.onDelete || undefined,
        })),
        primaryKey: table.primaryKey,
      })),
      databaseType: 'prisma',
      schemaName: schema.generator?.output || 'prisma',
    };
  }

  static fromDrizzle(schema: DrizzleSchemaInfo): UnifiedSchemaInfo {
    return {
      tables: schema.tables.map((table) => ({
        name: table.name,
        description: table.description || undefined,
        columns: table.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.isOptional,
          default: col.defaultValue,
          isPrimaryKey: col.isPrimaryKey,
          isUnique: col.isUnique,
          isForeignKey: col.isRelation,
          referencesTable: col.relationName || undefined,
          onDelete: col.onDelete || undefined,
        })),
        indexes: table.indexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          isPrimaryKey: false,
        })),
        relations: table.relations.map((rel) => ({
          fromTable: rel.fromTable,
          fromColumn: rel.fromColumns[0] || '',
          toTable: rel.toTable,
          toColumn: rel.toColumns[0] || '',
          cardinality:
            rel.type === 'one-to-one'
              ? '1:1'
              : rel.type === 'one-to-many'
                ? '1:N'
                : rel.type === 'many-to-one'
                  ? 'N:1'
                  : 'N:M',
          onDelete: rel.onDelete || undefined,
        })),
        primaryKey: table.primaryKey,
      })),
      databaseType: 'drizzle',
      schemaName: schema.dialect,
    };
  }
}

// ============================================================================
// Template Generator
// ============================================================================

export class TemplateGenerator {
  private templateDir: string;
  private outputDir: string;

  constructor(templateDir: string = 'templates', outputDir: string = '.ai') {
    this.templateDir = templateDir;
    this.outputDir = outputDir;
  }

  generate(schema: UnifiedSchemaInfo): {
    claudeMd: string;
    agentsMd: string;
    queries: Record<string, string>;
    edgeCasesMd: string;
    constraintsMd: string;
    testTemplates: Record<string, string>;
    memoryPatterns: Record<string, string>;
    handoffTemplates: Record<string, string>;
    decisionTemplates: Record<string, string>;
  } {
    const data = this.buildTemplateData(schema);

    const claudeMd = this.renderClaudeMd(data);
    const agentsMd = this.renderAgentsMd(data);
    const queries = this.generateAllQueryTemplates(schema);
    const edgeCasesMd = this.renderEdgeCasesMd(data);
    const constraintsMd = this.renderConstraintsMd(data);
    const testTemplates = this.generateTestTemplates(schema);
    const memoryPatterns = this.generateMemoryPatterns(schema);
    const handoffTemplates = this.generateHandoffTemplates(schema);
    const decisionTemplates = this.generateDecisionTemplates(schema);

    return {
      claudeMd,
      agentsMd,
      queries,
      edgeCasesMd,
      constraintsMd,
      testTemplates,
      memoryPatterns,
      handoffTemplates,
      decisionTemplates,
    };
  }

  async save(outputPath: string, schema: UnifiedSchemaInfo): Promise<void> {
    const {
      claudeMd,
      agentsMd,
      queries,
      edgeCasesMd,
      constraintsMd,
      testTemplates,
      memoryPatterns,
      handoffTemplates,
      decisionTemplates,
    } = this.generate(schema);

    const fullOutputPath = path.resolve(outputPath);
    await fs.promises.mkdir(fullOutputPath, { recursive: true });

    await fs.promises.writeFile(path.join(fullOutputPath, 'CLAUDE.md'), claudeMd);
    await fs.promises.writeFile(path.join(fullOutputPath, 'AGENTS.md'), agentsMd);
    await fs.promises.writeFile(path.join(fullOutputPath, 'edge-cases.md'), edgeCasesMd);
    await fs.promises.writeFile(path.join(fullOutputPath, 'constraints.md'), constraintsMd);

    const queriesDir = path.join(fullOutputPath, 'queries');
    await fs.promises.mkdir(queriesDir, { recursive: true });

    for (const [filename, content] of Object.entries(queries)) {
      await fs.promises.writeFile(path.join(queriesDir, filename), content);
    }

    // Save test templates
    const testDir = path.join(fullOutputPath, 'test-templates');
    await fs.promises.mkdir(testDir, { recursive: true });

    for (const [filename, content] of Object.entries(testTemplates)) {
      await fs.promises.writeFile(path.join(testDir, filename), content);
    }

    // Save memory patterns
    const memoryDir = path.join(fullOutputPath, 'memory');
    await fs.promises.mkdir(memoryDir, { recursive: true });

    for (const [filename, content] of Object.entries(memoryPatterns)) {
      await fs.promises.writeFile(path.join(memoryDir, filename), content);
    }

    // Save handoff templates
    const handoffsDir = path.join(fullOutputPath, 'handoffs');
    await fs.promises.mkdir(handoffsDir, { recursive: true });

    for (const [filename, content] of Object.entries(handoffTemplates)) {
      await fs.promises.writeFile(path.join(handoffsDir, filename), content);
    }

    // Save decision templates
    const decisionsDir = path.join(fullOutputPath, 'decisions');
    await fs.promises.mkdir(decisionsDir, { recursive: true });

    for (const [filename, content] of Object.entries(decisionTemplates)) {
      await fs.promises.writeFile(path.join(decisionsDir, filename), content);
    }

    // Save context templates
    const contextDir = path.join(fullOutputPath, 'context');
    await fs.promises.mkdir(contextDir, { recursive: true });

    await fs.promises.writeFile(
      path.join(contextDir, 'SESSION_CONTEXT.json'),
      JSON.stringify(
        {
          version: '1.1.0',
          session: {
            id: 'sess_TEMPLATE',
            agentId: 'agent_TEMPLATE',
            timestamp: '2026-02-08T10:00:00Z',
            status: 'in_progress',
          },
          state: {
            phase: 'initializing',
            progress: 0,
            lastAction: 'Template generated',
            nextAction: 'Define goals',
          },
          variables: {},
          schema: {
            databaseType: schema.databaseType,
            tablesModified: schema.tables.map((t) => t.name),
            schemaHash: 'TEMPLATE',
          },
          decisions: [],
          handoffs: [],
          errors: [],
        },
        null,
        2,
      ),
    );
  }

  private buildTemplateData(schema: UnifiedSchemaInfo): TemplateData {
    const tables: TableTemplateData[] = schema.tables.map((table) => ({
      name: table.name,
      description: table.description || '',
      columns: table.columns.map((col) => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        default: col.default,
        isKey: col.isPrimaryKey || col.isForeignKey,
        description: col.description || '',
      })),
      indexes: table.indexes.map((idx) => ({
        name: idx.name,
        columns: idx.columns,
        unique: idx.unique,
        purpose: this.getIndexPurpose(idx, table),
      })),
      relations: table.relations.map(
        (rel) => `- \`${rel.fromColumn}\` â†’ \`${rel.toTable}\` (${rel.cardinality})`,
      ),
      primaryKey: table.primaryKey.join(', ') || 'N/A',
      foreignKeyCount: table.relations.length,
      columnList: table.columns.map((c) => c.name + ': ' + c.type).join('\n'),
      usagePattern: this.getUsagePattern(table),
    }));

    const relationships = this.buildRelationships(schema);

    return {
      timestamp: new Date().toISOString(),
      databaseType: schema.databaseType,
      schemaName: schema.schemaName || 'default',
      source: schema.source || '',
      tables,
      relationships,
      cardinalitySummary: this.getCardinalitySummary(schema),
      businessRules: this.getBusinessRules(schema),
      conventions: this.getConventions(schema),
      ownershipRules: this.getOwnershipRules(schema),
      typeMappings: TYPE_MAPPINGS,
      performanceTips: this.getPerformanceTips(schema),
      version: '1.1.0',
    };
  }

  private buildRelationships(schema: UnifiedSchemaInfo): RelationshipTemplateData[] {
    const relationships: RelationshipTemplateData[] = [];

    for (const table of schema.tables) {
      for (const rel of table.relations) {
        relationships.push({
          fromTable: rel.fromTable,
          toTable: rel.toTable,
          cardinality: rel.cardinality,
          onDelete: rel.onDelete,
          description: this.getRelationshipDescription(rel),
        });
      }
    }

    return relationships;
  }

  private getCardinalitySummary(schema: UnifiedSchemaInfo): string {
    const counts: Record<string, number> = { '1:1': 0, '1:N': 0, 'N:1': 0, 'N:M': 0 };

    for (const table of schema.tables) {
      for (const rel of table.relations) {
        counts[rel.cardinality] = (counts[rel.cardinality] || 0) + 1;
      }
    }

    const parts: string[] = [];
    if (counts['1:1'] > 0) parts.push(`${counts['1:1']} one-to-one`);
    if (counts['1:N'] > 0) parts.push(`${counts['1:N']} one-to-many`);
    if (counts['N:1'] > 0) parts.push(`${counts['N:1']} many-to-one`);
    if (counts['N:M'] > 0) parts.push(`${counts['N:M']} many-to-many`);

    return parts.length > 0 ? parts.join(', ') : 'No relationships defined';
  }

  private getIndexPurpose(index: UnifiedIndexInfo, table: UnifiedTableInfo): string {
    if (index.isPrimaryKey) return 'Primary key constraint';
    if (index.unique) return 'Unique constraint';
    if (index.columns.includes('organization_id')) return 'Multi-tenant isolation';
    if (index.columns.includes('deleted_at')) return 'Soft delete filtering';
    if (index.columns.includes('created_at')) return 'Sorting and ordering';
    if (index.columns.some((c) => table.relations.some((r) => r.fromColumn === c)))
      return 'Foreign key index';
    return 'Performance optimization';
  }

  private getRelationshipDescription(rel: UnifiedRelationInfo): string {
    switch (rel.cardinality) {
      case '1:1':
        return `Each \`${rel.fromTable}\` has exactly one \`${rel.toTable}\``;
      case '1:N':
        return `Each \`${rel.fromTable}\` has many \`${rel.toTable}\``;
      case 'N:1':
        return `Many \`${rel.fromTable}\` belong to one \`${rel.toTable}\``;
      case 'N:M':
        return `\`${rel.fromTable}\` and \`${rel.toTable}\` have a many-to-many relationship`;
      default:
        return '';
    }
  }

  private getUsagePattern(table: UnifiedTableInfo): string {
    if (table.name.endsWith('users') || table.name.endsWith('user')) {
      return 'Core user table. All operations require organization_id check.';
    }
    if (table.name.endsWith('organizations') || table.name.endsWith('company')) {
      return 'Root entity. No organization_id (is root).';
    }
    if (table.name.endsWith('sessions') || table.name.endsWith('tokens')) {
      return 'Auth-related. Include user_id check. Soft delete recommended.';
    }
    if (table.relations.length === 0) {
      return 'Standalone table. No foreign key dependencies.';
    }
    return 'Standard CRUD with potential organization_id isolation.';
  }

  private getBusinessRules(schema: UnifiedSchemaInfo): BusinessRule[] {
    const rules: BusinessRule[] = [
      {
        name: 'Organization Isolation',
        description:
          'All tables with organization_id must be filtered by it for multi-tenant security',
        rule: 'SELECT * FROM table WHERE id = $1 AND organization_id = $2',
        examples: [
          '-- Correct: Include organization check',
          'SELECT * FROM users WHERE id = $1 AND organization_id = $2;',
          '-- Wrong: Missing organization check',
          'SELECT * FROM users WHERE id = $1;',
        ],
      },
      {
        name: 'Soft Deletes',
        description:
          'Use deleted_at for soft deletes instead of hard deletes to preserve data integrity',
        rule: 'UPDATE table SET deleted_at = NOW() WHERE id = $1',
        examples: [
          '-- Soft delete (recommended)',
          'UPDATE users SET deleted_at = NOW() WHERE id = $1;',
          '-- Query without deleted records',
          'SELECT * FROM users WHERE deleted_at IS NULL;',
        ],
      },
    ];

    const hasTimestamps = schema.tables.some((t) =>
      t.columns.some((c) => c.name === 'created_at' || c.name === 'updated_at'),
    );

    if (hasTimestamps) {
      rules.push({
        name: 'Timestamp Conventions',
        description: 'Use created_at for ordering, updated_at for change detection',
        rule: 'ORDER BY created_at DESC, updated_at ASC',
        examples: [
          '-- Recent items first',
          'SELECT * FROM table ORDER BY created_at DESC LIMIT 10;',
          '-- Detect changes since last sync',
          'SELECT * FROM table WHERE updated_at > $1;',
        ],
      });
    }

    return rules;
  }

  private getConventions(schema: UnifiedSchemaInfo): string[] {
    const conventions: string[] = [
      'Use parameterized queries to prevent SQL injection',
      'Always include organization_id in WHERE clauses for multi-tenant tables',
      'Use COALESCE for nullable column handling',
      'Prefer ORDER BY created_at DESC for lists',
      'Use EXPLAIN ANALYZE to optimize slow queries',
    ];

    return conventions;
  }

  private getOwnershipRules(schema: UnifiedSchemaInfo): string {
    let rules =
      '- **Multi-Tenant Isolation**: All tables include `organization_id` for tenant separation\n';
    rules += '- **Ownership Verification**: Check ownership before any write operation\n';

    return rules;
  }

  private getPerformanceTips(schema: UnifiedSchemaInfo): string[] {
    const tips: string[] = [
      'Use indexes on frequently filtered columns (organization_id, deleted_at)',
      'Avoid SELECT *, specify needed columns for better performance',
      'Batch inserts with bulk operations when inserting multiple rows',
    ];

    const hasJoins = schema.tables.some((t) => t.relations.length > 0);

    if (hasJoins) {
      tips.push('Ensure foreign key columns are indexed for join performance');
      tips.push('Use eager loading to avoid N+1 query problems');
    }

    return tips;
  }

  private renderClaudeMd(data: TemplateData): string {
    let tablesSection = '';

    for (const table of data.tables) {
      let section = `### ${table.name}\n\n`;

      section += '| Column | Type | Nullable | Key | Notes |\n';
      section += '|--------|------|----------|-----|-------|\n';

      for (const col of table.columns) {
        const nullable = col.nullable ? 'yes' : 'no';
        const key = col.isKey ? 'PK/FK' : '-';
        const desc = col.description || '-';
        section += `| \`${col.name}\` | \`${col.type}\` | ${nullable} | ${key} | ${desc} |\n`;
      }

      if (table.indexes.length > 0) {
        section += '\n**Indexes:**\n';
        for (const idx of table.indexes) {
          const unique = idx.unique ? ' (unique)' : '';
          section += `- \`${idx.name}\` on \`(${idx.columns.join(', ')})\`${unique} - ${idx.purpose}\n`;
        }
      }

      if (table.relations.length > 0) {
        section += '\n**Foreign Keys:**\n';
        for (const rel of table.relations) {
          section += `${rel}\n`;
        }
      }

      tablesSection += section + '\n';
    }

    let relationshipsSection = '';
    for (const rel of data.relationships) {
      const onDelete = rel.onDelete ? ` (ON DELETE ${rel.onDelete})` : '';
      relationshipsSection += `| ${rel.fromTable} | ${rel.cardinality} | ${rel.toTable} | ${onDelete} |\n`;
    }

    let businessRulesSection = '';
    for (const rule of data.businessRules) {
      businessRulesSection += `\n### ${rule.name}\n\n`;
      businessRulesSection += `${rule.description}\n\n`;
      businessRulesSection += `**Rule:** \n\`\`\`sql\n${rule.rule}\n\`\`\`\n`;
      if (rule.examples.length > 0) {
        businessRulesSection += '\n**Examples:**\n```sql\n' + rule.examples.join('\n') + '\n```\n';
      }
    }

    let conventionsSection = '';
    for (const conv of data.conventions) {
      conventionsSection += `- ${conv}\n`;
    }

    // Build output with agent-aware callouts
    let output = '# Database Context\n\n';
    output += '> AUTO-GENERATED by cohere-db. Works with Claude, Codex, Antigravity, Xcode.\n\n';

    // Agent-specific callouts
    output += '> [!NOTE|CLAUDE]\n';
    output += '> **Claude Code**: This file auto-loads.\n';
    output += '> ```bash\n';
    output += '> claude db:validate  # Verify queries\n';
    output += '> claude test:run      # Run tests\n';
    output += '> ```\n\n';

    output += '> [!NOTE|CODEX]\n';
    output += '> **Codex**: You MUST explicitly read this file:\n';
    output += '> ```\n';
    output += '> Read the CLAUDE.md file in this directory.\n';
    output += '> ```\n';
    output += '> Codex does NOT auto-load context files.\n\n';

    output += '> [!NOTE|ANTIGRAVITY]\n';
    output += '> **Antigravity**: Use with MCP. Coordinate via `.ai/memory/`.\n\n';

    output += '## Overview\n\n';
    output += `**Database Type:** ${data.databaseType}\n`;
    output += `**Schema:** ${data.schemaName}\n`;
    output += `**Tables:** ${data.tables.length}\n\n`;
    output += '## Tables\n\n';
    output += tablesSection;
    output += '## Relationships\n\n';
    output += '| From | Cardinality | To | Actions |\n';
    output += '|------|-------------|-----|--------|\n';
    output += relationshipsSection;
    output += '\n> [!NOTE|ALL]\n';
    output += '> **ALL AGENTS**: Foreign key columns MUST be indexed.\n\n';
    output += '## Business Rules\n\n';
    output += businessRulesSection;
    output += '## Conventions\n\n';
    output += conventionsSection;
    output += '\n> [!NOTE|ALL]\n';
    output += '> **ALL AGENTS**: Parameterized queries required. Never interpolate strings.\n\n';
    output += '## Multi-Tenant Isolation\n\n';
    output += data.ownershipRules + '\n\n';

    output += '## Additional Resources\n\n';
    output += '| Resource | Purpose |\n';
    output += '|----------|----------|\n';
    output += '| `.ai/edge-cases.md` | Edge case patterns |\n';
    output += '| `.ai/constraints.md` | Query limits |\n';
    output += '| `.ai/test-templates/` | Edge case tests |\n';
    output += '| `.ai/memory/` | Checkpoint patterns |\n';

    return output;
  }

  private renderAgentsMd(data: TemplateData): string {
    let tableQuickRef = '';
    for (const table of data.tables) {
      const pk = table.primaryKey || 'N/A';
      const sampleCols = table.columns
        .slice(0, 3)
        .map((c) => c.name)
        .join(', ');
      tableQuickRef += `| [${table.name}](#${table.name}) | ${pk} | ${table.foreignKeyCount} | ${sampleCols}... |\n`;
    }

    let tableDetails = '';
    for (const table of data.tables) {
      tableDetails += `\n### ${table.name}\n\n`;
      tableDetails += `**Description:** ${table.description || 'No description available'}\n\n`;
      tableDetails += '**Columns:**\n```\n';
      tableDetails += table.columnList + '\n';
      tableDetails += '```\n\n';
      if (table.relations.length > 0) {
        tableDetails += '**Relationships:**\n';
        tableDetails += table.relations.join('\n') + '\n\n';
      }
      tableDetails += `**Usage Pattern:** ${table.usagePattern}\n`;
    }

    let cardinalitySection = '';
    cardinalitySection += `**Relationship Summary:** ${data.cardinalitySummary}\n\n`;
    cardinalitySection += '| Type | Description |\n';
    cardinalitySection += '|------|-------------|\n';
    cardinalitySection += '| 1:1 | One-to-one relationship |\n';
    cardinalitySection += '| 1:N | One-to-many relationship |\n';
    cardinalitySection += '| N:1 | Many-to-one relationship |\n';
    cardinalitySection += '| N:M | Many-to-many relationship |\n';

    let typeMappingsSection = '';
    for (const tm of data.typeMappings) {
      typeMappingsSection += `| \`${tm.dbType}\` | \`${tm.tsType}\` ${tm.notes ? `(${tm.notes})` : ''} |\n`;
    }

    // Build output with agent-aware callouts
    let output = '# Database Context for AI Assistants\n\n';
    output += '> AUTO-GENERATED by cohere. Core content works for all agents.\n\n';

    output += '## Quick Reference\n\n';
    output += '| Table | Primary Key | Foreign Keys | Sample Columns |\n';
    output += '|-------|-------------|--------------|----------------|\n';
    output += tableQuickRef;
    output += cardinalitySection;
    output += '\n## Table Details\n\n';
    output += tableDetails;
    output += '\n## Type Mappings\n\n';
    output += '| Database Type | TypeScript Type | Notes |\n';
    output += '|---------------|-----------------|-------|\n';
    output += typeMappingsSection;
    output += '\n## Performance Tips\n\n';
    for (const tip of data.performanceTips) {
      output += `- ${tip}\n`;
    }

    // Add agent-specific warnings
    output += '\n## Platform Warnings\n\n';
    output += '> [!WARNING|CODEX]\n';
    output += '> **Codex**: Add to AGENTS.md:\n';
    output += '> ```\n';
    output += '> All queries MUST include organization_id filter.\n';
    output += '> Pattern: SELECT ... WHERE id = $1 AND organization_id = $2\n';
    output += '> ```\n\n';

    output += '> [!WARNING|ANTIGRAVITY]\n';
    output +=
      '> **Antigravity**: Parallel agents share context. Use `.ai/memory/checkpoints/`.\n\n';

    output += '> [!WARNING|ALL]\n';
    output += '> **ALL AGENTS**: Checkpoint every 5-10 minutes to prevent context loss.\n';

    return output;
  }

  private generateAllQueryTemplates(schema: UnifiedSchemaInfo): Record<string, string> {
    const queries: Record<string, string> = {};

    for (const table of schema.tables) {
      queries[`${table.name}.sql`] = this.generateQueryTemplate(table);
    }

    queries['transactions.sql'] = this.generateTransactionPatterns();

    return queries;
  }

  private generateQueryTemplate(table: UnifiedTableInfo): string {
    const pk = table.primaryKey[0] || 'id';
    const columns = table.columns.map((c) => c.name);
    const hasOrgId = table.columns.some((c) => c.name === 'organization_id');
    const hasDeletedAt = table.columns.some((c) => c.name === 'deleted_at');
    const nonDefaultCols = columns.filter((c) => c !== 'created_at' && c !== 'updated_at');

    let output = `-- ${table.name} queries\n`;
    output += `-- AUTO-GENERATED by cohere\n\n`;

    // READ operations
    output += `-- === READ ===\n\n`;
    output += `-- Get by ${pk}\n`;
    output += `SELECT * FROM ${table.name} WHERE ${pk} = $1;\n\n`;

    if (hasOrgId) {
      output += `-- Get with organization check\n`;
      output += `SELECT * FROM ${table.name} WHERE ${pk} = $1 AND organization_id = $2;\n\n`;
    }

    output += `-- List with pagination\n`;
    output += `SELECT * FROM ${table.name}\n`;
    if (hasOrgId) {
      output += `WHERE organization_id = $1\n`;
    }
    output += `ORDER BY created_at DESC\n`;
    output += `LIMIT $2 OFFSET $3;\n\n`;

    if (hasDeletedAt) {
      output += `-- List without deleted records\n`;
      output += `SELECT * FROM ${table.name}\n`;
      if (hasOrgId) {
        output += `WHERE organization_id = $1\n`;
      }
      output += `AND deleted_at IS NULL\n`;
      output += `ORDER BY created_at DESC;\n\n`;
    }

    // CREATE operations
    output += `-- === CREATE ===\n\n`;
    output += `-- Insert single record\n`;
    output += `INSERT INTO ${table.name} (${nonDefaultCols.join(', ')})\n`;
    output += `VALUES (${nonDefaultCols.map((_, i) => '$' + (i + 1)).join(', ')});\n`;

    return output;
  }

  private generateTransactionPatterns(): string {
    return `-- Transaction Examples
-- Use transactions for atomic operations

BEGIN TRANSACTION;

-- 1. Create parent record
INSERT INTO orders (user_id, total, status)
VALUES ($1, $2, 'pending')
RETURNING id;

-- 2. Create child records
INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES 
  ($3, $4, $5, $6),
  ($3, $7, $8, $9);

-- 3. Update inventory
UPDATE products SET stock = stock - $5 WHERE id = $4;
UPDATE products SET stock = stock - $8 WHERE id = $7;

COMMIT;
`;
  }

  // ============================================================================
  // Edge Cases Generation
  // ============================================================================

  private renderEdgeCasesMd(data: TemplateData): string {
    let output = '# Edge Cases Handling Guide\n\n';
    output += `> AUTO-GENERATED by cohere. Last updated: ${data.timestamp}\n\n`;

    // Session Restart Amnesia
    output += '## 1. Session Restart Amnesia\n\n';
    output += '### Checkpoint Pattern\n';
    output += '```typescript\n';
    output += `// Checkpoint file: .ai/memory/checkpoint-{timestamp}.json\n`;
    output += 'interface AgentCheckpoint {\n';
    output += '  timestamp: string;\n';
    output += '  sessionId: string;\n';
    output += '  schemaVersion: string;\n';
    output += '  currentTask?: TaskContext;\n';
    output += '  discoveredPatterns: DiscoveredPattern[];\n';
    output += '}\n';
    output += '```\n\n';

    // Tool Misalignment
    output += '## 2. Tool Misalignment\n\n';
    output += '### Type Constraint Warnings\n';
    output += '```sql\n';
    output += '-- Verify column types before queries\n';
    output += 'SELECT column_name, data_type\n';
    output += 'FROM information_schema.columns\n';
    output += `WHERE table_name = '${data.tables[0]?.name || 'table_name'}';\n`;
    output += '```\n\n';

    // Infinite Context Exploration
    output += '## 3. Infinite Context Exploration\n\n';
    output += '### Query Limits\n';
    output += '| Operation | Limit | Reason |\n';
    output += '|-----------|-------|--------|\n';
    output += '| SELECT rows | 10,000 max | Prevent context exhaustion |\n';
    output += '| JOIN depth | 5 max | Query complexity |\n';
    output += '| Query timeout | 30s | Resource sharing |\n\n';

    // Verification Gaps
    output += '## 4. Verification Gaps\n\n';
    output += '### Duplicate Detection\n';
    output += '```sql\n';
    output += '-- Find potential duplicate records\n';
    output += 'SELECT email, COUNT(*) as cnt\n';
    output += `FROM ${data.tables[0]?.name || 'users'}\n`;
    output += 'GROUP BY email\n';
    output += 'HAVING COUNT(*) > 1;\n';
    output += '```\n\n';

    // Database-specific tables
    output += '## 5. Schema-Specific Edge Cases\n\n';
    for (const table of data.tables) {
      const hasOrgId = table.columns.some((c: ColumnTemplateData) => c.name === 'organization_id');
      const hasDeletedAt = table.columns.some((c: ColumnTemplateData) => c.name === 'deleted_at');

      if (hasOrgId || hasDeletedAt) {
        output += `### ${table.name}\n\n`;

        if (hasOrgId) {
          output +=
            '- **Organization isolation required**: All queries must include `organization_id` check\n';
        }
        if (hasDeletedAt) {
          output +=
            '- **Soft delete pattern**: Use `deleted_at IS NULL` to exclude deleted records\n';
        }
        output += '\n';
      }
    }

    return output;
  }

  private renderConstraintsMd(data: TemplateData): string {
    let output = '# Query Constraints & Limits\n\n';
    output += `> AUTO-GENERATED by cohere. Last updated: ${data.timestamp}\n\n`;

    output += '## Query Limits\n\n';
    output += '| Operation | Limit | Reason |\n';
    output += '|-----------|-------|--------|\n';
    output += '| SELECT rows | 10,000 max | Prevent context exhaustion |\n';
    output += '| SELECT with OFFSET | 1,000 max | Performance degradation |\n';
    output += '| JOIN depth | 5 max | Query complexity |\n';
    output += '| INSERT rows (batch) | 1,000 max | Transaction size |\n';
    output += '| Query timeout | 30s | Resource sharing |\n\n';

    output += '## Required Patterns\n\n';
    output += '### LIMIT Required\n';
    output += '```sql\n';
    output += '-- âœ“ CORRECT: Always use LIMIT\n';
    output += `SELECT * FROM ${data.tables[0]?.name || 'table'} LIMIT 100;\n`;
    output += '-- âœ— WRONG: No LIMIT on potential large tables\n';
    output += `SELECT * FROM ${data.tables[0]?.name || 'table'};\n`;
    output += '```\n\n';

    // Check if tables have organization_id
    const hasOrgIsolation = data.tables.some((t: TableTemplateData) =>
      t.columns.some((c: ColumnTemplateData) => c.name === 'organization_id'),
    );

    if (hasOrgIsolation) {
      output += '### Organization Isolation Required\n';
      output += '```sql\n';
      output += '-- âœ“ CORRECT: Organization check included\n';
      output += `SELECT * FROM ${data.tables[0]?.name || 'users'} WHERE organization_id = $1;\n`;
      output += '-- âœ— WRONG: Missing organization_id (security risk!)\n';
      output += `SELECT * FROM ${data.tables[0]?.name || 'users'};\n`;
      output += '```\n\n';
    }

    output += '## Pagination Patterns\n\n';
    output += '### Keyset Pagination (Recommended)\n';
    output += '```typescript\n';
    output += 'async function getNextPage(lastId: string, limit: number = 50) {\n';
    output += `  return query(\`SELECT * FROM ${data.tables[0]?.name || 'items'} WHERE id > $1 ORDER BY id LIMIT $2\`, [lastId, limit]);\n`;
    output += '}\n';
    output += '```\n\n';

    output += '## Context Guardrails\n\n';
    output += '```typescript\n';
    output += 'const QUERY_CONSTRAINTS = {\n';
    output += '  maxRows: 1000,\n';
    output += '  maxDepth: 5,\n';
    output += '  timeoutMs: 30000,\n';
    output += '  requireOrderBy: true,\n';
    output += '  requireLimit: true,\n';
    output += '};\n';
    output += '```\n\n';

    return output;
  }

  private generateTestTemplates(schema: UnifiedSchemaInfo): Record<string, string> {
    const templates: Record<string, string> = {};

    // Main edge cases test file
    templates['edge-cases.test.ts'] = this.generateEdgeCasesTest(schema);

    // CRUD edge cases
    const crudTemplates = this.generateCRUDEdgeCases(schema);
    for (const [name, content] of Object.entries(crudTemplates)) {
      templates[name] = content;
    }

    return templates;
  }

  private generateEdgeCasesTest(schema: UnifiedSchemaInfo): string {
    const tableName = schema.tables[0]?.name || 'table_name';
    const pk = schema.tables[0]?.primaryKey || 'id';

    return `/**
 * Edge Case Tests for ${tableName}
 * AUTO-GENERATED by cohere
 */

describe('${tableName} Edge Cases', () => {
  const orgId = 'test-org-id';

  describe('Empty Result Sets', () => {
    test('SELECT returns empty array when no rows match', async () => {
      const result = await query(
        'SELECT * FROM ${tableName} WHERE id = $1 AND organization_id = $2',
        ['nonexistent-id', orgId]
      );
      expect(result.rows).toEqual([]);
    });
  });

  describe('Primary Key Edge Cases', () => {
    test('INSERT fails on duplicate primary key', async () => {
      await expect(query(
        'INSERT INTO ${tableName} (id) VALUES ($1)',
        ['existing-id']
      )).rejects.toThrow('duplicate_key');
    });

    test('UPDATE modifies correct row', async () => {
      const result = await query(
        'UPDATE ${tableName} SET updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id',
        ['target-id', orgId]
      );
      expect(result.rowCount).toBe(1);
    });
  });

  describe('Soft Delete Edge Cases', () => {
    test('SELECT excludes soft-deleted records by default', async () => {
      const result = await query(
        'SELECT * FROM ${tableName} WHERE organization_id = $1',
        [orgId]
      );
      expect(result.rows.every(r => r.deleted_at === null)).toBe(true);
    });
  });
});
`;
  }

  private generateCRUDEdgeCases(schema: UnifiedSchemaInfo): Record<string, string> {
    const templates: Record<string, string> = {};

    for (const table of schema.tables) {
      const testContent = this.generateSingleTableTests(table);
      templates[table.name + '.test.ts'] = testContent;
    }

    return templates;
  }

  private generateSingleTableTests(table: UnifiedTableInfo): string {
    const orgIdLine = table.columns.some((c) => c.name === 'organization_id')
      ? "  const orgId = 'test-org-id';"
      : '  // No organization_id column in this table';

    const softDeleteTest = table.columns.some((c) => c.name === 'deleted_at')
      ? `
  test('Soft-deleted records are excluded by default', async () => {
    const result = await query('SELECT * FROM ' + table.name);
    expect(result.rows.every(r => r.deleted_at === null)).toBe(true);
  });`
      : '';

    const updateTest =
      table.primaryKey.length > 0
        ? `
  test('UPDATE with valid ' + table.primaryKey[0] + ' succeeds', async () => {
    const result = await query(
      'UPDATE ' + table.name + ' SET updated_at = NOW() WHERE id = $1 RETURNING id',
      ['test-id']
    );
    expect(result.rowCount).toBeGreaterThanOrEqual(0);
  });`
        : '';

    return (
      '/**\n' +
      ' * ' +
      table.name +
      ' Edge Case Tests\n' +
      ' * AUTO-GENERATED by cohere\n' +
      ' */\n\n' +
      "describe('" +
      table.name +
      " Edge Cases', () => {\n" +
      orgIdLine +
      softDeleteTest +
      updateTest +
      '\n});\n'
    );
  }

  // ============================================================================
  // Memory Patterns Generation
  // ============================================================================

  private generateMemoryPatterns(schema: UnifiedSchemaInfo): Record<string, string> {
    const patterns: Record<string, string> = {};

    patterns['checkpoint-patterns.md'] = this.generateCheckpointPatterns(schema);
    patterns['session-template.md'] = this.generateSessionTemplate(schema);
    patterns['accumulated-learnings.md'] = this.generateEmptyLearnings();

    return patterns;
  }

  private generateCheckpointPatterns(schema: UnifiedSchemaInfo): string {
    const tablesList = schema.tables
      .map(
        (t) =>
          '- **' +
          t.name +
          '**: ' +
          t.columns.length +
          ' columns, ' +
          t.relations.length +
          ' relationships',
      )
      .join('\n');

    return (
      '# Memory & Checkpoint Patterns\n\n' +
      '> AUTO-GENERATED by cohere-db. Pattern version: 1.1.0\n\n' +
      '## Directory Structure\n\n' +
      '```\n' +
      '.ai/\n' +
      'â”œâ”€â”€ memory/\n' +
      'â”‚   â”œâ”€â”€ checkpoints/          # Session checkpoints\n' +
      'â”‚   â”‚   â””â”€â”€ checkpoint-{timestamp}.json\n' +
      'â”‚   â”œâ”€â”€ accumulated-learnings.md  # Cross-session knowledge\n' +
      'â”‚   â”œâ”€â”€ edge-cases.md         # Documented edge cases\n' +
      'â”‚   â””â”€â”€ session-history.md    # Recent session notes\n' +
      '```\n\n' +
      '## Checkpoint Interface\n\n' +
      '```typescript\n' +
      'interface AgentCheckpoint {\n' +
      '  timestamp: string;\n' +
      '  sessionId: string;\n' +
      '  schemaVersion: string;\n' +
      '  schemaHash: string;          // ' +
      schema.tables.length +
      ' tables in current schema\n' +
      '  currentTask?: TaskContext;\n' +
      '  discoveredPatterns: DiscoveredPattern[];\n' +
      '  pendingQueries: PendingQuery[];\n' +
      '  agentMemory: Record<string, unknown>;\n' +
      '}\n\n' +
      'interface TaskContext {\n' +
      '  taskId: string;\n' +
      "  status: 'in_progress' | 'paused' | 'completed';\n" +
      '  lastAction?: string;\n' +
      '  progress: number;\n' +
      '}\n' +
      '```\n\n' +
      '## Tables in Schema\n' +
      tablesList +
      '\n\n' +
      '## Usage\n\n' +
      '```typescript\n' +
      "import { saveCheckpoint, restoreLatestCheckpoint } from './memory/checkpoint';\n\n" +
      "const checkpoint = await restoreLatestCheckpoint('.ai');\n" +
      'if (checkpoint) {\n' +
      "  console.log('Resuming from:', checkpoint.timestamp);\n" +
      '}\n' +
      '// ... perform work ...\n' +
      "await saveCheckpoint('.ai', newCheckpoint);\n" +
      '```\n'
    );
  }

  private generateSessionTemplate(schema: UnifiedSchemaInfo): string {
    const tablesList = schema.tables.map((t) => '- ' + t.name).join('\n');

    return (
      '# Session Template\n\n' +
      '> AUTO-GENERATED by cohere\n\n' +
      '## Current Session\n\n' +
      '**Session ID:** ${SESSION_ID}\n' +
      '**Start Time:** ${START_TIME}\n' +
      '**Schema:** ' +
      schema.databaseType +
      '\n\n' +
      '## Tables in Scope\n' +
      tablesList +
      '\n\n' +
      '## Goals\n' +
      '- \n\n' +
      '## Progress\n' +
      '- [ ] \n\n' +
      '## Notes\n' +
      '- \n\n' +
      '---\n' +
      '*Delete this header and fill in your session details*\n'
    );
  }

  private generateEmptyLearnings(): string {
    return (
      '# Accumulated Learnings\n\n' +
      '> AUTO-GENERATED by cohere\n\n' +
      'Cross-session knowledge and patterns discovered during agent work.\n\n' +
      '## Getting Started\n\n' +
      'Copy patterns discovered across sessions here:\n\n' +
      '```markdown\n' +
      '## YYYY-MM-DD\n\n' +
      '**Category:** query|schema|relationship|edge-case\n\n' +
      '**Description:** \n\n' +
      '**Example:**\n' +
      '```sql\n' +
      '-- Your SQL example here\n' +
      '```\n\n' +
      '**Usage Count:** N\n' +
      '```\n\n' +
      '---\n' +
      '*This file is updated automatically by checkpoint patterns*\n'
    );
  }

  // ============================================================================
  // Handoff Templates Generation
  // ============================================================================

  private generateHandoffTemplates(schema: UnifiedSchemaInfo): Record<string, string> {
    const templates: Record<string, string> = {};

    templates['handoff-template.md'] = this.generateHandoffTemplate(schema);
    templates['MULTI_AGENT_PROTOCOL.md'] = this.generateMultiAgentProtocol(schema);

    return templates;
  }

  private generateHandoffTemplate(schema: UnifiedSchemaInfo): string {
    const tablesList = schema.tables.map((t) => `- \`${t.name}\``).join('\n');

    return `# Agent Handoff Record

> AUTO-GENERATED by cohere. Read this before continuing.

## Session Info

| Field | Value |
|-------|-------|
| **Agent ID** | \`{agentId}\` |
| **Session ID** | \`{sessionId}\` |
| **Timestamp** | \`{timestamp}\` |
| **Duration** | \`{duration}\` |
| **Status** | \`{status}\` |

---

## What Was Attempted

### Goals
- Goal 1
- Goal 2
- Goal 3

### Actions Taken

| Step | Action | Result |
|------|--------|--------|
| 1 | Action description | âœ… Success / âŒ Failed |
| 2 | Action description | âœ… Success / âŒ Failed |
| 3 | Action description | â¸ï¸ Paused |

---

## What Succeeded

- âœ… Success item 1
- âœ… Success item 2

---

## What Failed

- âŒ Failed item 1
- âŒ Failed item 2 with error: \`{error}\`

### Error Details
\`\`\`
{errorStackTrace}
\`\`\`

### Recovery Attempts
1. Attempt 1: Result
2. Attempt 2: Result

---

## Decisions Made

| Decision ID | Choice | Rationale |
|-------------|--------|-----------|
| DECISION_001 | Choice A | Rationale |
| DECISION_002 | Choice B | Rationale |

> See \`.ai/decisions/\` for detailed decision logs.

---

## Current State

### Last Completed Step
\`\`\`
{lastCompletedStep}
\`\`\`

### Pending Work
- [ ] Pending item 1
- [ ] Pending item 2

### Known Issues
- Issue 1: Description
- Issue 2: Description

---

## Context for Next Agent

### Variables
\`\`\`json
{variablesJson}
\`\`\`

### Schema State
- Tables modified: {modifiedTables}
- New relationships: {newRelationships}

### Tables in Scope
${tablesList}

---

## Next Steps

### Immediate Actions
1. Next action 1
2. Next action 2

### Recommended Approach
\`\`\`
{recommendedApproach}
\`\`\`

### Expected Duration
- \`{estimatedDuration}\`

---

## Files Generated

| File | Purpose |
|------|---------|
| \`.ai/state/CURRENT_STATE.md\` | Progress snapshot |
| \`.ai/context/SESSION_CONTEXT.json\` | Machine-readable state |
| \`.ai/decisions/\` | Decision logs |

---

> **PROTOCOL**: Before spawning subagents:
> 1. Generate handoff file
> 2. Pass handoff to next agent
> 3. Next agent reads \`.ai/state/CURRENT_STATE.md\` first
`;
  }

  private generateMultiAgentProtocol(schema: UnifiedSchemaInfo): string {
    const tablesList = schema.tables.map((t) => t.name).join(', ');

    return `# Multi-Agent Protocol

> AUTO-GENERATED by cohere. Protocol for agent-to-agent handoff.

## Overview

This document defines the protocol for safe handoff between AI agents working on the same codebase.

## Protocol Steps

### 1. Pre-Handoff (Current Agent)

Before ending your session:

\`\`\`bash
cohere-db handoff --record --status {status} --agentId {agentId}
\`\`\`

This creates:
- \`.ai/handoffs/HANDOFF_<timestamp>.md\` - Full handoff record
- \`.ai/state/CURRENT_STATE.md\` - Current progress snapshot
- \`.ai/context/SESSION_CONTEXT.json\` - Machine-readable state

### 2. Handoff Transfer

Share these files with the next agent:
- Handoff file location
- Session context JSON
- Any modified files

### 3. Post-Handoff (Next Agent)

On receiving handoff:

\`\`\`bash
# List available sessions
cohere-db handoff --list

# Resume specific session
cohere-db handoff --resume <session_id>

# Read state first
cat .ai/state/CURRENT_STATE.md
\`\`\`

---

## State Files

### CURRENT_STATE.md

| Section | Purpose |
|---------|---------|
| Session Status | Agent ID, timestamp, status |
| Progress | Completed steps, current step, remaining |
| Work Queue | Pending tasks, blocked tasks |
| Variables | Key state variables |
| Checkpoints | Saved checkpoints |

### SESSION_CONTEXT.json

Machine-readable state for programmatic access:

\`\`\`json
{
  "session": { "id", "agentId", "status" },
  "state": { "phase", "progress" },
  "variables": { /* key-value pairs */ },
  "schema": { "databaseType", "tablesModified" },
  "decisions": [ { "id", "title", "choice" } ]
}
\`\`\`

---

## Tables in Scope

${tablesList}

---

## Constraints

| Constraint | Value |
|------------|-------|
| Max handoff size | 10KB |
| Checkpoint interval | 5 minutes |
| Decision logging | Required for major choices |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| \`cohere-db handoff --record\` | Record current session |
| \`cohere-db handoff --list\` | List available sessions |
| \`cohere-db handoff --resume <id>\` | Resume from session |
| \`cohere-db handoff --status completed\` | Mark session complete |

---

## Best Practices

1. **Checkpoint frequently** - Save state every 5-10 minutes
2. **Log decisions** - Use decision IDs in handoffs
3. **Document failures** - Include error context in handoff
4. **Atomic handoffs** - Complete handoff before ending session

---

## Example Flow

\`\`\`
Agent A (in progress)
    â†“
cohere-db handoff --record --status paused
    â†“
Agent B receives files
    â†“
cohere-db handoff --resume sess_abc123
    â†“
Agent B continues work
    â†“
cohere-db handoff --record --status completed
\`\`\`
`;
  }

  // ============================================================================
  // Decision Templates Generation
  // ============================================================================

  private generateDecisionTemplates(schema: UnifiedSchemaInfo): Record<string, string> {
    const templates: Record<string, string> = {};

    templates['decision-template.md'] = this.generateDecisionTemplate(schema);
    templates['DECISION_LOG.md'] = this.generateDecisionLog(schema);

    return templates;
  }

  private generateDecisionTemplate(schema: UnifiedSchemaInfo): string {
    return `# Decision: {decisionTitle}

> AUTO-GENERATED by cohere. Decision ID: \`{decisionId}\`

## Metadata

| Field | Value |
|-------|-------|
| **Decision ID** | \`{decisionId}\` |
| **Timestamp** | \`{timestamp}\` |
| **Agent ID** | \`{agentId}\` |
| **Session ID** | \`{sessionId}\` |
| **Status** | \`{status}\` |

---

## Context

### Problem Statement

{problemDescription}

### Constraints

- Constraint 1
- Constraint 2
- Constraint 3

### Requirements

1. Requirement 1
2. Requirement 2

---

## Options Considered

### Option A: {optionATitle}

| Attribute | Value |
|-----------|-------|
| Pros | Pro 1, Pro 2 |
| Cons | Con 1, Con 2 |
| Risk | Low/Medium/High |
| Effort | Small/Medium/Large |

### Option B: {optionBTitle}

| Attribute | Value |
|-----------|-------|
| Pros | Pro 1, Pro 2 |
| Cons | Con 1, Con 2 |
| Risk | Low/Medium/High |
| Effort | Small/Medium/Large |

---

## Decision

> **{chosenOption}** was selected

### Rationale

{choiceRationale}

### Trade-offs

| Factor | Impact |
|--------|--------|
| Factor 1 | {impact1} |
| Factor 2 | {impact2} |

---

## Implementation

### Chosen Approach

{implementationDetails}

### Files Modified

| File | Change |
|------|--------|
| file1.ts | Modification A |
| file2.sql | Modification B |

---

## Outcome

### Expected Results

1. Expected outcome 1
2. Expected outcome 2

### Potential Risks

1. Risk 1 - Mitigation
2. Risk 2 - Mitigation

### Follow-up Required

- [ ] Follow-up item 1
- [ ] Follow-up item 2

---

## Related Decisions

| ID | Decision | Relationship |
|----|----------|--------------|
| DECISION_001 | Related decision | Precedes |
| DECISION_003 | Related decision | Extends |

---

> **USAGE**: Use this format for all significant decisions.
> Decision IDs are referenced in handoffs for context.
`;
  }

  private generateDecisionLog(schema: UnifiedSchemaInfo): string {
    const tablesList = schema.tables.map((t) => `- \`${t.name}\``).join('\n');

    return `# Decision Log

> AUTO-GENERATED by cohere. All decisions made during this session.

## Overview

This log tracks all significant decisions made by agents working on this codebase.

## Decision Index

| ID | Date | Title | Status |
|----|------|-------|--------|
| DECISION_001 | YYYY-MM-DD | Decision title | Active |
| DECISION_002 | YYYY-MM-DD | Decision title | Active |

---

## Active Decisions

### DECISION_001: {decisionTitle}

**Status:** Active
**Date:** {date}
**Agent:** {agentId}

**Summary:** Brief summary of decision

**Impact:** Tables affected: ${tablesList}

---

## Archived Decisions

### DECISION_XXX: {archivedTitle}

**Status:** Archived
**Date:** {date}
**Reason:** Context no longer relevant

---

## Adding New Decisions

Use the template in \`.ai/decisions/decision-template.md\`:

\`\`\`bash
# Create new decision
cp .ai/decisions/decision-template.md .ai/decisions/DECISION_003.md

# Edit the file with your decision
# Update this log
\`\`\`

---

## Decision Categories

| Category | Description |
|----------|-------------|
| schema | Database schema changes |
| query | Query pattern choices |
| architecture | System design decisions |
| workflow | Process/flow decisions |

---

> **NOTE**: Decision IDs are referenced in handoffs.
> Always update this log when creating new decisions.
`;
  }
}
