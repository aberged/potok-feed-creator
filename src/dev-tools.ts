import './dev-theme.css';
import { encodePost } from './post';
import type { PotokChild, PotokOwnGroup } from './potok';
import { templateOf, type TemplateId } from './templates';

// Dev only (main.ts imports it in its DEV block). Fills what potok-dev.ts reads
// for `listChildren` and `getGroup` (localStorage `potok-dev:children` and
// `potok-dev:group`):
// - `?seed`: posts in every state, with a group that is set up right;
// - `?seed=empty`: no posts;
// - `?seed=setup`: the same posts, in a group that is set up wrong;
// - `?seed=viewer`: a viewer who may not edit the group.
//
// Without `?seed` the store stays as it is, so saved posts survive a reload.
// `?seed` runs on every load, so each URL always shows the same thing.

const CHILDREN_STORAGE_KEY = 'potok-dev:children';
const GROUP_STORAGE_KEY = 'potok-dev:group';

const picture = (id: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="hsl(${(id * 47) % 360} 60% 55%)"/></svg>`,
  )}`;

function child(id: number, template: TemplateId, flags: Partial<PotokChild>): PotokChild {
  const { name, description, descriptionFormat } = encodePost({ template, fields: templateOf(template).sample });

  return {
    id,
    name,
    description,
    description_format: descriptionFormat,
    description_html: description,
    app_description: null,
    uses_api: false,
    picture_url: picture(id),
    is_public: false,
    inherits_members: true,
    creator_id: 1,
    inserted_at: `2026-11-0${id % 9 || 1}T08:00:00Z`,
    published_at: null,
    last_value_at: null,
    comment_count: 0,
    reactions: [],
    can_react: true,
    can_edit: true,
    member_count: 5,
    updated_at: '2026-11-05T08:00:00Z',
    ...flags,
  };
}

const children = (): PotokChild[] => [
  child(1, 'notice', { is_public: true }),
  child(2, 'quote', {}),
  child(3, 'article', { inherits_members: false, member_count: 1 }),
  child(4, 'event', { is_public: true }),
  child(5, 'question', { is_public: true, inherits_members: false, member_count: 1 }),
  child(6, 'list', { can_edit: false, description: null }),
  {
    ...child(7, 'text', {}),
    name: 'Vest koja je aplikacija',
    description: null,
    description_html: null,
    app_description: 'Mala igra za dvoje.',
    uses_api: true,
    can_edit: false,
  },
  {
    ...child(8, 'quote', {}),
    name: 'Promenjena ručno',
    description: `${child(8, 'quote', {}).description}<p>Dodato ručno.</p>`,
  },
];

const parent = { id: 90, name: 'Vesti', is_public: true, uses_api: true };

const setUp: Partial<PotokOwnGroup> = { name: '.feed', parent, is_public: true, inherits_members: true };

const groups: Record<string, Partial<PotokOwnGroup>> = {
  setup: {
    name: 'vesti',
    parent,
    is_public: false,
    inherits_members: false,
    everyone_creates_subgroups: true,
  },
  viewer: { ...setUp, can_manage_children: false, can_create_children: false },
};

export function seedDevCreator() {
  const seed = new URLSearchParams(location.search).get('seed');
  if (seed === null) return;

  localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(groups[seed] ?? setUp));
  localStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(seed === 'empty' ? [] : children()));
}
