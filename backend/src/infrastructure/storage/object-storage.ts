/** Where media bytes live. Implementations: LocalDiskStorage (dev/test) and R2Storage (production target). */
export interface ObjectStorage {
  /** Writes a new object. Keys are generated server-side and never reused. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** URL the public website can load. Only valid for publicly served objects. */
  publicUrl(key: string): string;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
