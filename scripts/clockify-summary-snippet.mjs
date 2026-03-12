import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const clientName = process.argv[2] ?? "NOZ";
const groupBy = (process.argv[3] ?? "Projeto,Utilizador,Descrição")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!clientName.trim()) {
  console.error("usage: node scripts/clockify-summary-snippet.mjs <client-name> [group1,group2,group3]");
  process.exit(1);
}

if (groupBy.length === 0 || groupBy.length > 3) {
  console.error("grouping must contain between 1 and 3 entries");
  process.exit(1);
}

const normalizeFs = (value) => value.normalize("NFD");
const sanitizeFilePart = (value) =>
  value
    .normalize("NFD")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

const currentMonthFolder = (() => {
  const now = new Date();
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(now);
  const prettyMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const year = String(now.getFullYear());
  const baseDir = path.join(
    os.homedir(),
    "Documents",
    normalizeFs("Nômades"),
    normalizeFs("Financeiro " + year),
    normalizeFs(prettyMonthName),
    "Clockify"
  );
  const fileName = "Relatório_" + sanitizeFilePart(clientName) + ".pdf";
  return { year, prettyMonthName, baseDir, fileName, fullPath: path.join(baseDir, fileName) };
})();

fs.mkdirSync(currentMonthFolder.baseDir, { recursive: true });

const snippet = String.raw`async (page) => {
  const clientName = ${JSON.stringify(clientName)};
  const groupBy = ${JSON.stringify(groupBy)};
  const expectedWorkspace = "Nomades";
  const downloadTarget = ${JSON.stringify(currentMonthFolder)};

  const wait = (ms) => page.waitForTimeout(ms);
  const clean = (value) =>
    (value || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();

  const previousMonthRange = (() => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    return {
      startBr: start.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      endBr: end.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      label: "Último mês",
    };
  })();

  const expectedRange = previousMonthRange.startBr + " - " + previousMonthRange.endBr;

  const readWorkspaceName = async () => {
    const candidates = [
      page.locator("app-topbar-options p").first(),
      page.locator("header p").first(),
      page.locator("p").first(),
    ];

    for (const candidate of candidates) {
      const value = clean(await candidate.innerText().catch(() => ""));
      if (value) return value;
    }

    return "";
  };

  const ensureWorkspace = async () => {
    const currentWorkspace = await readWorkspaceName();
    if (currentWorkspace === expectedWorkspace) {
      return { changed: false, currentWorkspace };
    }

    await page.evaluate(() => {
      const host = document.querySelector("#cake-app-switcher__switcher-button-host");
      const button = host?.shadowRoot?.querySelector("button.switcher-button");

      if (!(button instanceof HTMLElement)) {
        throw new Error("Clockify workspace switcher button not found");
      }

      button.click();
    });

    const targetLink = page.getByRole("link", { name: expectedWorkspace, exact: true });
    await targetLink.waitFor({ state: "visible", timeout: 10000 });
    await targetLink.click();
    await page.waitForURL(/app\.clockify\.me\/(tracker|reports|dashboard|calendar|projects|teams|clients|tags)/, {
      timeout: 20000,
    });
    await wait(1500);

    const finalWorkspace = await readWorkspaceName();
    if (finalWorkspace !== expectedWorkspace) {
      throw new Error(
        'Workspace switch failed. Expected "' + expectedWorkspace + '" but found "' + finalWorkspace + '"'
      );
    }

    return { changed: true, currentWorkspace, finalWorkspace };
  };

  const ensureSummaryPage = async () => {
    if (!page.url().includes("/reports/summary")) {
      await page.goto("https://app.clockify.me/reports/summary", { waitUntil: "domcontentloaded" });
      await wait(1500);
    }

    if (!page.url().includes("/reports/summary")) {
      throw new Error("Could not open Clockify summary report");
    }

    return { changed: true, url: page.url() };
  };

  const findRangeInput = () => page.getByRole("textbox").first();

  const readCurrentRange = async () => clean(await findRangeInput().inputValue().catch(() => ""));

  const periodMenuVisible = async () => {
    const lastMonthOption = page.getByText(previousMonthRange.label, { exact: true }).last();
    return lastMonthOption.isVisible().catch(() => false);
  };

  const openPeriodMenu = async () => {
    if (await periodMenuVisible()) return;

    const triggers = [
      page.getByText(previousMonthRange.label, { exact: true }).first(),
      page.getByText("Este mês", { exact: true }).first(),
      page.locator("[data-testid='calendar-range-picker']").first(),
      page.locator("app-date-range-picker").first(),
      findRangeInput(),
    ];

    for (const trigger of triggers) {
      if (!(await trigger.isVisible().catch(() => false))) continue;
      await trigger.click();
      await wait(250);
      if (await periodMenuVisible()) return;
    }

    throw new Error("Period dropdown trigger not found");
  };

  const ensurePreviousMonth = async () => {
    const currentRange = await readCurrentRange();
    if (currentRange === expectedRange) {
      return { changed: false, expectedRange, currentRange };
    }

    await openPeriodMenu();
    const option = page.getByText(previousMonthRange.label, { exact: true }).last();
    await option.click();
    await wait(1200);

    const finalRange = await readCurrentRange();
    if (finalRange !== expectedRange) {
      throw new Error('Period switch failed. Expected "' + expectedRange + '" but found "' + finalRange + '"');
    }

    return { changed: true, expectedRange, currentRange: finalRange };
  };

  const locateFilterPopover = async () => {
    const search = page.getByPlaceholder("Procurar clientes");
    if (await search.isVisible().catch(() => false)) {
      return search;
    }

    return null;
  };

  const openClientFilter = async () => {
    const existing = await locateFilterPopover();
    if (existing) return existing;

    const triggers = [
      page.getByText("Cliente", { exact: true }).last(),
      page.locator("main").getByText("Cliente", { exact: true }).last(),
    ];

    for (const trigger of triggers) {
      if (!(await trigger.isVisible().catch(() => false))) continue;
      await trigger.click();
      await wait(300);
      const popover = await locateFilterPopover();
      if (popover) return popover;
    }

    throw new Error("Client filter popover not found");
  };

  const evaluateClientSelection = async () =>
    page.evaluate((targetClientName) => {
      const normalize = (value) =>
        (value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const normalizedTarget = normalize(targetClientName);
      const labels = Array.from(document.querySelectorAll("label[for]"));

      const entries = labels
        .map((label) => {
          const text = normalize(label.textContent);
          const inputId = label.getAttribute("for");
          const input = inputId ? document.getElementById(inputId) : null;
          if (!(input instanceof HTMLInputElement)) return null;
          if (!text || text === "selecionar tudo" || text === "arredondamento" || text === "mostrar estimativa") {
            return null;
          }
          return { text, input };
        })
        .filter(Boolean);

      const target = entries.find((entry) => entry.text === normalizedTarget);
      if (!target) {
        throw new Error('Client checkbox not found for "' + targetClientName + '"');
      }

      const checkedEntries = entries.filter((entry) => entry.input.checked);
      return {
        targetChecked: target.input.checked,
        checkedCount: checkedEntries.length,
        exclusive: target.input.checked && checkedEntries.length === 1,
      };
    }, clientName);

  const forceExclusiveClientSelection = async () =>
    page.evaluate((targetClientName) => {
      const normalize = (value) =>
        (value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const normalizedTarget = normalize(targetClientName);
      const labels = Array.from(document.querySelectorAll("label[for]"));
      const entries = labels
        .map((label) => {
          const text = normalize(label.textContent);
          const inputId = label.getAttribute("for");
          const input = inputId ? document.getElementById(inputId) : null;
          if (!(input instanceof HTMLInputElement)) return null;
          if (!text || text === "arredondamento" || text === "mostrar estimativa") return null;
          return { text, input };
        })
        .filter(Boolean);

      let found = false;
      for (const entry of entries) {
        const nextChecked = entry.text === normalizedTarget;
        entry.input.checked = nextChecked;
        entry.input.dispatchEvent(new Event("input", { bubbles: true }));
        entry.input.dispatchEvent(new Event("change", { bubbles: true }));
        if (nextChecked) found = true;
      }

      if (!found) {
        throw new Error('Client checkbox not found for "' + targetClientName + '"');
      }
    }, clientName);

  const closeClientFilterIfOpen = async () => {
    const popover = await locateFilterPopover();
    if (!popover) return;
    await page.keyboard.press("Escape");
    await wait(150);
  };

  const setClientFilter = async () => {
    const search = await openClientFilter();
    await search.fill(clientName);
    await search.press("Enter");
    await page.getByText(clientName, { exact: true }).last().waitFor({ state: "visible", timeout: 5000 });
    await wait(250);

    const stateBefore = await evaluateClientSelection();
    if (!stateBefore.exclusive) {
      await forceExclusiveClientSelection();
      await wait(250);

      const stateAfter = await evaluateClientSelection();
      if (!stateAfter.exclusive) {
        throw new Error('Client filter was not applied exclusively for "' + clientName + '"');
      }

      const applyButton = page.getByRole("button", { name: /Aplicar/i }).last();
      if (await applyButton.isVisible().catch(() => false)) {
        await applyButton.click();
        await wait(1200);
      } else {
        await closeClientFilterIfOpen();
      }

      return { changed: true, stateAfter };
    }

    await closeClientFilterIfOpen();
    return { changed: false, stateBefore };
  };

  const setGrouping = async () => {
    const headers = page.locator("summary-group-header");
    const headerCount = await headers.count();

    for (let index = 0; index < groupBy.length; index += 1) {
      if (index >= headerCount) {
        throw new Error("Grouping slot " + (index + 1) + " is not available");
      }

      const desired = groupBy[index];
      const header = headers.nth(index);
      const currentLabel = clean(await header.innerText().catch(() => ""));
      if (currentLabel === desired) {
        continue;
      }

      await header.click();
      await wait(250);

      const option = page.getByRole("option", { name: desired, exact: true }).last();
      await option.waitFor({ state: "visible", timeout: 5000 });
      await option.click();
      await wait(500);
    }

    return { changed: true, groupBy };
  };

  const exportPdf = async () => {
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await page.getByText("Exportar", { exact: true }).click();
    await wait(250);
    await page.getByText("Salvar como PDF", { exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(downloadTarget.fullPath);

    return {
      suggestedFilename: download.suggestedFilename(),
      savedTo: downloadTarget.fullPath,
      folder: downloadTarget.baseDir,
    };
  };

  const workspace = await ensureWorkspace();
  const summaryPage = await ensureSummaryPage();
  const previousMonth = await ensurePreviousMonth();
  const clientApplied = await setClientFilter();
  const grouping = await setGrouping();
  const download = await exportPdf();

  return {
    url: page.url(),
    workspace,
    summaryPage,
    previousMonth,
    clientApplied,
    grouping,
    download,
  };
}`;

console.log(snippet);
