import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks its file loading.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at startup, not imported, so tracing must be told to ship them.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
};

export default nextConfig;
