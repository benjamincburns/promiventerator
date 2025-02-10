/**
 * Type alias for event keys that must be strings and exist in type T
 */
export type EventKey<EventsT> = keyof EventsT;

/**
 * Type alias for event receiver functions. If T is void, the receiver takes no parameters,
 * otherwise it takes a parameter of type T. Returns void or Promise<void>.
 */
export type EventReceiver<EventPayloadT> = EventPayloadT extends void
  ? () => void | Promise<void>
  : (params: EventPayloadT) => void | Promise<void>;

/**
 * The type yielded by a Promiventerator's AsyncIterator
 */
type EventIteratorValue<EventsT> = {
  [K in keyof EventsT]: EventsT[K] extends void ? [K] : [K, EventsT[K]];
}[keyof EventsT];

/**
 * A Promise-based event emitter class that combines Promise functionality with event handling.
 * Allows for both Promise-like operations and event emission/listening.
 *
 * @typeParam ReturnT - The type of value that the Promise will resolve to
 * @typeParam EventsT - A record type describing the events and their parameter types
 *
 * @example
 * ```typescript
 * const pv = new Promiventerator<string, MyEvents>((resolve) => {
 *   setTimeout(() => pv.emit("progress", 50), 500);
 *   setTimeout(() => {
 *     pv.emit("complete");
 *     resolve("done");
 *   }, 1000);
 * });
 *
 * // Listen to events
 * pv.on("progress", (value) => console.log(`event: progress`));
 * pv.on("complete", () => console.log("event: complete"));
 *
 * // Emit events
 * await pv.emit("progress", 50);
 * await pv.emit("complete");
 *
 * // Iterate over all events
 * for await (const [eventName, data] of pv) {
 *   console.log(`for loop: ${eventName}`, data);
 * }
 *
 * // wait for the promise to finish
 * console.log(await pv);
 * ```
 */
export class Promiventerator<ReturnT, EventsT>
  extends Promise<ReturnT>
  implements AsyncIterable<EventIteratorValue<EventsT>>
{
  isDone = false;
  value?: ReturnT;

  private listeners: Map<
    EventKey<EventsT>,
    Set<{
      fn: EventReceiver<EventsT[EventKey<EventsT>]>;
      once: boolean;
    }>
  > = new Map();

  private iterators: Set<{
    push: (value: EventIteratorValue<EventsT>) => void;
    done: () => void;
  }> = new Set();

  private eventHistory: EventIteratorValue<EventsT>[] = [];

  private endResolver: (value: { value: ReturnT; done: true }) => void;
  private endPromise: Promise<{ value: ReturnT; done: true }>;

  /**
   * Gets or creates a Set of listeners for the specified event.
   *
   * @param eventName - The name of the event to get listeners for
   * @returns A Set containing the event listeners
   * @internal
   */
  private getListeners<K extends EventKey<EventsT>>(
    eventName: K
  ): Set<{
    fn: EventReceiver<EventsT[K]>;
    once: boolean;
  }> {
    let listeners = this.listeners.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(eventName, listeners);
    }
    return listeners as Set<{
      fn: EventReceiver<EventsT[K]>;
      once: boolean;
    }>;
  }

  /**
   * Creates a new Promiventerator instance.
   *
   * @param executor - The executor function that defines the Promise behavior
   */
  constructor(
    executor: (
      resolve: (value: ReturnT | PromiseLike<ReturnT>) => void,
      reject: (reason?: unknown) => void
    ) => void | Promise<void>
  ) {
    let endResolver: (value: { value: ReturnT; done: true }) => void;
    const endPromise = new Promise<{ value: ReturnT; done: true }>(
      (resolve) => {
        endResolver = resolve;
      }
    );

    super((resolve, reject) =>
      executor((value) => {
        this.endResolver({ value: value as ReturnT, done: true });
        this.isDone = true;
        this.value = value as ReturnT;
        resolve(value);
      }, reject)
    );

    // biome-ignore lint/style/noNonNullAssertion: tsc and biome are too dumb to know that it's assigned already.
    this.endResolver = endResolver!;
    this.endPromise = endPromise;
  }

  /**
   * Registers an event listener that will be called every time the specified event is emitted.
   *
   * @param eventName - The name of the event to listen for
   * @param fn - The callback function to execute when the event occurs
   * @returns The Promiventerator instance for chaining
   */
  on<K extends EventKey<EventsT>>(
    eventName: K,
    fn: EventReceiver<EventsT[K]>
  ): this {
    const listeners = this.getListeners(eventName);
    listeners.add({ fn, once: false });
    return this;
  }

  /**
   * Registers an event listener that will be called only once when the specified event is emitted.
   * After the first emission, the listener is automatically removed.
   *
   * @param eventName - The name of the event to listen for
   * @param fn - The callback function to execute when the event occurs
   * @returns The Promiventerator instance for chaining
   */
  once<K extends EventKey<EventsT>>(
    eventName: K,
    fn: EventReceiver<EventsT[K]>
  ): this {
    const listeners = this.getListeners(eventName);
    listeners.add({ fn, once: true });
    return this;
  }

  /**
   * Removes the specified event listener from the given event.
   *
   * @param eventName - The name of the event to remove the listener from
   * @param fn - The callback function to remove
   * @returns The Promiventerator instance for chaining
   */
  off<K extends EventKey<EventsT>>(
    eventName: K,
    fn: EventReceiver<EventsT[K]>
  ): this {
    const listeners = this.getListeners(eventName);
    for (const listener of listeners) {
      if (listener.fn === fn) {
        listeners.delete(listener);
      }
    }
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
    return this;
  }

  /**
   * Emits an event with optional data, triggering all registered listeners.
   *
   * @param eventName - The name of the event to emit
   * @param data - The data to pass to the event listeners (if the event type requires data)
   * @returns A Promise that resolves to true if there were any listeners, false otherwise
   */
  async emit<K extends EventKey<EventsT>>(
    eventName: EventsT[K] extends void ? K : never
  ): Promise<boolean>;
  async emit<K extends EventKey<EventsT>>(
    eventName: EventsT[K] extends void ? never : K,
    data: EventsT[K] extends void ? never : EventsT[K]
  ): Promise<boolean>;
  async emit<K extends EventKey<EventsT>>(
    eventName: K,
    data?: EventsT[K] extends void ? never : EventsT[K]
  ): Promise<boolean> {
    const eventData =
      data !== undefined
        ? ([eventName, data] as [K, EventsT[K]])
        : ([eventName] as [K]);

    this.eventHistory.push(eventData as unknown as EventIteratorValue<EventsT>);

    for (const iterator of this.iterators) {
      iterator.push(eventData as unknown as EventIteratorValue<EventsT>);
    }

    const listeners = this.getListeners(eventName);
    const promises: Promise<void>[] = [];

    for (const listener of listeners) {
      const result =
        data !== undefined
          ? (listener.fn as (params: EventsT[K]) => void | Promise<void>)(data)
          : (listener.fn as () => void | Promise<void>)();

      promises.push(Promise.resolve(result));

      if (listener.once) {
        listeners.delete(listener);
      }
    }

    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }

    await Promise.all(promises);
    return promises.length > 0;
  }

  /**
   * Implements the AsyncIterator interface, allowing the Promiventerator to be used
   * in for-await-of loops to iterate over emitted events.
   *
   * @returns An AsyncIterator that yields event tuples and resolves to the final ReturnT value
   *
   * @example
   * ```typescript
   * for await (const [eventName, data] of promiventerator) {
   *   console.log(`Event: ${eventName}, Data:`, data);
   * }
   * ```
   */
  [Symbol.asyncIterator](): AsyncIterator<
    EventIteratorValue<EventsT>,
    ReturnT
  > {
    let resolveNext:
      | ((value: IteratorResult<EventIteratorValue<EventsT>, ReturnT>) => void)
      | null = null;
    const queue: Array<EventIteratorValue<EventsT>> = [...this.eventHistory];

    const iterator = {
      push: (value: EventIteratorValue<EventsT>) => {
        if (resolveNext) {
          resolveNext({ value, done: false });
          resolveNext = null;
        } else {
          queue.push(value);
        }
      },
      done: (value?: ReturnT | PromiseLike<ReturnT>) => {
        if (resolveNext) {
          resolveNext({ value: value as ReturnT, done: true });
          resolveNext = null;
        }
      },
    };

    this.iterators.add(iterator);
    return {
      next: async () => {
        if (queue.length > 0) {
          // biome-ignore lint/style/noNonNullAssertion: queue is not empty
          const value = queue.shift()!;
          return { value, done: false };
        }

        return Promise.race([
          this.endPromise,
          new Promise<IteratorResult<EventIteratorValue<EventsT>, ReturnT>>(
            (resolve) => {
              resolveNext = resolve;
            }
          ),
        ]);
      },

      return: async (value?: ReturnT | PromiseLike<ReturnT>) => {
        this.iterators.delete(iterator);
        iterator.done(value);
        if (value !== undefined && !this.isDone) {
          this.endResolver({ value: value as ReturnT, done: true });
        }
        return this.endPromise;
      },
    };
  }
}
