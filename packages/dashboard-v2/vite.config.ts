import { defineConfig as lovableConfig } from "@lovable.dev/vite-tanstack-config";

export default async (env: any) => {
  const config = await lovableConfig({
    vite: {
      resolve: {
        tsconfigPaths: true,
      },
      server: {
        proxy: {
          "/api": {
            target: "http://localhost:3000",
            changeOrigin: true,
          },
        },
      },
    },
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
  })(env);

  // The wrapper automatically injects `vite-tsconfig-paths` which triggers a Vite 6 warning.
  // We filter it out here since we enabled native resolution via `resolve.tsconfigPaths`.
  const removeTsConfigPaths = (plugins: any): any => {
    if (!plugins) return plugins;
    if (Array.isArray(plugins)) {
      return plugins.map(removeTsConfigPaths).filter(Boolean);
    }
    if (plugins.name === "vite-tsconfig-paths") {
      return null;
    }
    return plugins;
  };

  if (config.plugins) {
    config.plugins = removeTsConfigPaths(config.plugins);
  }

  return config;
};
