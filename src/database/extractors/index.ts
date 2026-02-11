/**
 * Extractor Index
 * Central export for all schema extractors and unified types
 */

// Database extractors
import type { SchemaInfo as PostgresSchemaInfo } from './postgres.js';
import type { MySQLSchemaInfo } from './mysql.js';
import type { SQLiteSchemaInfo } from './sqlite.js';

// ORM extractors
import type { PrismaSchemaInfo } from './prisma.js';
import type { DrizzleSchemaInfo } from './drizzle.js';
import type { MongoDBSchemaInfo } from './mongodb.js';
import type { FirebaseSchemaInfo } from './firebase.js';

export type { PostgresSchemaInfo, MySQLSchemaInfo, SQLiteSchemaInfo };
export type { PrismaSchemaInfo, DrizzleSchemaInfo, MongoDBSchemaInfo, FirebaseSchemaInfo };

// Unified Types (matching templates.ts)
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

// Converter Class
export class UnifiedSchemaConverter {
  static convert(schemaInfo: any): UnifiedSchemaInfo {
    switch (schemaInfo.databaseType) {
      case 'postgresql':
        return convertPostgres(schemaInfo);
      case 'mysql':
        return convertMySQL(schemaInfo);
      case 'sqlite':
        return convertSQLite(schemaInfo);
      case 'prisma':
        return convertPrisma(schemaInfo);
      case 'drizzle':
        return convertDrizzle(schemaInfo);
      case 'mongodb':
        return convertMongoDB(schemaInfo);
      case 'firebase':
        return convertFirebase(schemaInfo);
      default:
        throw new Error(`Unsupported database type: ${schemaInfo.databaseType}`);
    }
  }
}

function convertPostgres(schema: PostgresSchemaInfo): UnifiedSchemaInfo {
  const source = schema.schemaName ? `postgresql://${schema.schemaName}` : 'postgresql';
  return {
    tables: schema.tables.map((table) =>
      convertTable(
        table,
        (table.foreignKeys || []).map((fk) => ({
          ...fk,
          onDelete: fk.onDelete || undefined,
          onUpdate: fk.onUpdate || undefined,
        })),
        table.indexes || [],
      ),
    ),
    databaseType: 'postgresql',
    schemaName: schema.schemaName,
    source,
  };
}

function convertMySQL(schema: MySQLSchemaInfo): UnifiedSchemaInfo {
  const source = schema.databaseName ? `mysql://${schema.databaseName}` : 'mysql';
  return {
    tables: schema.tables.map((table) =>
      convertTable(
        table,
        (table.foreignKeys || []).map((fk) => ({
          ...fk,
          onDelete: fk.onDelete || undefined,
          onUpdate: fk.onUpdate || undefined,
        })),
        table.indexes || [],
      ),
    ),
    databaseType: 'mysql',
    schemaName: schema.databaseName,
    source,
  };
}

function convertSQLite(schema: SQLiteSchemaInfo): UnifiedSchemaInfo {
  const source = schema.databasePath || 'sqlite';
  return {
    tables: schema.tables.map((table) => convertSQLiteTable(table)),
    databaseType: 'sqlite',
    source,
  };
}

function convertPrisma(schema: PrismaSchemaInfo): UnifiedSchemaInfo {
  const source = schema.generator?.output || 'prisma';
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
        referencesColumn: col.relationReferences?.[0],
        onDelete: col.onDelete || undefined,
        description: undefined,
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
        cardinality: mapRelationCardinality(rel.type),
        onDelete: rel.onDelete || undefined,
      })),
      primaryKey: table.primaryKey,
    })),
    databaseType: 'prisma',
    schemaName: schema.generator?.output,
    source,
  };
}

function convertDrizzle(schema: DrizzleSchemaInfo): UnifiedSchemaInfo {
  const source = schema.dialect;
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
        referencesColumn: undefined,
        onDelete: col.onDelete || undefined,
        description: undefined,
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
        cardinality: mapRelationCardinality(rel.type),
        onDelete: rel.onDelete || undefined,
      })),
      primaryKey: table.primaryKey,
    })),
    databaseType: 'drizzle',
    schemaName: schema.dialect,
    source,
  };
}

function convertMongoDB(schema: MongoDBSchemaInfo): UnifiedSchemaInfo {
  const source = schema.databaseName ? `mongodb://${schema.databaseName}` : 'mongodb';
  return {
    tables: schema.collections.map((collection) => ({
      name: collection.name,
      description: `MongoDB collection (${collection.documentCount} documents, sampled ${collection.sampleSize})`,
      columns: collection.fields.map((field) => ({
        name: field.name,
        type: field.isArray ? `${field.type}[]` : field.type,
        nullable: field.nullable,
        default: null,
        isPrimaryKey: field.name === '_id',
        isUnique: field.name === '_id',
        isForeignKey: field.type === 'ObjectId' && field.name !== '_id',
        referencesTable: undefined, // MongoDB doesn't have explicit FK constraints
        referencesColumn: undefined,
        description:
          field.sampleValues && field.sampleValues.length > 0
            ? `Sample: ${JSON.stringify(field.sampleValues[0])}`
            : undefined,
      })),
      indexes: collection.indexes.map((idx) => ({
        name: idx.name,
        columns: Object.keys(idx.keys),
        unique: idx.unique,
        isPrimaryKey: idx.name === '_id_',
      })),
      relations: [], // MongoDB doesn't have explicit relationships
      primaryKey: ['_id'],
    })),
    databaseType: 'mongodb',
    schemaName: schema.databaseName,
    source,
  };
}

function convertFirebase(schema: FirebaseSchemaInfo): UnifiedSchemaInfo {
  const source = schema.projectId ? `firebase://${schema.projectId}` : 'firebase';
  return {
    tables: schema.collections.map((collection) => ({
      name: collection.name,
      description: `Firestore collection (${collection.documentCount} documents sampled)`,
      columns: collection.fields.map((field) => ({
        name: field.name,
        type: field.isArray ? `${field.type}[]` : field.type,
        nullable: field.nullable,
        default: null,
        isPrimaryKey: field.name === 'id' || field.name === '_id',
        isUnique: field.name === 'id' || field.name === '_id',
        isForeignKey: field.isReference,
        referencesTable: undefined,
        referencesColumn: undefined,
        description:
          field.sampleValues && field.sampleValues.length > 0
            ? `Sample: ${JSON.stringify(field.sampleValues[0])}`
            : undefined,
      })),
      indexes: [],
      relations: [],
      primaryKey: ['id'],
    })),
    databaseType: 'firebase',
    schemaName: schema.projectId,
    source,
  };
}

function convertTable(
  table: any,
  foreignKeys: {
    column: string;
    referencesTable: string;
    referencesColumn: string;
    onDelete?: string;
    onUpdate?: string;
  }[],
  indexes: { name: string; columns: string[]; unique: boolean; isPrimaryKey?: boolean }[],
): UnifiedTableInfo {
  const primaryKeySet = new Set(table.primaryKey || []);
  const uniqueColumns = new Set<string>();
  indexes.forEach((idx) => {
    if (idx.unique) {
      idx.columns.forEach((column) => uniqueColumns.add(column));
    }
  });

  const fkMap = new Map<string, (typeof foreignKeys)[0]>();
  foreignKeys.forEach((fk) => fkMap.set(fk.column, fk));

  return {
    name: table.name,
    description: table.description || table.comment,
    columns: (table.columns || []).map((col: any) => {
      const fk = fkMap.get(col.name);
      return {
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        default: col.default || col.defaultValue || null,
        isPrimaryKey: primaryKeySet.has(col.name),
        isUnique: uniqueColumns.has(col.name),
        isForeignKey: Boolean(fk),
        referencesTable: fk?.referencesTable,
        referencesColumn: fk?.referencesColumn,
        onDelete: fk?.onDelete,
        onUpdate: fk?.onUpdate,
        description: col.description || col.comment || undefined,
      };
    }),
    indexes: indexes.map((idx) => ({
      name: idx.name,
      columns: idx.columns || [],
      unique: idx.unique,
      isPrimaryKey: Boolean(idx.isPrimaryKey),
    })),
    relations: foreignKeys.map((fk) => ({
      fromTable: table.name,
      fromColumn: fk.column,
      toTable: fk.referencesTable,
      toColumn: fk.referencesColumn,
      cardinality: 'N:1',
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
    })),
    primaryKey: table.primaryKey || [],
  };
}

function convertSQLiteTable(table: any): UnifiedTableInfo {
  const primaryKeySet = new Set(table.primaryKey || []);
  const uniqueColumns = new Set<string>();
  table.indexes?.forEach((idx: any) => {
    if (idx.unique) {
      idx.columns.forEach((column: string) => uniqueColumns.add(column));
    }
  });

  const fkMap = new Map<string, any>();
  table.foreignKeys?.forEach((fk: any) => fkMap.set(fk.from, fk));

  return {
    name: table.name,
    description: undefined,
    columns: (table.columns || []).map((col: any) => {
      const fk = fkMap.get(col.name);
      return {
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        default: col.default || null,
        isPrimaryKey: primaryKeySet.has(col.name),
        isUnique: uniqueColumns.has(col.name),
        isForeignKey: Boolean(fk),
        referencesTable: fk?.table,
        referencesColumn: fk?.to,
        onDelete: fk?.onDelete,
        onUpdate: fk?.onUpdate,
        description: undefined,
      };
    }),
    indexes: (table.indexes || []).map((idx: any) => ({
      name: idx.name,
      columns: idx.columns,
      unique: idx.unique,
      isPrimaryKey: idx.isPrimaryKey,
    })),
    relations: (table.foreignKeys || []).map((fk: any) => ({
      fromTable: table.name,
      fromColumn: fk.from,
      toTable: fk.table,
      toColumn: fk.to,
      cardinality: 'N:1',
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
    })),
    primaryKey: table.primaryKey || [],
  };
}

function mapRelationCardinality(type: string): UnifiedRelationInfo['cardinality'] {
  switch (type) {
    case 'one-to-one':
    case '1:1':
      return '1:1';
    case 'one-to-many':
      return '1:N';
    case 'many-to-one':
      return 'N:1';
    case 'many-to-many':
      return 'N:M';
    default:
      return '1:N';
  }
}

// Extractor Factory
export type ExtractorType =
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'prisma'
  | 'drizzle'
  | 'mongodb'
  | 'firebase';

export interface SchemaExtractor {
  extract(): Promise<any>;
  close(): Promise<void>;
}

export async function createExtractor(
  type: ExtractorType,
  connectionString: string,
  options?: { schemaPath?: string; projectId?: string; serviceAccountPath?: string },
): Promise<SchemaExtractor> {
  switch (type) {
    case 'postgresql':
      const { PostgresExtractor } = await import('./postgres.js');
      return new PostgresExtractor(connectionString);
    case 'mysql':
      const { MySQLExtractor } = await import('./mysql.js');
      return new MySQLExtractor(connectionString);
    case 'sqlite':
      const { SQLiteExtractor } = await import('./sqlite.js');
      return new SQLiteExtractor(connectionString);
    case 'prisma':
      const { PrismaExtractor } = await import('./prisma.js');
      return new PrismaExtractor(options?.schemaPath || 'prisma/schema.prisma');
    case 'drizzle':
      const { DrizzleExtractor } = await import('./drizzle.js');
      return new DrizzleExtractor(options?.schemaPath || 'src/db/schema.ts');
    case 'mongodb':
      const { MongoDBExtractor } = await import('./mongodb.js');
      return new MongoDBExtractor(connectionString);
    case 'firebase':
      const { FirebaseExtractor } = await import('./firebase.js');
      const projectId = options?.projectId || 'unknown';
      const serviceAccountPath = options?.serviceAccountPath;
      return new FirebaseExtractor(projectId, serviceAccountPath);
    default:
      throw new Error(`Unknown extractor type: ${type}`);
  }
}
