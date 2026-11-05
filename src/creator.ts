import { defaultAudience, DRAFT, stateOf, type Audience } from './audience';
import { decodePost, encodePost, type Post } from './post';
import type { PotokChild, PotokChildAttrs, PotokContentFormat, PotokError, PotokGroupTab, PotokOwnGroup, PotokSdk, PotokSubgroup } from './potok';
import { isTemplateId, missingFields, templateOf, WAITING_IMAGE, type PostFields, type TemplateId } from './templates';

export const PAGE_SIZE = 20;

/** What is being written, in case the frame restarts: it does when the connection comes back. */
export const UNSAVED_KEY = 'feedcreator:unsaved';

export const AUTOSAVE_DELAY_MS = 500;
export const PREVIEW_DELAY_MS = 600;
export const NOTICE_MS = 4_000;

const FAILED_SAVE = 'Objava nije sačuvana. Pokušaj ponovo.';
const SLOW_SAVE = 'Veza je spora, pa ne znamo da li je sve sačuvano. Pogledaj pregled i sačuvaj još jednom.';

export type Screen = 'list' | 'templates' | 'editor';

/** `preview`: the frame in the group's edit form, where API calls are refused. */
export type Phase = 'loading' | 'failed' | 'preview' | 'denied' | 'ready';

/** A post being written. */
export type Form = {
  /** The group, from the moment it exists. */
  id: number | null;
  template: TemplateId;
  fields: PostFields;
  /** Of a free text; the other templates are always HTML. */
  format: PotokContentFormat;
  /** What the group has now: a closed draft until it is published. */
  audience: Audience;
  /** Who else is in the group, which a closed group can still have. */
  memberCount: number;
  /** A picture from the device, until the group holds it. */
  pendingImage: string | null;
  /** The group's picture has to go with the next save. */
  clearPicture: boolean;
  /** What the post was made from, when its text was changed by hand since. */
  changedPost: Post | null;
};

export type Unsaved = Pick<Form, 'id' | 'template' | 'fields' | 'format' | 'clearPicture'>;

export type CreatorState = {
  phase: Phase;
  screen: Screen;
  group: PotokOwnGroup | null;
  profileId: number | null;
  posts: PotokSubgroup[];
  hasMore: boolean;
  loadingMore: boolean;
  /** A post left unfinished last time. */
  unsaved: Unsaved | null;
  form: Form | null;
  /** The form as the server will show it; null until it answers. */
  previewHtml: string | null;
  saving: boolean;
  notice: string | null;
  error: string | null;
};

type CreatorApi = Pick<
  PotokSdk,
  | 'getGroup'
  | 'getCurrentProfile'
  | 'listChildren'
  | 'getChild'
  | 'createChild'
  | 'updateChild'
  | 'withdrawChild'
  | 'previewDescription'
  | 'openGroup'
>;

type CreatorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ChildReply = { ok: true; group: PotokChild } | PotokError;

export const audienceOf = (group: Pick<PotokSubgroup, 'is_public' | 'inherits_members'>): Audience => ({
  isPublic: group.is_public,
  inheritsMembers: group.inherits_members,
});

export const isDraft = (form: Pick<Form, 'audience'>) => stateOf(form.audience) === 'draft';

/** The required fields still empty, by their labels. */
export function missingOf(form: Form): string[] {
  const fields = form.pendingImage ? { ...form.fields, image: WAITING_IMAGE } : form.fields;
  return missingFields(templateOf(form.template), fields);
}

/**
 * Where a description finds the group's picture. A new query beats the cache
 * that `/avatar` asks for when the picture changes. `?v=` of the address itself
 * changes with every edit of the group, which would reload it for no reason.
 */
export function groupImageAddress(pictureUrl: string, stamp: number): string {
  if (pictureUrl.startsWith('data:')) return pictureUrl;
  return `${pictureUrl.split('?')[0]}?p=${stamp}`;
}

function readUnsaved(storage: CreatorStorage): Unsaved | null {
  try {
    const stored: unknown = JSON.parse(storage.getItem(UNSAVED_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return null;

    const { id, template, fields, format, clearPicture } = stored as Partial<Unsaved>;
    if (!isTemplateId(template) || !fields || typeof fields !== 'object') return null;

    return {
      id: id ?? null,
      template,
      fields,
      format: format === 'html' ? 'html' : 'markdown',
      clearPicture: clearPicture === true,
    };
  } catch {
    return null;
  }
}

export function createCreator(api: CreatorApi, storage: CreatorStorage, onChange: (state: CreatorState) => void) {
  let state: CreatorState = {
    phase: 'loading',
    screen: 'list',
    group: null,
    profileId: null,
    posts: [],
    hasMore: false,
    loadingMore: false,
    unsaved: null,
    form: null,
    previewHtml: null,
    saving: false,
    notice: null,
    error: null,
  };

  let previewShown = false;
  let previewRun = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const update = (patch: Partial<CreatorState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  const notify = (notice: string) => {
    clearTimeout(noticeTimer);
    update({ notice, error: null });
    noticeTimer = setTimeout(() => update({ notice: null }), NOTICE_MS);
  };

  const fail = (error: string) => {
    clearTimeout(noticeTimer);
    update({ error, notice: null });
  };

  const failureOf = (reply: PotokError) => reply.message ?? FAILED_SAVE;

  // --- The list

  const fetchPosts = async (beforeId?: number): Promise<boolean> => {
    const reply = await api.listChildren({ limit: PAGE_SIZE, beforeId }).catch(() => null);
    if (!reply?.ok) return false;

    update({ posts: beforeId ? [...state.posts, ...reply.groups] : reply.groups, hasMore: reply.has_more });
    return true;
  };

  const start = async () => {
    update({ phase: 'loading' });

    const reply = await api.getGroup().catch(() => null);
    if (!reply?.ok) return update({ phase: reply?.error === 'preview' ? 'preview' : 'failed' });

    const { group } = reply;
    if (!group.can_manage_children) return update({ phase: 'denied', group });

    const profile = await api.getCurrentProfile().catch(() => null);
    const listed = await fetchPosts();

    update({
      phase: listed ? 'ready' : 'failed',
      group,
      profileId: profile?.id ?? null,
      unsaved: readUnsaved(storage),
    });
  };

  const loadMore = async () => {
    const last = state.posts.at(-1);
    if (state.loadingMore || !state.hasMore || !last) return;

    update({ loadingMore: true });
    const listed = await fetchPosts(last.id);
    update({ loadingMore: false });

    if (!listed) fail('Sledeće objave nisu učitane.');
  };

  // --- The form

  const clearUnsaved = () => {
    clearTimeout(autosaveTimer);
    storage.removeItem(UNSAVED_KEY);
    update({ unsaved: null });
  };

  const rememberSoon = () => {
    clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(() => {
      const { form } = state;
      if (!form) return;

      const { id, template, fields, format, clearPicture } = form;
      storage.setItem(UNSAVED_KEY, JSON.stringify({ id, template, fields, format, clearPicture }));
    }, AUTOSAVE_DELAY_MS);
  };

  const postOf = ({ template, fields }: Form): Post => ({ template, fields });

  /** The picture from the device has no address yet, so the text stands in one. */
  const previewOf = (form: Form) => {
    const fields = form.pendingImage ? { ...form.fields, image: WAITING_IMAGE } : form.fields;
    return encodePost({ template: form.template, fields }, form.format);
  };

  const refreshPreview = async () => {
    const { form } = state;
    if (!form) return;

    const run = ++previewRun;
    const { description, descriptionFormat } = previewOf(form);
    const reply = await api.previewDescription(description, { descriptionFormat }).catch(() => null);

    // An answer that was overtaken by a newer text, or one that never came, changes nothing.
    if (run === previewRun && reply?.ok) update({ previewHtml: reply.html });
  };

  const previewSoon = () => {
    clearTimeout(previewTimer);
    if (previewShown) previewTimer = setTimeout(() => void refreshPreview(), PREVIEW_DELAY_MS);
  };

  const changed = (patch: Partial<Form>) => {
    if (!state.form) return;

    update({ form: { ...state.form, ...patch }, error: null });
    rememberSoon();
    previewSoon();
  };

  const openForm = (form: Form) => {
    clearTimeout(previewTimer);
    previewRun += 1;

    update({ form, screen: 'editor', previewHtml: null, error: null, notice: null });
    if (previewShown) void refreshPreview();
  };

  const newForm = (template: TemplateId, fields: PostFields = {}): Form => ({
    id: null,
    template,
    fields,
    format: 'markdown',
    audience: DRAFT,
    memberCount: 1,
    pendingImage: null,
    clearPicture: false,
    changedPost: null,
  });

  const formOf = (child: PotokChild): Form => {
    const decoded = decodePost(child.description ?? '', child.description_format);
    const base: Form = {
      ...newForm('text'),
      id: child.id,
      audience: audienceOf(child),
      memberCount: child.member_count,
    };

    if (decoded.kind === 'post') {
      return { ...base, template: decoded.post.template, fields: decoded.post.fields };
    }

    const free = { title: child.name, source: decoded.source };

    return decoded.kind === 'changed'
      ? { ...base, fields: free, format: 'html', changedPost: decoded.post }
      : { ...base, fields: free, format: decoded.format };
  };

  const fetchChild = async (id: number): Promise<PotokChild | null> => {
    const reply = await api.getChild(id).catch(() => null);

    if (!reply?.ok) {
      fail('Ova objava trenutno ne može da se otvori.');
      return null;
    }

    return reply.group;
  };

  // --- Saving

  /**
   * Writes the form to its group, and `audience` with it. The address of a
   * picture from the device comes with the group, so the group takes the picture
   * first. The audience goes with the last call: nobody gets to see a post
   * without its picture. A failure after the first call leaves the form with
   * the group's id, so that trying again changes that group.
   */
  const write = async (form: Form, audience?: Audience): Promise<ChildReply | null> => {
    let current = form;

    if (current.pendingImage) {
      const picture = current.pendingImage;
      const { name } = encodePost(postOf(current), current.format);

      const reply = await (current.id === null
        ? api.createChild({ name, picture })
        : api.updateChild(current.id, { picture }));

      if (!reply.ok) return reply;

      current = {
        ...current,
        id: reply.group.id,
        pendingImage: null,
        clearPicture: false,
        fields: { ...current.fields, image: groupImageAddress(reply.group.picture_url, Date.now()) },
      };

      update({ form: current });
    }

    const attrs = { ...encodePost(postOf(current), current.format), ...audience };
    const clearing: PotokChildAttrs = current.clearPicture ? { picture: '' } : {};

    return current.id === null ? api.createChild(attrs) : api.updateChild(current.id, { ...attrs, ...clearing });
  };

  /** A call that never answered may have been done all the same. */
  const adoptCreated = async (form: Form) => {
    if (form.id !== null || state.form?.id !== null) return;

    const { name } = encodePost(postOf(form), form.format);
    const reply = await api.listChildren({ limit: PAGE_SIZE }).catch(() => null);
    if (!reply?.ok) return;

    const known = new Set(state.posts.map((post) => post.id));
    const created = reply.groups.find(
      (post) => post.name === name && post.creator_id === state.profileId && !known.has(post.id),
    );

    if (created && state.form) update({ form: { ...state.form, id: created.id } });
  };

  const save = async (audience?: Audience): Promise<PotokChild | null> => {
    const { form } = state;
    if (!form || state.saving) return null;

    update({ saving: true, error: null, notice: null });

    let reply: ChildReply | null = null;

    try {
      reply = await write(form, audience);
    } catch {
      await adoptCreated(form);
      update({ saving: false });
      fail(SLOW_SAVE);
      return null;
    }

    update({ saving: false });

    if (!reply?.ok) {
      fail(reply ? failureOf(reply) : FAILED_SAVE);
      return null;
    }

    const child = reply.group;

    update({
      form: {
        ...state.form!,
        id: child.id,
        audience: audienceOf(child),
        memberCount: child.member_count,
        clearPicture: false,
        changedPost: null,
      },
    });

    clearUnsaved();
    void fetchPosts();
    return child;
  };

  const backToList = () => {
    clearTimeout(previewTimer);
    previewRun += 1;
    update({ screen: 'list', form: null, previewHtml: null, error: null });
  };

  return {
    get state() {
      return state;
    },

    start,
    loadMore,

    /** Tells whether the preview is on screen, as it costs a call to the server. */
    showPreview(shown: boolean) {
      if (previewShown === shown) return;

      previewShown = shown;
      clearTimeout(previewTimer);
      if (shown) void refreshPreview();
    },

    chooseTemplate() {
      update({ screen: 'templates', error: null, notice: null });
    },

    /** For a new post, or another format for the one being written: fields of the same name stay. */
    pickTemplate(template: TemplateId) {
      const { form } = state;

      if (!form) return openForm(newForm(template));

      const fields = Object.fromEntries(
        templateOf(template)
          .fields.map(({ key }) => [key, form.fields[key]])
          .filter(([, value]) => value !== undefined),
      );

      openForm({ ...form, template, fields, changedPost: null });
      rememberSoon();
    },

    /** Goes back from the list of templates without choosing. */
    leaveTemplates() {
      if (state.form) update({ screen: 'editor' });
      else update({ screen: 'list' });
    },

    async openPost(post: PotokSubgroup) {
      if (post.uses_api) {
        await api.openGroup(post.id, { tab: 'description' }).catch(() => null);
        return;
      }

      const child = await fetchChild(post.id);
      if (!child) return;

      if (!child.can_edit) return fail('Ovu objavu može da menja samo njen autor ili admin.');

      openForm(formOf(child));
    },

    async resumeUnsaved() {
      const { unsaved } = state;
      if (!unsaved) return;

      if (unsaved.id === null) {
        openForm({ ...newForm(unsaved.template, unsaved.fields), format: unsaved.format });
        return;
      }

      const child = await fetchChild(unsaved.id);
      if (!child) return clearUnsaved();

      openForm({ ...formOf(child), ...unsaved, changedPost: null });
    },

    discardUnsaved: clearUnsaved,

    setField(key: string, value: string | string[]) {
      if (state.form) changed({ fields: { ...state.form.fields, [key]: value } });
    },

    setPendingImage(pendingImage: string) {
      changed({ pendingImage });
    },

    /** A picture the group holds goes with it, as its address opens without a session. */
    removeImage() {
      const { form } = state;
      if (!form) return;

      const image = form.fields.image;
      const held = typeof image === 'string' && image.startsWith('/avatar/group/');

      changed({
        pendingImage: null,
        clearPicture: form.clearPicture || held,
        fields: { ...form.fields, image: '' },
      });
    },

    imageFailed() {
      fail('Ta slika ne može da se pročita. Izaberi drugu.');
    },

    /** A post changed by hand returns to what its template makes of its fields. */
    backToTemplate() {
      const post = state.form?.changedPost;
      if (post) changed({ template: post.template, fields: post.fields, changedPost: null, format: 'markdown' });
    },

    /** Sačuvaj: a new post stays a draft, and one already out changes where it is. */
    async savePost() {
      const child = await save();
      if (child) notify(isDraft({ audience: audienceOf(child) }) ? 'Sačuvano. Vidiš je samo ti.' : 'Izmene su objavljene.');
    },

    /** Objavi. */
    async publish(audience: Audience) {
      const child = await save(audience);
      if (!child) return;

      backToList();
      notify('Objavljeno.');
    },

    /** Changes who a post reaches, for one already out. */
    async changeAudience(audience: Audience) {
      const child = await save(audience);
      if (child) notify('Publika je promenjena.');
    },

    /** Povuci. */
    async withdraw() {
      const id = state.form?.id;
      if (id == null || state.saving) return;

      update({ saving: true, error: null });
      const reply = await api.withdrawChild(id).catch(() => null);
      update({ saving: false });

      if (!reply?.ok) return fail(reply ? failureOf(reply) : FAILED_SAVE);

      if (state.form) {
        update({
          form: { ...state.form, audience: audienceOf(reply.group), memberCount: reply.group.member_count },
        });
      }

      void fetchPosts();
      notify('Objava je povučena. Sada je vidiš samo ti.');
    },

    backToList,

    /** Leaves for the group's chat, settings or, for a parent, its page. The app ends with the page. */
    async leaveFor(id: number, tab?: PotokGroupTab) {
      const reply = await api.openGroup(id, { tab }).catch(() => null);
      if (!reply?.ok) fail('Ta strana trenutno ne može da se otvori.');
    },

    clearMessage() {
      update({ notice: null, error: null });
    },

    defaultAudience: () => (state.group ? defaultAudience(state.group) : DRAFT),
  };
}

export type Creator = ReturnType<typeof createCreator>;
