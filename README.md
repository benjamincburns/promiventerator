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

### Basic Usage

```typescript
import { Promiventerator } from 'promiventerator';

// Define your event types
interface MyEvents {
  progress: number;      // event with data
  complete: void;        // event without data
  data: { value: string };  // complex data
}

// Create a Promiventerator instance
const pv = new Promiventerator<string, MyEvents>((resolve) => {
  setTimeout(() => resolve('done'), 1000);
});

// Listen to events
pv.on('progress', (value) => console.log(`Progress: ${value}%`));
pv.on('complete', () => console.log('Finished!'));

// Emit events
await pv.emit('progress', 50);
await pv.emit('complete');

// Use as a Promise
const result = await pv; // 'done'
```

### Using the Iterator Interface

```typescript
const pv = new Promiventerator<string, MyEvents>(resolve => {
  setTimeout(() => resolve('done'), 1000);
});

// Iterate over all events
for await (const [eventName, data] of { [Symbol.asyncIterator]: () => pv.iterate() }) {
  console.log(`Event: ${eventName}`, data);
}
```

### Type Safety

The Promiventerator provides full type safety for your events:

```typescript
interface MyEvents {
  progress: number;
  complete: void;
}

const pv = new Promiventerator<string, MyEvents>(resolve => {
  resolve('done');
});

await pv.emit('progress', 50);     // ✅ OK
await pv.emit('complete');         // ✅ OK
await pv.emit('complete', 123);    // ❌ Type error
await pv.emit('progress');         // ❌ Type error
await pv.emit('unknown', {});      // ❌ Type error
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

- `.iterate(): AsyncIterator<[EventKey<Events>, Events[EventKey<Events>]] | [EventKey<Events>]>`
  - Returns an AsyncIterator for the event stream
  - Includes all historical events

Feel free to contribute! 🎉 
