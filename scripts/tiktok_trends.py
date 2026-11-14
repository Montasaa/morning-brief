#!/usr/bin/env python3
"""Scrape TikTok Creative Center (public, logged-out) trends for Saudi Arabia, last 7 days.
Output: tiktok_trends.json next to this file. No login, no captcha handling: if blocked, records what the page shows."""
import asyncio, json, re, sys, os, datetime
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,"tiktok_trends.json")
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
START="https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en"
REGION="Saudi Arabia"

async def pick_region(pg):
    await pg.get_by_text("The United States").first.click(timeout=15000)
    await pg.wait_for_timeout(1000)
    await pg.get_by_text(REGION, exact=True).last.click(timeout=10000)
    await pg.wait_for_timeout(5000)

async def rows(pg):
    # each table row -> text + links + images
    return await pg.evaluate("""() => {
      const out=[]; const trs=document.querySelectorAll('tr, [class*="row"], [class*="Row"]');
      for (const r of trs){ const t=r.innerText.trim(); if(!/^\\d+\\s/.test(t)) continue;
        out.push({text:t, links:[...r.querySelectorAll('a')].map(a=>a.href),
                  imgs:[...r.querySelectorAll('img')].map(i=>i.src).filter(s=>s&&!s.startsWith('data:'))}); }
      return out; }""")

def parse_hashtags(rs):
    items, seen = [], set()
    for r in rs:
        m=re.match(r"(\d+)\s+#(\S+)", r["text"]); 
        if not m or m.group(2) in seen: continue
        seen.add(m.group(2)); t=r["text"].replace("\n"," ")
        posts=re.search(r"([\d.,]+[KMB]?)\s+Posts",t); views=re.search(r"([\d.,]+[KMB]?)\s+Views",t)
        metric=", ".join(x for x in [posts and posts.group(1)+" posts", views and views.group(1)+" views"] if x)
        items.append({"name":"#"+m.group(2),"kind":"hashtag","rank":int(m.group(1)),"metric":metric,
            "url":f"https://www.tiktok.com/tag/{m.group(2)}","image":(r["imgs"] or [None])[0],"creator":None})
    return items

def parse_videos(rs):
    items=[]
    for r in rs:
        vid=[l for l in r["links"] if re.search(r"tiktok\.com/@[^/]+/video/\d+",l)]
        m=re.match(r"(\d+)\s+(.*)", r["text"].replace("\n"," "))
        if not m: continue
        cr=re.search(r"@([\w.]+)", (vid[0] if vid else "")+" "+r["text"])
        views=re.search(r"([\d.,]+[KMB]?)\s+Views",r["text"])
        items.append({"name":m.group(2)[:120],"kind":"video","rank":int(m.group(1)),
            "metric":views and views.group(1)+" views","url":vid[0] if vid else None,
            "image":(r["imgs"] or [None])[0],"creator":cr and "@"+cr.group(1)})
    return items


async def hashtag_rows(pg):
    return await pg.evaluate("""()=>[...document.querySelectorAll('*')].filter(e=>e.children.length<3&&(e.innerText||'').trim()=='See analytics').map(e=>{
      let r=e; while(r && !/^\\s*\\d+\\s*\\n/.test(r.innerText||'')) r=r.parentElement;
      return r?{text:r.innerText,imgs:[...r.querySelectorAll('img')].map(i=>i.src).filter(s=>s&&!s.startsWith('data:'))}:null}).filter(Boolean)""")

async def main():
    res={"generated_at":datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
         "region":"SA","period_days":7,"items":[],"notes":[]}
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(user_agent=UA,viewport={"width":1400,"height":1000})
        r=await pg.goto(START,wait_until="networkidle",timeout=60000); await pg.wait_for_timeout(3000)
        body=await pg.inner_text("body")
        if (r and r.status>=400) or "Rank" not in body:
            res["notes"].append(f"blocked: status={r and r.status} url={pg.url} page_text={body[:400]!r}")
        else:
            await pick_region(pg); body=await pg.inner_text("body")
            if "trending now in\nSaudi Arabia" not in body and "Saudi Arabia" not in body[:400]:
                res["notes"].append("WARNING: region did not switch to Saudi Arabia")
            res["notes"].append("hashtag url="+pg.url)
            res["items"]+=parse_hashtags([{"text":x["text"].replace("\n"," ").strip(),"imgs":x["imgs"],"links":[]} for x in await hashtag_rows(pg)])
            if "Log in or sign up" in body:
                res["notes"].append("logged-out view shows only the top 3 hashtags; 'View more' requires 'Log in or sign up' (not bypassed)")
            await pg.get_by_text("Video",exact=True).first.click(); await pg.wait_for_timeout(4000)
            await pg.get_by_text("The United States").first.click(); await pg.wait_for_timeout(1500)
            if await pg.get_by_text(REGION,exact=True).count()==0:
                res["notes"].append("videos: Saudi Arabia not offered on the public Video tab (only US, Japan, Vietnam, Thailand, Indonesia)")
        res["notes"].append("songs/sounds: the public trends page no longer has a Music tab (only Hashtag, Creator 'coming soon', Video)")
        await b.close()
    tmp=OUT+".tmp"; json.dump(res,open(tmp,"w"),ensure_ascii=False,indent=1); os.replace(tmp,OUT)
    print(json.dumps(res,ensure_ascii=False,indent=1))
asyncio.run(main())
