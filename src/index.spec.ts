import { describe, it, expect, vi, beforeEach } from "vitest";
import { Promiventerator } from "./index.js";

interface TestEvents {
  progress: number;
  // biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
  complete: void;
  data: { value: string };
  resolve: string;
  reject: Error;
}

describe("Promiventerator", () => {
  let pv: Promiventerator<string, TestEvents>;

  beforeEach(() => {
    pv = new Promiventerator((resolve) => {
      setTimeout(() => resolve("done"), 50);
    });
  });

  describe("Promise functionality", () => {
    it("should work as a regular promise", async () => {
      const result = await pv;
      expect(result).toBe("done");
    });

    it("should handle promise rejection", async () => {
      const errorPv = new Promiventerator<string, TestEvents>((_, reject) => {
        reject(new Error("test error"));
      });

      await expect(errorPv).rejects.toThrow("test error");
    });
  });

  describe("Event emitter functionality", () => {
    it("should handle events with data", async () => {
      const handler = vi.fn();
      pv.on("progress", handler);

      await pv.emit("progress", 50);
      expect(handler).toHaveBeenCalledWith(50);
    });

    it("should handle events without data", async () => {
      const handler = vi.fn();
      pv.on("complete", handler);

      await pv.emit("complete");
      expect(handler).toHaveBeenCalledWith();
    });

    it("should handle multiple event listeners", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      pv.on("progress", handler1);
      pv.on("progress", handler2);

      await pv.emit("progress", 75);

      expect(handler1).toHaveBeenCalledWith(75);
      expect(handler2).toHaveBeenCalledWith(75);
    });

    it("should handle async event handlers", async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const results: number[] = [];

      pv.on("progress", async (value) => {
        await delay(10);
        results.push(value);
      });

      await pv.emit("progress", 25);
      expect(results).toContain(25);
    });

    it("should handle once listeners", async () => {
      const handler = vi.fn();
      pv.once("progress", handler);

      await pv.emit("progress", 30);
      await pv.emit("progress", 60);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(30);
    });

    it("should handle off (removeListener)", async () => {
      const handler = vi.fn();
      pv.on("progress", handler);
      pv.off("progress", handler);

      await pv.emit("progress", 45);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Iterator functionality", () => {
    it("should iterate over emitted events", async () => {
      const events: Array<[keyof TestEvents, unknown]> = [];

      await pv.emit("progress", 50);
      await pv.emit("complete");

      for await (const event of pv) {
        events.push(event as [keyof TestEvents, unknown]);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(["progress", 50]);
      expect(events[1]).toEqual(["complete"]);
    });

    it("should handle multiple iterators", async () => {
      const iterator1 = pv[Symbol.asyncIterator]();
      const iterator2 = pv[Symbol.asyncIterator]();

      const result1 = iterator1.next();
      const result2 = iterator2.next();

      await pv.emit("progress", 100);

      const value1 = await result1;
      const value2 = await result2;

      expect(value1.value).toEqual(["progress", 100]);
      expect(value2.value).toEqual(["progress", 100]);
    });

    it("should clean up iterator on return", async () => {
      const iterator = pv[Symbol.asyncIterator]();
      await iterator.return?.();

      const handler = vi.fn();
      pv.on("progress", handler);
      await pv.emit("progress", 90);

      expect(handler).toHaveBeenCalled();
      const nextResult = await iterator.next();
      expect(nextResult.done).toBe(true);
      expect(await nextResult.value).toStrictEqual("done");
    });

    it("should provide all historical events to new iterators", async () => {
      // Emit some events before creating the iterator
      await pv.emit("progress", 25);
      await pv.emit("complete");
      await pv.emit("progress", 50);

      // Create iterator after events were emitted
      const iterator = pv[Symbol.asyncIterator]();
      const events: Array<[keyof TestEvents, unknown]> = [];

      // Collect first 3 events
      for (let i = 0; i < 3; i++) {
        const result = await iterator.next();
        if (!result.done) {
          events.push(result.value as [keyof TestEvents, unknown]);
        }
      }

      // Verify we got all historical events in order
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual(["progress", 25]);
      expect(events[1]).toEqual(["complete"]);
      expect(events[2]).toEqual(["progress", 50]);

      // Verify we still get new events
      const nextPromise = iterator.next();
      await pv.emit("progress", 75);
      const result = await nextPromise;
      expect(result.value).toEqual(["progress", 75]);
    });
  });

  describe("Type safety", () => {
    it("should not allow emitting void events with data", async () => {
      // @ts-expect-error - complete is a void event
      await pv.emit("complete", 123);
    });

    it("should not allow emitting data events without data", async () => {
      // @ts-expect-error - progress expects data
      await pv.emit("progress");
    });

    it("should handle complex event data", async () => {
      const handler = vi.fn();
      pv.on("data", handler);

      await pv.emit("data", { value: "test" });
      expect(handler).toHaveBeenCalledWith({ value: "test" });
    });
  });

  it("should work with the README example", async () => {
    interface MyEvents {
      progress: number; // event with data
      complete: void; // event without data
      data: { value: string }; // complex data
    }

    const consoleLog = vi.fn();

    const pv = new Promiventerator<string, MyEvents>((resolve) => {
      setTimeout(() => pv.emit("progress", 50), 500);
      setTimeout(() => {
        pv.emit("complete");
        resolve("done");
      }, 1000);
    });

    // Listen to events
    pv.once("progress", (value) => consoleLog(`event: progress ${value}`));
    pv.once("complete", () => consoleLog("event: complete"));

    // Iterate over all events
    for await (const [eventName, data] of pv) {
      if (eventName === "progress") {
        consoleLog(`for loop: ${eventName} ${data}`);
      } else {
        consoleLog(`for loop: ${eventName}`);
      }
    }

    // wait for the promise to finish
    consoleLog(await pv);

    expect(consoleLog).toHaveBeenCalledTimes(5);
    expect(consoleLog.mock.calls.map((call) => call[0])).toEqual([
      "event: progress 50",
      "for loop: progress 50",
      "event: complete",
      "for loop: complete",
      "done",
    ]);
  });
});
