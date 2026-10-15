import type {Abilities, Site, Viewer} from '../lib/types';
import {backend, read} from './backend';
import {GUEST} from '../platform/viewer';

/**
 * What every page needs, from the Site API in-process: the community's brand,
 * the visitor and what they may do here. Call it first in a page's frontmatter:
 *
 *   const {api, site, viewer, abilities} = await pageContext(Astro.request, Astro.response);
 *
 * `api` is the in-process Site API client for the page's own reads. The page
 * now depends on the visitor's cookies, so it is marked private: no shared
 * cache may keep one visitor's page and serve it to another.
 */
export async function pageContext(request: Request, response: {headers: Headers}) {
  const api = backend(request);
  const [brand, me] = await Promise.all([
    read<{site: Site | null}>(api.site.$get()),
    read<{viewer: Viewer; abilities: Abilities}>(api.me.$get()),
  ]);
  response.headers.set('Cache-Control', 'private, no-store');
  return {
    api,
    site: brand?.site ?? null,
    viewer: me?.viewer ?? GUEST,
    abilities: me?.abilities ?? {manageJobs: false},
  };
}

/**
 * What a PRERENDERED page needs (`export const prerender = true`): the brand
 * only, read once at BUILD time (the platform gives the Build the community's
 * origin). There is no visitor at build time: the page renders signed out and
 * passes `isStatic` to `<Base>`, which fills the visitor in, in the browser.
 *
 *   export const prerender = true;
 *   const {api, site, viewer} = await staticContext(Astro.request);
 */
export async function staticContext(request: Request) {
  const api = backend(request);
  const brand = await read<{site: Site | null}>(api.site.$get());
  return {api, site: brand?.site ?? null, viewer: GUEST};
}
