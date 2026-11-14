#!/usr/bin/env python3
"""Merge tiktok_trends.json into brief.json social section (keeps other items; replaces old tt-* items)."""
import json,os,re,datetime,hashlib
# Live brief on the dashboard host. Override with BRIEF_JSON.
# Leave the repository-root brief.json alone: an external sync publishes that file from main.
B=os.environ.get("BRIEF_JSON","/home/box/services/glance/data/brief.json"); T=os.path.join(os.path.dirname(os.path.abspath(__file__)),"tiktok_trends.json")
t=json.load(open(T))
if any(str(n).startswith("WARNING: region") for n in t.get("notes",[])):
    raise SystemExit("tiktok region did not switch to SA; not merging")
d=json.load(open(B)); s=d["sections"]["social"]
old={i["id"]:i for i in s["items"] if i["id"].startswith("tt-")}
keep=[i for i in s["items"] if not i["id"].startswith("tt-")]
now=t["generated_at"]; new=[]
for it in t["items"][:10]:
    tag=it["name"].lstrip("#"); slug=re.sub(r"[^a-z0-9]+","-",tag.lower()).strip("-") or hashlib.md5(tag.encode()).hexdigest()[:8]
    iid=f"tt-{it['kind']}-{slug}"
    new.append({"id":iid,"title":f"{it['name']} is #{it['rank']} on TikTok in Saudi Arabia this week",
      "summary":f"TikTok Creative Center, Saudi Arabia, last 7 days: {it['metric']}.",
      "sources":[{"title":"TikTok","url":it["url"],"type":"social"},
                 {"title":"TikTok Creative Center (SA, 7 days)","url":"https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?region=SA&period=7","type":"social"}],
      "time":old.get(iid,{}).get("time",now),"section":"social","status":"new" if iid not in old else old[iid].get("status","new"),
      "image":it["image"],"platform":"tiktok","creator":it.get("creator") or "TikTok Creative Center","metric":it["metric"]})
s["items"]=keep+new
json.loads(json.dumps(d)); tmp=B+".tmp"; json.dump(d,open(tmp,"w"),ensure_ascii=False,indent=2); os.replace(tmp,B)
print(f"social: {len(keep)} kept + {len(new)} tiktok")
