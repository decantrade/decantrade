import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Enables Cloudflare bindings (env vars, etc.) when running `next dev`.
// No-op outside of the OpenNext Cloudflare context.
initOpenNextCloudflareForDev();
