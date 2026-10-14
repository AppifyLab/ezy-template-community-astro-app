import {getSite, type Site} from '../lib/api';
import {getViewer, type Viewer} from './viewer';

/**
 * What every page needs: the community's brand and the visitor, fetched in
 * parallel on the server. Call it at the top of a page's frontmatter:
 *
 *   const {site, viewer} = await pageContext(Astro.request, Astro.response);
 *
 * The page now depends on the visitor's cookies, so it is marked private:
 * no shared cache may keep one visitor's page and serve it to another.
 */
export async function pageContext(
  request: Request,
  response: {headers: Headers}
): Promise<{site: Site | null; viewer: Viewer}> {
  const [site, viewer] = await Promise.all([getSite(new URL(request.url)), getViewer(request)]);
  response.headers.set('Cache-Control', 'private, no-store');
  return {site, viewer};
}
