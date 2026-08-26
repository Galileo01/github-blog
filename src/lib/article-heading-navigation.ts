const SELECTORS = {
  root: '[data-article-heading-navigation]',
  link: '[data-heading-navigation-link][data-heading-id]',
  currentHeadingLabel: '[data-current-heading-label]',
} as const;

const setCurrentHeading = (
  links: HTMLAnchorElement[],
  currentHeadingLabels: HTMLElement[],
  heading: HTMLElement,
) => {
  for (const link of links) {
    if (link.dataset.headingId === heading.id) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  }

  const headingText = heading.textContent?.trim() ?? '';
  for (const label of currentHeadingLabels) label.textContent = headingText;
};

export const initializeArticleHeadingNavigation = () => {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS.root));
  const links = roots.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>(SELECTORS.link)),
  );
  const currentHeadingLabels = roots.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(SELECTORS.currentHeadingLabel)),
  );

  if (links.length === 0) return;

  const headingIds = [...new Set(links.map((link) => link.dataset.headingId).filter(Boolean))] as string[];
  const headings = headingIds
    .map((headingId) => document.getElementById(headingId))
    .filter((heading): heading is HTMLElement => heading !== null);

  if (headings.length === 0) return;

  let frameId: number | undefined;

  const updateCurrentHeading = () => {
    frameId = undefined;
    const activationOffset = window.matchMedia('(max-width: 639px)').matches ? 128 : 96;
    let currentHeading = headings[0];

    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= activationOffset) {
        currentHeading = heading;
      } else {
        break;
      }
    }

    setCurrentHeading(links, currentHeadingLabels, currentHeading);
  };

  const scheduleUpdate = () => {
    if (frameId !== undefined) return;
    frameId = window.requestAnimationFrame(updateCurrentHeading);
  };

  for (const link of links) {
    link.addEventListener('click', () => {
      const details = link.closest('details');
      if (details instanceof HTMLDetailsElement) details.open = false;
    });
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('hashchange', scheduleUpdate);
  updateCurrentHeading();
};
