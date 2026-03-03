import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));

  // First - click DEV KEY, then Sign In
  await page.evaluate(() => {
    // Find DEV KEY - it might be in multiple elements
    const allEls = document.querySelectorAll('*');
    const candidates = [];
    for (const el of allEls) {
      if (el.textContent?.trim() === 'DEV\nKEY' || el.textContent?.trim() === 'KEY') {
        candidates.push({ tag: el.tagName, text: el.textContent.trim(), parent: el.parentElement?.tagName });
      }
    }
    console.log('Candidates:', JSON.stringify(candidates));
  });

  // Inspect the DOM around the wallet buttons
  const html = await page.evaluate(() => {
    // Find the div/span with DEV text and KEY text nearby
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      if (el.innerText && el.innerText.includes('DEV') && el.innerText.includes('KEY') && 
          el.innerText.length < 100 && el.children.length < 5) {
        return el.outerHTML;
      }
    }
    return 'not found';
  });
  console.log('DEV KEY container HTML:', html.slice(0, 500));

  // Get ALL input-like elements
  const inputs = await page.evaluate(() => {
    const result = [];
    const els = document.querySelectorAll('input, textarea, [contenteditable]');
    for (const el of els) {
      result.push({
        tag: el.tagName,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        value: el.value,
        visible: el.offsetParent !== null,
      });
    }
    return result;
  });
  console.log('Input elements:', JSON.stringify(inputs));

  // Now sign in with DevKeypair  
  await page.evaluate(() => localStorage.setItem('dm_web_wallet_choice', 'DevKeypair'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('After reload with DevKeypair:', text.slice(0, 400));
  
  // Get wallet public key
  const walletKey = await page.evaluate(() => {
    const stored = localStorage.getItem('dm_dev_web_wallet_secret');
    if (!stored) return 'no wallet';
    return `Has secret, len=${stored.length}`;
  });
  console.log('Wallet:', walletKey);

  // If on profile creation, find the text input
  if (text.includes('Create Profile') || text.includes('Enter Name')) {
    console.log('\n-- On Create Profile screen --');
    const allInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*')).filter(el => {
        const ht = el.outerHTML.toLowerCase();
        return ht.includes('type="text"') || ht.includes('placeholder') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      }).map(el => ({
        tag: el.tagName,
        outerHtml: el.outerHTML.slice(0, 200),
        visible: el.getBoundingClientRect().width > 0,
      }));
    });
    console.log('Profile inputs:', JSON.stringify(allInputs.slice(0, 5)));
    
    // Try to find and click the input field using different approaches
    const inputEl = await page.$('input');
    if (inputEl) {
      console.log('Found input element!');
      await inputEl.click();
      await inputEl.fill('TestMole');
      console.log('Filled input with TestMole');
    } else {
      // Maybe it's using React Native TextInput
      const rnInput = await page.$('[data-testid="profile-name-input"], [aria-label="Enter Name"]');
      console.log('RN input:', rnInput ? 'found' : 'not found');
      
      // Try clicking on "Enter Name" text area
      const enterName = await page.getByText('Enter Name');
      if (await enterName.count() > 0) {
        console.log('Found "Enter Name" text element');
        const box = await enterName.boundingBox();
        console.log('BBox:', JSON.stringify(box));
        if (box) {
          await page.click(`[x="${box.x}"][y="${box.y}"]`).catch(() => {});
          await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
          await new Promise(r => setTimeout(r, 500));
          await page.keyboard.type('TestMole');
          console.log('Typed TestMole at Enter Name location');
        }
      }
    }
  }

  await browser.close();
}

main().catch(console.error);
