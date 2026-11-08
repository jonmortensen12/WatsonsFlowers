/* Watson's Flowers - draws the install icons and the link preview in the
   sign's colours (pink panel, gold FLOWERS, the Watson's oval, a blossom).
   node tools/art.mjs  ->  web/icon-192.png, web/icon-512.png, web/og.png */
import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({chromium} = require('playwright')); } catch(e){ ({chromium} = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const draw = `
function draw(c, W, H, wide){
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2b3f8b'); sky.addColorStop(1, '#f58b6a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const s = wide ? H / 512 : W / 512;
  g.save(); g.translate(wide ? W * 0.5 : W / 2, H / 2); g.scale(s, s);
  g.fillStyle = '#f2a7b4'; g.fillRect(-230, -20, 460, 130); g.strokeStyle = '#d97a8c'; g.lineWidth = 10; g.strokeRect(-230, -20, 460, 130);
  g.font = '900 84px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#7a4a10'; g.strokeText('FLOWERS', 0, 50); g.fillStyle = '#f2c531'; g.fillText('FLOWERS', 0, 50);
  g.fillStyle = '#151515'; g.beginPath(); g.ellipse(-40, -95, 175, 75, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f6f3ea'; g.beginPath(); g.ellipse(-40, -95, 163, 64, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#151515'; g.font = 'italic bold 92px "Brush Script MT", "Segoe Script", cursive'; g.fillText("Watson's", -40, -88);
  g.save(); g.translate(170, -150);
  for(let i = 0; i < 5; i++){ g.rotate(Math.PI * 2 / 5); g.fillStyle = '#f7cfd6'; g.strokeStyle = '#c96a80'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -38, 26, 38, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.fillStyle = '#f2c531'; g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill(); g.restore();
  g.fillStyle = '#1f6a45'; g.beginPath(); g.arc(170, 170, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f4ecd2'; g.font = 'bold 30px Georgia'; g.fillText('BEST', 170, 160); g.font = 'bold 22px Georgia'; g.fillText('1927', 170, 192);
  g.restore();
}`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas><script>' + draw + '</script>');
for(const [file, W, H, wide] of [['icon-192.png', 192, 192, false], ['icon-512.png', 512, 512, false], ['og.png', 1200, 630, true]]){
  const data = await page.evaluate(([W, H, wide]) => { const c = document.getElementById('c'); c.width = W; c.height = H; draw(c, W, H, wide); return c.toDataURL('image/png'); }, [W, H, wide]);
  fs.writeFileSync(path.join('web', file), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote web/' + file);
}
await browser.close();
