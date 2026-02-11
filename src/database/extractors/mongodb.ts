/**
 * MongoDB Schema Extractor
 * Extracts database schema information from MongoDB databases by sampling documents
 */

import { MongoClient, Db, Collection } from 'mongodb';

export interface MongoDBFieldInfo {
  name: string;
  type: string;
  nullable: boolean;
  isArray: boolean;
  sampleValues?: any[];
}

export interface MongoDBCollectionInfo {
  name: string;
  documentCount: number;
  fields: MongoDBFieldInfo[];
  sampleSize: number;
  indexes: {
    name: string;
    keys: Record<string, any>;
    unique: boolean;
  }[];
}

export interface MongoDBSchemaInfo {
  collections: MongoDBCollectionInfo[];
  databaseType: 'mongodb';
  databaseName: string;
  connectionString: string;
}

export class MongoDBExtractor {
  private connectionString: string;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private sampleSize: number = 100;

  constructor(connectionString: string, sampleSize: number = 100) {
    this.connectionString = connectionString;
    this.sampleSize = sampleSize;
  }

  async extract(): Promise<MongoDBSchemaInfo> {
    this.client = new MongoClient(this.connectionString);

    try {
      await this.client.connect();

      // Extract database name from connection string
      const dbName = this.extractDatabaseName(this.connectionString);
      this.db = this.client.db(dbName);

      // List all collections
      const collectionsInfo = await this.db.listCollections().toArray();
      const collectionNames = collectionsInfo.map((c) => c.name);

      // Extract schema for each collection
      const collections = await Promise.all(
        collectionNames.map((name) => this.extractCollectionSchema(name)),
      );

      return {
        collections,
        databaseType: 'mongodb',
        databaseName: dbName,
        connectionString: this.sanitizeConnectionString(this.connectionString),
      };
    } catch (error) {
      throw error;
    }
  }

  private async extractCollectionSchema(collectionName: string): Promise<MongoDBCollectionInfo> {
    if (!this.db) throw new Error('Database not connected');

    const collection: Collection = this.db.collection(collectionName);

    // Get document count
    const documentCount = await collection.countDocuments();

    // Sample documents
    const sampleDocuments = await collection.find({}).limit(this.sampleSize).toArray();

    // Get indexes
    const indexes = await collection.indexes();

    // Infer schema from sampled documents
    const fields = this.inferSchemaFromDocuments(sampleDocuments);

    return {
      name: collectionName,
      documentCount,
      fields,
      sampleSize: sampleDocuments.length,
      indexes: indexes.map((idx) => ({
        name: idx.name || '',
        keys: idx.key,
        unique: idx.unique || false,
      })),
    };
  }

  private inferSchemaFromDocuments(documents: any[]): MongoDBFieldInfo[] {
    if (documents.length === 0) return [];

    const fieldMap = new Map<
      string,
      {
        types: Set<string>;
        nullCount: number;
        isArray: boolean;
        samples: any[];
      }
    >();

    // Analyze all documents
    for (const doc of documents) {
      this.analyzeObject(doc, fieldMap, '');
    }

    // Convert to field info
    const fields: MongoDBFieldInfo[] = [];
    for (const [fieldName, info] of fieldMap.entries()) {
      const types = Array.from(info.types);
      const primaryType = this.determinePrimaryType(types);

      fields.push({
        name: fieldName,
        type: primaryType,
        nullable: info.nullCount > 0,
        isArray: info.isArray,
        sampleValues: info.samples.slice(0, 3), // Keep first 3 sample values
      });
    }

    return fields.sort((a, b) => a.name.localeCompare(b.name));
  }

  private analyzeObject(obj: any, fieldMap: Map<string, any>, prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;

      if (!fieldMap.has(fieldName)) {
        fieldMap.set(fieldName, {
          types: new Set<string>(),
          nullCount: 0,
          isArray: false,
          samples: [],
        });
      }

      const fieldInfo = fieldMap.get(fieldName)!;

      if (value === null || value === undefined) {
        fieldInfo.nullCount++;
        fieldInfo.types.add('null');
      } else if (Array.isArray(value)) {
        fieldInfo.isArray = true;
        fieldInfo.types.add('Array');

        // Analyze array elements
        if (value.length > 0) {
          const elementType = this.getMongoType(value[0]);
          fieldInfo.types.add(`Array<${elementType}>`);
        }
      } else if (typeof value === 'object') {
        const mongoType = this.getMongoType(value);
        fieldInfo.types.add(mongoType);

        // Don't recurse into ObjectId, Date, etc.
        if (mongoType === 'Object') {
          this.analyzeObject(value, fieldMap, fieldName);
        }
      } else {
        const mongoType = this.getMongoType(value);
        fieldInfo.types.add(mongoType);

        // Store sample values
        if (fieldInfo.samples.length < 3 && !['null', 'undefined'].includes(mongoType)) {
          fieldInfo.samples.push(value);
        }
      }
    }
  }

  private getMongoType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    // Check for MongoDB types
    if (value._bsontype === 'ObjectId' || value.constructor?.name === 'ObjectId') {
      return 'ObjectId';
    }
    if (value instanceof Date) return 'Date';
    if (value._bsontype === 'Binary') return 'Binary';
    if (value._bsontype === 'Decimal128') return 'Decimal128';

    // Check for standard JavaScript types
    if (Array.isArray(value)) return 'Array';
    if (typeof value === 'string') return 'String';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'Int' : 'Double';
    }
    if (typeof value === 'boolean') return 'Boolean';
    if (typeof value === 'object') return 'Object';

    return 'Mixed';
  }

  private determinePrimaryType(types: string[]): string {
    if (types.length === 0) return 'Mixed';
    if (types.length === 1) return types[0];

    // Filter out null
    const nonNullTypes = types.filter((t) => t !== 'null');
    if (nonNullTypes.length === 1) return nonNullTypes[0];
    if (nonNullTypes.length === 0) return 'null';

    // If multiple types, return Mixed
    return `Mixed(${nonNullTypes.join('|')})`;
  }

  private extractDatabaseName(connectionString: string): string {
    try {
      // Parse connection string to extract database name
      // mongodb://host:port/dbname or mongodb+srv://host/dbname
      const match = connectionString.match(/\/([^/?]+)(\?|$)/);
      if (match && match[1]) {
        return match[1];
      }
      // Default to 'test' if not found
      return 'test';
    } catch {
      return 'test';
    }
  }

  private sanitizeConnectionString(connectionString: string): string {
    // Remove password from connection string for display
    return connectionString.replace(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/, 'mongodb$1://$2:***@');
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }
}
