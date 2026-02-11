/**
 * Firebase Firestore Schema Extractor
 * Extracts database schema information from Firebase Firestore by sampling documents
 */

import * as admin from 'firebase-admin';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';

export interface FirebaseFieldInfo {
  name: string;
  type: string;
  nullable: boolean;
  isArray: boolean;
  isReference: boolean;
  sampleValues?: any[];
}

export interface FirebaseCollectionInfo {
  name: string;
  documentCount: number;
  fields: FirebaseFieldInfo[];
  sampleSize: number;
}

export interface FirebaseSchemaInfo {
  collections: FirebaseCollectionInfo[];
  databaseType: 'firebase';
  projectId: string;
}

export class FirebaseExtractor {
  private projectId: string;
  private serviceAccountPath?: string;
  private db: Firestore | null = null;
  private sampleSize: number = 100;
  private app: admin.app.App | null = null;

  constructor(projectId: string, serviceAccountPath?: string, sampleSize: number = 100) {
    this.projectId = projectId;
    this.serviceAccountPath = serviceAccountPath;
    this.sampleSize = sampleSize;
  }

  async extract(): Promise<FirebaseSchemaInfo> {
    try {
      // Initialize Firebase Admin
      if (!this.serviceAccountPath && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new Error(
          'Firebase service account required. Use --firebase-key or set GOOGLE_APPLICATION_CREDENTIALS env var.',
        );
      }

      const config: admin.AppOptions = {
        projectId: this.projectId,
      };

      if (this.serviceAccountPath) {
        const serviceAccount = await import(this.serviceAccountPath);
        config.credential = admin.credential.cert(serviceAccount.default || serviceAccount);
      }

      this.app = admin.initializeApp(config, `cohere-${Date.now()}`);
      this.db = admin.firestore(this.app);

      // List all collections (top-level only for now)
      const collections = await this.db.listCollections();
      const collectionNames = collections.map((c) => c.id);

      console.log(`   Found ${collectionNames.length} collections`);

      // Extract schema for each collection
      const collectionSchemas = await Promise.all(
        collectionNames.map((name) => this.extractCollectionSchema(name)),
      );

      return {
        collections: collectionSchemas,
        databaseType: 'firebase',
        projectId: this.projectId,
      };
    } catch (error) {
      throw error;
    }
  }

  private async extractCollectionSchema(collectionName: string): Promise<FirebaseCollectionInfo> {
    if (!this.db) throw new Error('Firestore not initialized');

    const collectionRef = this.db.collection(collectionName);

    // Get approximate count (note: Firestore doesn't have built-in count)
    const snapshot = await collectionRef.limit(this.sampleSize).get();
    const sampleSize = snapshot.size;

    // Sample documents
    const documents = snapshot.docs;

    // Infer schema from sampled documents
    const fields = this.inferSchemaFromDocuments(documents);

    return {
      name: collectionName,
      documentCount: sampleSize, // Approximate, as Firestore doesn't expose exact counts easily
      fields,
      sampleSize,
    };
  }

  private inferSchemaFromDocuments(documents: DocumentSnapshot[]): FirebaseFieldInfo[] {
    if (documents.length === 0) return [];

    const fieldMap = new Map<
      string,
      {
        types: Set<string>;
        nullCount: number;
        isArray: boolean;
        isReference: boolean;
        samples: any[];
      }
    >();

    // Analyze all documents
    for (const doc of documents) {
      const data = doc.data();
      if (data) {
        this.analyzeObject(data, fieldMap, '');
      }
    }

    // Convert to field info
    const fields: FirebaseFieldInfo[] = [];
    for (const [fieldName, info] of fieldMap.entries()) {
      const types = Array.from(info.types);
      const primaryType = this.determinePrimaryType(types);

      fields.push({
        name: fieldName,
        type: primaryType,
        nullable: info.nullCount > 0,
        isArray: info.isArray,
        isReference: info.isReference,
        sampleValues: info.samples.slice(0, 3),
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
          isReference: false,
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

        if (value.length > 0) {
          const elementType = this.getFirestoreType(value[0]);
          fieldInfo.types.add(`Array<${elementType}>`);
        }
      } else if (this.isFirestoreReference(value)) {
        fieldInfo.isReference = true;
        fieldInfo.types.add('Reference');
      } else if (typeof value === 'object') {
        const firestoreType = this.getFirestoreType(value);
        fieldInfo.types.add(firestoreType);

        // Don't recurse into special Firestore types
        if (firestoreType === 'Map') {
          this.analyzeObject(value, fieldMap, fieldName);
        }
      } else {
        const firestoreType = this.getFirestoreType(value);
        fieldInfo.types.add(firestoreType);

        // Store sample values
        if (fieldInfo.samples.length < 3 && firestoreType !== 'null') {
          fieldInfo.samples.push(value);
        }
      }
    }
  }

  private isFirestoreReference(value: any): boolean {
    // Check if it's a Firestore DocumentReference
    return value && typeof value === 'object' && '_path' in value && 'firestore' in value;
  }

  private getFirestoreType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    // Check for Firestore-specific types
    if (this.isFirestoreReference(value)) return 'Reference';
    if (value instanceof Date || (value && typeof value.toDate === 'function')) return 'Timestamp';
    if (value && value.constructor && value.constructor.name === 'GeoPoint') return 'GeoPoint';

    // Standard JavaScript types
    if (Array.isArray(value)) return 'Array';
    if (typeof value === 'string') return 'String';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'Number' : 'Number';
    }
    if (typeof value === 'boolean') return 'Boolean';
    if (typeof value === 'object') return 'Map';

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

  async close(): Promise<void> {
    if (this.app) {
      await this.app.delete();
      this.app = null;
      this.db = null;
    }
  }
}
