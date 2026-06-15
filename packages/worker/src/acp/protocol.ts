import { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";

export interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export function createWriter(stream: Writable) {
  return (msg: JsonRpcMessage) => {
    stream.write(JSON.stringify(msg) + "\n");
  };
}

export function createReader(stream: Readable, onMessage: (msg: JsonRpcMessage) => void) {
  const rl = createInterface({ input: stream });
  rl.on("line", (line) => {
    try { onMessage(JSON.parse(line) as JsonRpcMessage); } catch { /* ignore malformed */ }
  });
  return rl;
}
