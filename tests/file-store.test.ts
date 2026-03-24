import { describe, it, expect, beforeEach } from "vitest";
import { FileStore } from "../src/file-store";
import type { UploadFile } from "../src/types";

const createMockFile = (overrides: Partial<UploadFile> = {}): UploadFile => ({
  id: crypto.randomUUID(),
  file: new File(["test"], "test.txt", { type: "text/plain" }),
  status: "queued",
  progress: 0,
  ...overrides,
});

describe("FileStore", () => {
  let store: FileStore;

  beforeEach(() => {
    store = new FileStore();
  });

  describe("add()", () => {
    it("should add file to store", () => {
      const file = createMockFile();
      store.add(file);

      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0]).toEqual(file);
    });

    it("should store copy, not reference", () => {
      const file = createMockFile();
      store.add(file);

      const retrieved = store.get(file.id);
      expect(retrieved).not.toBe(file);
      expect(retrieved).toEqual(file);
    });
  });

  describe("get()", () => {
    it("should return file by id", () => {
      const file = createMockFile();
      store.add(file);

      const retrieved = store.get(file.id);
      expect(retrieved).toEqual(file);
    });

    it("should return undefined for non-existent id", () => {
      const retrieved = store.get("non-existent");
      expect(retrieved).toBeUndefined();
    });

    it("should return copy, not reference", () => {
      const file = createMockFile();
      store.add(file);

      const retrieved = store.get(file.id);
      retrieved!.progress = 50;

      expect(store.get(file.id)!.progress).toBe(0);
    });
  });

  describe("getAll()", () => {
    it("should return empty array when store is empty", () => {
      expect(store.getAll()).toEqual([]);
    });

    it("should return all files", () => {
      store.add(createMockFile());
      store.add(createMockFile());
      store.add(createMockFile());

      expect(store.getAll()).toHaveLength(3);
    });

    it("should return copy of files array", () => {
      store.add(createMockFile());
      const all1 = store.getAll();
      const all2 = store.getAll();

      expect(all1).not.toBe(all2);
    });
  });

  describe("update()", () => {
    it("should update file properties", () => {
      const file = createMockFile();
      store.add(file);

      const success = store.update(file.id, {
        status: "uploading",
        progress: 50,
      });
      const updated = store.get(file.id);

      expect(success).toBe(true);
      expect(updated!.status).toBe("uploading");
      expect(updated!.progress).toBe(50);
    });

    it("should return false for non-existent id", () => {
      const success = store.update("non-existent", { progress: 50 });
      expect(success).toBe(false);
    });
  });

  describe("remove()", () => {
    it("should remove file by id", () => {
      const file = createMockFile();
      store.add(file);

      const removed = store.remove(file.id);

      expect(removed).toBe(true);
      expect(store.getAll()).toHaveLength(0);
    });

    it("should return false for non-existent id", () => {
      const removed = store.remove("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("clear()", () => {
    it("should remove all files", () => {
      store.add(createMockFile());
      store.add(createMockFile());
      store.add(createMockFile());

      store.clear();

      expect(store.getAll()).toHaveLength(0);
    });
  });

  describe("getByStatus()", () => {
    it("should return files with matching status", () => {
      store.add(createMockFile({ status: "queued" }));
      store.add(createMockFile({ status: "uploading" }));
      store.add(createMockFile({ status: "queued" }));
      store.add(createMockFile({ status: "success" }));

      const queued = store.getByStatus("queued");
      expect(queued).toHaveLength(2);
      expect(queued.every((f) => f.status === "queued")).toBe(true);
    });

    it("should return empty array when no matches", () => {
      store.add(createMockFile({ status: "success" }));

      const queued = store.getByStatus("queued");
      expect(queued).toHaveLength(0);
    });
  });
});
