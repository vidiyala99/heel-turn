import json,glob,sys,statistics as S
def L(f):
    return json.load(open(f,encoding='utf-8'))['output']['output'].get('data') or {}
def rows(t,p):
    out={}
    for f in sorted(glob.glob(f'{t}_{p}_*.json')):
        d=L(f)
        q=json.load(open(f,encoding='utf-8'))['input']['query'].split(' since')[0]
        if p=='x': L_=[(i['likeCount'],i['viewCount'],i['replyCount'],i['authorFollowers'],i['authorUsername'],i['url'],i['text'].replace('\n',' ')[:130],q) for i in (d.get('items') or [])]
        if p=='yt': L_=[(i.get('views') or 0,i.get('lengthText'),i.get('channel'),i.get('publishedTime'),i['url'],(i.get('title') or '')[:100],q) for i in (d.get('videos') or [])]
        if p=='tt': L_=[(i['likes'],i['views'],i['comments'],i['shares'],i['author'],i['url'],i['caption'].replace('\n',' ')[:130],q) for i in (d.get('videos') or [])]
        if p=='rd': L_=[(i['score'],i['numComments'],i['subreddit'],i['url'],i['title'][:110],q) for i in (d.get('posts') or [])]
        for r in L_: out[r[-3] if p!='yt' else r[4]]=r
    return sorted(out.values(),key=lambda r:-(r[0] or 0))
t,p,n=sys.argv[1],sys.argv[2],int(sys.argv[3])
r=rows(t,p); print(t,p,'N=',len(r))
for x in r[:n]: print(x)
