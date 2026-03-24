# @designbycode/uploader-core

A framework-agnostic JavaScript file uploader library with queue management, progress tracking, abort support, and file validation.

[![npm version](https://img.shields.io/npm/v/@designbycode/uploader-core)](https://npm.npmjs.com/package/@designbycode/uploader-core)
[![license](https://img.shields.io/npm/l/@designbycode/uploader-core)](LICENSE)

## Features

- **Framework-agnostic** — Works in browsers and Node.js
- **Dual module support** — ESM and CommonJS
- **Queue management** — Add multiple files and upload them in sequence or parallel
- **Progress tracking** — Real-time upload progress via events
- **Abort support** — Cancel individual uploads or all at once
- **File validation** — Built-in size and MIME type validation
- **Custom validators** — Support for async validation functions
- **Concurrency control** — Limit simultaneous uploads with `maxConcurrent`
- **Event-driven** — Subscribe to `add`, `progress`, `success`, `error`, `remove` events
- **TypeScript** — Full TypeScript support with type definitions

## Installation

```bash
# Using bun
bun add @designbycode/uploader-core

# Using npm
npm install @designbycode/uploader-core

# Using pnpm
pnpm add @designbycode/uploader-core
```

## Quick Start

```typescript
import { Uploader } from "@designbycode/uploader-core";

const uploader = new Uploader({
  process: async (file, { signal, onProgress }) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      signal,
    });

    return { serverId: response.json().id };
  },
});

// Add files and upload
const input = document.querySelector('input[type="file"]');
input.addEventListener("change", async () => {
  const added = await uploader.addFiles(Array.from(input.files));
  uploader.uploadAll();
});

// Listen for events
uploader.on("progress", (file) => {
  console.log(`${file.file.name}: ${file.progress}%`);
});

uploader.on("success", (file) => {
  console.log(`${file.file.name} uploaded successfully`);
});
```

## API

### `new Uploader(options?)`

Creates a new uploader instance.

```typescript
const uploader = new Uploader({
  autoUpload: false, // Automatically upload files when added
  maxConcurrent: 2, // Limit simultaneous uploads
  validation: {
    // File validation rules
    maxSize: 10 * 1024 * 1024, // 10MB
    acceptedMimeTypes: ["image/png", "image/jpeg"],
  },
  process: async (file, { signal, onProgress }) => {
    // Your upload logic here
    return { serverId: "file-id" };
  },
});
```

### Options

| Option              | Type                              | Description                                        |
| ------------------- | --------------------------------- | -------------------------------------------------- |
| `autoUpload`        | `boolean`                         | Automatically upload files when added              |
| `maxConcurrent`     | `number`                          | Maximum simultaneous uploads (default: unlimited)  |
| `validation`        | `ValidationRule \| FileValidator` | File validation rules or custom validator          |
| `process`           | `ProcessFn`                       | Function to handle the actual upload               |
| `revert`            | `RevertFn`                        | Function to undo upload (e.g., delete from server) |
| `onAdd`             | `Callback`                        | Called when a file is added                        |
| `onProgress`        | `Callback`                        | Called when upload progress updates                |
| `onSuccess`         | `Callback`                        | Called when upload succeeds                        |
| `onError`           | `Callback`                        | Called when upload fails                           |
| `onRemove`          | `Callback`                        | Called when a file is removed                      |
| `onValidationError` | `Callback`                        | Called when validation fails                       |

### Methods

#### `addFiles(files: File[]): Promise<UploadFile[]>`

Add files to the upload queue. Returns the added `UploadFile` objects.

```typescript
const added = await uploader.addFiles([file1, file2, file3]);
console.log(`Added ${added.length} files`);
```

#### `uploadFile(id: string): Promise<void>`

Upload a single file by its ID.

```typescript
await uploader.uploadFile("file-uuid");
```

#### `uploadAll(): void`

Upload all queued files.

```typescript
uploader.uploadAll();
```

#### `cancelFile(id: string): void`

Cancel an in-progress upload.

```typescript
uploader.cancelFile("file-uuid");
```

#### `cancelAll(): void`

Cancel all in-progress uploads.

```typescript
uploader.cancelAll();
```

#### `removeFile(id: string): Promise<void>`

Remove a file from the queue. Calls `revert()` if the file was uploaded.

```typescript
await uploader.removeFile("file-uuid");
```

#### `getFiles(): ReadonlyArray<UploadFile>`

Get all files in the queue.

```typescript
const files = uploader.getFiles();
files.forEach((f) => console.log(f.file.name, f.status));
```

#### `getFile(id: string): UploadFile | undefined`

Get a single file by ID.

```typescript
const file = uploader.getFile("file-uuid");
```

#### `clear(): void`

Clear all files from the queue.

```typescript
uploader.clear();
```

## Events

### `on(event, callback): () => void`

Subscribe to an event. Returns an unsubscribe function.

```typescript
const unsubscribe = uploader.on("success", (file) => {
  console.log(`${file.file.name} uploaded!`);
});

// Later, unsubscribe
unsubscribe();
```

### `once(event, callback): () => void`

Subscribe to an event for a single execution.

```typescript
uploader.once("success", (file) => {
  console.log("First upload completed!");
});
```

### `off(event, callback): void`

Unsubscribe from an event.

```typescript
const handler = (file) => console.log(file.file.name);
uploader.on("success", handler);
uploader.off("success", handler);
```

### Event Types

| Event      | Payload      | Description             |
| ---------- | ------------ | ----------------------- |
| `add`      | `UploadFile` | File added to queue     |
| `progress` | `UploadFile` | Upload progress updated |
| `success`  | `UploadFile` | Upload completed        |
| `error`    | `UploadFile` | Upload failed           |
| `remove`   | `UploadFile` | File removed from queue |

## Validation

### Built-in Rules

```typescript
const uploader = new Uploader({
  validation: {
    maxSize: 5 * 1024 * 1024, // 5MB max
    minSize: 1000, // 1KB min
    acceptedMimeTypes: ["image/png", "image/jpeg", "image/gif"],
    rejectedMimeTypes: ["application/exe"],
  },
  process: async (file, { signal, onProgress }) => {
    // ...
  },
});

uploader.on("validationError", (file, error) => {
  console.error(`${file.name} rejected: ${error}`);
});
```

### Custom Validator

```typescript
const uploader = new Uploader({
  validation: async (file) => {
    // Check file name
    if (!file.name.match(/^[a-zA-Z0-9-_]+\.[a-z]+$/)) {
      return { valid: false, error: "Invalid file name format" };
    }

    // Async validation (e.g., check against API)
    const isAllowed = await checkFileAllowed(file);
    if (!isAllowed) {
      return { valid: false, error: "File not allowed" };
    }

    return { valid: true };
  },
});
```

## Concurrency Control

Limit simultaneous uploads:

```typescript
const uploader = new Uploader({
  maxConcurrent: 2, // Only 2 uploads at a time
  process: async (file, { signal, onProgress }) => {
    // ...
  },
});

// Add 10 files, only 2 will upload at once
await uploader.addFiles(files);
uploader.uploadAll();
```

## Types

### UploadFile

```typescript
interface UploadFile {
  id: string;
  file: File;
  status: "idle" | "queued" | "uploading" | "success" | "error" | "cancelled";
  progress: number;
  serverId?: string;
  error?: string;
}
```

### UploadStatus

```typescript
type UploadStatus =
  | "idle"
  | "queued"
  | "uploading"
  | "success"
  | "error"
  | "cancelled";
```

### ValidationRule

```typescript
interface ValidationRule {
  maxSize?: number;
  minSize?: number;
  acceptedMimeTypes?: string[];
  rejectedMimeTypes?: string[];
}
```

## License

MIT
