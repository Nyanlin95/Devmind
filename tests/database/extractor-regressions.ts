import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UnifiedSchemaConverter } from '../dist/extractors/index.js';
import { PrismaExtractor } from '../dist/extractors/prisma.js';
import type { PostgresSchemaInfo } from '../../src/database/extractors/postgres.ts';
import type { MySQLSchemaInfo } from '../../src/database/extractors/mysql.ts';
import type { SQLiteSchemaInfo } from '../../src/database/extractors/sqlite.ts';

function ensure(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testPostgresFixture(): void {
  const sample: PostgresSchemaInfo = {
    databaseType: 'postgresql',
    schemaName: 'public',
    tables: [
      {
        name: 'users',
        description: 'Application users',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, default: null, description: 'PK' },
          {
            name: 'organization_id',
            type: 'uuid',
            nullable: false,
            default: null,
            description: 'FK',
          },
        ],
        indexes: [
          { name: 'users_pkey', columns: ['id'], unique: true, isPrimaryKey: true },
          {
            name: 'users_org_idx',
            columns: ['organization_id'],
            unique: false,
            isPrimaryKey: false,
          },
        ],
        foreignKeys: [
          {
            column: 'organization_id',
            referencesTable: 'organizations',
            referencesColumn: 'id',
            onDelete: 'CASCADE',
          },
        ],
        primaryKey: ['id'],
      },
    ],
  };

  const unified = UnifiedSchemaConverter.convert(sample);
  const table = unified.tables.find((t) => t.name === 'users');
  ensure(Boolean(table), 'users table missing');
  const idColumn = table!.columns.find((c) => c.name === 'id');
  const orgColumn = table!.columns.find((c) => c.name === 'organization_id');
  ensure(idColumn?.isPrimaryKey, 'id column not flagged as primary key');
  ensure(orgColumn?.isForeignKey, 'organization_id not flagged as foreign key');
  ensure(table!.relations.length === 1, 'expected one foreign-key relation');
  ensure(table!.primaryKey.includes('id'), 'primary key metadata lost');
  ensure(
    unified.tables[0].indexes.some((idx) => idx.name === 'users_org_idx'),
    'index metadata dropped for users_org_idx',
  );
}

function testMySQLFixture(): void {
  const sample: MySQLSchemaInfo = {
    databaseType: 'mysql',
    databaseName: 'app',
    tables: [
      {
        name: 'accounts',
        columns: [
          {
            name: 'id',
            type: 'varchar(36)',
            nullable: false,
            default: null,
            extra: '',
            comment: 'PK',
          },
          {
            name: 'email',
            type: 'varchar(255)',
            nullable: false,
            default: null,
            extra: '',
            comment: '',
          },
        ],
        indexes: [
          {
            name: 'accounts_pkey',
            columns: ['id'],
            unique: true,
            isPrimaryKey: true,
            indexType: 'BTREE',
          },
          {
            name: 'accounts_email_uniq',
            columns: ['email'],
            unique: true,
            isPrimaryKey: false,
            indexType: 'BTREE',
          },
        ],
        foreignKeys: [],
        primaryKey: ['id'],
        engine: 'InnoDB',
        comment: 'Accounts',
        autoIncrement: '100',
      },
    ],
  };

  const unified = UnifiedSchemaConverter.convert(sample);
  const table = unified.tables[0];
  const emailColumn = table.columns.find((c) => c.name === 'email');
  ensure(emailColumn?.isUnique, 'email unique index not preserved');
  ensure(
    table.columns.some((c) => c.isPrimaryKey),
    'missing primary key column after conversion',
  );
}

function testSQLiteFixture(): void {
  const sample: SQLiteSchemaInfo = {
    databaseType: 'sqlite',
    databasePath: ':memory:',
    tables: [
      {
        name: 'items',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false, default: null, primaryKey: true },
          { name: 'user_id', type: 'INTEGER', nullable: false, default: null, primaryKey: false },
        ],
        indexes: [
          {
            name: 'idx_items_user_id',
            table: 'items',
            columns: ['user_id'],
            unique: false,
            isPrimaryKey: false,
            isAutoIncrement: false,
          },
        ],
        foreignKeys: [
          {
            id: 1,
            seq: 0,
            table: 'users',
            from: 'user_id',
            to: 'id',
            onUpdate: 'NO ACTION',
            onDelete: 'CASCADE',
            match: 'NONE',
          },
        ],
        primaryKey: ['id'],
        withoutRowId: false,
      },
    ],
  };

  const unified = UnifiedSchemaConverter.convert(sample);
  const column = unified.tables[0].columns.find((c) => c.name === 'user_id');
  ensure(column?.isForeignKey, 'SQLite foreign key missing');
}

async function testPrismaExtractor(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(__dirname, 'fixtures', 'prisma', 'simple.prisma');
  const extractor = new PrismaExtractor(fixturePath);
  const schema = await extractor.extract();
  const user = schema.tables.find((table) => table.name === 'User');
  ensure(Boolean(user), 'User table missing in Prisma fixture');
  const profile = user!.columns.find((column) => column.name === 'profile');
  const posts = user!.columns.find((column) => column.name === 'posts');
  ensure(profile?.isRelation, 'profile relation not recognized');
  ensure(profile?.isOptional, 'profile column should be optional');
  ensure(posts?.isList, 'posts list relation missing');
  const relation = user!.relations.find((rel) => rel.toTable === 'Profile');
  ensure(relation?.onDelete === 'CASCADE', 'relation onDelete not captured');
}

async function main(): Promise<void> {
  testPostgresFixture();
  testMySQLFixture();
  testSQLiteFixture();
  await testPrismaExtractor();
  console.log('✅ extractor regression fixtures passed');
}

main().catch((error) => {
  console.error('Extractor regression failure:', error);
  process.exit(1);
});
