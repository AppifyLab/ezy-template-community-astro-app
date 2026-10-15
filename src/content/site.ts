/**
 * The site's own words: navigation, home and about copy.
 *
 * Edit freely. The community's NAME and LOGO are not here: they come from the
 * platform (`GET /site-api/site`), so a rename in the community dashboard shows up here
 * without a Publish. Use `{name}` in any string below for the community name.
 */

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Top navigation. Every href is either a page of THIS site (`/`, `/blog`,
 * `/jobs`, `/about`, `/portal`) or an App page (`/feeds`, `/login`…) —
 * all plain links. Never point one at a path that is neither.
 */
export const NAV: NavItem[] = [
  {label: 'Home', href: '/'},
  {label: 'Blog', href: '/blog'},
  {label: 'Jobs', href: '/jobs'},
  {label: 'About', href: '/about'},
];

/** The home page, top to bottom. Each block is one section; reorder or drop freely. */
export const HOME = {
  hero: {
    eyebrow: 'Welcome to {name}',
    title: 'Learn, share and grow together',
    body: 'A community for people who want to get better at what they do. Read the blog, find your next role, and join the conversation.',
  },
  features: {
    title: 'What you get',
    items: [
      {
        title: 'Real conversations',
        body: 'Ask questions, share wins and get feedback from people who have been there.',
      },
      {
        title: 'Practical guides',
        body: 'Stories and how-tos on the blog, written by members and the team.',
      },
      {
        title: 'Opportunities',
        body: 'Roles shared with the community first, on the job board.',
      },
    ],
  },
  quote: {
    text: 'I joined for the advice and stayed for the people. The best decision I made this year.',
    author: 'A happy member',
  },
  cta: {
    title: 'Ready to join {name}?',
    body: 'It takes a minute, and it is free to start.',
  },
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

/** Fill `{name}` with the community's name. */
export function withName(text: string, name: string): string {
  return text.replaceAll('{name}', name);
}
