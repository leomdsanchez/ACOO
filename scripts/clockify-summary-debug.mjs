import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const clientName = process.argv[2] ?? "NOZ";
const expectedWorkspace = "Nomades";
const sourceProfileDir = path.join(os.homedir(), "Library", "Application Support", "PlaywrightMCP", "chrome-profile");

if (!clientName.trim()) {
  console.error("usage: node scripts/clockify-summary-debug.mjs <client-name>");
  process.exit(1);
}

const clean = (value) =>
  (value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

const normalize = (value) => clean(value).toLowerCase();

const excludeProfilePath = (source, destination) => {
  const base = path.basename(source);

  if (
    base.startsWith("Singleton") ||
    base === "RunningChromeVersion" ||
    base === "lockfile" ||
    base.endsWith(".lock") ||
    base.endsWith(".tmp")
  ) {
    return false;
  }

  const relativePath = path.relative(sourceProfileDir, source);
  if (!relativePath || relativePath.startsWith("..")) {
    return true;
  }

  if (relativePath.startsWith("Default/Cache") || relativePath.startsWith("Default/Code Cache")) {
    return false;
  }

  return true;
};

const buildDownloadTarget = () => {
  const now = new Date();
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(now);
  const prettyMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const year = String(now.getFullYear());
  const baseDir = path.join(
    os.homedir(),
    "Documents",
    "Nômades",
    `Financeiro ${year}`,
    prettyMonthName.normalize("NFD"),
    "Clockify"
  );
  const fileName = `Relatório_${clientName}.pdf`;

  fs.mkdirSync(baseDir, { recursive: true });
  return { baseDir, fullPath: path.join(baseDir, fileName), fileName };
};

const previousMonthRange = (() => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

  return {
    label: "Último mês",
    range: `${start.toLocaleDateString("pt-BR", { timeZone: "UTC" })} - ${end.toLocaleDateString("pt-BR", {
      timeZone: "UTC",
    })}`,
  };
})();

const cloneProfile = () => {
  if (!fs.existsSync(sourceProfileDir)) {
    throw new Error(`Chrome profile not found: ${sourceProfileDir}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clockify-debug-profile-"));
  fs.cpSync(sourceProfileDir, tempRoot, {
    recursive: true,
    filter: excludeProfilePath,
    force: true,
  });
  return tempRoot;
};

const wait = (page, ms) => page.waitForTimeout(ms);

const readWorkspaceName = async (page) => {
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

const ensureWorkspace = async (page) => {
  const currentWorkspace = await readWorkspaceName(page);
  if (currentWorkspace === expectedWorkspace) {
    return;
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
  await wait(page, 1500);
};

const ensureSummaryPage = async (page) => {
  if (!page.url().includes("/reports/summary")) {
    await page.goto("https://app.clockify.me/reports/summary", { waitUntil: "domcontentloaded" });
    await wait(page, 1500);
  }

  if (!page.url().includes("/reports/summary")) {
    throw new Error("Could not open Clockify summary report");
  }
};

const ensurePreviousMonth = async (page) => {
  const rangeInput = page.getByRole("textbox").first();
  const currentRange = clean(await rangeInput.inputValue().catch(() => ""));
  if (currentRange === previousMonthRange.range) {
    return;
  }

  const periodTrigger = page
    .getByText(previousMonthRange.label, { exact: true })
    .first()
    .or(page.getByText("Este mês", { exact: true }).first());
  await periodTrigger.click();
  await wait(page, 300);
  await page.getByText(previousMonthRange.label, { exact: true }).last().click();
  await wait(page, 1200);

  const finalRange = clean(await rangeInput.inputValue().catch(() => ""));
  if (finalRange !== previousMonthRange.range) {
    throw new Error(`Period switch failed. Expected "${previousMonthRange.range}" but found "${finalRange}"`);
  }
};

const setClientFilter = async (page) => {
  await page.locator("main").getByText("Cliente", { exact: true }).last().click();
  await wait(page, 300);

  const search = page.getByPlaceholder("Procurar clientes");
  await search.fill(clientName);
  await search.press("Enter");
  await page.getByText(clientName, { exact: true }).last().waitFor({ state: "visible", timeout: 5000 });
  await wait(page, 250);

  await page.evaluate((targetClientName) => {
    const normalizeInner = (value) =>
      (value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const target = normalizeInner(targetClientName);
    const labels = Array.from(document.querySelectorAll("label[for]"));
    let found = false;

    for (const label of labels) {
      const text = normalizeInner(label.textContent);
      const inputId = label.getAttribute("for");
      const input = inputId ? document.getElementById(inputId) : null;
      if (!(input instanceof HTMLInputElement)) continue;
      if (!text || text === "arredondamento" || text === "mostrar estimativa") continue;

      const nextChecked = text === target;
      input.checked = nextChecked;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (nextChecked) found = true;
    }

    if (!found) {
      throw new Error(`Client checkbox not found for "${targetClientName}"`);
    }
  }, clientName);

  await wait(page, 300);
  const applyButton = page.getByRole("button", { name: /Aplicar/i }).last();
  if (await applyButton.isVisible().catch(() => false)) {
    await applyButton.click();
    await wait(page, 1200);
  }
};

const setGrouping = async (page) => {
  const values = ["Projeto", "Utilizador", "Descrição"];
  const headers = page.locator("summary-group-header");

  for (let index = 0; index < values.length; index += 1) {
    const header = headers.nth(index);
    const currentLabel = clean(await header.innerText().catch(() => ""));
    if (currentLabel === values[index]) continue;

    await header.click();
    await wait(page, 250);
    await page.getByRole("option", { name: values[index], exact: true }).last().click();
    await wait(page, 500);
  }
};

const exportPdf = async (page, downloadTarget) => {
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await page.getByText("Exportar", { exact: true }).click();
  await wait(page, 250);
  await page.getByText("Salvar como PDF", { exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(downloadTarget.fullPath);
  return downloadTarget.fullPath;
};

const main = async () => {
  const debugProfileDir = cloneProfile();
  const downloadTarget = buildDownloadTarget();
  const chromePathCandidates = [
    "/Volumes/Mac HD/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const executablePath = chromePathCandidates.find((candidate) => fs.existsSync(candidate));

  if (!executablePath) {
    throw new Error("Google Chrome executable not found.");
  }

  const context = await chromium.launchPersistentContext(debugProfileDir, {
    executablePath,
    channel: undefined,
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ["--start-maximized"],
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://app.clockify.me/reports/summary", { waitUntil: "domcontentloaded" });
    await page.pause();

    await ensureWorkspace(page);
    await ensureSummaryPage(page);
    await ensurePreviousMonth(page);
    await setClientFilter(page);
    await setGrouping(page);

    console.log(JSON.stringify({ status: "ready_to_export", url: page.url(), clientName, downloadTarget }, null, 2));

    await page.pause();
    const savedTo = await exportPdf(page, downloadTarget);
    console.log(JSON.stringify({ status: "done", savedTo }, null, 2));
    await page.pause();
  } finally {
    await context.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
