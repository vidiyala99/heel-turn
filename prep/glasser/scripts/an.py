import json,glob,re,statistics as S
def D(f):
    return json.load(open(f,encoding='utf-8'))
REL={'F':r'(ai|agent).{0,40}(film|movie|short|actor|bloop|script|cinema|animat)|(film|movie|actor).{0,40}(ai|agent)',
 'G':r'(ai|agent|npc|bot)s?.{0,50}(among us|mafia|werewolf|diplomacy|social deduction|betray|town|npc|game|play|minecraft|deception|villag|civiliz)|(among us|mafia|werewolf|npc).{0,40}(ai|agent)',
 'C':r'(ai|agent|gpt|chatgpt).{0,50}(negotiat|roleplay|role-play|sales|coach|driving|debate|instructor|examiner|train|practice|teach|tutor)|(negotiat|sales|driving|debate).{0,40}(ai|agent)'}
def items(t,p):
    out={}
    for pre in (t,t+'b',t+'s'):
        for f in glob.glob(f'{pre}_{p}_*.json'):
            j=D(f)
            if j['status']!='COMPLETED': continue
            d=(j['output']['output'].get('data') or {})
            if p=='x':
                for i in d.get('items') or []: out[i['url']]=dict(url=i['url'],eng=i['likeCount'],views=i['viewCount'],fol=i['authorFollowers'],who=i['authorUsername'],txt=i['text'])
            if p=='yt':
                for i in d.get('videos') or []: out[i['url']]=dict(url=i['url'],eng=i.get('views') or 0,fol=None,who=i.get('channel'),txt=i.get('title') or '',len=i.get('lengthText'),age=i.get('publishedTime'))
            if p=='tt':
                for i in d.get('videos') or []: out[i['url']]=dict(url=i['url'],eng=i['likes'],views=i['views'],fol=None,who=i['author'],txt=i['caption'] or '',com=i['comments'],sh=i['shares'])
            if p=='rd':
                for i in d.get('posts') or []: out[i['url']]=dict(url=i['url'],eng=i['score'],com=i['numComments'],who=i['subreddit'],txt=i['title']+' '+(i.get('selftext') or '')[:200])
    return list(out.values())
if __name__=='__main__':
    import sys
    for t in 'FGC':
        for p in ['x','yt','tt','rd']:
            allr=items(t,p); rel=[r for r in allr if re.search(REL[t],r['txt'],re.I)]
            rel.sort(key=lambda r:-r['eng'])
            m=S.median([r['eng'] for r in rel]) if rel else None
            print(f'== {t} {p} total={len(allr)} relevant={len(rel)} median_eng={m}')
            for r in rel[:int(sys.argv[1])]:
                print('  ',r['eng'],r.get('views') or '',r.get('fol') or '',r['who'],r.get('len') or '',r['url'],'|',r['txt'].replace('\n',' ')[:110])
