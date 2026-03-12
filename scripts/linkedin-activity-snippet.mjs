const options = {
  maxCards: Number.parseInt(process.argv[2] ?? "15", 10),
};

if (!Number.isFinite(options.maxCards) || options.maxCards <= 0) {
  console.error("maxCards must be a positive integer");
  process.exit(1);
}

const snippet = String.raw`async (page) => {
  const maxCards = ${options.maxCards};
  const currentUrl = page.url();

  if (!currentUrl.includes("/recent-activity/all/")) {
    throw new Error("Open the lead's recent-activity/all page before running this snippet.");
  }

  const result = await page.evaluate(({ maxCards }) => {
    const clean = (value) =>
      (value || "")
        .replace(/\s+/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();

    const pickText = (root, selectors) => {
      for (const selector of selectors) {
        const node = root.querySelector(selector);
        const text = clean(node?.textContent || "");
        if (text) return text;
      }
      return "";
    };

    const cards = Array.from(document.querySelectorAll("article")).slice(0, maxCards);

    return cards.map((card, index) => {
      const actor =
        pickText(card, [
          '[data-test-app-aware-link] span[aria-hidden="true"]',
          '.update-components-actor__title span[aria-hidden="true"]',
          '.feed-shared-actor__name',
          'a[href*="/in/"] span[aria-hidden="true"]',
        ]) || "unknown";

      const actorHref =
        card.querySelector('a[href*="/in/"], a[href*="/company/"]')?.href || "";

      const body =
        pickText(card, [
          '.update-components-text span[dir="ltr"]',
          '.feed-shared-inline-show-more-text span[dir="ltr"]',
          '.update-components-update-v2__commentary',
          '.feed-shared-text',
        ]) || "";

      const snippet = body.slice(0, 220);
      const timestamp = pickText(card, [
        'span.update-components-actor__sub-description',
        '.feed-shared-actor__sub-description',
      ]);

      const menuButton = card.querySelector('button[aria-label*="menu de controle"], button[aria-label*="control menu"], button[aria-label*="publication control menu"]');
      const menuAria = clean(menuButton?.getAttribute("aria-label") || "");

      const publicationHref =
        card.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]')?.href || "";

      const isShared = clean(card.textContent || "").includes("compartilhou isso");
      const type = isShared ? "shared_post" : "author_post";

      return {
        id: index + 1,
        actor,
        actorHref,
        type,
        timestamp,
        snippet,
        publicationHref,
        menuAria,
      };
    });
  }, { maxCards });

  return result;
}`;

console.log(snippet);
