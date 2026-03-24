import { FileStore } from "./file-store";
import { Emitter } from "./events";
import type {
  UploadFile,
  UploaderOptions,
  ValidationRule,
  ValidationResult,
} from "./types";

type Events = {
  add: UploadFile;
  progress: UploadFile;
  success: UploadFile;
  error: UploadFile;
  remove: UploadFile;
  retry: { file: UploadFile; attempt: number };
};

export class Uploader {
  private store = new FileStore();
  private emitter = new Emitter<Events>();
  private readonly options: UploaderOptions;
  private activeUploads = 0;

  constructor(options: UploaderOptions = {}) {
    this.options = options;
  }

  on = this.emitter.on.bind(this.emitter);
  once = this.emitter.once.bind(this.emitter);
  off = this.emitter.off.bind(this.emitter);

  getFiles(): ReadonlyArray<UploadFile> {
    return this.store.getAll();
  }

  getFile(id: string): UploadFile | undefined {
    return this.store.get(id);
  }

  getFileByServerId(serverId: string): UploadFile | undefined {
    return this.store.getByServerId(serverId);
  }

  async addFiles(fileList: File[]): Promise<UploadFile[]> {
    const added: UploadFile[] = [];

    for (const file of fileList) {
      const validation = await this.validateFile(file);
      if (!validation.valid) {
        this.options.onValidationError?.(file, validation.error!);
        continue;
      }

      const uploadFile: UploadFile = {
        id: crypto.randomUUID(),
        file,
        status: "queued",
        progress: 0,
      };

      this.store.add(uploadFile);
      added.push(uploadFile);
      this.emitter.emit("add", uploadFile);
      this.options.onAdd?.(uploadFile);

      if (this.options.autoUpload) {
        await this.uploadFile(uploadFile.id);
      }
    }

    return added;
  }

  private async validateFile(file: File): Promise<ValidationResult> {
    const { validation } = this.options;

    if (!validation) {
      return { valid: true };
    }

    if (typeof validation === "function") {
      return await validation(file);
    }

    return this.validateWithRules(file, validation);
  }

  private validateWithRules(
    file: File,
    rules: ValidationRule,
  ): ValidationResult {
    if (rules.maxSize !== undefined && file.size > rules.maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${rules.maxSize} bytes`,
      };
    }

    if (rules.minSize !== undefined && file.size < rules.minSize) {
      return {
        valid: false,
        error: `File size is below minimum of ${rules.minSize} bytes`,
      };
    }

    if (rules.acceptedMimeTypes?.length) {
      const accepted = this.matchGlobPatterns(
        file.type,
        rules.acceptedMimeTypes,
      );
      if (!accepted) {
        return {
          valid: false,
          error: `File type "${file.type}" is not accepted`,
        };
      }
    }

    if (rules.rejectedMimeTypes?.length) {
      const rejected = this.matchGlobPatterns(
        file.type,
        rules.rejectedMimeTypes,
      );
      if (rejected) {
        return { valid: false, error: `File type "${file.type}" is rejected` };
      }
    }

    return { valid: true };
  }

  private matchGlobPatterns(mimeType: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (pattern === mimeType) return true;
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -1);
        if (mimeType.startsWith(prefix)) return true;
      }
    }
    return false;
  }

  async uploadFile(id: string): Promise<void> {
    const maxConcurrent = this.options.maxConcurrent ?? Infinity;

    if (this.activeUploads >= maxConcurrent) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const cleanup = () => {
          if (resolved) return;
          resolved = true;
          this.emitter.off("success", cleanup);
          this.emitter.off("error", cleanup);
          resolve();
        };

        const check = () => {
          if (this.activeUploads < maxConcurrent) {
            cleanup();
          } else {
            setTimeout(check, 50);
          }
        };

        this.emitter.on("success", cleanup);
        this.emitter.on("error", cleanup);
        setTimeout(check, 50);
      });
    }

    const file = this.store.get(id);
    if (!file || !this.options.process) return;

    if (file.status !== "queued") return;

    const maxRetries = this.options.maxRetries ?? 0;
    const retryDelay = this.options.retryDelay ?? 1000;
    let currentRetry = file.retryCount ?? 0;

    const attemptUpload = async (): Promise<void> => {
      const abortController = new AbortController();
      this.activeUploads++;

      this.store.update(id, {
        status: "uploading",
        abortController,
        retryCount: currentRetry,
      });

      try {
        const result = await this.options.process!(file.file, {
          signal: abortController.signal,
          onProgress: (progress) => {
            const updated = this.store.get(id);
            if (updated) {
              this.store.update(id, { progress });
              this.emitter.emit("progress", updated);
              this.options.onProgress?.(updated);
            }
          },
        });

        this.store.update(id, {
          status: "success",
          serverId: result.serverId,
          progress: 100,
        });

        const updated = this.store.get(id);
        if (updated) {
          this.emitter.emit("success", updated);
          this.options.onSuccess?.(updated);
        }
      } catch (error: unknown) {
        if (abortController.signal.aborted) {
          this.store.update(id, { status: "cancelled" });
          const updated = this.store.get(id);
          if (updated) {
            this.emitter.emit("error", updated);
            this.options.onError?.(updated);
          }
        } else if (currentRetry < maxRetries) {
          currentRetry++;
          this.store.update(id, { status: "queued", progress: 0 });

          const updated = this.store.get(id);
          if (updated) {
            this.emitter.emit("retry", {
              file: updated,
              attempt: currentRetry,
            });
            this.options.onRetry?.(updated, currentRetry);
          }

          await new Promise((resolve) => setTimeout(resolve, retryDelay));

          const checkFile = this.store.get(id);
          if (
            checkFile?.status === "queued" &&
            !abortController.signal.aborted
          ) {
            await attemptUpload();
            return;
          }
        } else {
          this.store.update(id, {
            status: "error",
            error: error instanceof Error ? error.message : "Upload failed",
          });

          const updated = this.store.get(id);
          if (updated) {
            this.emitter.emit("error", updated);
            this.options.onError?.(updated);
          }
        }
      } finally {
        this.activeUploads--;
      }
    };

    await attemptUpload();
  }

  uploadAll(): void {
    this.store.getByStatus("queued").forEach((f) => this.uploadFile(f.id));
  }

  cancelFile(id: string): void {
    const file = this.store.get(id);
    file?.abortController?.abort();
  }

  cancelAll(): void {
    this.store.getByStatus("uploading").forEach((f) => this.cancelFile(f.id));
  }

  pauseFile(id: string): void {
    const file = this.store.get(id);
    if (!file || file.status !== "uploading") return;
    file.abortController?.abort();
    this.store.update(id, { status: "paused" });
  }

  pauseAll(): void {
    this.store.getByStatus("uploading").forEach((f) => this.pauseFile(f.id));
  }

  resumeFile(id: string): void {
    const file = this.store.get(id);
    if (!file || file.status !== "paused") return;
    this.store.update(id, { status: "queued" });
    this.uploadFile(id);
  }

  resumeAll(): void {
    this.store.getByStatus("paused").forEach((f) => this.resumeFile(f.id));
  }

  async removeFile(id: string): Promise<void> {
    const file = this.store.get(id);
    if (!file) return;

    if (file.serverId && this.options.revert) {
      await this.options.revert(file.serverId);
    }

    this.store.remove(id);
    this.emitter.emit("remove", file);
    this.options.onRemove?.(file);
  }

  clear(): void {
    this.store.clear();
  }
}
