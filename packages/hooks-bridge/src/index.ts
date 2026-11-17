// Public entry of @control-center/hooks-bridge for the main process: the protocol, the pipe
// server and the client (used by the hook script and the tests). The hook script is `bin.ts`.
export * from './protocol.ts';
export { createBridgeServer, type BridgeServer, type BridgeServerOptions } from './server.ts';
export { sendHookEvent, type DeliveryResult } from './client.ts';
