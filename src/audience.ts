import type { PotokOwnGroup } from './potok';

// Who a post reaches. Potok has no notion of a post, so this is only what the
// two switches of its group add up to. The sentences here say what Potok does
// with them; `docs/feed-i-feedcreator.md` in potok-ide says why.

export type Audience = { isPublic: boolean; inheritsMembers: boolean };

export type PostState = 'draft' | 'members' | 'public' | 'public_closed_chat';

export const DRAFT: Audience = { isPublic: false, inheritsMembers: false };

/** The name Feed reads its stories from (`FEED_GROUP` in potok-feed). */
export const FEED_GROUP = '.feed';

export function stateOf({ isPublic, inheritsMembers }: Audience): PostState {
  if (isPublic) return inheritsMembers ? 'public' : 'public_closed_chat';
  return inheritsMembers ? 'members' : 'draft';
}

export const STATE_LABELS: Record<PostState, string> = {
  draft: 'Nacrt',
  members: 'Članovi',
  public: 'Javno',
  public_closed_chat: 'Javno',
};

/** A post starts out reaching whoever can see `.feed` itself. */
export function defaultAudience(group: PotokOwnGroup): Audience {
  return { isPublic: group.is_public, inheritsMembers: true };
}

export type Reach = {
  /** Who sees the post. */
  sees: string;
  /** Who can talk about it. */
  talks: string;
  /** What else to know before publishing this way. */
  warnings: string[];
};

export function reachOf(audience: Audience, group: PotokOwnGroup): Reach {
  const { isPublic, inheritsMembers } = audience;
  const warnings: string[] = [];

  if (isPublic && !group.is_public) {
    warnings.push(
      `${group.name} je privatna, pa objavu u feed-u vide samo njeni članovi. Ipak, svako ko ima link vidi je i van Potoka.`,
    );
  }

  if (isPublic) {
    warnings.push('Ime, slika i opis javne grupe vide se i van Potoka, svakome ko ima link.');
  }

  if (inheritsMembers) {
    warnings.push('Svaki član dobija obaveštenje o svakoj poruci u razgovoru o ovoj objavi.');
  }

  const members = `članovi grupe ${group.name}`;

  return {
    sees: isPublic ? 'svi prijavljeni' : inheritsMembers ? members : 'samo ti i oni koje pozoveš',
    talks: inheritsMembers
      ? members
      : isPublic
        ? 'samo oni koji dobiju pristup'
        : 'samo ti i oni koje pozoveš',
    warnings,
  };
}

export type SetupWarning = { id: string; problem: string; fix: string };

/** What in the group's own settings keeps the feed from working as it should. */
export function setupWarnings(group: PotokOwnGroup): SetupWarning[] {
  const warnings: SetupWarning[] = [];
  const parent = group.parent;

  if (group.name !== FEED_GROUP) {
    warnings.push({
      id: 'name',
      problem: `Feed čita samo podgrupu tačnog imena ${FEED_GROUP}, a ova se zove ${group.name}.`,
      fix: `Preimenuj je u ${FEED_GROUP} u podešavanjima grupe.`,
    });
  }

  if (parent?.is_public && !group.is_public) {
    warnings.push({
      id: 'private_under_public',
      problem: `Grupa ${parent.name} je javna, a ova je privatna, pa nečlanovi u Feed-u vide poruku da ${FEED_GROUP} ne postoji.`,
      fix: 'Uključi „Javna grupa“ u podešavanjima ove grupe.',
    });
  }

  if (parent && !group.inherits_members) {
    warnings.push({
      id: 'no_inheritance',
      problem: `Ova grupa ne nasleđuje članove, pa članovi grupe ${parent.name} nisu članovi objava.`,
      fix: 'Uključi „Nasleđuje članove“ u podešavanjima ove grupe.',
    });
  }

  if (group.everyone_creates_subgroups) {
    warnings.push({
      id: 'everyone_creates',
      problem: 'Svaki član može ručno da napravi podgrupu ovde, a javna podgrupa odmah ulazi u Feed.',
      fix: 'U ulogama napravi sopstveni manifest i isključi „Kreiranje podgrupa“ za sve članove.',
    });
  }

  return warnings;
}
