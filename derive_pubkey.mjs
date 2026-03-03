import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));
  
  const secret = await page.evaluate(() => localStorage.getItem('dm_dev_web_wallet_secret'));
  console.log('SECRET_JSON:', secret);
  await browser.close();
}
main().catch(console.error);
