"""Block until any listed lane job finishes (LANE_DONE in its log); print which. Usage: a37_watch.py inst:job ..."""
import json, os, sys, time, urllib.request
KEY = os.environ["AGENT37_API_KEY"]
def ex(i, cmd):
    req = urllib.request.Request(f"https://sandbox.agent37.app/v1/instances/{i}/exec", data=json.dumps({"command": cmd}).encode(),
                                 headers={"X-Agent37-Key": KEY, "Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=90).read()).get("stdout", "")
pairs = [a.split(":") for a in sys.argv[1:]]
while True:
    for inst, job in pairs:
        try:
            out = ex(inst, f"grep -q LANE_DONE ~/jobs/{job}.log && echo DONE; git -C ~/heel-turn ls-remote --heads origin lane/{job} | wc -l")
        except Exception as e:
            continue
        if "DONE" in out:
            print(f"FINISHED {inst}:{job}", flush=True); sys.exit(0)
    time.sleep(60)
