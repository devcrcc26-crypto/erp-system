import { chromium } from 'playwright';

const baseURL = 'http://localhost:3000';
const email = 'lead@company.local';
const password = 'Admin@12345';
const outDir = process.argv[2] ?? '.';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

async function shot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log('saved', name);
}

async function waitReady() {
  await page.waitForSelector('h1, h3', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

try {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await waitReady();
  console.log('logged in, at', page.url());

  await page.goto(`${baseURL}/hr/leave-requests`, { waitUntil: 'domcontentloaded' });
  await waitReady();
  await shot('leave-list');

  await page.goto(`${baseURL}/hr/overtime`, { waitUntil: 'domcontentloaded' });
  await waitReady();
  await shot('overtime-list');

  const leaveRow = page.locator('table tbody tr').first();
  await page.goto(`${baseURL}/hr/leave-requests`, { waitUntil: 'domcontentloaded' });
  await waitReady();
  if (await leaveRow.count() > 0) {
    await leaveRow.click();
    await waitReady();
    await shot('leave-detail');
  } else {
    console.log('no leave rows to open');
  }

  await page.goto(`${baseURL}/hr/overtime`, { waitUntil: 'domcontentloaded' });
  await waitReady();
  const otRow = page.locator('table tbody tr').first();
  if (await otRow.count() > 0) {
    await otRow.click();
    await waitReady();
    await shot('overtime-detail');
  } else {
    console.log('no overtime rows to open');
  }
} catch (err) {
  console.error('ERROR', err);
  await shot('error-state');
} finally {
  await browser.close();
}
