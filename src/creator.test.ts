import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_DELAY_MS,
  createCreator,
  groupImageAddress,
  missingOf,
  NOTICE_MS,
  PAGE_SIZE,
  PREVIEW_DELAY_MS,
  UNSAVED_KEY,
  type CreatorState,
} from './creator';
import { encodePost, hashOf } from './post';
import type { PotokChild, PotokOwnGroup, PotokSdk, PotokSubgroup, PotokTemplate } from './potok';
import { WAITING_IMAGE } from './templates';

/** A template of a group above `.feed`, as `listTemplates` gives it. */
const MATCH: PotokTemplate = {
  id: 'custom:7',
  name: 'Utakmica',
  purpose: 'Rezultat i strelci.',
  rev: 2,
  own: false,
  owner: 'Liga',
  thumbnail: '<h2>Domaćin</h2>',
  fields: [
    { key: 'domacin', label: 'Domaćin', kind: 'text', required: true, hint: '', options: [] },
    { key: 'ishod', label: 'Ishod', kind: 'choice', required: false, hint: '', options: ['pobeda', 'poraz'] },
    { key: 'strelci', label: 'Strelci', kind: 'items', required: false, hint: '', options: [] },
    { key: 'slika', label: 'Slika', kind: 'image', required: false, hint: '', options: [] },
    { key: 'galerija', label: 'Galerija', kind: 'pictures', required: false, hint: '', options: [], captions: 'galerija_captions' },
    { key: 'snimak', label: 'Snimak', kind: 'video', required: false, hint: '', options: [] },
  ],
};

/** What Potok writes for a group's own template: its marker and HTML. */
function customDescription(id: string, fields: Record<string, string | string[]>) {
  const html = `<h2>${String(fields.domacin ?? '')}</h2>`;
  const marker = JSON.stringify({ v: 1, template: id, rev: 2, fields, hash: hashOf(html) });
  return `<!--potok-post ${marker}-->\n${html}`;
}

/** What `shrinkImage` makes of any file here, as tests have no canvas. */
const SHRUNK = 'data:image/jpeg;base64,AAAA';

vi.mock('./image', async (original) => ({
  ...(await original<typeof import('./image')>()),
  shrinkImage: vi.fn(async () => SHRUNK),
}));

const own: PotokOwnGroup = {
  id: 2,
  name: '.feed',
  is_public: false,
  inherits_members: true,
  parent: { id: 1, name: 'Vesti', is_public: false, uses_api: true },
  can_manage_children: true,
  can_create_children: true,
  everyone_creates_subgroups: false,
  can_start_polls: false,
  signed_in: true,
};

function child(id: number, patch: Partial<PotokChild> = {}): PotokChild {
  const { name, description, descriptionFormat } = encodePost({
    template: 'quote',
    fields: { quote: `Citat ${id}` },
  });

  return {
    id,
    name,
    description,
    description_format: descriptionFormat,
    description_html: `<p>Citat ${id}</p>`,
    app_description: null,
    uses_api: false,
    picture_url: `/avatar/group/${id}?v=100`,
    is_public: false,
    inherits_members: true,
    creator_id: 1,
    inserted_at: '2026-11-05T08:00:00Z',
    published_at: null,
    last_value_at: null,
    comment_count: 0,
    reactions: [],
    can_react: true,
    can_edit: true,
    member_count: 3,
    updated_at: '2026-11-05T08:00:00Z',
    key: null,
    lat: null,
    lng: null,
    pin: null,
    ...patch,
  };
}

function memoryStorage(items: Record<string, string> = {}) {
  const map = new Map(Object.entries(items));

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

/** A server with `posts` in its list; what it writes returns a group as the real one does. */
function fakeApi(posts: PotokSubgroup[] = []) {
  let nextId = 500;

  const written = (id: number, attrs: Parameters<PotokSdk['updateChild']>[1]) => ({
    ok: true as const,
    group: child(id, {
      name: attrs.name ?? `grupa ${id}`,
      is_public: attrs.isPublic ?? false,
      inherits_members: attrs.inheritsMembers ?? false,
      member_count: attrs.inheritsMembers ? 3 : 1,
    }),
  });

  return {
    getGroup: vi.fn<PotokSdk['getGroup']>(async () => ({ ok: true, group: own })),
    getCurrentProfile: vi.fn<PotokSdk['getCurrentProfile']>(async () => ({ id: 1 }) as never),
    listChildren: vi.fn<PotokSdk['listChildren']>(async ({ beforeId } = {}) => {
      const rows = posts.filter((post) => beforeId === undefined || post.id < beforeId);
      return { ok: true, groups: rows.slice(0, PAGE_SIZE), has_more: rows.length > PAGE_SIZE, has_newer: false };
    }),
    getChild: vi.fn<PotokSdk['getChild']>(async (id) => ({ ok: true, group: child(id) })),
    createChild: vi.fn<PotokSdk['createChild']>(async (attrs) => written(nextId++, attrs)),
    updateChild: vi.fn<PotokSdk['updateChild']>(async (id, attrs) => written(id, attrs)),
    withdrawChild: vi.fn<PotokSdk['withdrawChild']>(async (id) => ({
      ok: true,
      group: child(id, { is_public: false, inherits_members: false, member_count: 1 }),
    })),
    previewDescription: vi.fn<PotokSdk['previewDescription']>(async (description) => ({
      ok: true,
      html: `<p>${description.length}</p>`,
    })),
    openGroup: vi.fn<PotokSdk['openGroup']>(async () => ({ ok: true })),
    getConfig: vi.fn<PotokSdk['getConfig']>(async () => ({ ok: true, config: null, files: null }) as never),
    saveConfig: vi.fn<PotokSdk['saveConfig']>(async () => ({ ok: true, config: {} }) as never),
    ensureFileGroups: vi.fn<PotokSdk['ensureFileGroups']>(async () => ({ ok: true, files: { public: 801 } })),
    uploadImage: vi.fn<PotokSdk['uploadImage']>(async () => ({
      ok: true,
      file: { file: nextId, name: 'slika.jpg', size: 3, type: 'image/jpeg', url: `https://potok.test/pictures/${nextId++}` },
    })),
    uploadMedia: vi.fn<PotokSdk['uploadMedia']>(async () => ({
      ok: true,
      file: { file: nextId, name: 'gol.mp4', size: 9, type: 'video/mp4', url: `https://potok.test/pictures/${nextId++}` },
    })),
    listTemplates: vi.fn<PotokSdk['listTemplates']>(async () => ({ ok: true, templates: [MATCH] })),
    renderTemplate: vi.fn<PotokSdk['renderTemplate']>(async (id, fields) => ({
      ok: true,
      description: customDescription(id, fields),
      name: typeof fields.domacin === 'string' && fields.domacin ? fields.domacin : 'Utakmica',
      html: `<h2>${String(fields.domacin ?? '')}</h2>`,
      missing: fields.domacin ? [] : ['Domaćin'],
      rev: 2,
    })),
  };
}

function setup(api = fakeApi(), storage = memoryStorage()) {
  const changes: CreatorState[] = [];
  const creator = createCreator(api, storage, (state) => changes.push(state));

  return { api, storage, creator, changes };
}

async function started(api = fakeApi(), storage = memoryStorage()) {
  const context = setup(api, storage);
  await context.creator.start();
  return context;
}

async function writing(api = fakeApi(), storage = memoryStorage()) {
  const context = await started(api, storage);
  context.creator.pickTemplate('quote');
  context.creator.setField('quote', 'Reka nosi sve.');
  return context;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting', () => {
  it('lists the posts for a viewer who may keep them', async () => {
    const { creator } = await started(fakeApi([child(2), child(1)]));

    expect(creator.state.phase).toBe('ready');
    expect(creator.state.group).toEqual(own);
    expect(creator.state.posts.map(({ id }) => id)).toEqual([2, 1]);
  });

  it('stops at a viewer who may not, without calling anything else', async () => {
    const api = fakeApi();
    api.getGroup.mockResolvedValue({ ok: true, group: { ...own, can_manage_children: false } });

    const { creator } = await started(api);

    expect(creator.state.phase).toBe('denied');
    expect(api.listChildren).not.toHaveBeenCalled();
  });

  it('knows the frame of the edit form, where calls are refused', async () => {
    const api = fakeApi();
    api.getGroup.mockResolvedValue({ ok: false, error: 'preview' });

    expect((await started(api)).creator.state.phase).toBe('preview');
  });

  it('tries again after a failure', async () => {
    const api = fakeApi();
    api.getGroup.mockRejectedValueOnce(new Error('timed out'));

    const { creator } = await started(api);
    expect(creator.state.phase).toBe('failed');

    await creator.start();
    expect(creator.state.phase).toBe('ready');
  });

  it('counts a list that would not load as a failure', async () => {
    const api = fakeApi();
    api.listChildren.mockResolvedValue({ ok: false, error: 'forbidden' });

    expect((await started(api)).creator.state.phase).toBe('failed');
  });
});

describe('paging', () => {
  const many = Array.from({ length: 25 }, (_, index) => child(25 - index));

  it('goes on after the last post', async () => {
    const api = fakeApi(many);
    const { creator } = await started(api);

    expect(creator.state.posts).toHaveLength(PAGE_SIZE);
    expect(creator.state.hasMore).toBe(true);

    await creator.loadMore();

    expect(api.listChildren).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, beforeId: 6 });
    expect(creator.state.posts).toHaveLength(25);
    expect(creator.state.hasMore).toBe(false);
  });

  it('asks for nothing when the list is over', async () => {
    const api = fakeApi([child(1)]);
    const { creator } = await started(api);

    await creator.loadMore();

    expect(api.listChildren).toHaveBeenCalledTimes(1);
  });

  it('says so when a page does not come', async () => {
    const api = fakeApi(many);
    const { creator } = await started(api);
    api.listChildren.mockResolvedValue({ ok: false, error: 'forbidden' });

    await creator.loadMore();

    expect(creator.state.error).toBeTruthy();
    expect(creator.state.posts).toHaveLength(PAGE_SIZE);
  });
});

describe('saving a new post', () => {
  it('makes a group only the author sees, and stays with it', async () => {
    const { api, creator } = await writing();

    await creator.savePost();

    const attrs = api.createChild.mock.calls[0][0];
    expect(attrs.name).toBe('Reka nosi sve.');
    expect(attrs.descriptionFormat).toBe('html');
    expect(attrs.description).toContain('Reka nosi sve.');
    expect(attrs.isPublic).toBeUndefined();
    expect(attrs.inheritsMembers).toBeUndefined();

    expect(creator.state.screen).toBe('editor');
    expect(creator.state.form?.id).toBe(500);
    expect(creator.state.notice).toContain('samo ti');
  });

  it('changes that group the second time', async () => {
    const { api, creator } = await writing();

    await creator.savePost();
    creator.setField('quote', 'Drugi tekst');
    await creator.savePost();

    expect(api.createChild).toHaveBeenCalledTimes(1);
    expect(api.updateChild.mock.calls[0][0]).toBe(500);
    expect(api.updateChild.mock.calls[0][1].description).toContain('Drugi tekst');
  });

  it('refuses a second save while the first is on its way', async () => {
    const { api, creator } = await writing();

    await Promise.all([creator.savePost(), creator.savePost()]);

    expect(api.createChild).toHaveBeenCalledTimes(1);
  });

  it('shows why the server refused', async () => {
    const api = fakeApi();
    api.createChild.mockResolvedValue({ ok: false, error: 'rate_limited', message: 'Previše izmena.' });

    const { creator } = await writing(api);
    await creator.savePost();

    expect(creator.state.error).toBe('Previše izmena.');
    expect(creator.state.form?.id).toBeNull();
  });
});

describe('publishing', () => {
  const audience = { isPublic: true, inheritsMembers: true };

  it('makes a new group for that audience in one call', async () => {
    const { api, creator } = await writing();

    await creator.publish(audience);

    expect(api.createChild).toHaveBeenCalledTimes(1);
    expect(api.createChild.mock.calls[0][0]).toMatchObject(audience);
    expect(api.updateChild).not.toHaveBeenCalled();
    expect(creator.state.screen).toBe('list');
    expect(creator.state.notice).toBe('Objavljeno.');
  });

  it('opens up a draft, in the group it already has', async () => {
    const { api, creator } = await writing();

    await creator.savePost();
    await creator.publish(audience);

    expect(api.createChild).toHaveBeenCalledTimes(1);
    expect(api.updateChild.mock.calls[0]).toEqual([500, expect.objectContaining(audience)]);
  });

  it('stays in the editor when it fails', async () => {
    const api = fakeApi();
    api.createChild.mockResolvedValue({ ok: false, error: 'forbidden', message: 'Ne.' });

    const { creator } = await writing(api);
    await creator.publish(audience);

    expect(creator.state.screen).toBe('editor');
    expect(creator.state.error).toBe('Ne.');
  });

  it('refreshes the list behind it', async () => {
    const api = fakeApi();
    const { creator } = await writing(api);

    await creator.publish(audience);

    expect(api.listChildren.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('a published post', () => {
  const opened = async (api = fakeApi()) => {
    const context = await started(api);
    await context.creator.openPost(child(7, { description: undefined }));
    return context;
  };

  it('opens with what its group has', async () => {
    const { api, creator } = await opened();

    expect(api.getChild).toHaveBeenCalledWith(7);
    expect(creator.state.screen).toBe('editor');
    expect(creator.state.form).toMatchObject({
      id: 7,
      template: 'quote',
      fields: { quote: 'Citat 7' },
      audience: { isPublic: false, inheritsMembers: true },
      memberCount: 3,
    });
  });

  it('keeps its audience when saved', async () => {
    const { api, creator } = await opened();

    creator.setField('quote', 'Ispravka');
    await creator.savePost();

    const attrs = api.updateChild.mock.calls[0][1];
    expect(attrs.isPublic).toBeUndefined();
    expect(attrs.inheritsMembers).toBeUndefined();
  });

  it('changes its audience apart from the editor', async () => {
    const { api, creator } = await opened();

    await creator.changeAudience({ isPublic: true, inheritsMembers: true });

    expect(api.updateChild.mock.calls[0][1]).toMatchObject({ isPublic: true, inheritsMembers: true });
    expect(creator.state.form?.audience.isPublic).toBe(true);
  });

  it('withdraws', async () => {
    const { api, creator } = await opened();

    await creator.withdraw();

    expect(api.withdrawChild).toHaveBeenCalledWith(7);
    expect(creator.state.form).toMatchObject({
      audience: { isPublic: false, inheritsMembers: false },
      memberCount: 1,
    });
    expect(creator.state.notice).toContain('povučena');
  });

  it('says so when it cannot be withdrawn', async () => {
    const api = fakeApi();
    api.withdrawChild.mockResolvedValue({ ok: false, error: 'forbidden', message: 'Ne.' });

    const { creator } = await opened(api);
    await creator.withdraw();

    expect(creator.state.error).toBe('Ne.');
    expect(creator.state.form?.audience.inheritsMembers).toBe(true);
  });
});

describe('opening what was not made here', () => {
  it('opens a description from elsewhere as free text', async () => {
    const api = fakeApi();
    api.getChild.mockResolvedValue({
      ok: true,
      group: child(7, { name: 'Ručno', description: '# Tekst', description_format: 'markdown' }),
    });

    const { creator } = await started(api);
    await creator.openPost(child(7));

    expect(creator.state.form).toMatchObject({
      template: 'text',
      format: 'markdown',
      fields: { title: 'Ručno', source: '# Tekst' },
      changedPost: null,
    });
  });

  it('opens a post changed by hand as free text, and can go back to its template', async () => {
    const api = fakeApi();
    const description = `${child(7).description}<p>Dodato.</p>`;
    api.getChild.mockResolvedValue({ ok: true, group: child(7, { name: 'N', description }) });

    const { creator } = await started(api);
    await creator.openPost(child(7));

    expect(creator.state.form).toMatchObject({ template: 'text', format: 'html' });
    expect(creator.state.form?.fields.source).toContain('Dodato.');
    expect(creator.state.form?.changedPost?.template).toBe('quote');

    creator.backToTemplate();

    expect(creator.state.form).toMatchObject({
      template: 'quote',
      fields: { quote: 'Citat 7' },
      changedPost: null,
    });
  });

  it('saves a hand-changed post as it stands, in its own format', async () => {
    const api = fakeApi();
    const description = `${child(7).description}<p>Dodato.</p>`;
    api.getChild.mockResolvedValue({ ok: true, group: child(7, { name: 'N', description }) });

    const { creator } = await started(api);
    await creator.openPost(child(7));
    await creator.savePost();

    const attrs = api.updateChild.mock.calls[0][1];
    expect(attrs.descriptionFormat).toBe('html');
    expect(attrs.description).toContain('Dodato.');
    expect(attrs.description).not.toContain('potok-post');
  });

  it('sends a group that is an app to its own page', async () => {
    const { api, creator } = await started();

    await creator.openPost(child(7, { uses_api: true }));

    expect(api.getChild).not.toHaveBeenCalled();
    expect(api.openGroup).toHaveBeenCalledWith(7, { tab: 'description' });
    expect(creator.state.screen).toBe('list');
  });

  it('leaves the post of someone else alone', async () => {
    const api = fakeApi();
    api.getChild.mockResolvedValue({ ok: true, group: child(7, { description: null, can_edit: false }) });

    const { creator } = await started(api);
    await creator.openPost(child(7));

    expect(creator.state.screen).toBe('list');
    expect(creator.state.error).toBeTruthy();
  });
});

describe('a picture from the device', () => {
  const picture = 'data:image/jpeg;base64,AAAA';
  const audience = { isPublic: true, inheritsMembers: true };

  const withPicture = async (api = fakeApi()) => {
    const context = await started(api);
    context.creator.pickTemplate('photo');
    context.creator.setField('title', 'Jutro');
    context.creator.setPendingImage(picture);
    return context;
  };

  it('counts as the picture a format requires', async () => {
    const { creator } = await withPicture();

    expect(missingOf(creator.state.form!)).toEqual([]);
  });

  it('goes to the group first, and the text takes its address', async () => {
    const { api, creator } = await withPicture();

    await creator.savePost();

    expect(api.createChild.mock.calls[0][0]).toEqual({ name: 'Jutro', picture });
    expect(api.updateChild.mock.calls[0][0]).toBe(500);
    expect(api.updateChild.mock.calls[0][1].description).toMatch(/src="\/avatar\/group\/500\?p=\d+"/);
    expect(creator.state.form?.pendingImage).toBeNull();
  });

  it('keeps the audience for the last call, so nobody sees the post without it', async () => {
    const { api, creator } = await withPicture();

    await creator.publish(audience);

    expect(api.createChild.mock.calls[0][0].isPublic).toBeUndefined();
    expect(api.createChild.mock.calls[0][0].inheritsMembers).toBeUndefined();
    expect(api.updateChild.mock.calls[0][1]).toMatchObject(audience);
  });

  it('replaces the picture of a group that exists', async () => {
    const api = fakeApi();
    const { creator } = await started(api);
    await creator.openPost(child(7));
    creator.setPendingImage(picture);

    await creator.savePost();

    expect(api.createChild).not.toHaveBeenCalled();
    expect(api.updateChild.mock.calls[0]).toEqual([7, { picture }]);
    expect(api.updateChild).toHaveBeenCalledTimes(2);
  });

  it('continues in the same group when the text failed', async () => {
    const api = fakeApi();
    const { creator } = await withPicture(api);
    api.updateChild.mockResolvedValueOnce({ ok: false, error: 'rate_limited', message: 'Sačekaj.' });

    await creator.savePost();

    expect(creator.state.error).toBe('Sačekaj.');
    expect(creator.state.form?.id).toBe(500);
    expect(creator.state.form?.pendingImage).toBeNull();

    await creator.savePost();

    expect(api.createChild).toHaveBeenCalledTimes(1);
    expect(api.updateChild).toHaveBeenCalledTimes(2);
  });

  it('stands in the preview by a word the server lets through', async () => {
    const { api, creator } = await withPicture();

    creator.showPreview(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(api.previewDescription.mock.calls[0][0]).toContain(WAITING_IMAGE);
    expect(api.previewDescription.mock.calls[0][0]).not.toContain('data:image');
  });

  it('takes the group picture away when a held picture is removed', async () => {
    const api = fakeApi();
    const { creator } = await started(api);
    await creator.openPost(child(7));
    creator.setField('image', '/avatar/group/7?p=5');

    creator.removeImage();
    await creator.savePost();

    expect(api.updateChild.mock.calls[0][1].picture).toBe('');
    expect(creator.state.form?.clearPicture).toBe(false);
  });

  it('leaves the group picture alone when an address is removed', async () => {
    const api = fakeApi();
    const { creator } = await started(api);
    await creator.openPost(child(7));
    creator.setField('image', 'https://example.com/a.png');

    creator.removeImage();
    await creator.savePost();

    expect(api.updateChild.mock.calls[0][1].picture).toBeUndefined();
  });
});

describe('groupImageAddress', () => {
  it('drops the version that changes with every edit of the group', () => {
    expect(groupImageAddress('/avatar/group/12?v=100', 7)).toBe('/avatar/group/12?p=7');
  });

  it('leaves the address of the dev mock alone', () => {
    expect(groupImageAddress('data:image/png;base64,AA', 7)).toBe('data:image/png;base64,AA');
  });
});

describe('a call that never answers', () => {
  it('finds the group it made after all, so the next save does not make another', async () => {
    const api = fakeApi();
    const { creator } = await writing(api);

    api.createChild.mockRejectedValueOnce(new Error('timed out'));
    api.listChildren.mockResolvedValueOnce({
      ok: true,
      groups: [child(900, { name: 'Reka nosi sve.' })],
      has_more: false,
      has_newer: false,
    });

    await creator.savePost();

    expect(creator.state.error).toContain('Veza je spora');
    expect(creator.state.form?.id).toBe(900);

    await creator.savePost();

    expect(api.createChild).toHaveBeenCalledTimes(1);
    expect(api.updateChild.mock.calls[0][0]).toBe(900);
  });

  it('adopts no one else’s group of the same name', async () => {
    const api = fakeApi();
    const { creator } = await writing(api);

    api.createChild.mockRejectedValueOnce(new Error('timed out'));
    api.listChildren.mockResolvedValueOnce({
      ok: true,
      groups: [child(900, { name: 'Reka nosi sve.', creator_id: 2 })],
      has_more: false,
      has_newer: false,
    });

    await creator.savePost();

    expect(creator.state.form?.id).toBeNull();
  });

  it('adopts no post that was there before', async () => {
    const api = fakeApi([child(5, { name: 'Reka nosi sve.' })]);
    const { creator } = await writing(api);

    api.createChild.mockRejectedValueOnce(new Error('timed out'));
    await creator.savePost();

    expect(creator.state.form?.id).toBeNull();
  });
});

describe('what is being written', () => {
  it('is kept shortly after typing, and without a picture, which would not fit', async () => {
    const { storage, creator } = await writing();
    creator.setPendingImage('data:image/jpeg;base64,AAAA');

    expect(storage.getItem(UNSAVED_KEY)).toBeNull();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    const stored = JSON.parse(storage.getItem(UNSAVED_KEY)!);
    expect(stored).toMatchObject({ id: null, template: 'quote', fields: { quote: 'Reka nosi sve.' } });
    expect(JSON.stringify(stored)).not.toContain('AAAA');
  });

  it('is offered after a restart', async () => {
    const stored = { id: null, template: 'quote', fields: { quote: 'Započeto' }, format: 'markdown', clearPicture: false };
    const { creator } = await started(fakeApi(), memoryStorage({ [UNSAVED_KEY]: JSON.stringify(stored) }));

    expect(creator.state.unsaved).toEqual(stored);

    await creator.resumeUnsaved();

    expect(creator.state.screen).toBe('editor');
    expect(creator.state.form).toMatchObject({ id: null, fields: { quote: 'Započeto' } });
  });

  it('goes back to its group when it had one', async () => {
    const stored = { id: 7, template: 'quote', fields: { quote: 'Izmena' }, format: 'markdown' };
    const api = fakeApi();
    const { creator } = await started(api, memoryStorage({ [UNSAVED_KEY]: JSON.stringify(stored) }));

    await creator.resumeUnsaved();

    expect(creator.state.form).toMatchObject({
      id: 7,
      fields: { quote: 'Izmena' },
      audience: { inheritsMembers: true },
    });
  });

  it('remembers a picture that is to go, past a reload', async () => {
    const api = fakeApi();
    const storage = memoryStorage();
    const { creator } = await started(api, storage);
    await creator.openPost(child(7));
    creator.setField('image', '/avatar/group/7?p=5');
    creator.removeImage();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    const { creator: restarted } = await started(api, storage);
    await restarted.resumeUnsaved();
    await restarted.savePost();

    expect(api.updateChild.mock.lastCall?.[1].picture).toBe('');
  });

  it('is gone once saved', async () => {
    const { storage, creator } = await writing();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await creator.savePost();

    expect(storage.getItem(UNSAVED_KEY)).toBeNull();
    expect(creator.state.unsaved).toBeNull();
  });

  it('can be thrown away', async () => {
    const stored = { id: null, template: 'quote', fields: {}, format: 'markdown' };
    const storage = memoryStorage({ [UNSAVED_KEY]: JSON.stringify(stored) });
    const { creator } = await started(fakeApi(), storage);

    creator.discardUnsaved();

    expect(storage.getItem(UNSAVED_KEY)).toBeNull();
    expect(creator.state.unsaved).toBeNull();
  });

  it('survives garbage in the storage', async () => {
    for (const garbage of ['nije json', 'null', '{"template":"no-such","fields":{}}', '{"template":"quote"}']) {
      const { creator } = await started(fakeApi(), memoryStorage({ [UNSAVED_KEY]: garbage }));

      expect(creator.state.unsaved).toBeNull();
    }
  });
});

describe('the preview', () => {
  it('waits for a pause in the typing', async () => {
    const { api, creator } = await writing();
    creator.showPreview(true);
    await vi.advanceTimersByTimeAsync(0);
    api.previewDescription.mockClear();

    creator.setField('quote', 'a');
    creator.setField('quote', 'ab');
    creator.setField('quote', 'abc');
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);

    expect(api.previewDescription).toHaveBeenCalledTimes(1);
    expect(api.previewDescription.mock.calls[0][0]).toContain('abc');
  });

  it('costs nothing while it is not on screen', async () => {
    const { api, creator } = await writing();

    creator.setField('quote', 'a');
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS * 2);

    expect(api.previewDescription).not.toHaveBeenCalled();
  });

  it('comes as soon as it is on screen', async () => {
    const { api, creator } = await writing();

    creator.showPreview(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(api.previewDescription).toHaveBeenCalledTimes(1);
    expect(creator.state.previewHtml).toMatch(/^<p>\d+<\/p>$/);
  });

  it('is not overwritten by a slower answer to older text', async () => {
    const { api, creator } = await writing();
    let answerOld: (reply: { ok: true; html: string }) => void = () => {};

    api.previewDescription.mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)));
    api.previewDescription.mockResolvedValueOnce({ ok: true, html: '<p>novo</p>' });

    creator.showPreview(true);
    await vi.advanceTimersByTimeAsync(0);

    creator.setField('quote', 'novo');
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);

    answerOld({ ok: true, html: '<p>staro</p>' });
    await vi.advanceTimersByTimeAsync(0);

    expect(creator.state.previewHtml).toBe('<p>novo</p>');
  });

  it('keeps the last text when a call fails', async () => {
    const { api, creator } = await writing();
    creator.showPreview(true);
    await vi.advanceTimersByTimeAsync(0);
    const shown = creator.state.previewHtml;

    api.previewDescription.mockResolvedValueOnce({ ok: false, error: 'rate_limited' });
    creator.setField('quote', 'a');
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);

    expect(creator.state.previewHtml).toBe(shown);
  });
});

describe('another format', () => {
  it('keeps the fields of the same name and drops the rest', async () => {
    const { creator } = await started();
    creator.pickTemplate('article');
    creator.setField('title', 'Naslov');
    creator.setField('lead', 'Uvod');

    creator.chooseTemplate();
    creator.pickTemplate('event');

    expect(creator.state.screen).toBe('editor');
    expect(creator.state.form).toMatchObject({ template: 'event', fields: { title: 'Naslov' } });
    expect(creator.state.form?.fields.lead).toBeUndefined();
  });

  it('comes back to the editor when nothing is picked', async () => {
    const { creator } = await writing();

    creator.chooseTemplate();
    creator.leaveTemplates();

    expect(creator.state.screen).toBe('editor');
    expect(creator.state.form?.fields.quote).toBe('Reka nosi sve.');
  });
});

describe('messages', () => {
  it('a notice goes away by itself', async () => {
    const { creator } = await writing();

    await creator.savePost();
    expect(creator.state.notice).toBeTruthy();

    await vi.advanceTimersByTimeAsync(NOTICE_MS);
    expect(creator.state.notice).toBeNull();
  });

  it('an error stays until the next change', async () => {
    const api = fakeApi();
    api.createChild.mockResolvedValue({ ok: false, error: 'forbidden', message: 'Ne.' });

    const { creator } = await writing(api);
    await creator.savePost();
    await vi.advanceTimersByTimeAsync(NOTICE_MS * 2);

    expect(creator.state.error).toBe('Ne.');

    creator.setField('quote', 'a');
    expect(creator.state.error).toBeNull();
  });
});

describe('leaving', () => {
  it('asks the page and says so when it cannot go', async () => {
    const api = fakeApi();
    api.openGroup.mockResolvedValue({ ok: false, error: 'not_found' });

    const { creator } = await started(api);
    await creator.leaveFor(7, 'settings');

    expect(api.openGroup).toHaveBeenCalledWith(7, { tab: 'settings' });
    expect(creator.state.error).toBeTruthy();
  });
});

describe('a gallery', () => {
  const files = (count: number) =>
    Array.from({ length: count }, (_, index) => new File(['x'], `slika-${index}.png`, { type: 'image/png' }));

  async function gallery(api = fakeApi()) {
    const context = await started(api);
    context.creator.pickTemplate('gallery');
    context.creator.setField('title', 'Dan na potoku');
    return context;
  }

  it("sends pictures from the device into its rows, the first one also as the post's picture", async () => {
    const { api, creator } = await gallery();

    await creator.addDevicePictures(files(2));

    expect(api.saveConfig).toHaveBeenCalledWith({ rules: {} }, { revision: 0 });
    expect(api.ensureFileGroups).toHaveBeenCalledTimes(1);
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
    expect(creator.state.form!.fields.pictures).toEqual(['https://potok.test/pictures/500', 'https://potok.test/pictures/501']);
    expect(creator.state.form!.fields.captions).toEqual(['', '']);
    expect(creator.state.form!.pendingImage).toBe(SHRUNK);
    expect(creator.state.uploading).toBe(0);
  });

  it('fills empty rows first and asks for the file group once', async () => {
    const { api, creator } = await gallery();
    creator.setPictures(['https://a.rs/1.jpg', ''], ['Prva', 'Druga']);

    await creator.addDevicePictures(files(1));
    await creator.addDevicePictures(files(1));

    expect(creator.state.form!.fields.pictures).toEqual(['https://a.rs/1.jpg', 'https://potok.test/pictures/500', 'https://potok.test/pictures/501']);
    expect(creator.state.form!.fields.captions).toEqual(['Prva', 'Druga', '']);
    expect(creator.state.form!.pendingImage).toBeNull();
    expect(api.getConfig).toHaveBeenCalledTimes(1);
  });

  it('keeps its own addresses when it saves, and gives the post its first picture', async () => {
    const { api, creator } = await gallery();
    await creator.addDevicePictures(files(1));

    await creator.savePost();

    expect(api.createChild).toHaveBeenNthCalledWith(1, { name: 'Dan na potoku', picture: SHRUNK });
    const [, attrs] = api.updateChild.mock.calls.at(-1)!;
    expect(attrs.description).toContain('data-potok-gallery="slides"');
    expect(attrs.description).toContain('https://potok.test/pictures/500');
    expect(attrs.description).not.toContain('"image"');
  });

  it('says so when the pictures cannot go anywhere', async () => {
    const api = fakeApi();
    api.ensureFileGroups.mockResolvedValue({ ok: false, error: 'forbidden' });
    const { creator } = await gallery(api);

    await creator.addDevicePictures(files(1));

    expect(creator.state.error).toBe('Slike trenutno ne mogu da se pošalju.');
    expect(creator.state.form!.fields.pictures).toBeUndefined();
    expect(creator.state.uploading).toBe(0);
  });
});

describe("the group's own templates", () => {
  it('come after the built-in formats, named by the group they come from', async () => {
    const { creator } = await started();

    expect(creator.state.customTemplates.map(({ id }) => id)).toEqual(['custom:7']);
    expect(creator.templates().at(-1)).toMatchObject({ id: 'custom:7', name: 'Utakmica', custom: { owner: 'Liga' } });
    expect(creator.templates().length).toBe(11);
  });

  it('leave the built-in formats working when they cannot be read', async () => {
    const api = fakeApi();
    api.listTemplates.mockResolvedValue({ ok: false, error: 'forbidden' });

    const { creator } = await started(api);

    expect(creator.state.phase).toBe('ready');
    expect(creator.state.customTemplates).toEqual([]);
  });

  it('write a post through Potok, which renders it, its choice as the select shows it', async () => {
    const { api, creator } = await started();

    creator.pickTemplate('custom:7');
    expect(creator.state.form?.template).toBe('custom:7');
    expect(missingOf(creator.state.form!)).toEqual(['Domaćin']);

    creator.setField('domacin', 'Zvezda');
    creator.setField('strelci', ['Pera', 'Mika']);
    await creator.savePost();

    expect(api.renderTemplate).toHaveBeenCalledWith('custom:7', {
      domacin: 'Zvezda',
      strelci: ['Pera', 'Mika'],
      ishod: 'pobeda',
    });

    const attrs = api.createChild.mock.calls[0][0];
    expect(attrs.name).toBe('Zvezda');
    expect(attrs.descriptionFormat).toBe('html');
    expect(attrs.description).toContain('"template":"custom:7"');
    expect(api.previewDescription).not.toHaveBeenCalled();
  });

  it('show their preview as Potok renders it', async () => {
    const { api, creator } = await started();
    creator.pickTemplate('custom:7');
    creator.showPreview(true);
    await vi.advanceTimersByTimeAsync(0);

    creator.setField('domacin', 'Zvezda');
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);

    expect(creator.state.previewHtml).toBe('<h2>Zvezda</h2>');
    expect(api.previewDescription).not.toHaveBeenCalled();
  });

  it('open a post made with one in its form', async () => {
    const api = fakeApi();
    const description = customDescription('custom:7', { domacin: 'Zvezda' });
    api.getChild.mockResolvedValue({ ok: true, group: child(9, { description, description_format: 'html' }) });

    const { creator } = await started(api);
    await creator.openPost(child(9));

    expect(creator.state.form).toMatchObject({ template: 'custom:7', fields: { domacin: 'Zvezda' }, goneTemplate: false });
  });

  it('open a post of one that is gone as free text, its look kept', async () => {
    const api = fakeApi();
    const description = customDescription('custom:99', { domacin: 'Zvezda' });
    api.getChild.mockResolvedValue({ ok: true, group: child(9, { name: 'Zvezda', description, description_format: 'html' }) });

    const { creator } = await started(api);
    await creator.openPost(child(9));

    expect(creator.state.form).toMatchObject({
      template: 'text',
      format: 'html',
      goneTemplate: true,
      fields: { title: 'Zvezda', source: '<h2>Zvezda</h2>' },
    });
  });

  it('send a video from the device as it is, and a picture made small', async () => {
    const { api, creator } = await started();
    creator.pickTemplate('custom:7');

    await creator.addDeviceMedia({ key: 'snimak', kind: 'video' }, new File(['mp4'], 'gol.mp4', { type: 'video/mp4' }));
    expect(api.uploadMedia).toHaveBeenCalledTimes(1);
    expect(creator.state.form?.fields.snimak).toMatch(/^https:\/\/potok\.test\/pictures\//);

    await creator.addDeviceMedia({ key: 'slika', kind: 'image' }, new File(['png'], 'tim.png', { type: 'image/png' }));
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(creator.state.form?.fields.slika).toMatch(/^https:\/\/potok\.test\/pictures\//);
    // The first picture of a new post is the post's own too.
    expect(creator.state.form?.pendingImage).toBe(SHRUNK);
    expect(creator.state.uploading).toBe(0);
  });

  it('keep the pictures of a field under its own keys', async () => {
    const { creator } = await started();
    creator.pickTemplate('custom:7');

    await creator.addDevicePictures([new File(['a'], 'a.png', { type: 'image/png' })], MATCH.fields[4]);
    creator.setPictures(creator.state.form!.fields.galerija as string[], ['Gol'], MATCH.fields[4]);

    expect(creator.state.form?.fields).toMatchObject({ galerija: [expect.stringMatching(/^https:/)], galerija_captions: ['Gol'] });
    expect(creator.state.form?.fields.pictures).toBeUndefined();
  });

  it('are made in the settings of .feed, where its editors go from here', async () => {
    const { api, creator } = await started();

    await creator.openTemplates();

    expect(api.openGroup).toHaveBeenCalledWith(own.id, { tab: 'templates' });
  });

  it('drop an unfinished post of one that is gone', async () => {
    const storage = memoryStorage({
      [UNSAVED_KEY]: JSON.stringify({ id: null, template: 'custom:99', fields: { domacin: 'x' }, format: 'html' }),
    });

    const { creator } = await started(fakeApi(), storage);

    expect(creator.state.unsaved).toBeNull();
  });
});
