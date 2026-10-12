import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {createRouter, RouterProvider} from '@tanstack/react-router';

import {routeTree} from './routes';

/**
 * The portal: rendered ONLY in the browser (`client:only="react"`) by
 * `src/pages/portal/[...path].astro`, which answers every `/portal/*` URL, so
 * deep links and reloads work. Move it by changing `basepath` and that page's
 * folder together — never under a path the community app owns.
 */
const queryClient = new QueryClient({defaultOptions: {queries: {retry: 1}}});

const router = createRouter({routeTree, basepath: '/portal'});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default function PortalApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
