import { mountCreator } from './ui';

if (import.meta.env.DEV) {
  const { seedDevCreator } = await import('./dev-tools');
  const { installDevPotok } = await import('./potok-dev');
  seedDevCreator();
  installDevPotok();
}

mountCreator(document.querySelector<HTMLElement>('#creator')!);
