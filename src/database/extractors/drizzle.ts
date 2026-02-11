/**
 * Drizzle Schema Parser
 * Extracts schema information from Drizzle schema.ts files
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DrizzleColumnInfo {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  isUnique: boolean;
  isPrimaryKey: boolean;
  isDefault: boolean;
  defaultValue: string | null;
  isRelation: boolean;
  relationName: string | null;
  onDelete: string | null;
}

export interface DrizzleIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface DrizzleRelationInfo {
  name: string;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  onDelete: string | null;
}

export interface DrizzleTableInfo {
  name: string;
  description: string | null;
  schema: string | null;
  columns: DrizzleColumnInfo[];
  indexes: DrizzleIndexInfo[];
  relations: DrizzleRelationInfo[];
  primaryKey: string[];
  uniqueConstraints: string[][];
}

export interface DrizzleSchemaInfo {
  tables: DrizzleTableInfo[];
  dialect: 'postgresql' | 'mysql' | 'sqlite';
}

export class DrizzleExtractor {
  private schemaPath: string;
  private schemaContent: string;

  constructor(schemaPath: string) {
    this.schemaPath = schemaPath;
    this.schemaContent = '';
  }

  async extract(): Promise<DrizzleSchemaInfo> {
    if (!fs.existsSync(this.schemaPath)) {
      throw new Error(`Drizzle schema not found at: ${this.schemaPath}`);
    }

    this.schemaContent = fs.readFileSync(this.schemaPath, 'utf-8');

    const dialect = this.detectDialect();
    const tables = this.parseTables();
    this.parseRelations(tables);

    return {
      tables,
      dialect,
    };
  }

  private detectDialect(): 'postgresql' | 'mysql' | 'sqlite' {
    if (this.schemaContent.includes('pgTable') || this.schemaContent.includes('pgEnum')) {
      return 'postgresql';
    }
    if (this.schemaContent.includes('mysqlTable') || this.schemaContent.includes('mysqlEnum')) {
      return 'mysql';
    }
    if (this.schemaContent.includes('sqliteTable')) {
      return 'sqlite';
    }
    return 'postgresql'; // Default
  }

  private parseTables(): DrizzleTableInfo[] {
    const tables: DrizzleTableInfo[] = [];

    // Match table definitions with schema name
    const tableRegex =
      /(?:export\s+)?(?:const|export)\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]+)\}\s*(?:,\s*(\w+))?\s*\)/g;

    let match;
    while ((match = tableRegex.exec(this.schemaContent)) !== null) {
      const tableName = match[1];
      const tableSqlName = match[2];
      const columnsBody = match[3];
      const relationsExport = match[4];

      const table = this.parseTableDefinition(tableName, tableSqlName, columnsBody);
      tables.push(table);
    }

    return tables;
  }

  private parseTableDefinition(
    name: string,
    sqlName: string,
    columnsBody: string,
  ): DrizzleTableInfo {
    const columns: DrizzleColumnInfo[] = [];
    const indexes: DrizzleIndexInfo[] = [];
    let primaryKey: string[] = [];
    const uniqueConstraints: string[][] = [];

    // Split by comma, but handle nested objects
    const lines = this.splitByComma(columnsBody);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse column definition
      const colMatch = trimmed.match(/^(\w+):\s*(.+)$/s);
      if (colMatch) {
        const [_, colName, colDef] = colMatch;
        const column = this.parseColumn(colName, colDef);
        columns.push(column);

        if (column.isPrimaryKey) {
          primaryKey.push(colName);
        }
      }
    }

    return {
      name,
      description: null,
      schema: sqlName,
      columns,
      indexes,
      relations: [],
      primaryKey,
      uniqueConstraints,
    };
  }

  private splitByComma(str: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '{' || char === '[') depth++;
      if (char === '}' || char === ']') depth--;
      if (char === ',' && depth === 0) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      result.push(current);
    }

    return result;
  }

  private parseColumn(name: string, def: string): DrizzleColumnInfo {
    let type = '';
    let isOptional = false;
    let isUnique = false;
    let isPrimaryKey = false;
    let isDefault = false;
    let defaultValue: string | null = null;
    let isRelation = false;
    let relationName: string | null = null;
    let onDelete: string | null = null;

    // Extract type and options
    const typeMatch = def.match(/^([\w.]+)/);
    if (typeMatch) {
      type = typeMatch[1];
    }

    const optionsStr = def.substring(type.length);

    // Parse options
    const optionalMatch = optionsStr.match(/\.optional\(\)/);
    if (optionalMatch) {
      isOptional = true;
    }

    const primaryKeyMatch = optionsStr.match(/\.primaryKey\(\)/);
    if (primaryKeyMatch) {
      isPrimaryKey = true;
    }

    const uniqueMatch = optionsStr.match(/\.unique\(\)/);
    if (uniqueMatch) {
      isUnique = true;
    }

    const defaultMatch = optionsStr.match(/\.default\(([^)]+)\)/);
    if (defaultMatch) {
      isDefault = true;
      defaultValue = defaultMatch[1].trim();
    }

    // Check for references
    const referencesMatch = optionsStr.match(/\.references?\s*\(\s*\(\)\s*=>\s*(\w+)\.(\w+)\)/);
    if (referencesMatch) {
      isRelation = true;
      relationName = referencesMatch[1];
    }

    // Check for onDelete
    const onDeleteMatch = optionsStr.match(/onDelete:\s*['"]?(\w+)['"]?/);
    if (onDeleteMatch) {
      onDelete = onDeleteMatch[1].toUpperCase();
    }

    // Check for serial/autoIncrement
    if (optionsStr.includes('.serial()') || optionsStr.includes('.autoincrement()')) {
      type = type === 'integer' ? 'serial' : type;
    }

    // Normalize type names
    if (optionsStr.includes('.text()')) type = 'text';
    if (optionsStr.includes('.varchar()')) type = 'varchar';
    if (optionsStr.includes('.integer()')) type = 'integer';
    if (optionsStr.includes('.boolean()')) type = 'boolean';
    if (optionsStr.includes('.timestamp()')) type = 'timestamp';
    if (optionsStr.includes('.json()')) type = 'json';
    if (optionsStr.includes('.uuid()')) type = 'uuid';

    return {
      name,
      type,
      isList: false,
      isOptional,
      isUnique,
      isPrimaryKey,
      isDefault,
      defaultValue,
      isRelation,
      relationName,
      onDelete,
    };
  }

  private parseRelations(tables: DrizzleTableInfo[]): void {
    const tableMap = new Map(tables.map((t) => [t.name, t]));

    // Parse relation definitions
    const relationsRegex =
      /export\s+const\s+(\w+)\s*=\s*relations?\s*\(\s*(\w+)\s*,\s*\(\{\s*([\s\S]*?)\}\s*\)\s*=>\s*\{([^}]*)\}\s*\)/g;

    let match;
    while ((match = relationsRegex.exec(this.schemaContent)) !== null) {
      const relationName = match[1];
      const tableName = match[2];
      const fieldsSection = match[3];
      const refsSection = match[4];

      const table = tableMap.get(tableName);
      if (!table) continue;

      // Parse many-to-many relations
      const manyToManyMatch = refsSection.match(/many\s*:\s*\[([^\]]+)\]/);
      if (manyToManyMatch) {
        const relatedTables = manyToManyMatch[1].split(',').map((s) => s.trim());
        for (const relatedName of relatedTables) {
          const relation: DrizzleRelationInfo = {
            name: relationName,
            fromTable: tableName,
            fromColumns: [],
            toTable: relatedName,
            toColumns: [],
            type: 'many-to-many',
            onDelete: null,
          };
          table.relations.push(relation);
        }
      }

      // Parse one-to-many
      const oneToManyMatch = refsSection.match(/one\s*:\s*\[([^\]]+)\]/);
      if (oneToManyMatch) {
        const relatedTables = oneToManyMatch[1].split(',').map((s) => s.trim());
        for (const relatedName of relatedTables) {
          const relation: DrizzleRelationInfo = {
            name: relationName,
            fromTable: tableName,
            fromColumns: [],
            toTable: relatedName,
            toColumns: [],
            type: 'one-to-many',
            onDelete: null,
          };
          table.relations.push(relation);
        }
      }
    }
  }

  async close(): Promise<void> {}
}

// Drizzle to TypeScript type mappings
export const DRIZZLE_TYPE_MAPPINGS = [
  { drizzleType: 'text', tsType: 'string' },
  { drizzleType: 'varchar', tsType: 'string' },
  { drizzleType: 'integer', tsType: 'number' },
  { drizzleType: 'serial', tsType: 'number' },
  { drizzleType: 'bigint', tsType: 'bigint' },
  { drizzleType: 'boolean', tsType: 'boolean' },
  { drizzleType: 'timestamp', tsType: 'Date' },
  { drizzleType: 'date', tsType: 'Date' },
  { drizzleType: 'json', tsType: 'Record<string, unknown>' },
  { drizzleType: 'uuid', tsType: 'string' },
];
