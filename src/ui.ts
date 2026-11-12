import { html, nothing, render, svg, type TemplateResult } from 'lit-html';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { reachOf, setupWarnings, STATE_LABELS, stateOf, type Audience } from './audience';
import { audienceOf, createCreator, isDraft, missingOf, type Creator, type CreatorState, type Form } from './creator';
import { shrinkImage } from './image';
import type { PotokSubgroup } from './potok';
import {
  LEVEL_OPTIONS,
  MAX_ITEMS,
  TEMPLATES,
  templateOf,
  WAITING_IMAGE,
  type Field,
  type Template,
} from './templates';

type Tab = 'write' | 'preview';

/** What only the screen needs to know. */
type Ui = {
  tab: Tab;
  /** The audience being chosen in the dialog, while it is open. */
  audience: Audience | null;
  confirmingWithdraw: boolean;
};

/** A beach of colors for the pictures in the list of formats. */
const SAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150"><rect width="320" height="150" fill="#bfdbfe"/><circle cx="250" cy="44" r="22" fill="#fde68a"/><path d="M0 110 C70 70 120 130 190 96 S300 80 320 100 V150 H0Z" fill="#2563eb"/></svg>',
)}`;

const icon = (...paths: string[]) => html`
  <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    ${paths.map((path) => svg`<path stroke-linecap="round" stroke-linejoin="round" d=${path} />`)}
  </svg>
`;

const plusIcon = icon('M12 4.5v15m7.5-7.5h-15');
const backIcon = icon('M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18');
const closeIcon = icon('M6 18 18 6M6 6l12 12');
const warningIcon = icon(
  'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z',
  'M12 15.75h.007v.008H12v-.008Z',
);
const chatIcon = icon(
  'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z',
);
const settingsIcon = icon(
  'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z',
  'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
);

const dateLabel = (iso: string) => {
  const date = new Date(iso);
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}.`;
};

/** A screen with nothing else on it: loading, a failure, or no access. */
const message = (title: string, hint?: string, action?: TemplateResult) => html`
  <div class="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-base-content">
    <p class="text-lg font-semibold">${title}</p>
    ${hint ? html`<p class="max-w-sm text-sm opacity-70">${hint}</p>` : nothing}
    ${action ?? nothing}
  </div>
`;

const withImage = (markup: string, image: string) => markup.replaceAll(WAITING_IMAGE, image);

// --- The list of posts

const stateBadge = (post: PotokSubgroup) => {
  if (post.uses_api) return html`<span class="d-badge d-badge-sm d-badge-ghost shrink-0">Aplikacija</span>`;

  const state = stateOf(audienceOf(post));
  const tone = state === 'draft' ? 'd-badge-warning' : state === 'members' ? 'd-badge-neutral' : 'd-badge-primary';

  return html`<span class="d-badge d-badge-sm ${tone} shrink-0">${STATE_LABELS[state]}</span>`;
};

const postRow = (creator: Creator, post: PotokSubgroup) => html`
  <li>
    <button class="fc-row" data-post=${post.id} @click=${() => void creator.openPost(post)}>
      <img class="size-11 shrink-0 rounded-xl object-cover" src=${post.picture_url} alt="" />
      <span class="min-w-0 flex-1 text-start">
        <span class="block truncate font-medium">${post.name}</span>
        <span class="block text-sm opacity-70">${dateLabel(post.published_at ?? post.inserted_at)}</span>
      </span>
      ${stateBadge(post)}
    </button>
  </li>
`;

const setupCard = (state: CreatorState) => {
  const warnings = state.group ? setupWarnings(state.group) : [];
  if (warnings.length === 0) return nothing;

  return html`
    <details id="setup-warnings" class="fc-setup" open>
      <summary class="flex cursor-pointer items-center gap-2 font-medium">
        ${warningIcon} Podešavanje feed-a (${warnings.length})
      </summary>
      <ul class="mt-2 flex flex-col gap-3 text-sm">
        ${warnings.map(
          ({ id, problem, fix }) => html`
            <li data-warning=${id}>
              <p>${problem}</p>
              <p class="font-medium">${fix}</p>
            </li>
          `,
        )}
      </ul>
    </details>
  `;
};

const unsavedCard = (creator: Creator, state: CreatorState) => {
  const { unsaved } = state;
  if (!unsaved) return nothing;

  const { title, name } = templateOf(unsaved.template);

  return html`
    <div id="unsaved-post" class="fc-card flex flex-wrap items-center gap-3">
      <p class="min-w-40 flex-1 text-sm">
        Nedovršeno: <span class="font-medium">${title(unsaved.fields) || name}</span>
      </p>
      <button id="unsaved-discard" class="d-btn d-btn-ghost d-btn-sm" @click=${() => creator.discardUnsaved()}>
        Odbaci
      </button>
      <button id="unsaved-resume" class="d-btn d-btn-primary d-btn-sm" @click=${() => void creator.resumeUnsaved()}>
        Nastavi
      </button>
    </div>
  `;
};

const listScreen = (creator: Creator, state: CreatorState) => {
  const group = state.group!;
  const parent = group.parent;

  return html`
    <header class="fc-header">
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-semibold">FeedCreator</h1>
        ${parent
          ? html`<button
              id="open-feed"
              class="fc-link"
              @click=${() => void creator.leaveFor(parent.id, 'description')}
            >
              Feed: ${parent.name}
            </button>`
          : nothing}
      </div>
      ${group.can_create_children
        ? html`<button id="new-post" class="d-btn d-btn-primary d-btn-sm" @click=${() => creator.chooseTemplate()}>
            ${plusIcon} Nova objava
          </button>`
        : nothing}
    </header>
    <main class="fc-scroll">
      <div class="fc-column flex flex-col gap-3">
        ${setupCard(state)} ${unsavedCard(creator, state)}
        ${state.posts.length === 0
          ? html`<p id="no-posts" class="py-12 text-center opacity-70">Još nema objava.</p>`
          : html`<ul id="posts" class="flex flex-col gap-2">
              ${state.posts.map((post) => postRow(creator, post))}
            </ul>`}
        ${state.hasMore
          ? html`<button
              id="load-more"
              class="d-btn d-btn-ghost d-btn-sm self-center"
              ?disabled=${state.loadingMore}
              @click=${() => void creator.loadMore()}
            >
              Učitaj još
            </button>`
          : nothing}
      </div>
    </main>
  `;
};

// --- The list of formats

const templateCard = (creator: Creator, template: Template, current: boolean) => html`
  <button
    class="fc-template ${current ? 'fc-template-current' : ''}"
    data-template=${template.id}
    @click=${() => creator.pickTemplate(template.id)}
  >
    <span class="fc-thumb" aria-hidden="true">
      <span class="fc-thumb-page rich-content">
        ${template.id === 'text'
          ? html`<p>${template.sample.source}</p>`
          : unsafeHTML(withImage(template.render(template.sample), SAMPLE_IMAGE))}
      </span>
    </span>
    <span class="px-3 pt-2 font-medium">${template.name}</span>
    <span class="px-3 pb-3 text-sm opacity-70">${template.purpose}</span>
  </button>
`;

const templatesScreen = (creator: Creator, state: CreatorState) => html`
  <header class="fc-header">
    <button class="d-btn d-btn-ghost d-btn-sm d-btn-square" aria-label="Nazad" @click=${() => creator.leaveTemplates()}>
      ${backIcon}
    </button>
    <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">Izaberi format</h1>
  </header>
  <main class="fc-scroll">
    <div id="templates" class="fc-column fc-template-grid">
      ${TEMPLATES.map((template) => templateCard(creator, template, state.form?.template === template.id))}
    </div>
  </main>
`;

// --- The editor

const fieldShell = (field: Field, control: TemplateResult) => html`
  <label class="fc-field">
    <span class="fc-label">${field.label}${field.required ? html`<span aria-hidden="true"> *</span>` : nothing}</span>
    ${control} ${field.hint ? html`<span class="fc-hint">${field.hint}</span>` : nothing}
  </label>
`;

const textValue = (form: Form, key: string) => {
  const value = form.fields[key];
  return typeof value === 'string' ? value : '';
};

const imageField = (creator: Creator, form: Form, field: Field) => {
  const address = textValue(form, field.key);
  const shown = form.pendingImage ?? address;

  const picked = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const picture = await shrinkImage(file);
    if (picture) creator.setPendingImage(picture);
    else creator.imageFailed();
  };

  return html`
    <div class="fc-field" data-field=${field.key}>
      <span class="fc-label">${field.label}${field.required ? html`<span aria-hidden="true"> *</span>` : nothing}</span>
      ${shown
        ? html`<div class="fc-image">
            <img src=${shown} alt="" />
            <button
              type="button"
              class="d-btn d-btn-circle d-btn-sm"
              aria-label="Ukloni sliku"
              @click=${() => creator.removeImage()}
            >
              ${closeIcon}
            </button>
          </div>`
        : nothing}
      <div class="flex flex-wrap gap-2">
        ${form.pendingImage
          ? nothing
          : html`<input
              class="d-input min-w-40 flex-1"
              type="url"
              inputmode="url"
              placeholder="https://"
              aria-label="Adresa slike"
              .value=${address.startsWith('/avatar/') ? '' : address}
              @input=${(event: Event) => creator.setField(field.key, (event.target as HTMLInputElement).value)}
            />`}
        <label class="d-btn d-btn-outline">
          Sa uređaja
          <input class="hidden" type="file" accept="image/*" @change=${picked} />
        </label>
      </div>
      <span class="fc-hint">Slika sa uređaja postaje i slika grupe, a njena adresa se otvara bez prijave.</span>
    </div>
  `;
};

const itemsField = (creator: Creator, form: Form, field: Field) => {
  const stored = form.fields[field.key];
  const rows = Array.isArray(stored) && stored.length > 0 ? stored : [''];

  const setRow = (index: number, value: string) =>
    creator.setField(
      field.key,
      rows.map((row, position) => (position === index ? value : row)),
    );

  return html`
    <div class="fc-field" data-field=${field.key}>
      <span class="fc-label">${field.label}${field.required ? html`<span aria-hidden="true"> *</span>` : nothing}</span>
      <ol class="flex flex-col gap-2">
        ${rows.map(
          (row, index) => html`
            <li class="flex items-center gap-2">
              <span class="w-5 text-end text-sm opacity-70">${index + 1}</span>
              <input
                class="d-input min-w-0 flex-1"
                aria-label="Stavka ${index + 1}"
                .value=${row}
                @input=${(event: Event) => setRow(index, (event.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="d-btn d-btn-ghost d-btn-sm d-btn-square"
                aria-label="Ukloni stavku ${index + 1}"
                ?disabled=${rows.length === 1}
                @click=${() =>
                  creator.setField(
                    field.key,
                    rows.filter((_row, position) => position !== index),
                  )}
              >
                ${closeIcon}
              </button>
            </li>
          `,
        )}
      </ol>
      <button
        type="button"
        class="d-btn d-btn-ghost d-btn-sm self-start"
        ?disabled=${rows.length >= MAX_ITEMS}
        @click=${() => creator.setField(field.key, [...rows, ''])}
      >
        ${plusIcon} Dodaj stavku
      </button>
    </div>
  `;
};

const fieldView = (creator: Creator, form: Form, field: Field) => {
  const input = (event: Event) =>
    creator.setField(field.key, (event.target as HTMLInputElement | HTMLTextAreaElement).value);

  switch (field.kind) {
    case 'image':
      return imageField(creator, form, field);
    case 'items':
      return itemsField(creator, form, field);
    case 'textarea':
      return fieldShell(
        field,
        html`<textarea
          class="d-textarea fc-textarea w-full"
          data-field=${field.key}
          rows=${field.key === 'body' || field.key === 'source' ? 6 : 3}
          placeholder=${field.placeholder ?? nothing}
          .value=${textValue(form, field.key)}
          @input=${input}
        ></textarea>`,
      );
    case 'level':
      return fieldShell(
        field,
        html`<select class="d-select w-full" data-field=${field.key} @change=${input}>
          ${LEVEL_OPTIONS.map(
            ({ value, label }) =>
              html`<option value=${value} ?selected=${(textValue(form, field.key) || 'info') === value}>${label}</option>`,
          )}
        </select>`,
      );
    default:
      return fieldShell(
        field,
        html`<input
          class="d-input w-full"
          data-field=${field.key}
          type=${field.kind}
          placeholder=${field.placeholder ?? nothing}
          .value=${textValue(form, field.key)}
          @input=${input}
        />`,
      );
  }
};

const changedCard = (creator: Creator, form: Form) =>
  form.changedPost
    ? html`
        <div id="changed-by-hand" class="fc-setup text-sm">
          <p>Tekst ove objave je menjan ručno, pa je otvoren kao slobodan tekst.</p>
          <button type="button" class="fc-link font-medium" @click=${() => creator.backToTemplate()}>
            Vrati na šablon ${templateOf(form.changedPost.template).name}
          </button>
        </div>
      `
    : nothing;

const closedWithOthers = (form: Form) =>
  isDraft(form) && form.memberCount > 1
    ? html`
        <p id="draft-with-members" class="fc-setup text-sm">
          Ovo nije objavljeno, ali grupu vide i drugi članovi (${form.memberCount - 1}). Ako to ne želiš, ukloni ih u
          članovima grupe.
        </p>
      `
    : nothing;

const linksView = (creator: Creator, form: Form) =>
  form.id === null
    ? nothing
    : html`
        <div class="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            id="open-chat"
            class="d-btn d-btn-ghost d-btn-sm"
            @click=${() => void creator.leaveFor(form.id!)}
          >
            ${chatIcon} Chat
          </button>
          <button
            type="button"
            id="open-settings"
            class="d-btn d-btn-ghost d-btn-sm"
            @click=${() => void creator.leaveFor(form.id!, 'settings')}
          >
            ${settingsIcon} Podešavanja grupe
          </button>
        </div>
      `;

const previewView = (state: CreatorState, form: Form) => {
  const shown =
    state.previewHtml === null
      ? html`<p class="py-12 text-center text-sm opacity-70">Tekst stiže ovde čim ga upišeš.</p>`
      : html`<div class="rich-content text-[1.0625rem]">
          ${unsafeHTML(form.pendingImage ? withImage(state.previewHtml, form.pendingImage) : state.previewHtml)}
        </div>`;

  return html`
    <section id="preview" class="fc-preview" aria-label="Pregled">
      <p class="fc-label">Ovako izgleda u feed-u</p>
      <div class="fc-preview-card">${shown}</div>
    </section>
  `;
};

const actionsView = (creator: Creator, state: CreatorState, ui: Ui, draw: () => void) => {
  const form = state.form!;
  const missing = missingOf(form);
  const blocked = missing.length > 0 || state.saving;
  const hint = missing.length > 0 ? html`<p class="fc-hint w-full">Još treba: ${missing.join(', ')}.</p>` : nothing;

  if (isDraft(form)) {
    return html`
      <footer class="fc-bar">
        ${hint}
        <button id="save" class="d-btn d-btn-outline flex-1" ?disabled=${blocked} @click=${() => void creator.savePost()}>
          Sačuvaj
        </button>
        <button
          id="publish"
          class="d-btn d-btn-primary flex-1"
          ?disabled=${blocked}
          @click=${() => {
            ui.audience = creator.defaultAudience();
            draw();
          }}
        >
          Objavi
        </button>
      </footer>
    `;
  }

  return html`
    <footer class="fc-bar">
      ${hint}
      <button
        id="withdraw"
        class="d-btn d-btn-ghost d-btn-error"
        ?disabled=${state.saving}
        @click=${() => {
          ui.confirmingWithdraw = true;
          draw();
        }}
      >
        Povuci
      </button>
      <button
        id="change-audience"
        class="d-btn d-btn-outline"
        ?disabled=${blocked}
        @click=${() => {
          ui.audience = form.audience;
          draw();
        }}
      >
        Publika
      </button>
      <button id="save" class="d-btn d-btn-primary flex-1" ?disabled=${blocked} @click=${() => void creator.savePost()}>
        Sačuvaj izmene
      </button>
    </footer>
  `;
};

const audienceSwitch = (
  id: string,
  title: string,
  about: string,
  checked: boolean,
  disabled: boolean,
  change: (checked: boolean) => void,
) => html`
  <label class="fc-switch">
    <input
      id=${id}
      class="d-toggle d-toggle-primary mt-0.5"
      type="checkbox"
      .checked=${checked}
      ?disabled=${disabled}
      @change=${(event: Event) => change((event.target as HTMLInputElement).checked)}
    />
    <span>
      <span class="block font-medium">${title}</span>
      <span class="fc-hint block">${about}</span>
    </span>
  </label>
`;

const audienceDialog = (creator: Creator, state: CreatorState, ui: Ui, draw: () => void) => {
  const form = state.form!;
  const audience = ui.audience!;
  const published = !isDraft(form);
  const closed = stateOf(audience) === 'draft';
  const reach = reachOf(audience, state.group!);

  // Turning it off here would leave every member in the group: that is what Povuci is for.
  const inheritanceLocked = published && form.audience.inheritsMembers;

  const setAudience = (patch: Partial<Audience>) => {
    ui.audience = { ...audience, ...patch };
    draw();
  };

  const close = () => {
    ui.audience = null;
    draw();
  };

  const confirm = () => {
    ui.audience = null;
    draw();
    void (published ? creator.changeAudience(audience) : creator.publish(audience));
  };

  return html`
    <div id="audience-dialog" class="d-modal d-modal-open d-modal-bottom sm:d-modal-middle" role="dialog" aria-modal="true" aria-labelledby="audience-title">
      <div class="d-modal-box flex flex-col gap-4">
        <h2 id="audience-title" class="text-lg font-semibold">${published ? 'Ko vidi objavu' : 'Objavi'}</h2>
        ${audienceSwitch(
          'audience-public',
          'Javna grupa',
          'Svako može da vidi grupu i da traži pristup.',
          audience.isPublic,
          false,
          (isPublic) => setAudience({ isPublic }),
        )}
        ${audienceSwitch(
          'audience-inherits',
          'Nasleđuje članove',
          inheritanceLocked
            ? 'Ovo može da se poništi samo dugmetom Povuci.'
            : 'Svaki član ove grupe je i član objave, sa istim ulogama.',
          audience.inheritsMembers,
          inheritanceLocked,
          (inheritsMembers) => setAudience({ inheritsMembers }),
        )}
        ${closed
          ? html`<p id="audience-closed" class="fc-setup text-sm">Ovako objavu vidiš samo ti. Uključi bar jedan prekidač.</p>`
          : html`
              <dl id="audience-reach" class="fc-reach">
                <dt>Vide je</dt>
                <dd>${reach.sees}</dd>
                <dt>Razgovaraju</dt>
                <dd>${reach.talks}</dd>
              </dl>
              ${reach.warnings.length > 0
                ? html`<ul class="fc-hint flex list-disc flex-col gap-1 ps-5">
                    ${reach.warnings.map((warning) => html`<li>${warning}</li>`)}
                  </ul>`
                : nothing}
            `}
        <div class="flex justify-end gap-2">
          <button id="audience-cancel" class="d-btn d-btn-ghost" @click=${close}>Otkaži</button>
          <button id="audience-confirm" class="d-btn d-btn-primary" ?disabled=${closed} @click=${confirm}>
            ${published ? 'Sačuvaj' : 'Objavi'}
          </button>
        </div>
      </div>
    </div>
  `;
};

const withdrawDialog = (creator: Creator, ui: Ui, draw: () => void) => html`
  <div id="withdraw-dialog" class="d-modal d-modal-open d-modal-bottom sm:d-modal-middle" role="dialog" aria-modal="true" aria-labelledby="withdraw-title">
    <div class="d-modal-box flex flex-col gap-3">
      <h2 id="withdraw-title" class="text-lg font-semibold">Povuci objavu?</h2>
      <p class="text-sm">
        Objava nestaje iz feed-a i postaje nacrt. Članovi koji su u nju ušli nasleđivanjem izlaze iz grupe, a chat ostaje
        sa svim porukama. Kad je ponovo objaviš, vraćaju se i ona ide na vrh feed-a.
      </p>
      <div class="flex justify-end gap-2">
        <button
          id="withdraw-cancel"
          class="d-btn d-btn-ghost"
          @click=${() => {
            ui.confirmingWithdraw = false;
            draw();
          }}
        >
          Otkaži
        </button>
        <button
          id="withdraw-confirm"
          class="d-btn d-btn-error"
          @click=${() => {
            ui.confirmingWithdraw = false;
            draw();
            void creator.withdraw();
          }}
        >
          Povuci
        </button>
      </div>
    </div>
  </div>
`;

const editorScreen = (creator: Creator, state: CreatorState, ui: Ui, draw: () => void) => {
  const form = state.form!;
  const template = templateOf(form.template);
  const name = template.title(form.fields);

  const setTab = (tab: Tab) => {
    ui.tab = tab;
    draw();
  };

  return html`
    <header class="fc-header">
      <button
        id="back-to-list"
        class="d-btn d-btn-ghost d-btn-sm d-btn-square"
        aria-label="Nazad na objave"
        @click=${() => creator.backToList()}
      >
        ${backIcon}
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-semibold">${name || 'Nova objava'}</h1>
        <p class="truncate text-sm opacity-70">
          <button id="change-template" class="fc-link" @click=${() => creator.chooseTemplate()}>${template.name}</button>
          · ${STATE_LABELS[stateOf(form.audience)]}
        </p>
      </div>
      <div class="d-tabs d-tabs-box d-tabs-sm fc-tabs" role="tablist">
        <button
          id="tab-write"
          role="tab"
          aria-selected=${ui.tab === 'write'}
          class="d-tab ${ui.tab === 'write' ? 'd-tab-active' : ''}"
          @click=${() => setTab('write')}
        >
          Piši
        </button>
        <button
          id="tab-preview"
          role="tab"
          aria-selected=${ui.tab === 'preview'}
          class="d-tab ${ui.tab === 'preview' ? 'd-tab-active' : ''}"
          @click=${() => setTab('preview')}
        >
          Pregled
        </button>
      </div>
    </header>
    <main class="fc-scroll">
      <div class="fc-editor" data-tab=${ui.tab}>
        <form id="post-form" class="fc-form" @submit=${(event: Event) => event.preventDefault()}>
          <fieldset class="flex flex-col gap-4" ?disabled=${state.saving}>
            ${changedCard(creator, form)} ${closedWithOthers(form)}
            ${template.fields.map((field) => fieldView(creator, form, field))} ${linksView(creator, form)}
          </fieldset>
        </form>
        ${previewView(state, form)}
      </div>
    </main>
    ${actionsView(creator, state, ui, draw)}
    ${ui.audience ? audienceDialog(creator, state, ui, draw) : nothing}
    ${ui.confirmingWithdraw ? withdrawDialog(creator, ui, draw) : nothing}
  `;
};

const toast = (creator: Creator, state: CreatorState) => {
  const text = state.error ?? state.notice;
  if (!text) return nothing;

  return html`
    <div id="toast" class="d-toast d-toast-top d-toast-center z-50 max-w-full whitespace-normal">
      <div role="status" class="d-alert ${state.error ? 'd-alert-error' : 'd-alert-info'} whitespace-normal">
        <span>${text}</span>
        <button class="d-btn d-btn-ghost d-btn-xs d-btn-square" aria-label="Zatvori" @click=${() => creator.clearMessage()}>
          ${closeIcon}
        </button>
      </div>
    </div>
  `;
};

const screenView = (creator: Creator, state: CreatorState, ui: Ui, draw: () => void) => {
  switch (state.phase) {
    case 'loading':
      return message('Učitavam objave…');
    case 'preview':
      return message('Pregled', 'FeedCreator radi tek na stranici grupe.');
    case 'denied':
      return message(
        'Objave uređuju oni koji smeju da menjaju ovu grupu',
        'Aplikacija pravi grupe u ime onoga ko je koristi, pa je dostupna samo njima.',
        // Someone without an account, at a `.feed` open to guests for its stories.
        state.group?.signed_in === false
          ? html`<button id="log-in" class="d-btn d-btn-primary d-btn-sm mt-3" @click=${() => void window.potok.openLogin()}>
              Prijavi se
            </button>`
          : undefined,
      );
    case 'failed':
      return message(
        'Objave nisu učitane',
        undefined,
        html`<button id="retry" class="d-btn d-btn-primary d-btn-sm mt-3" @click=${() => void creator.start()}>
          Pokušaj ponovo
        </button>`,
      );
  }

  if (state.screen === 'templates') return templatesScreen(creator, state);
  if (state.screen === 'editor' && state.form) return editorScreen(creator, state, ui, draw);
  return listScreen(creator, state);
};

const WIDE = '(min-width: 56rem)';

export function mountCreator(root: HTMLElement) {
  root.classList.add('fc');

  const ui: Ui = { tab: 'write', audience: null, confirmingWithdraw: false };
  const wide = window.matchMedia(WIDE);

  const draw = () => {
    const { state } = creator;

    // The next post starts with its form, whatever the last one ended on.
    if (state.screen !== 'editor') ui.tab = 'write';

    render(html`${screenView(creator, state, ui, draw)}${toast(creator, state)}`, root);
    creator.showPreview(state.screen === 'editor' && (wide.matches || ui.tab === 'preview'));
  };

  const creator = createCreator(window.potok, localStorage, () => draw());

  wide.addEventListener('change', draw);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || (!ui.audience && !ui.confirmingWithdraw)) return;

    ui.audience = null;
    ui.confirmingWithdraw = false;
    draw();
  });

  void creator.start();
}
