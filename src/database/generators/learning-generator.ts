/**
 * Learning Generator
 * Converts schema analysis into accumulated learnings
 */

import { UnifiedSchemaInfo, UnifiedTableInfo, UnifiedColumnInfo } from '../extractors/index.js';

export interface DetectedPattern {
  type: 'multi-tenancy' | 'soft-delete' | 'audit-trail' | 'polymorphic' | 'enum-usage';
  confidence: number;
  description: string;
  tables: string[];
  recommendation: string;
  example?: string;
}

export class LearningGenerator {
  /**
   * Analyze schema and generate learnings
   */
  generateLearnings(schema: UnifiedSchemaInfo): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Detect multi-tenancy
    const multiTenancy = this.detectMultiTenancy(schema);
    if (multiTenancy) patterns.push(multiTenancy);

    // Detect soft delete
    const softDelete = this.detectSoftDelete(schema);
    if (softDelete) patterns.push(softDelete);

    // Detect audit trail
    const auditTrail = this.detectAuditTrail(schema);
    if (auditTrail) patterns.push(auditTrail);

    // Detect polymorphic associations
    const polymorphic = this.detectPolymorphic(schema);
    if (polymorphic) patterns.push(polymorphic);

    // Detect enum usage
    const enums = this.detectEnumUsage(schema);
    patterns.push(...enums);

    return patterns;
  }

  /**
   * Detect multi-tenancy pattern (organization_id, tenant_id, etc.)
   */
  private detectMultiTenancy(schema: UnifiedSchemaInfo): DetectedPattern | null {
    const tenantColumns = ['organization_id', 'tenant_id', 'account_id', 'workspace_id'];
    const tablesWithTenant: string[] = [];

    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (tenantColumns.includes(column.name.toLowerCase())) {
          tablesWithTenant.push(table.name);
          break;
        }
      }
    }

    if (tablesWithTenant.length >= 3) {
      const tenantColumn = this.getMostCommonColumn(schema.tables, tenantColumns);
      return {
        type: 'multi-tenancy',
        confidence: tablesWithTenant.length / schema.tables.length,
        description: `Multi-tenancy pattern detected: ${tablesWithTenant.length} tables have ${tenantColumn}`,
        tables: tablesWithTenant,
        recommendation: `ALWAYS include \`${tenantColumn}\` in WHERE clauses for data isolation`,
        example: `SELECT * FROM users WHERE ${tenantColumn} = ? AND id = ?`,
      };
    }

    return null;
  }

  /**
   * Detect soft delete pattern (deleted_at, is_deleted)
   */
  private detectSoftDelete(schema: UnifiedSchemaInfo): DetectedPattern | null {
    const softDeleteColumns = ['deleted_at', 'is_deleted', 'deleted'];
    const tablesWithSoftDelete: string[] = [];

    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (softDeleteColumns.includes(column.name.toLowerCase())) {
          tablesWithSoftDelete.push(table.name);
          break;
        }
      }
    }

    if (tablesWithSoftDelete.length >= 2) {
      const deleteColumn = this.getMostCommonColumn(schema.tables, softDeleteColumns);
      const isTimestamp = deleteColumn.includes('_at');

      return {
        type: 'soft-delete',
        confidence: tablesWithSoftDelete.length / schema.tables.length,
        description: `Soft delete pattern: ${tablesWithSoftDelete.length} tables use ${deleteColumn}`,
        tables: tablesWithSoftDelete,
        recommendation: `Filter out soft-deleted records by default`,
        example: isTimestamp
          ? `SELECT * FROM users WHERE ${deleteColumn} IS NULL`
          : `SELECT * FROM users WHERE ${deleteColumn} = false`,
      };
    }

    return null;
  }

  /**
   * Detect audit trail pattern (created_at, updated_at)
   */
  private detectAuditTrail(schema: UnifiedSchemaInfo): DetectedPattern | null {
    const auditColumns = ['created_at', 'updated_at', 'modified_at'];
    let tablesWithAudit = 0;

    for (const table of schema.tables) {
      const hasCreated = table.columns.some((c) => c.name.toLowerCase() === 'created_at');
      const hasUpdated = table.columns.some(
        (c) => c.name.toLowerCase() === 'updated_at' || c.name.toLowerCase() === 'modified_at',
      );

      if (hasCreated && hasUpdated) {
        tablesWithAudit++;
      }
    }

    if (tablesWithAudit >= schema.tables.length * 0.5) {
      return {
        type: 'audit-trail',
        confidence: tablesWithAudit / schema.tables.length,
        description: `Audit trail: ${tablesWithAudit} tables track created_at and updated_at`,
        tables: [],
        recommendation: 'Use timestamp columns for debugging, rollback, and audit purposes',
        example: "SELECT * FROM users WHERE updated_at > NOW() - INTERVAL '1 day'",
      };
    }

    return null;
  }

  /**
   * Detect polymorphic associations (resource_type + resource_id)
   */
  private detectPolymorphic(schema: UnifiedSchemaInfo): DetectedPattern | null {
    const polymorphicTables: string[] = [];

    for (const table of schema.tables) {
      const hasTypeColumn = table.columns.some(
        (c) => c.name.toLowerCase().includes('_type') || c.name.toLowerCase() === 'type',
      );
      const hasIdColumn = table.columns.some(
        (c) => c.name.toLowerCase().includes('_id') && !c.name.toLowerCase().includes('user_id'),
      );

      if (hasTypeColumn && hasIdColumn) {
        polymorphicTables.push(table.name);
      }
    }

    if (polymorphicTables.length > 0) {
      return {
        type: 'polymorphic',
        confidence: 0.8,
        description: `Polymorphic associations detected in: ${polymorphicTables.join(', ')}`,
        tables: polymorphicTables,
        recommendation: 'Use type + id pattern for flexible associations',
        example: "SELECT * FROM comments WHERE resource_type = 'Post' AND resource_id = ?",
      };
    }

    return null;
  }

  /**
   * Detect enum column usage
   */
  private detectEnumUsage(schema: UnifiedSchemaInfo): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    for (const table of schema.tables) {
      for (const column of table.columns) {
        // Check if column type suggests enum
        if (
          column.type.toLowerCase().includes('enum') ||
          column.name.toLowerCase().includes('status') ||
          column.name.toLowerCase().includes('role') ||
          column.name.toLowerCase().includes('type')
        ) {
          patterns.push({
            type: 'enum-usage',
            confidence: 0.9,
            description: `${table.name}.${column.name} appears to be an enum/status field`,
            tables: [table.name],
            recommendation: `Use specific values, avoid SELECT * to reduce overhead`,
            example: `SELECT id, ${column.name} FROM ${table.name} WHERE ${column.name} = 'active'`,
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Helper: Find most common column name
   */
  private getMostCommonColumn(tables: UnifiedTableInfo[], candidates: string[]): string {
    const counts: Record<string, number> = {};

    for (const table of tables) {
      for (const column of table.columns) {
        const name = column.name.toLowerCase();
        if (candidates.includes(name)) {
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    }

    let maxCount = 0;
    let mostCommon = candidates[0];

    for (const [name, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = name;
      }
    }

    return mostCommon;
  }

  /**
   * Format learnings as markdown
   */
  formatLearnings(patterns: DetectedPattern[]): string {
    let markdown = '# Business Logic Learnings\n\n';
    markdown += `> Auto-generated from schema analysis on ${new Date().toISOString()}\n\n`;

    for (const pattern of patterns) {
      markdown += `## ${this.patternTitle(pattern.type)}\n\n`;
      markdown += `**Confidence:** ${(pattern.confidence * 100).toFixed(0)}%\n\n`;
      markdown += `**Description:** ${pattern.description}\n\n`;

      if (pattern.tables.length > 0 && pattern.tables.length <= 10) {
        markdown += `**Affected Tables:** ${pattern.tables.join(', ')}\n\n`;
      } else if (pattern.tables.length > 10) {
        markdown += `**Affected Tables:** ${pattern.tables.length} tables\n\n`;
      }

      markdown += `**Recommendation:** ${pattern.recommendation}\n\n`;

      if (pattern.example) {
        markdown += `**Example:**\n\`\`\`sql\n${pattern.example}\n\`\`\`\n\n`;
      }

      markdown += '---\n\n';
    }

    return markdown;
  }

  private patternTitle(type: string): string {
    const titles: Record<string, string> = {
      'multi-tenancy': 'Multi-Tenancy Pattern',
      'soft-delete': 'Soft Delete Pattern',
      'audit-trail': 'Audit Trail Pattern',
      polymorphic: 'Polymorphic Associations',
      'enum-usage': 'Enum/Status Field',
    };

    return titles[type] || type;
  }
}
