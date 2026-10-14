/**
 * The site's own words: navigation, home, about and contact copy.
 *
 * Edit freely. The community's NAME and LOGO are not here: they come from the
 * platform (`getSite`), so a rename in the community dashboard shows up here
 * without a Publish. Use `{name}` in any string below for the community name.
 */

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Top navigation. Every href is either a page of THIS site (`/`, `/about`,
 * `/blog`, `/contact`, `/portal`) or an App page (`/feeds`, `/login`…) —
 * all plain links. Never point one at a path that is neither.
 */
export const NAV: NavItem[] = [
  {label: 'Home', href: '/'},
  {label: 'About', href: '/about'},
  {label: 'Blog', href: '/blog'},
  {label: 'Contact', href: '/contact'},
];

export const HOME = {
  tagline: 'Welcome to {name}',
  intro:
    'A place to learn, share and grow together. Read the latest from the blog, get in touch, or join the community.',
  features: [
    {
      title: 'Join the conversation',
      body: 'Posts, comments and events live in the community. Members get the full experience.',
    },
    {
      title: 'Read the blog',
      body: 'Stories, guides and announcements from the team, published straight from the community.',
    },
    {
      title: 'Your own space',
      body: 'Members get a portal on this site: upload files, browse who is here, and more.',
    },
  ],
};

export const ABOUT = {
  title: 'About {name}',
  lede: 'Who we are, and why this community exists.',
  sections: [
    {
      heading: 'Our story',
      body: '{name} started with a simple idea: people learn faster together. Replace this text with your own story.',
    },
    {
      heading: 'What you will find here',
      body: 'Conversations with people who share your interests, a blog with practical guides, and events you can join.',
    },
    {
      heading: 'How to take part',
      body: 'Create an account, introduce yourself, and jump into any conversation. Everyone is welcome.',
    },
  ],
};

export const CONTACT = {
  title: 'Contact',
  lede: 'Questions, ideas or partnerships: send us a message and we will get back to you.',
  success: 'Thanks! Your message has been sent.',
};

/** Fill `{name}` with the community's name. */
export function withName(text: string, name: string): string {
  return text.replaceAll('{name}', name);
}
