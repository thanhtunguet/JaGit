import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  noExternal: [/^@jagit\//],
  clean: true,
  dts: false,
  splitting: false,
  shims: false,
});
