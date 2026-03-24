import { describe, it, expect, vi, beforeEach } from "vitest";
import { Emitter } from "../src/events";

describe("Emitter", () => {
  let emitter: Emitter<{ test: string; numeric: number }>;

  beforeEach(() => {
    emitter = new Emitter();
  });

  describe("on()", () => {
    it("should register event listener", () => {
      const fn = vi.fn();
      emitter.on("test", fn);
      emitter.emit("test", "hello");

      expect(fn).toHaveBeenCalledWith("hello");
    });

    it("should allow multiple listeners for same event", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      emitter.on("test", fn1);
      emitter.on("test", fn2);
      emitter.emit("test", "hello");

      expect(fn1).toHaveBeenCalledWith("hello");
      expect(fn2).toHaveBeenCalledWith("hello");
    });

    it("should return unsubscribe function", () => {
      const fn = vi.fn();
      const unsubscribe = emitter.on("test", fn);
      unsubscribe();
      emitter.emit("test", "hello");

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("once()", () => {
    it("should fire listener only once", () => {
      const fn = vi.fn();
      emitter.once("test", fn);
      emitter.emit("test", "first");
      emitter.emit("test", "second");

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("first");
    });

    it("should return unsubscribe function", () => {
      const fn = vi.fn();
      const unsubscribe = emitter.once("test", fn);
      unsubscribe();
      emitter.emit("test", "hello");

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("off()", () => {
    it("should remove specific listener", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      emitter.on("test", fn1);
      emitter.on("test", fn2);
      emitter.off("test", fn1);
      emitter.emit("test", "hello");

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledWith("hello");
    });

    it("should handle off for non-existent event", () => {
      expect(() => emitter.off("test", vi.fn())).not.toThrow();
    });
  });

  describe("emit()", () => {
    it("should pass payload to all listeners", () => {
      const received: string[] = [];
      emitter.on("test", (v) => received.push(v));
      emitter.on("test", (v) => received.push(v + "!"));
      emitter.emit("test", "hello");

      expect(received).toEqual(["hello", "hello!"]);
    });

    it("should handle emitting to event with no listeners", () => {
      expect(() => emitter.emit("test", "hello")).not.toThrow();
    });

    it("should work with different event types", () => {
      const stringFn = vi.fn();
      const numFn = vi.fn();
      emitter.on("test", stringFn);
      emitter.on("numeric", numFn);
      emitter.emit("test", "hello");
      emitter.emit("numeric", 42);

      expect(stringFn).toHaveBeenCalledWith("hello");
      expect(numFn).toHaveBeenCalledWith(42);
    });
  });
});
