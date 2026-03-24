import { describe, it, expect, vi, beforeEach } from "vitest";
import { Uploader } from "../src/uploader";
import type { UploaderOptions, UploadFile, ProcessFn } from "../src/types";

const createMockFile = (name = "test.txt", type = "text/plain"): File => {
  return new File(["content"], name, { type });
};

const createMockProcess = (delayMs = 10): ProcessFn => {
  return vi.fn().mockImplementation(async (file, { onProgress }) => {
    for (let i = 0; i <= 100; i += 20) {
      await new Promise((r) => setTimeout(r, delayMs / 5));
      onProgress(i);
    }
    return { serverId: `server-${crypto.randomUUID()}` };
  }) as unknown as ProcessFn;
};

describe("Uploader", () => {
  describe("initialization", () => {
    it("should create uploader with empty options", () => {
      const uploader = new Uploader();
      expect(uploader.getFiles()).toHaveLength(0);
    });

    it("should store options", () => {
      const options: UploaderOptions = { autoUpload: true };
      const uploader = new Uploader(options);
      expect(uploader).toBeDefined();
    });
  });

  describe("addFiles()", () => {
    it("should add files to queue", async () => {
      const uploader = new Uploader();
      const file = createMockFile();

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(1);
      expect(uploader.getFiles()).toHaveLength(1);
      expect(uploader.getFile(added[0]!.id)).toBeDefined();
    });

    it("should set correct initial state", async () => {
      const uploader = new Uploader();
      const file = createMockFile();

      const added = await uploader.addFiles([file]);

      expect(added[0]!.status).toBe("queued");
      expect(added[0]!.progress).toBe(0);
      expect(added[0]!.file).toBe(file);
    });

    it("should generate unique ids", async () => {
      const uploader = new Uploader();
      const files = [createMockFile(), createMockFile(), createMockFile()];

      const added = await uploader.addFiles(files);

      const ids = added.map((f) => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it("should trigger onAdd callback", async () => {
      const onAdd = vi.fn();
      const uploader = new Uploader({ onAdd });
      const file = createMockFile();

      await uploader.addFiles([file]);

      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ file }));
    });

    it("should trigger add event", async () => {
      const handler = vi.fn();
      const uploader = new Uploader();
      uploader.on("add", handler);
      const file = createMockFile();

      await uploader.addFiles([file]);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should auto-upload when enabled", async () => {
      const process = createMockProcess();
      const uploader = new Uploader({ autoUpload: true, process });
      const file = createMockFile();

      await uploader.addFiles([file]);
      await new Promise((r) => setTimeout(r, 50));

      expect(process).toHaveBeenCalled();
    });
  });

  describe("uploadFile()", () => {
    it("should upload file and update status", async () => {
      const process = createMockProcess(5);
      const uploader = new Uploader({ process });
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.uploadFile(added[0]!.id);
      await new Promise((r) => setTimeout(r, 30));

      const updated = uploader.getFile(added[0]!.id);
      expect(updated!.status).toBe("success");
      expect(updated!.progress).toBe(100);
      expect(updated!.serverId).toBeDefined();
    });

    it("should trigger progress events", async () => {
      const onProgress = vi.fn();
      const uploader = new Uploader({
        process: createMockProcess(5),
        onProgress,
      });
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.uploadFile(added[0]!.id);
      await new Promise((r) => setTimeout(r, 30));

      expect(onProgress).toHaveBeenCalled();
    });

    it("should trigger success event", async () => {
      const handler = vi.fn();
      const uploader = new Uploader({ process: createMockProcess(5) });
      uploader.on("success", handler);
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.uploadFile(added[0]!.id);
      await new Promise((r) => setTimeout(r, 30));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should not re-upload completed files", async () => {
      const process = createMockProcess(5);
      const uploader = new Uploader({ process });
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.uploadFile(added[0]!.id);
      await new Promise((r) => setTimeout(r, 30));
      (process as ReturnType<typeof vi.fn>).mockClear();

      await uploader.uploadFile(added[0]!.id);

      expect(process).not.toHaveBeenCalled();
    });
  });

  describe("uploadAll()", () => {
    it("should upload all queued files", async () => {
      const process = createMockProcess(5);
      const uploader = new Uploader({ process });
      const files = [
        createMockFile("a.txt"),
        createMockFile("b.txt"),
        createMockFile("c.txt"),
      ];

      await uploader.addFiles(files);
      uploader.uploadAll();
      await new Promise((r) => setTimeout(r, 100));

      const all = uploader.getFiles();
      expect(all.every((f) => f.status === "success")).toBe(true);
    });
  });

  describe("cancelFile()", () => {
    it("should cancel in-progress upload", async () => {
      const slowProcess: ProcessFn = vi
        .fn()
        .mockImplementation(async (file, { signal }) => {
          await new Promise((r) => setTimeout(r, 1000));
          if (signal.aborted) throw new Error("Aborted");
          return { serverId: "test" };
        }) as unknown as ProcessFn;

      const uploader = new Uploader({ process: slowProcess });
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      const uploadPromise = uploader.uploadFile(added[0]!.id);
      await new Promise((r) => setTimeout(r, 10));
      uploader.cancelFile(added[0]!.id);

      await uploadPromise;
      const updated = uploader.getFile(added[0]!.id);
      expect(updated!.status).toBe("cancelled");
    });
  });

  describe("cancelAll()", () => {
    it("should cancel all in-progress uploads", async () => {
      const slowProcess: ProcessFn = vi
        .fn()
        .mockImplementation(async (file, { signal }) => {
          await new Promise((r) => setTimeout(r, 500));
          if (signal.aborted) throw new Error("Aborted");
          return { serverId: "test" };
        }) as unknown as ProcessFn;

      const uploader = new Uploader({ process: slowProcess });
      const files = [createMockFile("a.txt"), createMockFile("b.txt")];

      await uploader.addFiles(files);
      uploader.uploadAll();
      await new Promise((r) => setTimeout(r, 50));
      uploader.cancelAll();
      await new Promise((r) => setTimeout(r, 600));

      const all = uploader.getFiles();
      const uploadingFiles = all.filter((f) => f.status === "cancelled");
      expect(uploadingFiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("removeFile()", () => {
    it("should remove file from store", async () => {
      const uploader = new Uploader();
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.removeFile(added[0]!.id);

      expect(uploader.getFile(added[0]!.id)).toBeUndefined();
    });

    it("should trigger revert if serverId exists", async () => {
      const revert = vi.fn().mockResolvedValue(undefined);
      const process = createMockProcess(5);
      const uploader = new Uploader({ process, revert });
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.uploadFile(added[0]!.id);
      await new Promise((r) => setTimeout(r, 30));
      await uploader.removeFile(added[0]!.id);

      expect(revert).toHaveBeenCalledWith(expect.stringContaining("server-"));
    });

    it("should trigger remove event", async () => {
      const handler = vi.fn();
      const uploader = new Uploader();
      uploader.on("remove", handler);
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.removeFile(added[0]!.id);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear()", () => {
    it("should remove all files", async () => {
      const uploader = new Uploader();
      const files = [createMockFile(), createMockFile()];

      await uploader.addFiles(files);
      uploader.clear();

      expect(uploader.getFiles()).toHaveLength(0);
    });
  });

  describe("event subscriptions", () => {
    it("should return unsubscribe function from on()", async () => {
      const handler = vi.fn();
      const uploader = new Uploader();
      const unsubscribe = uploader.on("add", handler);
      const file = createMockFile();

      unsubscribe();
      await uploader.addFiles([file]);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should support once()", async () => {
      const handler = vi.fn();
      const uploader = new Uploader();
      uploader.once("add", handler);
      const file = createMockFile();

      await uploader.addFiles([file]);
      await uploader.addFiles([createMockFile()]);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should support off()", async () => {
      const handler = vi.fn();
      const uploader = new Uploader();
      uploader.on("add", handler);
      uploader.off("add", handler);
      const file = createMockFile();

      await uploader.addFiles([file]);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle upload failure", async () => {
      const failingProcess: ProcessFn = vi
        .fn()
        .mockRejectedValue(new Error("Upload failed")) as unknown as ProcessFn;

      const onError = vi.fn();
      const uploader = new Uploader({ process: failingProcess, onError });
      const file = createMockFile();
      const added = await uploader.addFiles([file]);

      await uploader.uploadFile(added[0]!.id);

      const updated = uploader.getFile(added[0]!.id);
      expect(updated!.status).toBe("error");
      expect(onError).toHaveBeenCalled();
    });
  });
});
