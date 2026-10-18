// Tiny bounded memo for hot, pure numeric helpers (roughness, voice-leading cost). Framework-free.
export class LruMemo<V> {
  private map = new Map<string, V>();
  constructor(private cap = 2000) {}
  get(key: string, make: () => V): V {
    const hit = this.map.get(key);
    if (hit !== undefined) {
      // refresh recency
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const v = make();
    this.map.set(key, v);
    if (this.map.size > this.cap) this.map.delete(this.map.keys().next().value as string);
    return v;
  }
  get size(): number { return this.map.size; }
}
