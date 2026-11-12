import { describe, expect, it } from 'vitest';
import { defaultAudience, FEED_GROUP, reachOf, setupWarnings, stateOf } from './audience';
import type { PotokOwnGroup } from './potok';

const group = (patch: Partial<PotokOwnGroup> = {}): PotokOwnGroup => ({
  id: 2,
  name: FEED_GROUP,
  is_public: false,
  inherits_members: true,
  parent: { id: 1, name: 'Vesti', is_public: false, uses_api: true },
  can_manage_children: true,
  can_create_children: true,
  everyone_creates_subgroups: false,
  can_start_polls: false,
  signed_in: true,
  ...patch,
});

const warningIds = (patch: Partial<PotokOwnGroup>) => setupWarnings(group(patch)).map(({ id }) => id);

describe('stateOf', () => {
  it('reads the two switches', () => {
    expect(stateOf({ isPublic: false, inheritsMembers: false })).toBe('draft');
    expect(stateOf({ isPublic: false, inheritsMembers: true })).toBe('members');
    expect(stateOf({ isPublic: true, inheritsMembers: true })).toBe('public');
    expect(stateOf({ isPublic: true, inheritsMembers: false })).toBe('public_closed_chat');
  });
});

describe('defaultAudience', () => {
  it('follows the group, and inherits its members', () => {
    expect(defaultAudience(group({ is_public: true }))).toEqual({ isPublic: true, inheritsMembers: true });
    expect(defaultAudience(group())).toEqual({ isPublic: false, inheritsMembers: true });
  });
});

describe('reachOf', () => {
  it('says that a post for the members stays with them', () => {
    const reach = reachOf({ isPublic: false, inheritsMembers: true }, group());

    expect(reach.sees).toContain(FEED_GROUP);
    expect(reach.talks).toContain(FEED_GROUP);
  });

  it('warns what inheriting costs every member', () => {
    const { warnings } = reachOf({ isPublic: false, inheritsMembers: true }, group());

    expect(warnings.join()).toContain('obaveštenje');
  });

  it('warns that a public group shows outside Potok', () => {
    const { warnings } = reachOf({ isPublic: true, inheritsMembers: false }, group({ is_public: true }));

    expect(warnings.join()).toContain('van Potoka');
    expect(warnings.join()).not.toContain('obaveštenje');
  });

  it('warns of a public post in a private feed, which its readers see differently', () => {
    const { warnings } = reachOf({ isPublic: true, inheritsMembers: true }, group());

    expect(warnings.join()).toContain('je privatna');
  });

  it('says who gets into the chat of a public post that inherits nobody', () => {
    const reach = reachOf({ isPublic: true, inheritsMembers: false }, group({ is_public: true }));

    expect(reach.sees).toBe('svi prijavljeni');
    expect(reach.talks).toContain('pristup');
  });
});

describe('setupWarnings', () => {
  it('has nothing to say about a group set up right', () => {
    expect(setupWarnings(group())).toEqual([]);
  });

  it('knows that Feed reads one name only', () => {
    expect(warningIds({ name: 'vesti' })).toEqual(['name']);
  });

  it('finds a private group under a public parent, where Feed fails for non-members', () => {
    const parent = { id: 1, name: 'Vesti', is_public: true, uses_api: true };

    expect(warningIds({ parent })).toEqual(['private_under_public']);
    expect(warningIds({ parent, is_public: true })).toEqual([]);
  });

  it('finds a group that cuts the chain of inheritance', () => {
    expect(warningIds({ inherits_members: false })).toEqual(['no_inheritance']);
  });

  it('finds a group where any member can post past the app', () => {
    expect(warningIds({ everyone_creates_subgroups: true })).toEqual(['everyone_creates']);
  });

  it('does not guess about a parent the viewer cannot see', () => {
    expect(warningIds({ parent: null, inherits_members: false })).toEqual([]);
  });
});
