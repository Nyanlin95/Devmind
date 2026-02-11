/**
 * Prisma Schema Parser
 * Extracts schema information from Prisma schema.prisma files
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PrismaColumnInfo {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  isUnique: boolean;
  isId: boolean;
  isDefault: boolean;
  defaultValue: string | null;
  isRelation: boolean;
  relationName: string | null;
  relationFields: string[];
  relationReferences: string[];
  onDelete: string | null;
}

export interface PrismaIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface PrismaRelationInfo {
  name: string;
  fromTable: string;
  fromFields: string[];
  toTable: string;
  toFields: string[];
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  onDelete: string | null;
}

export interface PrismaTableInfo {
  name: string;
  description: string | null;
  columns: PrismaColumnInfo[];
  indexes: PrismaIndexInfo[];
  relations: PrismaRelationInfo[];
  primaryKey: string[];
  uniqueConstraints: string[][];
}

export interface PrismaSchemaInfo {
  tables: PrismaTableInfo[];
  datasource: {
    provider: string;
    url: string;
  };
  generator: {
    provider: string;
    output: string;
  };
}

export class PrismaExtractor {
  private schemaPath: string;
  private schemaContent: string;

  constructor(schemaPath: string) {
    this.schemaPath = schemaPath;
    this.schemaContent = '';
  }

  async extract(): Promise<PrismaSchemaInfo> {
    if (!fs.existsSync(this.schemaPath)) {
      throw new Error(`Prisma schema not found at: ${this.schemaPath}`);
    }

    this.schemaContent = fs.readFileSync(this.schemaPath, 'utf-8');

    const datasource = this.parseDatasource();
    const generator = this.parseGenerator();
    const tables = this.parseModels();

    return {
      tables,
      datasource,
      generator,
    };
  }

  private parseDatasource(): { provider: string; url: string } {
    const datasourceMatch = this.schemaContent.match(
      /datasource\s+db\s*\{[^}]*url\s*=\s*env\(["']?([^"']+)["']?\)/s,
    );
    const providerMatch = this.schemaContent.match(
      /datasource\s+db\s*\{[^}]*provider\s*=\s*["']?([^"'\n]+)["']?/s,
    );

    return {
      url: datasourceMatch ? process.env[datasourceMatch[1]] || datasourceMatch[1] : '',
      provider: providerMatch ? providerMatch[1].trim() : 'postgresql',
    };
  }

  private parseGenerator(): { provider: string; output: string } {
    const providerMatch = this.schemaContent.match(
      /generator\s+client\s*\{[^}]*provider\s*=\s*["']?([^"'\n]+)["']?/s,
    );
    const outputMatch = this.schemaContent.match(
      /generator\s+client\s*\{[^}]*output\s*=\s*["']?([^"'\n]+)["']?/s,
    );

    return {
      provider: providerMatch ? providerMatch[1].trim() : 'prisma-client-js',
      output: outputMatch ? outputMatch[1].trim() : './node_modules/.prisma/client',
    };
  }

  private parseModels(): PrismaTableInfo[] {
    const models: PrismaTableInfo[] = [];
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;

    let match;
    while ((match = modelRegex.exec(this.schemaContent)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];

      const table = this.parseModel(modelName, modelBody);
      models.push(table);
    }

    // Parse relations after all models are extracted
    this.parseRelations(models);

    return models;
  }

  private parseModel(name: string, body: string): PrismaTableInfo {
    const lines = body.split('\n').filter((l) => l.trim());

    const columns: PrismaColumnInfo[] = [];
    const indexes: PrismaIndexInfo[] = [];
    let primaryKey: string[] = [];
    let uniqueConstraints: string[][] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('//')) continue;

      // Parse @@id (composite primary key)
      const idMatch = trimmed.match(/@@id\s*\(\s*\[([^\]]+)\]\s*\)/);
      if (idMatch) {
        primaryKey = idMatch[1].split(',').map((s) => s.trim());
        continue;
      }

      // Parse @@unique
      const uniqueMatch = trimmed.match(/@@unique\s*\(\s*\[([^\]]+)\]\s*\)/);
      if (uniqueMatch) {
        uniqueConstraints.push(uniqueMatch[1].split(',').map((s) => s.trim()));
        continue;
      }

      // Parse @@index
      const indexMatch = trimmed.match(/@@index\s*\(\s*\[([^\]]+)\]\s*\)/);
      if (indexMatch) {
        indexes.push({
          name: `idx_${name}_${indexMatch[1].split(',')[0].trim()}`,
          columns: indexMatch[1].split(',').map((s) => s.trim()),
          unique: false,
        });
        continue;
      }

      // Parse field
      const fieldMatch = trimmed.match(/^(\w+)\s+(.+)$/);
      if (fieldMatch) {
        const [_, fieldName, fieldDef] = fieldMatch;
        const column = this.parseField(fieldName, fieldDef);
        columns.push(column);

        if (column.isId && !column.isRelation) {
          primaryKey = [fieldName];
        }
      }
    }

    return {
      name,
      description: null,
      columns,
      indexes,
      relations: [],
      primaryKey,
      uniqueConstraints,
    };
  }

  private parseField(name: string, def: string): PrismaColumnInfo {
    const trimmed = def.trim();
    const typeMatch = trimmed.match(/^([^\s\[\?]+)(\[\])?(\?)?/);
    let type = typeMatch?.[1] || '';
    const isList = Boolean(typeMatch?.[2]);
    const isOptional = Boolean(typeMatch?.[3]);
    const remainder = trimmed.slice(typeMatch?.[0]?.length || 0).trim();

    let isUnique = false;
    let isId = false;
    let isDefault = false;
    let defaultValue: string | null = null;
    let isRelation = false;
    let relationName: string | null = null;
    const relationFields: string[] = [];
    const relationReferences: string[] = [];
    let onDelete: string | null = null;

    const builtInTypes = [
      'String',
      'Int',
      'Float',
      'Boolean',
      'DateTime',
      'Json',
      'Bytes',
      'BigInt',
      'Decimal',
    ];

    const attrRegex = /@(\w+)(\(([^)]*)\))?/g;
    let match;
    while ((match = attrRegex.exec(remainder)) !== null) {
      const [, attr, , body] = match;
      switch (attr) {
        case 'id':
          isId = true;
          break;
        case 'unique':
          isUnique = true;
          break;
        case 'default':
          isDefault = true;
          defaultValue = body?.trim() || null;
          break;
        case 'relation':
          isRelation = true;
          if (body) {
            const nameMatch = body.match(/name:\s*["']([^"']+)["']/);
            if (nameMatch) {
              relationName = nameMatch[1];
            }
            const fieldsMatch = body.match(/fields:\s*\[([^\]]+)\]/);
            if (fieldsMatch) {
              relationFields.push(...this.parsePrismaList(fieldsMatch[1]));
            }
            const referencesMatch = body.match(/references:\s*\[([^\]]+)\]/);
            if (referencesMatch) {
              relationReferences.push(...this.parsePrismaList(referencesMatch[1]));
            }
            const onDeleteMatch = body.match(/onDelete:\s*([A-Za-z_]+)/);
            if (onDeleteMatch) {
              onDelete = onDeleteMatch[1].toUpperCase();
            }
          }
          break;
      }
    }

    const isBuiltIn = builtInTypes.includes(type);
    if (!isBuiltIn) {
      isRelation = true;
    }

    return {
      name,
      type,
      isList,
      isOptional,
      isUnique,
      isId,
      isDefault,
      defaultValue,
      isRelation,
      relationName,
      relationFields,
      relationReferences,
      onDelete,
    };
  }

  private parseRelations(models: PrismaTableInfo[]): void {
    const modelMap = new Map(models.map((m) => [m.name, m]));

    // Find all relation fields and update them
    for (const model of models) {
      for (const column of model.columns) {
        if (column.isRelation && !column.relationName) {
          // Try to find the related model
          const relatedModel = modelMap.get(column.type);
          if (relatedModel) {
            // Find corresponding relation field in related model
            for (const relatedCol of relatedModel.columns) {
              if (relatedCol.isRelation && relatedCol.type === model.name) {
                // This is a bidirectional relation
                column.relationFields = [column.name];
                column.relationReferences = [relatedCol.name];
                break;
              }
            }
          }
        }
      }
    }

    // Build relation info
    for (const model of models) {
      for (const column of model.columns) {
        if (column.isRelation) {
          const relatedModel = modelMap.get(column.type);
          if (relatedModel) {
            const relation: PrismaRelationInfo = {
              name: column.relationName || `${model.name}_${column.name}`,
              fromTable: model.name,
              fromFields: [column.name],
              toTable: relatedModel.name,
              toFields: relatedModel.primaryKey,
              type: column.isList ? 'one-to-many' : 'one-to-one',
              onDelete: column.onDelete,
            };

            // Check for many-to-many (both sides have list relations)
            for (const relatedCol of relatedModel.columns) {
              if (relatedCol.isRelation && relatedCol.type === model.name && relatedCol.isList) {
                relation.type = 'many-to-many';
                break;
              }
            }

            // Check for many-to-one (current side is optional/list)
            if (column.isOptional || column.isList) {
              relation.type = column.isList ? 'one-to-many' : 'many-to-one';
            }

            model.relations.push(relation);
          }
        }
      }
    }
  }

  async close(): Promise<void> {}

  private parsePrismaList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
}

// Prisma to TypeScript type mappings
export const PRISMA_TYPE_MAPPINGS = [
  { prismaType: 'String', tsType: 'string' },
  { prismaType: 'Int', tsType: 'number' },
  { prismaType: 'Float', tsType: 'number' },
  { prismaType: 'Boolean', tsType: 'boolean' },
  { prismaType: 'DateTime', tsType: 'Date' },
  { prismaType: 'Json', tsType: 'Record<string, unknown>' },
  { prismaType: 'Bytes', tsType: 'Buffer' },
  { prismaType: 'BigInt', tsType: 'bigint' },
  { prismaType: 'Decimal', tsType: 'number' },
];
