import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Read all localStorage keys and derive the public key
  const walletInfo = await page.evaluate(async () => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      result[key] = localStorage.getItem(key);
    }
    return result;
  });

  console.log('All localStorage keys:', Object.keys(walletInfo));
  console.log('dm_web_wallet_choice:', walletInfo['dm_web_wallet_choice']);
  console.log('dm_dev_web_wallet_secret length:', walletInfo['dm_dev_web_wallet_secret']?.length);

  // Now navigate with wallet set and check what public key is used
  await page.evaluate(() => {
    // Ensure DevKeypair is set as choice
    localStorage.setItem('dm_web_wallet_choice', 'DevKeypair');
  });
  
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  
  // Get public key from the page
  const pageContent = await page.evaluate(() => document.body.innerText);
  console.log('\nPage content after setting DevKeypair:', pageContent.slice(0, 500));

  await browser.close();
}

main().catch(console.error);
