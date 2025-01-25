# Promiventerator 🚀

A Promiventerator is what you'd get if a `Promise`, an `AsyncEventEmitter`, and an `AsyncIterator` got together and decided to have a baby. Handy for when you want to let the caller decide whether they just want the final result, whether they want to listen to all the events that happen along the way, or whether they want to stream events in a `for await` loop. Fully typed, too.

## Features

- 🤝 Fully Promise-compatible
- 📡 Typed event emission and handling
- 🔄 AsyncIterator interface for event streams
- 📜 Complete event history for new subscribers
- 💪 Full TypeScript support
- 🎯 Zero dependencies

## Installation

```bash
npm install promiventerator
```

## Usage

### Complete Example

```typescript
import { Promiventerator } from "promiventerator";

const pv = new Promiventerator<string, MyEvents>((resolve) => {
  setTimeout(() => pv.emit("progress", 50), 500);
  setTimeout(() => {
    pv.emit("complete");
    resolve("done");
  }, 1000);
});

// Listen to events
pv.on("progress", (value) => console.log(`event: progress`));
pv.on("complete", () => console.log("event: complete"));

// Emit events
await pv.emit("progress", 50);
await pv.emit("complete");

// Iterate over all events
for await (const [eventName, data] of pv) {
  console.log(`for loop: ${eventName}`, data);
}

// wait for the promise to finish
console.log(await pv);

// expected output:
//   event: progress 50
//   for loop: progress 50
//   for loop: complete
//   event: complete
//   done
```

## API

### Constructor

```typescript
new Promiventerator<T, Events>(executor: (resolve, reject) => void)
```

- `T`: The type of the Promise result
- `Events`: An interface describing your event types

### Methods

- `.on<K>(eventName: K, handler: EventReceiver<Events[K]>): this`

  - Add an event listener
  - Returns `this` for chaining

- `.once<K>(eventName: K, handler: EventReceiver<Events[K]>): this`

  - Add a one-time event listener
  - Returns `this` for chaining

- `.off<K>(eventName: K, handler: EventReceiver<Events[K]>): this`

  - Remove an event listener
  - Returns `this` for chaining

- `.emit<K>(eventName: K, data?: Events[K]): Promise<boolean>`

  - Emit an event with optional data
  - Returns a Promise that resolves to `true` if there were listeners

- `[Symbol.asyncIterator](): AsyncIterator<[EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]>`
  - Returns an AsyncIterator for the event stream
  - Includes all historical events

Feel free to contribute! 🎉
