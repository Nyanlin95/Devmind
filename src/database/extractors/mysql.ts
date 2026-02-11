/**
 * MySQL Schema Extractor
 * Extracts database schema information from MySQL databases
 */

import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export interface MySQLColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  extra: string;
  comment: string;
}

export interface MySQLIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  isPrimaryKey: boolean;
  indexType: string;
}

export interface MySQLForeignKeyInfo {
  column: string;
  referencesTable: string;
  referencesColumn: string;
  onDelete: string | null;
  onUpdate: string | null;
}

export interface MySQLTableInfo {
  name: string;
  columns: MySQLColumnInfo[];
  indexes: MySQLIndexInfo[];
  foreignKeys: MySQLForeignKeyInfo[];
  primaryKey: string[];
  engine: string;
  comment: string;
  autoIncrement: string | null;
}

export interface MySQLSchemaInfo {
  tables: MySQLTableInfo[];
  databaseType: 'mysql';
  databaseName: string;
}

export class MySQLExtractor {
  private pool: Pool;
  private databaseName: string;

  constructor(connectionString: string) {
    // Parse connection string to extract database name
    const url = new URL(connectionString);
    this.databaseName = url.pathname.slice(1) || 'database';

    this.pool = mysql.createPool({
      host: url.hostname || 'localhost',
      port: parseInt(url.port) || 3306,
      user: url.username || 'root',
      password: url.password || '',
      database: this.databaseName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  async extract(): Promise<MySQLSchemaInfo> {
    const connection = await this.pool.getConnection();
    try {
      const tables = await this.extractTables(connection);
      const tablesWithDetails = await Promise.all(
        tables.map(async (table) => {
          const tableName = table.name || '';
          const columns = await this.extractColumns(connection, tableName);
          const indexes = await this.extractIndexes(connection, tableName);
          const foreignKeys = await this.extractForeignKeys(connection, tableName);
          const primaryKey = indexes.filter((i) => i.isPrimaryKey).flatMap((i) => i.columns);

          return {
            name: tableName,
            comment: table.comment || '',
            engine: table.engine || 'InnoDB',
            autoIncrement: table.autoIncrement || null,
            columns,
            indexes,
            foreignKeys,
            primaryKey,
          };
        }),
      );

      return {
        tables: tablesWithDetails,
        databaseType: 'mysql' as const,
        databaseName: this.databaseName,
      };
    } finally {
      connection.release();
    }
  }

  private async extractTables(connection: PoolConnection): Promise<Partial<MySQLTableInfo>[]> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `
      SELECT 
        TABLE_NAME as table_name,
        TABLE_COMMENT as table_comment,
        ENGINE as engine,
        AUTO_INCREMENT as auto_increment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
      [this.databaseName],
    );

    return rows.map((row) => ({
      name: row.table_name,
      comment: row.table_comment,
      engine: row.engine,
      autoIncrement: row.auto_increment?.toString() || null,
    }));
  }

  private async extractColumns(
    connection: PoolConnection,
    tableName: string,
  ): Promise<MySQLColumnInfo[]> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `
      SELECT 
        COLUMN_NAME as column_name,
        COLUMN_TYPE as column_type,
        IS_NULLABLE as is_nullable,
        COLUMN_DEFAULT as column_default,
        EXTRA as extra,
        COLUMN_COMMENT as column_comment
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
      [this.databaseName, tableName],
    );

    return rows.map((row) => ({
      name: row.column_name,
      type: row.column_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
      extra: row.extra,
      comment: row.column_comment,
    }));
  }

  private async extractIndexes(
    connection: PoolConnection,
    tableName: string,
  ): Promise<MySQLIndexInfo[]> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `
      SELECT 
        INDEX_NAME as index_name,
        NON_UNIQUE as non_unique,
        INDEX_TYPE as index_type,
        GROUP_CONcat(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
    `,
      [this.databaseName, tableName],
    );

    // Also get primary key info
    const [pkRows] = await connection.query<RowDataPacket[]>(
      `
      SELECT 
        INDEX_NAME as index_name
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
    `,
      [this.databaseName, tableName],
    );

    const primaryKeyIndexNames = pkRows.map((row) => row.index_name);

    return rows.map((row) => {
      const indexName = row.index_name;
      const columns = row.columns.split(',');

      return {
        name: indexName,
        columns,
        unique: row.non_unique === 0,
        isPrimaryKey: indexName === 'PRIMARY',
        indexType: row.index_type,
      };
    });
  }

  private async extractForeignKeys(
    connection: PoolConnection,
    tableName: string,
  ): Promise<MySQLForeignKeyInfo[]> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `
      SELECT 
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_NAME as referenced_table_name,
        REFERENCED_COLUMN_NAME as referenced_column_name,
        DELETE_RULE as delete_rule,
        UPDATE_RULE as update_rule
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = ? 
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `,
      [this.databaseName, tableName],
    );

    return rows.map((row) => ({
      column: row.column_name,
      referencesTable: row.referenced_table_name,
      referencesColumn: row.referenced_column_name,
      onDelete: row.delete_rule,
      onUpdate: row.update_rule,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// MySQL-specific type mappings
export const MYSQL_TYPE_MAPPINGS = [
  { dbType: 'varchar', tsType: 'string', maxLength: '(n)' },
  { dbType: 'text', tsType: 'string' },
  { dbType: 'longtext', tsType: 'string' },
  { dbType: 'int', tsType: 'number' },
  { dbType: 'bigint', tsType: 'number' },
  { dbType: 'smallint', tsType: 'number' },
  { dbType: 'tinyint', tsType: 'number' },
  { dbType: 'decimal', tsType: 'number' },
  { dbType: 'float', tsType: 'number' },
  { dbType: 'double', tsType: 'number' },
  { dbType: 'boolean', tsType: 'boolean' },
  { dbType: 'tinyint(1)', tsType: 'boolean' },
  { dbType: 'date', tsType: 'Date' },
  { dbType: 'datetime', tsType: 'Date' },
  { dbType: 'timestamp', tsType: 'Date' },
  { dbType: 'json', tsType: 'Record<string, unknown>' },
  { dbType: 'enum', tsType: 'string' },
  { dbType: 'set', tsType: 'string[]' },
  { dbType: 'blob', tsType: 'Buffer' },
];
