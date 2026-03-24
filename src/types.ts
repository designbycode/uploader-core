export type UploadStatus =
  | "idle"
  | "queued"
  | "uploading"
  | "paused"
  | "success"
  | "error"
  | "cancelled";

export type UploadFile = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  serverId?: string;
  error?: string;
  retryCount?: number;
  abortController?: AbortController;
};

export type ProcessFn = (
  file: File,
  options: {
    onProgress: (progress: number) => void;
    signal: AbortSignal;
  },
) => Promise<{ serverId: string }>;

export type RevertFn = (serverId: string) => Promise<void>;

export type LoadFn = () => Promise<
  {
    id: string;
    url?: string;
    name: string;
    size: number;
  }[]
>;

export type ValidationRule = {
  maxSize?: number;
  minSize?: number;
  acceptedMimeTypes?: string[];
  rejectedMimeTypes?: string[];
};

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export type FileValidator = (
  file: File,
) => ValidationResult | Promise<ValidationResult>;

export type UploaderOptions = {
  autoUpload?: boolean;
  maxConcurrent?: number;
  validation?: ValidationRule | FileValidator;

  maxRetries?: number;
  retryDelay?: number;

  process?: ProcessFn;
  revert?: RevertFn;
  load?: LoadFn;

  onAdd?: (file: UploadFile) => void;
  onProgress?: (file: UploadFile) => void;
  onSuccess?: (file: UploadFile) => void;
  onError?: (file: UploadFile) => void;
  onRemove?: (file: UploadFile) => void;
  onRetry?: (file: UploadFile, attempt: number) => void;
  onValidationError?: (file: File, error: string) => void;
};
