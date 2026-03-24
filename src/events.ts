type Callback<T> = (payload: T) => void;

export class Emitter<TEvents extends Record<string, unknown>> {
  private events: Partial<{ [K in keyof TEvents]: Callback<TEvents[K]>[] }> =
    {};

  on<K extends keyof TEvents>(event: K, cb: Callback<TEvents[K]>): () => void {
    if (!this.events[event]) this.events[event] = [];
    this.events[event]!.push(cb);
    return () => this.off(event, cb);
  }

  once<K extends keyof TEvents>(
    event: K,
    cb: Callback<TEvents[K]>,
  ): () => void {
    const wrapper: Callback<TEvents[K]> = (payload) => {
      cb(payload);
      this.off(event, wrapper);
    };
    if (!this.events[event]) this.events[event] = [];
    this.events[event]!.push(wrapper);
    return () => this.off(event, wrapper);
  }

  off<K extends keyof TEvents>(event: K, cb: Callback<TEvents[K]>) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event]!.filter((c) => c !== cb);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
    this.events[event]?.forEach((cb) => cb(payload));
  }
}
