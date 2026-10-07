export function listenForParameterMessages(target, { expectedOrigin, expectedSource, handlers }) {
  const onMessage = (event) => {
    if (event.origin !== expectedOrigin || event.source !== expectedSource) return;
    const handler = handlers[event.data?.type];
    if (typeof handler === 'function') handler(event.data);
  };
  target.addEventListener('message', onMessage);
  return () => target.removeEventListener('message', onMessage);
}

export function postParameterMessage(target, targetOrigin, type, parameters) {
  const message = parameters === undefined ? { type } : { type, parameters };
  target.postMessage(message, targetOrigin);
}
