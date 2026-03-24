import type { UploadFile } from "./types";

export class FileStore {
  private files: Map<string, UploadFile> = new Map();

  getAll(): ReadonlyArray<UploadFile> {
    return Array.from(this.files.values());
  }

  get(id: string): UploadFile | undefined {
    const file = this.files.get(id);
    return file ? { ...file } : undefined;
  }

  add(file: UploadFile): void {
    this.files.set(file.id, { ...file });
  }

  update(id: string, updates: Partial<UploadFile>): boolean {
    const file = this.files.get(id);
    if (!file) return false;
    const updated = { ...file, ...updates };
    this.files.set(id, updated);
    return true;
  }

  remove(id: string): boolean {
    return this.files.delete(id);
  }

  clear(): void {
    this.files.clear();
  }

  getByStatus(status: UploadFile["status"]): ReadonlyArray<UploadFile> {
    return this.getAll().filter((f) => f.status === status);
  }

  getByServerId(serverId: string): UploadFile | undefined {
    for (const file of this.files.values()) {
      if (file.serverId === serverId) {
        return { ...file };
      }
    }
    return undefined;
  }
}
