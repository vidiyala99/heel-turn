"""Agent37 lane helper. python tools/a37.py list | exec <instance> "<shell>" """
import json, os, sys, urllib.request
KEY = os.environ["AGENT37_API_KEY"]
def call(method, url, body=None, headers=None, timeout=650):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **(headers or {})}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode() or "{}")
if sys.argv[1] == "list":
    d = call("GET", "https://api.agent37.com/v1/instances", headers={"Authorization": f"Bearer {KEY}"})
    for i in (d.get("data") or d.get("instances") or d if isinstance(d, list) else []):
        print(i.get("id"), i.get("name"), i.get("status") or i.get("state"))
    if not isinstance(d, list) and not (d.get("data") or d.get("instances")): print(json.dumps(d)[:800])
elif sys.argv[1] == "exec":
    d = call("POST", f"https://sandbox.agent37.app/v1/instances/{sys.argv[2]}/exec", {"command": sys.argv[3]},
             headers={"X-Agent37-Key": KEY})
    sys.stdout.write(d.get("stdout", "")); sys.stderr.write(d.get("stderr", ""))
    sys.exit(d.get("exit_code", d.get("exitCode", 0)) or 0)
