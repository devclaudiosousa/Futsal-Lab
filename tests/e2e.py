import asyncio, sys, json
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:8790/'; SH=sys.argv[1]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(**({'executable_path': __import__('os').environ['CHROME']} if __import__('os').environ.get('CHROME') else {}))
    ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page(); errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'fonts' not in m.text else None)
    page.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await page.goto(BASE+'index.html#/hoje'); await page.wait_for_timeout(800)
    await page.click('#ex'); await page.wait_for_timeout(1200)
    await page.screenshot(path=f'{SH}/01-hoje.png', full_page=True)
    # Hoje → jogo ao vivo do próximo jogo? O próximo pode ser treino; vai pela época
    await page.goto(BASE+'index.html#/epoca'); await page.wait_for_timeout(500)
    jogos = await page.eval_on_selector_all('a.item[href^="#/jogo/"]','els=>els.map(e=>e.getAttribute("href"))')
    fut = jogos[0]; jid = fut.split('/')[-1]
    await page.goto(BASE+'index.html'+fut); await page.wait_for_timeout(600)
    await page.click('.hero >> text=Ao vivo'); await page.wait_for_timeout(800)
    await page.screenshot(path=f'{SH}/02-pre.png', full_page=True)
    # trocar um do cinco inicial antes de começar
    on = await page.eval_on_selector_all('.pc.on','els=>els.map(e=>e.dataset.p)')
    bench = await page.eval_on_selector_all('.pc:not(.on)','els=>els.map(e=>e.dataset.p)')
    print('em campo', len(on), 'banco', len(bench))
    await page.click(f'[data-p="{on[2]}"]'); await page.click(f'[data-p="{bench[0]}"]'); await page.wait_for_timeout(300)
    await page.click('[data-act="kickoff"]'); await page.wait_for_timeout(1500)
    await page.click('[data-act="stop"]'); await page.wait_for_timeout(1000); await page.click('[data-act="stop"]'); await page.wait_for_timeout(300)
    on = await page.eval_on_selector_all('.pc.on','els=>els.map(e=>e.dataset.p)')
    bench = await page.eval_on_selector_all('.pc:not(.on)','els=>els.map(e=>e.dataset.p)')
    await page.click(f'[data-p="{bench[1]}"]'); await page.click(f'[data-p="{on[1]}"]'); await page.wait_for_timeout(300)
    await page.click('.scoreline .sc >> nth=0'); await page.wait_for_timeout(200)
    await page.click('.scoreline .sh >> nth=1'); await page.wait_for_timeout(200)
    # pressão longa no cartão do pivô → modal de posição
    await page.locator(f'[data-p="{on[0]}"]').dispatch_event('pointerdown'); await page.wait_for_timeout(750)
    await page.screenshot(path=f'{SH}/03-posicao.png')
    await page.click('.modal [data-slot="pivo"]'); await page.wait_for_timeout(300)
    await page.wait_for_timeout(1200)
    await page.screenshot(path=f'{SH}/04-aovivo.png', full_page=True)
    clocks = await page.inner_text('.clocks'); print('relógios', clocks.replace('\n',' '))
    # reload: o jogo continua (gravação a cada toque)
    await page.reload(); await page.wait_for_timeout(1000)
    st = await page.evaluate("""async id => { const {db} = await import('./js/db.js'); const L = await import('./js/live/engine.js'); const j = await db.get('jogos', id); const d = L.derive(j.aovivo, Date.now()); return {ev: j.aovivo.events.map(e=>e.type), per: d.per, phase: d.phase, eff: Math.round(d.eff), run: Math.round(d.run), score: d.score, shots: d.shots, court: d.court}; }""", jid)
    print('estado', json.dumps(st))
    # página do jogo: estatística a partir do banco
    await page.goto(BASE+'index.html'+fut); await page.wait_for_timeout(800)
    print('fonte', await page.locator('.pill', has_text='Ao vivo').count())
    await page.screenshot(path=f'{SH}/05-jogo.png', full_page=True)
    # Mais: configuração do OneDrive
    await page.goto(BASE+'index.html#/mais'); await page.wait_for_timeout(600)
    await page.screenshot(path=f'{SH}/06-mais.png', full_page=True)
    await page.fill('#odcid','abc'); await page.click('#odin'); await page.wait_for_timeout(200)
    print('valida id:', await page.inner_text('#smsg'))
    # iPad horizontal
    c2 = await b.new_context(viewport={'width':1180,'height':820}); p2 = await c2.new_page()
    p2.on('pageerror', lambda e: errs.append('ipad '+str(e)))
    await p2.goto(BASE+'index.html#/hoje'); await p2.wait_for_timeout(500); await p2.click('#ex'); await p2.wait_for_timeout(1000)
    await p2.goto(BASE+'index.html#/epoca'); await p2.wait_for_timeout(400)
    j2 = await p2.eval_on_selector_all('a.item[href^="#/jogo/"]','els=>els.map(e=>e.getAttribute("href"))')
    await p2.goto(BASE+'index.html#/aovivo/'+j2[0].split('/')[-1]); await p2.wait_for_timeout(600)
    await p2.click('[data-act="kickoff"]'); await p2.wait_for_timeout(1200)
    await p2.screenshot(path=f'{SH}/07-ipad.png')
    for pg in (page,p2): print('largura', await pg.evaluate('document.documentElement.scrollWidth'), await pg.evaluate('innerWidth'))
    print('ERROS', errs)
    await b.close()
asyncio.run(main())
