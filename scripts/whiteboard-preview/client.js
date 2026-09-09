export function createClient() {
  return {
    channel(name) {
      const bus = new BroadcastChannel(name), listeners = [];
      const room = {
        on(type, config, callback) { listeners.push({ type, config, callback }); return room; },
        subscribe(callback) { setTimeout(() => callback("SUBSCRIBED"), 50); return room; },
        send(message) { bus.postMessage(message); return Promise.resolve("ok"); },
        track(payload) { localStorage.setItem(`board-member:${payload.id}`, JSON.stringify(payload)); listeners.filter((x) => x.type === "presence").forEach((x) => x.callback()); return Promise.resolve("ok"); },
        presenceState() { return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("board-member:")).map((k) => [k, [JSON.parse(localStorage.getItem(k))]])); },
        unsubscribe() { bus.close(); return Promise.resolve(); },
      };
      bus.onmessage = ({ data }) => listeners.filter((x) => x.type === "broadcast" && x.config.event === data.event).forEach((x) => x.callback({ payload: data.payload }));
      return room;
    },
    removeChannel(channel) { return channel.unsubscribe(); },
  };
}
