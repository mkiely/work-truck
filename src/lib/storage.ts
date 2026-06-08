// A tiny localStorage-shaped store, domain-agnostic. It stores opaque JSON under
// string keys — it knows nothing about releases, sprints, items, or any connector's
// data. Connectors that want a stateful dev backend (read + write that survives across
// requests within a process) build on top of this; see src/connectors/acme.
//
// The shape deliberately mirrors the browser's `Storage` interface so the seam reads
// the same on both sides of the contract and could later be swapped for a durable
// backing (a file, a real KV) without touching callers.

/** The subset of the Web Storage API we depend on. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory `KeyValueStorage`, backed by a Map. Resets when the process restarts. */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** A typed view over one key in a {@link KeyValueStorage}: read/write/reset of a `T`. */
export interface NamespacedStore<T> {
  /** Current value; lazily seeds (and persists) the seed on first read. */
  read(): T;
  /** Replace the stored value. */
  write(value: T): void;
  /** Restore the value to a fresh copy of the seed. */
  reset(): T;
}

/**
 * Bind one JSON-serializable value of type `T` to `key` in `storage`, seeding it from
 * `seed()` the first time it's read (or after {@link NamespacedStore.reset}). `seed` is
 * a factory so each seed is an independent copy — never a shared mutable reference.
 */
export function namespacedStore<T>(
  storage: KeyValueStorage,
  key: string,
  seed: () => T,
): NamespacedStore<T> {
  const write = (value: T): void => {
    storage.setItem(key, JSON.stringify(value));
  };

  const read = (): T => {
    const raw = storage.getItem(key);
    if (raw === null) {
      const seeded = seed();
      write(seeded);
      return seeded;
    }
    return JSON.parse(raw) as T;
  };

  const reset = (): T => {
    const seeded = seed();
    write(seeded);
    return seeded;
  };

  return { read, write, reset };
}
