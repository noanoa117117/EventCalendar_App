import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep the default dummy cache overrides: this app currently has no ISR/R2
// requirement. The adapter uses a Cloudflare Edge wrapper for middleware and a
// Cloudflare Node-compat wrapper for the application server.
export default defineCloudflareConfig();
