import json, subprocess, concurrent.futures, sys
b=json.load(open('brief.json'))
urls=[]
for s in b['sections']:
    for it in s['items']:
        for so in it['sources']:
            urls.append((f"{s['id']}/{it['id']}", so['name'], so['url']))
    for v in s['watch']:
        urls.append((f"{s['id']}/watch", v['channel'], v['url']))
# de-dup by url
seen={}
for where,name,u in urls:
    seen.setdefault(u,(where,name))
def check(item):
    u,(where,name)=item
    try:
        r=subprocess.run(["curl","-sSL","-m","30","-A","Mozilla/5.0 (X11; Linux x86_64) Chrome/124","-o","/dev/null","-w","%{http_code} %{url_effective}",u],capture_output=True,text=True,timeout=40)
        code,_,eff=r.stdout.partition(' ')
        return (u,code,eff,where,name)
    except Exception as e:
        return (u,'ERR',str(e),where,name)
bad=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    for u,code,eff,where,name in ex.map(check, seen.items()):
        ok=code.isdigit() and 200<=int(code)<400
        if not ok: bad.append((u,code,eff,where,name))
        print(('OK ' if ok else 'BAD'),code,where,'|',name,'|',u[:80],'->',eff[:80])
print(f"\n{len(seen)} unique links, {len(bad)} bad")
for x in bad: print('BAD',x)
sys.exit(1 if bad else 0)
