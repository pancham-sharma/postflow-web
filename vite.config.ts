// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { resolve as resolveProjectPath, sep } from "node:path";
import { loadEnv, type Plugin } from "vite";

const projectRoot = resolveProjectPath(process.cwd());
const mcpRoutesDir = resolveProjectPath(projectRoot, "src/routes");
const projectRootPrefix = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;

if (mcpRoutesDir !== projectRoot && !mcpRoutesDir.startsWith(projectRootPrefix)) {
  throw new Error("MCP routes directory must remain inside the project root.");
}

/**
 * @lovable.dev/mcp-js compares resolved paths using the platform separator.
 * Vite normalizes config.root to forward slashes on Windows, so let the MCP
 * plugin resolve against the native root for its containment check and then
 * restore Vite's normalized value for every other plugin.
 */
function mcpPluginWithPortableRoutes(): Plugin {
  const plugin = mcpPlugin({ routesDir: mcpRoutesDir });
  const configResolved =
    typeof plugin.configResolved === "function" ? plugin.configResolved : undefined;
  if (!configResolved) return plugin;

  return {
    ...plugin,
    configResolved(config) {
      if (process.platform !== "win32") return configResolved(config);

      const normalizedRoot = config.root;
      config.root = projectRoot;
      try {
        return configResolved(config);
      } finally {
        config.root = normalizedRoot;
      }
    },
  };
}

// Vite exposes only VITE_* values to application modules. That is correct for
// the browser, but local TanStack server functions also need the same backend
// secrets that Lovable injects at runtime in deployed environments. Load an
// explicit server-only allowlist into process.env during local dev/build; none
// of these values are added to Vite's client-side `define` map.
const SERVER_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "POSTFLOW_APP_URL",
  "POSTFLOW_TOKEN_ENCRYPTION_KEY",
  "SOCIAL_TOKEN_ENC_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "LOVABLE_API_KEY",
  "YOUTUBE_OAUTH_CLIENT_ID",
  "YOUTUBE_OAUTH_CLIENT_SECRET",
  "YOUTUBE_REDIRECT_URI",
  "META_OAUTH_CLIENT_ID",
  "META_OAUTH_CLIENT_SECRET",
  "FACEBOOK_CONFIGURATION_ID",
  "FACEBOOK_REDIRECT_URI",
  "META_PAGES_MANAGE_POSTS_AVAILABLE",
  "INSTAGRAM_OAUTH_CLIENT_ID",
  "INSTAGRAM_OAUTH_CLIENT_SECRET",
  "INSTAGRAM_REDIRECT_URI",
  "PINTEREST_OAUTH_CLIENT_ID",
  "PINTEREST_OAUTH_CLIENT_SECRET",
  "PINTEREST_REDIRECT_URI",
  "SNAPCHAT_OAUTH_CLIENT_ID",
  "SNAPCHAT_OAUTH_CLIENT_SECRET",
  "SNAPCHAT_OAUTH_PUBLIC_CLIENT_ID",
  "SNAPCHAT_REDIRECT_URI",
  "SNAPCHAT_PUBLIC_PROFILE_CLIENT_ID",
  "SNAPCHAT_PUBLIC_PROFILE_CLIENT_SECRET",
  "SNAPCHAT_PUBLIC_PROFILE_REDIRECT_URI",
  "SNAPCHAT_PP_API_BASE",
  "MEDIA_PROCESSOR_URL",
  "MEDIA_PROCESSOR_TOKEN",
] as const;

function localServerEnv(): Plugin {
  return {
    name: "postflow-local-server-env",
    enforce: "pre",
    config(_config, env) {
      const loaded = loadEnv(env.mode, process.cwd(), "");
      for (const key of SERVER_ENV_KEYS) {
        if (!process.env[key] && loaded[key]) process.env[key] = loaded[key];
      }
    },
  };
}

function configuredPublicAppUrl(): string {
  // POSTFLOW_APP_URL is a public origin, but it is intentionally not exposed
  // through Vite's normal env prefix. Read it here and project only its
  // normalized origin into the browser bundle.
  const loaded = loadEnv("development", process.cwd(), "");
  const raw = (process.env["POSTFLOW_APP_URL"] ?? loaded["POSTFLOW_APP_URL"] ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export default defineConfig({
  // Render runs this as a Node web service. Lovable's own build still forces
  // its Cloudflare target internally, so this preserves Lovable deployment
  // behavior while producing a runnable Node SSR entry for Render.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // POSTFLOW_APP_URL is a public origin, not a credential. Expose only its
    // normalized origin so browser OAuth can use the deployment URL without
    // adding a second environment variable or embedding a production URL.
    define: {
      "import.meta.env.VITE_POSTFLOW_APP_URL": JSON.stringify(configuredPublicAppUrl()),
    },
    plugins: [localServerEnv(), mcpPluginWithPortableRoutes()],
  },
});
