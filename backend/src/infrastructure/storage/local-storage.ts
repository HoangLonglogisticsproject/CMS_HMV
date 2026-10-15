import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ObjectStorage } from './object-storage';

/** Disk-backed storage for development and tests. Files are served by the API under /media-files. */
export class LocalDiskStorage implements ObjectStorage {
  readonly root: string;

  constructor(
    dir: string,
    private readonly baseUrl: string,
  ) {
    this.root = resolve(dir);
  }

  private path(key: string) {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root))
      throw new Error(`Storage key escapes root: ${key}`);
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body, { flag: 'wx' }); // never overwrite an existing object
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
