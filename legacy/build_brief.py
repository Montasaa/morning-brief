#!/usr/bin/env python3
"""Build brief.json for Abdulrahman's Morning Brief.

Sources are gathered from public RSS/JSON endpoints, GitHub, and YouTube.
Every URL used here was checked before publishing. IDs are stable slugs:
re-running this file replaces items by id instead of duplicating them.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

GH_TRENDING = "https://github.com/trending?since=daily"
GH = "https://github.com"

def src(name, url):
    return {"name": name, "url": url}

def item(section, id, title, summary, sources, published_at, *, change=None,
         status="new", updated=False, meta=None, tags=None):
    lines = summary.strip().split("\n")
    assert len(lines) == 2, (id, len(lines))
    d = {
        "id": id,
        "section": section,
        "title": title,
        "summary": "\n".join(lines),
        "sources": sources,
        "published_at": published_at,
        "status": status,
        "updated": updated or status in ("new", "updated"),
    }
    if change:
        d["change"] = change
    if meta:
        d["meta"] = meta
    if tags:
        d["tags"] = tags
    return d

def video(title, url, channel, published_at=None):
    v = {"title": title, "url": url, "channel": channel}
    if published_at:
        v["published_at"] = published_at
    return v

# ---------------------------------------------------------------- trending repos
trending = [
    item(
        "trending_repos", "nvidia-openshell",
        "NVIDIA/OpenShell - a locked-down runtime for ai agents",
        "nvidia's open-source sandbox for running autonomous agents without handing them your whole machine.\n1,240 stars today; rust; apache-2.0; 18.6k total.",
        [src("GitHub", GH + "/NVIDIA/OpenShell"), src("GitHub Trending", GH_TRENDING)],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 1240, "stars_total": 18666, "language": "Rust", "license": "Apache-2.0"},
        tags=["agents", "security", "rust"],
    ),
    item(
        "trending_repos", "cloudflare-security-audit-skill",
        "cloudflare/security-audit-skill - an audit agent with receipts",
        "a coding-agent skill that runs multi-phase security audits and verifies each finding before reporting it.\n2,706 stars today, the top gainer on github trending; javascript; mit; 41.8k total.",
        [src("GitHub", GH + "/cloudflare/security-audit-skill"), src("GitHub Trending", GH_TRENDING)],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 2706, "stars_total": 41820, "language": "JavaScript", "license": "MIT"},
        tags=["security", "agents", "javascript"],
    ),
    item(
        "trending_repos", "php-src",
        "php/php-src - trending for the worst reason",
        "php's core repo drew 722 stars today as teams raced to patch critical flaws dubbed 'black october'.\nnearly 70% of websites run php, per cnbc; the fixes land in this repo.",
        [src("GitHub", GH + "/php/php-src"), src("CNBC", "https://www.cnbc.com/2026/10/23/php-vulnerabilities-ai-cybersecurity.html")],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 722, "stars_total": 41530, "language": "C", "license": "BSD-3-Clause"},
        tags=["security", "php", "c"],
    ),
    item(
        "trending_repos", "anthropics-knowledge-work-plugins",
        "anthropics/knowledge-work-plugins - claude cowork plugins",
        "anthropic's open plugin pack for knowledge workers using claude cowork.\n643 stars today; python; apache-2.0; 32.1k total.",
        [src("GitHub", GH + "/anthropics/knowledge-work-plugins"), src("GitHub Trending", GH_TRENDING)],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 643, "stars_total": 32131, "language": "Python", "license": "Apache-2.0"},
        tags=["agents", "plugins", "python"],
    ),
    item(
        "trending_repos", "ziwei-doushu",
        "Renhuai123/ziwei-doushu - a complete chinese astrology engine",
        "a zi wei dou shu charting engine with the full chart algorithm, four transformations system, pattern library and source texts.\n547 stars today; typescript; mit; 6.8k total.",
        [src("GitHub", GH + "/Renhuai123/ziwei-doushu"), src("GitHub Trending", GH_TRENDING)],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 547, "stars_total": 6816, "language": "TypeScript", "license": "MIT"},
        tags=["typescript", "culture", "data"],
    ),
    item(
        "trending_repos", "claude-red",
        "SnailSploit/Claude-Red - offensive-security skills for claude",
        "a curated library of attack-surface skills, from sqli to edr evasion, packaged as claude SKILL.md files.\n209 stars today; python; dual-use and worth treating carefully.",
        [src("GitHub", GH + "/SnailSploit/Claude-Red"), src("GitHub Trending", GH_TRENDING)],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 209, "stars_total": 8334, "language": "Python", "license": "MIT"},
        tags=["security", "agents", "dual-use"],
    ),
    item(
        "trending_repos", "voxcpm",
        "OpenBMB/VoxCPM - tokenizer-free multilingual tts",
        "voxcpm2 does speech generation, voice design and cloning without a tokenizer.\n144 stars today; python; apache-2.0; 40.2k total.",
        [src("GitHub", GH + "/OpenBMB/VoxCPM"), src("GitHub Trending", GH_TRENDING)],
        "2026-10-23T20:00:00Z",
        meta={"stars_today": 144, "stars_total": 40183, "language": "Python", "license": "Apache-2.0"},
        tags=["audio", "tts", "python"],
    ),
]

# ---------------------------------------------------------------- middle east
middle_east = [
    item(
        "middle_east", "jordan-karak-church-shooting",
        "seven killed in a gun attack on a church funeral in jordan",
        "gunmen opened fire on a funeral at a church in hmoud, karak, killing seven and wounding at least 34 before fleeing.\nno group has claimed it; jordan's interior minister called the attackers 'a group of extremists'.",
        [src("BBC", "https://www.bbc.co.uk/news/articles/ck87zlpzny15o"),
         src("Al Jazeera", "https://news.google.com/rss/articles/CBMiqgFBVV95cUxNWDJEUlpqMVFqM21NUFNVNzdrTHlkNlJIT2FwbExlZm5FR01ZWEpFdGRFMWltUDRPSHlseFpSanVYc0EtU3ZZcjJoR3dfMnJuN0drRkx4UlZzQ1RtOUFsd2h1NWtZQmdiYmNCU256VzFTakYydExHOGRoTGg5ZzBCcDM5NVA1LUtkcHNuV1JCcDB4WXM4ZnBqY3V6Y0x3NkF6ak9KbVpqVzFHQdIBrwFBVV95cUxNbm5hVF9hZnBmYnBCS2haUGJ6akNiOVdnSEl0ekdmYUlTbnZZOEpHakE3ZWhvTnNXRHM4R0JHQUVIUkJPdmJsY0NSckdxclZiRGtaVS1tdXQtTkNCUExKdXZTandkWUNzTjdTak5iNmwyQmp1aXJQRENpbGtIUmxQaVpvbTRMX2FTamZNeG9fR2xZXzV2cUFwbVJPWXRYLTdfR3JzRUNSRlZ0RllWZXdB?oc=5"),
         src("Arab News", "https://news.google.com/rss/articles/CBMiqwFBVV95cUxPR19FbjNpSWpYRkF1S1poNloyTE50RTNtMlZQWEVObE1Sb1pMNGNYY2h3TGpqRVRNX2lkTHFQS0FNZlV2R2FYV1ZWRDNkMmQ1QzVwUnoxTy05VFdFYm9RcU1jQXFXQXJHTHR5TG9tQWl5NXUtUjNIMnV2aFlNeTkwY3NaNFNlcGJKeXREeUl1eFBPeWRCTlN2TTE2YXFqRmVBQnFFbkpiTUxudG8?oc=5")],
        "2026-10-23T19:46:00Z",
        change="death toll was revised from six to seven within hours; cctv verified by the bbc shows three gunmen walking toward the church.",
        tags=["jordan", "attack"],
    ),
    item(
        "middle_east", "hebron-west-bank-lockdown",
        "israel seals off hebron and the west bank after two soldiers killed",
        "netanyahu ordered a full closure of the occupied west bank and demolitions in hebron after gunmen killed two soldiers at a checkpoint.\nisrael's defence minister promised mass displacement, explicitly invoking the jenin camp and gaza.",
        [src("BBC", "https://www.bbc.co.uk/news/articles/cq4g1p974wxko"),
         src("The Guardian", "https://www.theguardian.com/world/2026/oct/23/netanyahu-orders-very-extensive-operation-west-bank-two-israeli-soldiers-killed"),
         src("The Jerusalem Post", "https://www.jpost.com/israel-news/defense-news/article-912642")],
        "2026-10-23T17:57:00Z",
        change="the closure was ordered this morning and diggers began demolishing buildings by the afternoon; netanyahu floated the largest west bank operation since 1967.",
        tags=["israel", "west-bank", "hebron"],
    ),
    item(
        "middle_east", "saudi-houthi-strikes-aramco",
        "houthi strikes hit a saudi airport and aramco as the war widens",
        "two people were killed at dammam's king fahd airport and two more by drone debris at the shaybah oil field this week.\naramco told staff to leave its dhahran headquarters; the saudi-led coalition says it downed a missile bound for riyadh.",
        [src("BBC", "https://www.bbc.co.uk/news/articles/cqwy71ww156ro"),
         src("CNBC", "https://www.cnbc.com/2026/10/23/oil-price-brent-wti-iran-war-saudi-arabia.html"),
         src("Arab News", "https://news.google.com/rss/articles/CBMi2AFBVV95cUxNTloxbk9QZFZTMjNsNmJWMFN0MU1GZHBRZlUyMG9vQjVuLVBfQW84dDhabVgwWFNCakRyb3ZsWDBTS1I0cmlDbGxHczQ5dUR0Wk1lRE8zcHIzbElpZUNucVhhLUxMM0pXVkVyMFc2NVpHMnRocmd1RDlzbERHbWRMeDE4dktDUlpfSERMck1heGFyQWMyQ09mOHhZOWs4ZzlOellkVmZPTlN2cFd4QUlDay1tX0dLTC1aSFBOQWVPeTNIX1piSXIwUm5maWtubUV5UVlDSFhiWG0?oc=5")],
        "2026-10-23T13:46:00Z",
        change="the airport toll was confirmed today; aramco's evacuation order and the riyadh intercept are both new since yesterday's strikes.",
        tags=["saudi-arabia", "houthis", "oil"],
    ),
    item(
        "middle_east", "us-diplomats-uk-jets",
        "us pulls non-essential diplomats from saudi arabia; uk sends typhoons",
        "the state department ordered non-essential staff out of saudi arabia as houthi attacks on airports and energy sites continue.\nbritain is deploying raf typhoons to help defend the kingdom.",
        [src("The Guardian", "https://www.theguardian.com/world/2026/oct/22/us-diplomats-told-to-leave-saudi-arabia-amid-houthi-attacks"),
         src("BBC", "https://www.bbc.co.uk/news/articles/ckr5yqe1r1llo")],
        "2026-10-22T13:05:00Z",
        change="the drawdown follows this week's airport and oil-field strikes; the uk jet deployment was confirmed on tuesday.",
        tags=["saudi-arabia", "us", "uk"],
    ),
    item(
        "middle_east", "istanbul-iran-diplomacy",
        "eight-nation summit warns washington against a new iran strike",
        "foreign ministers from the e3, turkiye, saudi arabia, pakistan, egypt and italy met in istanbul and said another attack would 'create nothing but losers'.\nthe us ambassador to turkiye said washington could 'absolutely' strike iran this weekend.",
        [src("Al Jazeera", "https://www.aljazeera.com/news/2026/10/23/european-middle-east-ministers-urge-us-iran-diplomacy-not-new-attacks"),
         src("The Guardian", "https://www.theguardian.com/world/2026/oct/23/european-middle-eastern-ministers-summit-iran-us-israel")],
        "2026-10-23T18:04:00Z",
        change="the bloc met for the first time today; the us envoy's weekend-strike comment raised the stakes hours later.",
        tags=["iran", "diplomacy", "oil"],
    ),
    item(
        "middle_east", "brent-six-month-high",
        "brent settles at $116.72, the highest since april",
        "brent rose 3.1% and wti 3.8% as traders priced in fresh us strikes on iran and continued houthi attacks on saudi output.\nbrent is up 6.2% on the week, its third straight weekly gain.",
        [src("CNBC", "https://www.cnbc.com/2026/10/23/oil-price-brent-wti-iran-war-saudi-arabia.html"),
         src("The Guardian", "https://www.theguardian.com/business/2026/oct/23/oil-five-month-high-fears-us-renews-strikes-iran")],
        "2026-10-23T19:00:00Z",
        change="the settlement is the highest since april 29; the weekly gain accelerated after reports that israel and the us plan post-midterm strikes.",
        tags=["oil", "markets", "iran"],
    ),
    item(
        "middle_east", "yemen-strikes-hunger",
        "yemen's military claims 780 strikes as the hunger crisis deepens",
        "the saudi-backed yemeni military says it hit 780 houthi targets and 'neutralised' 512 fighters in 24 hours.\nthe bbc reports newborn twins fighting for survival as the conflict drives yemen's hunger crisis.",
        [src("Arab News", "https://news.google.com/rss/articles/CBMitAFBVV95cUxPc05PTFktSnFEc3daZ2VfamNoLVRaU3A4UGJwR3ZUOTJ3S0VXbFhyWllDVTJXcHpGU3R2WHlYQlZTSi1HUXZQYlR5OEZBaS1GS0ZWMnJVX2NjakNwOWpYSmFQNXgxUVVrQjVuU2ZvTDYxXy1YTnFvN2d1RVkzTzZCOGkzdE1wUVF6ZXV1WjBBSkxOVDhydjZFTkNRUkRDb3FjZGxYVXZYUWp6dWUxcWxlVlljdXQ?oc=5"),
         src("Al Arabiya English", "https://news.google.com/rss/articles/CBMiywFBVV95cUxOSFhkN3pVQlJzMW9TOVRXU08zdWFESzBscUwtUmw1eUZCdGo1YzRVQzdVR25idmhYTFRVWFdxNWFFVjBiVVZid0lLaUM4bVl4NmdlY1dfakU0SzN5M2k2Y19VS3NOZHVPbHVJa0psZ0tpYXg5U19wU0FsaGc2d1VSQjIyaDYwNUk0di1ZMC10VUNVMW5FdDUxVVJ2bjl3Wld0X3NGS1Q2V3RxM0czSTk1ZlZHT0lIU2FZSm5jbVFOenZnSTdQVVlvZ09TNNIB0AFBVV95cUxPVWJuZThWSVdwY1Rhd19KeUt5dHdNZGNSWWtrcDRSRmZTYV9WWVV6ODlWUkhyYnZCRXdJUFROYXNCZlpJcDRnRGtPTmdKX0RveDN2WkNscFZlTnlVakZfWG1qNjFlTGwtT0VrYXBHY2hiQjJhb2w2Z2tpdm9SeDRrWE9YNThGOHBiX2ZzVTRqVFF6MVNUNS1WNDBGMFV3VU5lUjYwbDFaRmh5SjNCWEtxMnZTdW43TmwwNGx4dkVkSnM5ZUFVOGQ2V2p1a0RNeVpO?oc=5"),
         src("BBC", "https://www.bbc.co.uk/news/articles/cr5ynl63v0pyo")],
        "2026-10-23T12:00:00Z",
        change="the 24-hour strike count is new today; aid agencies say the humanitarian squeeze is worsening, not easing.",
        tags=["yemen", "houthis", "humanitarian"],
    ),
    item(
        "middle_east", "israel-election-poll",
        "netanyahu's bloc trails four days before israel's election",
        "a new poll puts netanyahu's bloc at 48 seats against 54 for the opposition, with arab parties potentially holding the balance.\nthe vote lands in the middle of the hebron escalation and the iran war debate.",
        [src("The Jerusalem Post", "https://www.jpost.com/israel-election-2026/article-912649"),
         src("BBC", "https://www.bbc.co.uk/news/articles/cx8dzrp768j8o")],
        "2026-10-23T13:27:00Z",
        change="the poll is new today; it shows the opposition gaining as the west bank operation dominates the final stretch.",
        tags=["israel", "election"],
    ),
]

# ---------------------------------------------------------------- us markets
us_markets = [
    item(
        "us_markets", "wall-street-close",
        "wall street closes lower as oil and ai doubts weigh",
        "the s&p 500 fell 0.52% to 7,623.68 and the nasdaq 0.21% to 25,955.34; the dow dropped 1.24% to 52,215.16.\nvix rose 3.3% to 19.66, and futures stayed soft after the bell (es -0.5%, nq flat).",
        [src("Yahoo Finance", "https://finance.yahoo.com/quote/%5EGSPC/"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/%5EIXIC/"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/%5EDJI/"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/%5EVIX/"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/ES%3DF/")],
        "2026-10-23T20:05:00Z",
        meta={"spx": 7623.68, "spx_pct": -0.519, "nasdaq": 25955.34, "nasdaq_pct": -0.206,
              "dow": 52215.16, "dow_pct": -1.235, "vix": 19.66, "vix_pct": 3.3,
              "es_futures": 7663.5, "es_pct": -0.532, "nq_futures": 29139.0, "nq_pct": -0.01},
        tags=["equities", "close"],
    ),
    item(
        "us_markets", "oil-six-month-high",
        "oil closes at a six-month high on iran war fears",
        "brent settled at $116.72, up 3.1%, and wti at $103.27, up 3.8%, as traders bet on new us strikes on iran.\nbrent gained 6.2% this week, its third straight weekly rise.",
        [src("CNBC", "https://www.cnbc.com/2026/10/23/oil-price-brent-wti-iran-war-saudi-arabia.html"),
         src("The Guardian", "https://www.theguardian.com/business/2026/oct/23/oil-five-month-high-fears-us-renews-strikes-iran")],
        "2026-10-23T19:00:00Z",
        meta={"brent": 116.72, "brent_pct": 3.1, "wti": 103.27, "wti_pct": 3.8},
        tags=["oil", "commodities"],
    ),
    item(
        "us_markets", "amex-job-cuts",
        "amex is cutting 5% of staff to 'prepare for ai'",
        "american express will cut about 5% of its global workforce and take a $336m restructuring charge.\nthe stock fell 3.7% even as the card giant reported third-quarter results.",
        [src("CNBC", "https://www.cnbc.com/2026/10/23/american-express-job-cuts.html"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/AXP/")],
        "2026-10-23T19:57:00Z",
        meta={"ticker": "AXP", "move_pct": -3.733, "close": 313.03},
        tags=["earnings", "jobs", "financials"],
    ),
    item(
        "us_markets", "slb-q3-beat",
        "slb jumps 7% on a q3 beat and a stronger 2027 outlook",
        "schlumberger beat estimates and pointed to a middle east drilling rebound for 2027 growth.\nthe stock closed up 7.1%, one of the s&p's best moves on a risk-off day.",
        [src("Reuters", "https://news.google.com/rss/articles/CBMitgFBVV95cUxPOVFTelJLT0RLMUpoVkFUUEJPdU13dmFDQkUzcFBWX1V2TGZBcXhSRTVZMTJ6RUVKU1pSZTRSZXdEeHA1bmwxYVROc1d5bW83bWh6Xzc0QzJ0cjVwLU9FVVNsUklWX3ZJVVAxZkx0cUNGT3BIRlNRRlotNDV5ZXdlOWsxZmo5OXlJX0FGR3FwSHFiSkhjM3BZNnJmTlZLRVZTUHNIZEpRWElHRE1JSkw1NDczUm44UQ?oc=5"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/SLB/")],
        "2026-10-23T17:30:00Z",
        meta={"ticker": "SLB", "move_pct": 7.084, "close": 53.06},
        tags=["earnings", "energy"],
    ),
    item(
        "us_markets", "bloom-energy-record-quarter",
        "bloom energy sinks 11% even after a record quarter",
        "bloom energy fell 11.2% despite reporting a record quarter, as investors sold the news.\nthe move made it one of the day's worst large-cap performers.",
        [src("Opening Bell Daily", "https://news.google.com/rss/articles/CBMihwFBVV95cUxQRDI3YUtvQ3RWclFESkdlUjFfaWxydkhiWkxac2NxRlBnZHJmY0tYLTZBSWhYdDNRRHpVbFpmUG1XdGdBWXVMYWl6LWgyQ3dFanN5THV4R0w1UFJUdnItWUprSm9iVjFKRlZRU3hvRVVQZ3FkdlJ2aG1UN2lhcTI3TGRBWDJYWkk?oc=5"),
         src("Yahoo Finance", "https://finance.yahoo.com/quote/BE/")],
        "2026-10-23T18:00:00Z",
        meta={"ticker": "BE", "move_pct": -11.237, "close": 193.3},
        tags=["earnings", "energy"],
    ),
    item(
        "us_markets", "consumer-sentiment-low",
        "consumer sentiment near a record low before the midterms",
        "the university of michigan's final october index dropped as petrol and grocery prices stayed high.\nindependents' sentiment fell to 42.4, just above the all-time low of 40.6.",
        [src("Al Jazeera", "https://www.aljazeera.com/economy/2026/10/23/us-consumer-sentiment-hits-a-near-record-low-before-midterm-elections")],
        "2026-10-23T17:26:00Z",
        meta={"independents_index": 42.4, "record_low": 40.6, "inflation_expectations_5y": 3.5},
        tags=["macro", "consumer", "midterms"],
    ),
    item(
        "us_markets", "mortgage-executive-order",
        "trump orders agencies to cut mortgage insurance and refinance costs",
        "the executive order directs agencies to cancel mortgage insurance on eligible future loans and expand cheaper refinancing.\nit lands less than two weeks before the midterms, with housing affordability a top voter concern.",
        [src("CNBC", "https://www.cnbc.com/2026/10/23/trump-mortgage-executive-order-costs.html")],
        "2026-10-23T19:53:00Z",
        tags=["housing", "policy", "midterms"],
    ),
    item(
        "us_markets", "meta-ai-repricing",
        "meta's 9% weekly slide shows the ai trade is being repriced",
        "meta lost about $135bn in market value over four sessions as investors questioned its ai buildout spending.\nnext week's microsoft, alphabet and amazon results are the next test, with flash pmis and a fed decision also due.",
        [src("CNBC", "https://www.cnbc.com/2026/10/23/meta-shares-rough-week-mike-khouw-is-buying.html"),
         src("Stock Titan", "https://news.google.com/rss/articles/CBMigwFBVV95cUxObzRpZ1F6YW9oLVp0WnJacm1TcFh4dkZWa2Z3UzJmamIzTmpkRi14N1BfNlQ1dGpHV2xOcElKTG9mWnJpRGl6TlFIM1MwamRvOHo2Q2t3SzBHbUVZYnVXd3EzYU1UMENKOU90bFlPY3lndzVVX0d6TTZCN1Q5WHdPWk5qNA?oc=5")],
        "2026-10-23T19:25:00Z",
        meta={"ticker": "META", "move_pct": -0.96, "week_pct": -9, "value_lost_usd_bn": 135},
        tags=["earnings", "ai", "big-tech"],
    ),
]

# ---------------------------------------------------------------- liverpool
liverpool = [
    item(
        "liverpool", "villarreal-comeback",
        "liverpool came from two down to beat villarreal 4-3",
        "mac allister scored twice, with wirtz and araujo also on target as liverpool overturned a 2-0 deficit at anfield.\nngumoha was player of the match; oluwaseyi pulled one back late for villarreal.",
        [src("BBC Sport", "https://www.bbc.co.uk/sport/football/videos/cmvg6qxp6lj7o"),
         src("Sky Sports", "https://news.google.com/rss/articles/CBMi2AFBVV95cUxNckxpYlVyVTQzY3Y3SWF6S3ltRDZZbndRZjRpejJlOW80eElsTGlSamVvRVJxZi1WbzFTaUlZZVIzdGljamw5eXVTT1RYNldSNWV4dnJCeWJBWWhzWVlRVEUzTEl4VEJNR2JvX1pKbWtHcGtvU2ZsNDhWUS1CNGNrSVdnTXdiOVJYN0RBMWhKTXNwblpQeHdBMFBKdnp4empUOGppcmhyRXFybEFSeFJnMFgtVEpYMlFrZzItTm9tUkJ0U3c3RE5ocFA5Unl5TDJJMXpPWkdiUVk?oc=5")],
        "2026-10-20T22:56:00Z",
        meta={"score": "4-3", "competition": "UEFA Champions League"},
        tags=["match", "champions-league"],
    ),
    item(
        "liverpool", "gravenberch-red-upheld",
        "panel backs gravenberch's red card, so brighton is a no-go",
        "the premier league's key match incidents panel said chris kavanagh was right to send off ryan gravenberch against man city.\ntwo yellows mean he misses the brighton game; iraola called the first caution 'never a yellow'.",
        [src("BBC Sport", "https://www.bbc.co.uk/sport/football/articles/cmed36n7qge3o")],
        "2026-10-21T16:28:00Z",
        meta={"player": "Ryan Gravenberch", "suspension": "1 match"},
        tags=["team-news", "discipline"],
    ),
    item(
        "liverpool", "brighton-preview",
        "brighton at anfield sunday, with six players missing",
        "liverpool host brighton at 2pm gmt on sunday (5pm riyadh), still without szoboszlai, frimpong, bradley and others.\nbarcola is fit but trained alone; munoz is a doubt, and storm boelo has put the fixture under review.",
        [src("Liverpool FC", "https://www.liverpoolfc.com/news/andoni-iraola-press-conference-liverpool-brighton-premier-league"),
         src("Liverpool Echo", "https://www.liverpoolecho.co.uk/sport/football/football-news/liverpool-injury-news-latest-brighton-34810377"),
         src("Liverpool Echo", "https://www.liverpoolecho.co.uk/sport/football/football-news/bradley-barcola-passed-fit-liverpool-34807852"),
         src("Yahoo Sports", "https://news.google.com/rss/articles/CBMiiAFBVV95cUxOM2gxbzhRQ29ESlZaZFpvR3JQSWxzaFZQUktpNWN6MUdEaHRRazlkUWlhQWFQMTVKMjdvUVgwVXRoUlAwQ1JiZTFQZlEtc2pLeUV2UGhyQVNUMVJ0Wm42bzhqZVdaTGluR1JyblNJSUF3VmYxaWg3THNyR2VrQjh1aDFGQVdjS1k0?oc=5")],
        "2026-10-23T14:54:00Z",
        meta={"kickoff": "2026-10-25T14:00:00Z", "venue": "Anfield", "injuries": ["Szoboszlai", "Frimpong", "Bradley", "Munoz", "Barcola workload"]},
        tags=["fixture", "team-news"],
    ),
    item(
        "liverpool", "home-win-drought",
        "iraola is still waiting for his first home league win",
        "liverpool have not won any of their three premier league home games under iraola this season.\nthe next two are at anfield, starting with brighton, and iraola says 'i want to win games'.",
        [src("Liverpool FC", "https://www.liverpoolfc.com/news/andoni-iraola-press-conference-liverpool-brighton-premier-league")],
        "2026-10-23T17:00:00Z",
        tags=["form", "analysis"],
    ),
    item(
        "liverpool", "elliott-valencia-loan",
        "liverpool check in on elliott's valencia loan",
        "club officials met valencia to review elliott's season; he has five substitute appearances and has not started a la liga game.\nboth clubs want more from him, but there is no agreement to cut the loan short.",
        [src("Liverpool Echo", "https://www.liverpoolecho.co.uk/sport/football/transfer-news/liverpool-valencia-harvey-elliott-news-34807952")],
        "2026-10-23T12:59:00Z",
        meta={"reliability": "reported - Liverpool Echo, no club confirmation"},
        tags=["transfer", "loan"],
    ),
    item(
        "liverpool", "transfer-rumours-roundup",
        "midfield rumours: nmecha contact, endrick enquiry, ndukwe meeting",
        "liverpool have reportedly contacted felix nmecha's camp; bulinews says dortmund's stance is the blocker (low-tier rumour).\nseparately, the echo reports an endrick enquiry and a meeting over ifeanyi ndukwe (both unconfirmed).",
        [src("Bulinews", "https://news.google.com/rss/articles/CBMikwFBVV95cUxQWFlLcExyOGlYQzZ2NFNoQlBSZ1RUS2NQV1gzTmw5YmpjZE9iYmpvLUF5SzZFcWhpaF9oR1hnYjlBcU9lRDg0dDU0a0dsUUdnNE9Pckc3d2htcHVkRVp1UnhjVVhjNHBpM0NRY0xpbHZHM0c3ZGlnQkE0OVhnZHBZRnpNLU1uaDFMRUpIVE5hWnY0ZWM?oc=5"),
         src("Liverpool Echo", "https://www.liverpoolecho.co.uk/sport/football/football-news/endrick-liverpool-transfer-news-iraola-34806362"),
         src("Liverpool Echo", "https://www.liverpoolecho.co.uk/sport/football/transfer-news/liverpool-ifeanyi-ndukwe-levante-talks-34804684")],
        "2026-10-23T12:00:00Z",
        meta={"reliability": "nmecha: low (Bulinews); endrick and ndukwe: Liverpool Echo reports"},
        tags=["transfer", "rumour"],
    ),
    item(
        "liverpool", "ngumoha-breakout",
        "ngumoha's villarreal night was a coming-of-age moment",
        "at 18 years and 52 days, ngumoha became liverpool's youngest player to score or assist in the champions league.\nhe won player of the match and anfield chanted his name; liverpool are reportedly working on a new contract.",
        [src("BBC Sport", "https://www.bbc.co.uk/sport/football/articles/ck0e0zydv33go"),
         src("The Liverpool Offside", "https://news.google.com/rss/articles/CBMiugFBVV95cUxObG83UEd0TU5RN1ZWVVN4bk1nbUU4RjUxM1V4ZkE4Wnk0OUZLb0tfeDJPMEtUXzJzQlppWTV6Q250UEtYWUhuY3NwdW5BUFEtbi00T0RRY255SV9RRms5NXVzYU9NRC14RzF6OU56N1FZV21QOWJCeDYzOXIwcnJlLXpnWVEzQzc1cG9FQ2pXbGVEbmhoMEJFMkNEdVFQOE9sRTM3V2FjYTF6NGdIaWVxRFFZanBiR3I0cHc?oc=5")],
        "2026-10-20T22:56:00Z",
        meta={"age": "18y 52d", "reliability": "contract: low-tier rumour (Liverpool Offside)"},
        tags=["player", "contract"],
    ),
]

sections = [
    {"id": "trending_repos", "title": "trending repos", "items": trending,
     "watch": [
         video("Introducing NVIDIA OpenShell Reference Architecture for Safer AI Agents", "https://www.youtube.com/watch?v=xaHdyqGtG1M", "NVIDIA", "2026-10-21T00:00:00Z"),
         video("Websites taken down worldwide over critical PHP vulnerabilities", "https://www.youtube.com/watch?v=3EB16ZFkRhw", "DW News", "2026-10-22T00:00:00Z"),
         video("Emergency Livestream - PHP Vulnerabilities: What You Need to Know Today", "https://www.youtube.com/watch?v=OrfwyFVkzqY", "SANS Institute", "2026-10-21T00:00:00Z"),
     ]},
    {"id": "middle_east", "title": "middle east", "items": middle_east,
     "watch": [
         video("Netanyahu orders closure of entire occupied West Bank after shooting", "https://www.youtube.com/watch?v=E8zFh4i0AaE", "BBC News", "2026-10-23T12:00:00Z"),
         video("Yemen's humanitarian crisis deepens following Houthi strikes on Saudi Arabia", "https://www.youtube.com/watch?v=_pW4vIdJsU0", "BBC News", "2026-10-22T23:00:00Z"),
         video("Iran threatens US bases as US and Israel reportedly consider new strikes", "https://www.youtube.com/watch?v=92BM5e8I9hA", "DW News", "2026-10-23T15:00:00Z"),
     ]},
    {"id": "us_markets", "title": "us markets", "items": us_markets, "watch": []},
    {"id": "liverpool", "title": "liverpool", "items": liverpool,
     "watch": [
         video("Highlights: Liverpool 4-3 Villarreal | Champions League comeback win", "https://www.youtube.com/watch?v=iSPDVKdWoJU", "Liverpool FC", "2026-10-21T00:00:00Z"),
         video("Anfield Inspires Reds Comeback | Liverpool 4-3 Villarreal | Champions League Highlights", "https://www.youtube.com/watch?v=TFfRuvrPxlA", "TNT Sports", "2026-10-21T00:00:00Z"),
     ]},
]

brief = {
    "schema_version": "1.0",
    "generated_at": NOW,
    "date": "2026-10-23",
    "edition": "evening",
    "timezone": "Asia/Riyadh",
    "next_build_at": "2026-10-24T03:30:00Z",
    "sections": sections,
    "top_stories": [
        {"section": "middle_east", "id": "jordan-karak-church-shooting"},
        {"section": "middle_east", "id": "hebron-west-bank-lockdown"},
        {"section": "us_markets", "id": "oil-six-month-high"},
        {"section": "us_markets", "id": "wall-street-close"},
        {"section": "liverpool", "id": "villarreal-comeback"},
    ],
}

# ---------------------------------------------------------------- validation
errors = []
ids = set()
for s in brief["sections"]:
    if not (5 <= len(s["items"]) <= 8):
        errors.append(f"{s['id']}: {len(s['items'])} items")
    if s["id"] in ("trending_repos", "middle_east", "liverpool") and not (1 <= len(s["watch"]) <= 3):
        errors.append(f"{s['id']}: watch count {len(s['watch'])}")
    for it in s["items"]:
        key = f"{s['id']}/{it['id']}"
        if key in ids:
            errors.append(f"duplicate id {key}")
        ids.add(key)
        if not re.fullmatch(r"[a-z0-9-]+", it["id"]):
            errors.append(f"bad id {key}")
        if len(it["summary"].split("\n")) != 2:
            errors.append(f"summary not 2 lines {key}")
        if not it["sources"]:
            errors.append(f"no sources {key}")
        for so in it["sources"]:
            if not so["url"].startswith("http"):
                errors.append(f"bad url {key}")
        if s["id"] == "middle_east" and not it.get("change"):
            errors.append(f"missing change {key}")
if errors:
    raise SystemExit("VALIDATION FAILED:\n" + "\n".join(errors))

out = HERE / "brief.json"
out.write_text(json.dumps(brief, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size} bytes), {sum(len(s['items']) for s in sections)} items")
