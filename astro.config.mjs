import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import {defineConfig} from 'astro/config';

// Pages render on request on a Cloudflare Worker. Beside them the same Worker
// serves the portal (`/portal/*`, a React app) and the Site API (`/site-api/*`,
// a Hono app). One project, one build, one dev server.
//
// No wrangler config is committed: the platform writes the deploy config at
// build time, so it can never be broken by an edit here.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // Images are shown as they are, never resized on the Worker: on-demand image
    // transforms need a Cloudflare Images binding the platform does not give a Site.
    imageService: 'passthrough',
  }),
  integrations: [react()],
  // Sessions need a KV binding the platform does not give a Site either; with
  // them on, any `Astro.session` call would fail at request time.
  session: false,
});
