/**
 * PostgreSQL Schema Extractor
 * Extracts database schema information from PostgreSQL databases
 */

import { Pool, PoolClient } from 'pg';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  description: string | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  isPrimaryKey: boolean;
}

export interface ForeignKeyInfo {
  column: string;
  referencesTable: string;
  referencesColumn: string;
  onDelete: string | null;
  onUpdate: string | null;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  primaryKey: string[];
  description: string | null;
}

export interface SchemaInfo {
  tables: TableInfo[];
  databaseType: 'postgresql';
  schemaName: string;
}

export class PostgresExtractor {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  async extract(schemaName: string = 'public'): Promise<SchemaInfo> {
    const client = await this.pool.connect();
    try {
      const tables = await this.extractTables(client, schemaName);
      const tablesWithDetails = await Promise.all(
        tables.map(async (table) => {
          const tableName = table.name || '';
          const columns = await this.extractColumns(client, schemaName, tableName);
          const indexes = await this.extractIndexes(client, schemaName, tableName);
          const foreignKeys = await this.extractForeignKeys(client, schemaName, tableName);
          const primaryKey = indexes.filter((i) => i.isPrimaryKey).flatMap((i) => i.columns);

          return {
            name: tableName,
            description: table.description || null,
            columns,
            indexes,
            foreignKeys,
            primaryKey,
          };
        }),
      );

      return {
        tables: tablesWithDetails as TableInfo[],
        databaseType: 'postgresql' as const,
        schemaName,
      };
    } finally {
      client.release();
    }
  }

  private async extractTables(
    client: PoolClient,
    schemaName: string,
  ): Promise<Partial<TableInfo>[]> {
    const query = `
      SELECT t.table_name, obj_description(c.oid, 'pg_class') as description
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `;
    const result = await client.query(query, [schemaName]);
    return result.rows.map((row) => ({
      name: row.table_name,
      description: row.description,
    }));
  }

  private async extractColumns(
    client: PoolClient,
    schemaName: string,
    tableName: string,
  ): Promise<ColumnInfo[]> {
    const query = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable = 'YES' as is_nullable,
        c.column_default,
        pg_catalog.col_description(
          (SELECT c.oid FROM pg_class WHERE relname = $2)::regclass::oid,
          c.ordinal_position
        ) as description
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;
    const result = await client.query(query, [schemaName, tableName]);
    return result.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
      default: row.column_default,
      description: row.description,
    }));
  }

  private async extractIndexes(
    client: PoolClient,
    schemaName: string,
    tableName: string,
  ): Promise<IndexInfo[]> {
    const query = `
      SELECT 
        i.relname as index_name,
        array_agg(a.attname ORDER BY ix.indkey::integer[]) as columns,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary_key
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey::integer[])
      WHERE t.relname = $1 AND n.nspname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary
    `;
    const result = await client.query(query, [tableName, schemaName]);
    return result.rows.map((row) => ({
      name: row.index_name,
      columns: row.columns.filter(Boolean),
      unique: row.is_unique,
      isPrimaryKey: row.is_primary_key,
    }));
  }

  private async extractForeignKeys(
    client: PoolClient,
    schemaName: string,
    tableName: string,
  ): Promise<ForeignKeyInfo[]> {
    const query = `
      SELECT 
        kcu.column_name,
        ccu.table_name AS references_table,
        ccu.column_name AS references_column,
        rc.delete_rule AS on_delete,
        rc.update_rule AS on_update
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
    `;
    const result = await client.query(query, [schemaName, tableName]);
    return result.rows.map((row) => ({
      column: row.column_name,
      referencesTable: row.references_table,
      referencesColumn: row.references_column,
      onDelete: row.on_delete,
      onUpdate: row.on_update,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
