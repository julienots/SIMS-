export default async ({ wait, shot, ev }) => {
  await wait(1500); await shot('01-splash');
  await wait(3000); await shot('02-menu');
  // Nouvel univers via l'API interne.
  await ev(async () => {
    const { generateWorld } = window.__test || {};
    return !!window.__app;
  });
};
