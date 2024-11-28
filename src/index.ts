type EventKey<T> = string & keyof T;
type EventReceiver<T> = T extends void
  ? () => void | Promise<void>
  : (params: T) => void | Promise<void>;

class Promiventerator<T, Events = Record<string, unknown>> extends Promise<T> {
  private listeners: Map<
    EventKey<Events>,
    Set<{
      fn: EventReceiver<Events[EventKey<Events>]>;
      once: boolean;
    }>
  > = new Map();

  private iterators: Set<{
    push: (
      value: [EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>],
    ) => void;
    done: () => void;
  }> = new Set();

  private eventHistory: Array<
    [EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]
  > = [];

  private endResolver: (value: { value: undefined, done: true }) => void;
  private endPromise: Promise<{ value: undefined, done: true }>;

  private getListeners<K extends EventKey<Events>>(
    eventName: K,
  ): Set<{
    fn: EventReceiver<Events[K]>;
    once: boolean;
  }> {
    let listeners = this.listeners.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(eventName, listeners);
    }
    return listeners as Set<{
      fn: EventReceiver<Events[K]>;
      once: boolean;
    }>;
  }
  
  constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: unknown) => void) => void) {
    let endResolver: (value: { value: undefined; done: true }) => void;
    const endPromise = new Promise<{ value: undefined; done: true }>((resolve) => {
      endResolver = resolve;
    });

    super((resolve, reject) =>
      executor((value) => {
        this.endResolver({ value: undefined, done: true });
        resolve(value);
      }, reject)
    );
    
    // biome-ignore lint/style/noNonNullAssertion: tsc and biome are too dumb to know that it's assigned already.
    this.endResolver = endResolver!;
    this.endPromise = endPromise;
  }

  on<K extends EventKey<Events>>(
    eventName: K,
    fn: EventReceiver<Events[K]>,
  ): this {
    const listeners = this.getListeners(eventName);
    listeners.add({ fn, once: false });
    return this;
  }

  once<K extends EventKey<Events>>(
    eventName: K,
    fn: EventReceiver<Events[K]>,
  ): this {
    const listeners = this.getListeners(eventName);
    listeners.add({ fn, once: true });
    return this;
  }

  off<K extends EventKey<Events>>(
    eventName: K,
    fn: EventReceiver<Events[K]>,
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

  async emit<K extends EventKey<Events>>(
    eventName: Events[K] extends void ? K : never,
  ): Promise<boolean>;
  async emit<K extends EventKey<Events>>(
    eventName: Events[K] extends void ? never : K,
    data: Events[K] extends void ? never : Events[K],
  ): Promise<boolean>;
  async emit<K extends EventKey<Events>>(
    eventName: K,
    data?: Events[K] extends void ? never : Events[K],
  ): Promise<boolean> {
    const eventData =
      data !== undefined
        ? ([eventName, data] as [K, Events[K]])
        : ([eventName] as [K]);

    this.eventHistory.push(eventData);

    for (const iterator of this.iterators) {
      iterator.push(eventData);
    }

    const listeners = this.getListeners(eventName);
    const promises: Promise<void>[] = [];

    for (const listener of listeners) {
      const result = data !== undefined
        ? (listener.fn as (params: Events[K]) => void | Promise<void>)(data)
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

  iterate(): AsyncIterator<
    [EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]
  > {
    let resolveNext:
      | ((
          value: IteratorResult<
            [EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]
          >,
        ) => void)
      | null = null;
    const queue: Array<
      [EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]
    > = [...this.eventHistory];

    const iterator = {
      push: (
        value:
          | [EventKey<Events>, Events[EventKey<Events>]]
          | [EventKey<Events>],
      ) => {
        if (resolveNext) {
          resolveNext({ value, done: false });
          resolveNext = null;
        } else {
          queue.push(value);
        }
      },
      done: () => {
        if (resolveNext) {
          resolveNext({ value: undefined, done: true });
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
          new Promise<IteratorResult<[EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]>>((resolve) => {
            resolveNext = resolve;
          }),
        ]);
      },

      return: async () => {
        this.iterators.delete(iterator);
        iterator.done();
        return { value: undefined, done: true };
      },
    };
  }
}

export { Promiventerator };
