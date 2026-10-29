from pathlib import Path
import asyncio, os, re, sys, time, json
sys.path.insert(0,str(Path('.recorddeps').resolve()))
from playwright.async_api import async_playwright

OUT=Path('public/live-recordings'); OUT.mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--disable-gpu'])
  auth=await browser.new_context(viewport={'width':1280,'height':720},device_scale_factor=1)
  page=await auth.new_page()
  await page.goto('https://cedimscalapan.com/auth/login',wait_until='domcontentloaded')
  await page.get_by_role('textbox',name='Email address').wait_for()
  await page.wait_for_load_state('networkidle',timeout=15000)
  await page.wait_for_timeout(2000)
  for attempt in range(3):
   await page.get_by_role('textbox',name='Email address').fill(os.environ['CEDIMS_EMAIL'])
   await page.get_by_role('textbox',name='Password').fill(os.environ['CEDIMS_PASSWORD'])
   await page.locator('#agree').check()
   await page.wait_for_timeout(900)
   if not await page.get_by_role('textbox',name='Email address').input_value(): continue
   await page.get_by_role('button',name='Sign in',exact=True).click()
   try:
    await page.wait_for_url(re.compile('dashboard'),timeout=12000)
    break
   except Exception:
    print('login attempt',attempt+1,'remained on',page.url,flush=True)
  else:
   await page.screenshot(path='out/login-debug.png')
   raise RuntimeError('Unable to sign in for recording')
  state=await auth.storage_state()
  await auth.close()
  context=await browser.new_context(viewport={'width':1280,'height':720},device_scale_factor=1,storage_state=state,record_video_dir=str(OUT),record_video_size={'width':1280,'height':720})
  page=await context.new_page()
  await page.goto('https://cedimscalapan.com/dashboard/compliance',wait_until='domcontentloaded')
  await page.get_by_text('Compliance Monitoring',exact=True).wait_for(timeout=30000)
  await page.wait_for_timeout(1200)
  skip=page.get_by_role('button',name='Skip tour')
  if await skip.is_visible(): await skip.click()
  await page.wait_for_timeout(450)
  t0=time.monotonic(); marks=[]
  async def mark(label): marks.append({'label':label,'sec':round(time.monotonic()-t0,3)})
  await mark('start dashboard')
  await page.wait_for_timeout(1500)
  week_button=page.get_by_role('button',name=re.compile(r'Week [567]')).first
  current=await week_button.inner_text()
  target='Week 6' if '7' in current else 'Week 7'
  await week_button.click()
  await mark('week menu open')
  await page.wait_for_timeout(800)
  await page.get_by_text(target,exact=True).click()
  await mark('week 7 selected')
  await page.wait_for_timeout(2400)
  print('AFTER WEEK BUTTONS',await page.locator('button').all_inner_texts(),flush=True)
  await page.screenshot(path='out/after-week-debug.png')
  trends=page.get_by_text('Explore trends',exact=False).first
  await trends.scroll_into_view_if_needed()
  await mark('scroll to trends')
  await page.wait_for_timeout(900)
  await trends.click()
  await mark('trends expanded')
  await page.wait_for_timeout(1300)
  await page.mouse.wheel(0,520)
  await mark('scroll chart')
  await page.wait_for_timeout(2700)
  await page.mouse.wheel(0,440)
  await mark('scroll lower')
  await page.wait_for_timeout(2200)
  video=page.video
  await context.close()
  path=await video.path()
  await browser.close()
  meta={'video':path,'marks':marks,'duration':round(time.monotonic()-t0,3)}
  Path('out/live-recording-meta.json').write_text(json.dumps(meta,indent=2))
  print(json.dumps(meta,indent=2))
asyncio.run(main())
