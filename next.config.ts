import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Lets `next dev` use the same Cloudflare binding integration as the Worker
// adapter. It does not deploy or read Cloudflare account credentials. Avoid
// initializing Wrangler during a production Next build.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
