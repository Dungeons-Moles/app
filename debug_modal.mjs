import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('/tmp/dm_modal_debug', { recursive: true });

const CLI_SECRET = [33,128,99,81,183,113,174,161,122,22,237,200,235,136,208,126,69,44,125,198,232,164,130,122,230,233,39,26,220,162,242,206,141,166,71,19,229,58,154,50,205,216,231,106,245,116,194,201,188,122,161,185,95,222,156,169,119,201,237,141,223,12,221,228];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((secret) => {
    localStorage.setItem('dm_dev_web_wallet_secret', JSON.stringify(secret));
    localStorage.setItem('dm_web_wallet_choice', 'DevKeypair');
  }, CLI_SECRET);

  const page = await context.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[useDuels]') || text.includes('Session') || text.includes('enterCurrentSession')) {
      console.log(`CON[${msg.type()}]: ${text.slice(0, 300)}`);
    }
  });

  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // Close welcome modal
  const body0 = await page.evaluate(() => document.body.innerText);
  if (body0.includes('Got it')) {
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent?.trim() === 'Got it!' || node.textContent?.trim() === 'Got it') {
          node.parentElement?.click();
          break;
        }
      }
    });
    await sleep(500);
  }

  // Click PVP -> Duels
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.trim() === 'PVP') { node.parentElement?.click(); break; }
    }
  });
  await sleep(1500);
  
  // Click Duels image
  await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      if (img.src.toLowerCase().includes('duel')) { img.parentElement?.click(); return; }
    }
    const allImgs = Array.from(document.querySelectorAll('img'));
    for (const img of allImgs) {
      const rect = img.getBoundingClientRect();
      if (rect.x > 500 && rect.x < 850 && rect.y > 200 && rect.y < 550 && rect.width > 50) {
        img.parentElement?.click(); return;
      }
    }
  });
  await sleep(2000);
  
  const title = await page.evaluate(() => document.title);
  console.log('Title after nav:', title);
  
  // On Duels screen - click Resume Session (to trigger session exists modal)
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.trim() === 'Resume Session') { node.parentElement?.click(); break; }
    }
  });
  await sleep(1500);
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/dm_modal_debug/01_modal_open.png' });
  
  // Get all elements with text "Resume" and their positions
  const resumeEls = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.trim() === 'Resume') {
        const el = node.parentElement;
        const rect = el?.getBoundingClientRect();
        results.push({
          tag: el?.tagName,
          text: node.textContent.trim(),
          x: rect?.x, y: rect?.y, w: rect?.width, h: rect?.height,
          visible: rect?.width > 0,
          classes: el?.className?.slice(0, 50),
          parentTag: el?.parentElement?.tagName,
        });
      }
    }
    return results;
  });
  console.log('Resume elements:', JSON.stringify(resumeEls, null, 2));
  
  // Try clicking the first visible "Resume" button with a real coordinate click
  for (const el of resumeEls) {
    if (el.visible && el.x > 0 && el.y > 0) {
      console.log(`Clicking at (${el.x + el.w/2}, ${el.y + el.h/2})`);
      await page.mouse.click(el.x + el.w/2, el.y + el.h/2);
      await sleep(2000);
      const newBody = await page.evaluate(() => document.body.innerText);
      console.log('After click:', newBody.slice(0, 300));
      break;
    }
  }
  
  await page.screenshot({ path: '/tmp/dm_modal_debug/02_after_resume_click.png' });
  
  // Wait for response
  await sleep(5000);
  const finalBody = await page.evaluate(() => document.body.innerText);
  const finalTitle = await page.evaluate(() => document.title);
  console.log('Final title:', finalTitle);
  console.log('Final body:', finalBody.slice(0, 300));

  await browser.close();
}

main().catch(console.error);
