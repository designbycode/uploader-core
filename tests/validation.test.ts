import { describe, it, expect, vi, beforeEach } from "vitest";
import { Uploader } from "../src/uploader";
import type { ValidationRule, FileValidator } from "../src/types";

const createMockFile = (
  name = "test.txt",
  size = 1000,
  type = "text/plain",
): File => {
  return new File(["x".repeat(size)], name, { type });
};

describe("Validation", () => {
  describe("with ValidationRule", () => {
    it("should accept files within size limit", async () => {
      const uploader = new Uploader({
        validation: { maxSize: 10000 },
      });
      const file = createMockFile("test.txt", 5000);

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(1);
    });

    it("should reject files exceeding maxSize", async () => {
      const onValidationError = vi.fn();
      const uploader = new Uploader({
        validation: { maxSize: 1000 },
        onValidationError,
      });
      const file = createMockFile("large.txt", 2000);

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(0);
      expect(onValidationError).toHaveBeenCalledWith(
        file,
        expect.stringContaining("exceeds maximum"),
      );
    });

    it("should reject files below minSize", async () => {
      const onValidationError = vi.fn();
      const uploader = new Uploader({
        validation: { minSize: 1000 },
        onValidationError,
      });
      const file = createMockFile("small.txt", 500);

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(0);
      expect(onValidationError).toHaveBeenCalledWith(
        file,
        expect.stringContaining("below minimum"),
      );
    });

    it("should accept files with allowed mime types", async () => {
      const uploader = new Uploader({
        validation: { acceptedMimeTypes: ["image/png", "image/jpeg"] },
      });
      const file = createMockFile("image.png", 1000, "image/png");

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(1);
    });

    it("should reject files with non-allowed mime types", async () => {
      const onValidationError = vi.fn();
      const uploader = new Uploader({
        validation: { acceptedMimeTypes: ["image/png", "image/jpeg"] },
        onValidationError,
      });
      const file = createMockFile("doc.pdf", 1000, "application/pdf");

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(0);
      expect(onValidationError).toHaveBeenCalledWith(
        file,
        expect.stringContaining("not accepted"),
      );
    });

    it("should reject files with rejected mime types", async () => {
      const onValidationError = vi.fn();
      const uploader = new Uploader({
        validation: { rejectedMimeTypes: ["application/pdf"] },
        onValidationError,
      });
      const file = createMockFile("doc.pdf", 1000, "application/pdf");

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(0);
      expect(onValidationError).toHaveBeenCalledWith(
        file,
        expect.stringContaining("rejected"),
      );
    });

    it("should allow files not in rejected mime types", async () => {
      const uploader = new Uploader({
        validation: { rejectedMimeTypes: ["application/pdf"] },
      });
      const file = createMockFile("text.txt", 1000, "text/plain");

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(1);
    });

    it("should apply multiple validation rules", async () => {
      const onValidationError = vi.fn();
      const uploader = new Uploader({
        validation: {
          maxSize: 10000,
          minSize: 1000,
          acceptedMimeTypes: ["image/png"],
        },
        onValidationError,
      });

      const tooSmall = createMockFile("small.png", 500, "image/png");
      const tooLarge = createMockFile("large.png", 20000, "image/png");
      const wrongType = createMockFile("doc.pdf", 5000, "application/pdf");
      const valid = createMockFile("image.png", 5000, "image/png");

      const results = await Promise.all([
        uploader.addFiles([tooSmall]),
        uploader.addFiles([tooLarge]),
        uploader.addFiles([wrongType]),
        uploader.addFiles([valid]),
      ]);

      expect(results[0]).toHaveLength(0);
      expect(results[1]).toHaveLength(0);
      expect(results[2]).toHaveLength(0);
      expect(results[3]).toHaveLength(1);
      expect(onValidationError).toHaveBeenCalledTimes(3);
    });
  });

  describe("with custom FileValidator function", () => {
    it("should accept files passing custom validation", async () => {
      const customValidator: FileValidator = (file) => {
        if (file.name.startsWith("allowed_")) {
          return { valid: true };
        }
        return { valid: false, error: "File name must start with 'allowed_'" };
      };

      const uploader = new Uploader({ validation: customValidator });
      const file = createMockFile("allowed_file.txt");

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(1);
    });

    it("should reject files failing custom validation", async () => {
      const onValidationError = vi.fn();
      const customValidator: FileValidator = (file) => {
        if (file.name.startsWith("allowed_")) {
          return { valid: true };
        }
        return { valid: false, error: "File name must start with 'allowed_'" };
      };

      const uploader = new Uploader({
        validation: customValidator,
        onValidationError,
      });
      const file = createMockFile("blocked_file.txt");

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(0);
      expect(onValidationError).toHaveBeenCalledWith(
        file,
        "File name must start with 'allowed_'",
      );
    });

    it("should support async custom validators", async () => {
      const asyncValidator: FileValidator = async (file) => {
        await new Promise((r) => setTimeout(r, 10));
        if (file.size > 0) {
          return { valid: true };
        }
        return { valid: false, error: "File is empty" };
      };

      const uploader = new Uploader({ validation: asyncValidator });
      const file = createMockFile("test.txt", 100);

      const added = await uploader.addFiles([file]);

      expect(added).toHaveLength(1);
    });
  });

  describe("without validation", () => {
    it("should accept all files when no validation provided", async () => {
      const uploader = new Uploader();
      const files = [
        createMockFile("test.txt", 1),
        createMockFile("large.exe", 1000000, "application/octet-stream"),
      ];

      const added = await uploader.addFiles(files);

      expect(added).toHaveLength(2);
    });
  });
});
