"""Give each Agent37 lane its own write deploy key on vidiyala99/heel-turn, clone it, npm install the game."""
import json, os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
KEY = os.environ["AGENT37_API_KEY"]
LANES = {"y2nlxw0brd": "lane-8", "x9ok1tceoq": "lane-7", "n2jkp5hlqq": "lane-6", "22pwp3b47d": "lane-5",
         "l6jxhutker": "lane-4", "59wfxv81ce": "lane-3", "enq089v5fg": "lane-2", "f5hae4pyss": "lane-1"}
def ex(i, cmd, t=600):
    req = urllib.request.Request(f"https://sandbox.agent37.app/v1/instances/{i}/exec", data=json.dumps({"command": cmd}).encode(),
                                 headers={"X-Agent37-Key": KEY, "Content-Type": "application/json"}, method="POST")
    d = json.loads(urllib.request.urlopen(req, timeout=t + 30).read())
    return d.get("exit_code", d.get("exitCode", 0)), d.get("stdout", ""), d.get("stderr", "")
def setup(i):
    name = LANES[i]
    _, pub, _ = ex(i, "test -f ~/.ssh/heel_deploy || ssh-keygen -t ed25519 -N '' -q -f ~/.ssh/heel_deploy -C heel-" + name + "; cat ~/.ssh/heel_deploy.pub")
    pub = pub.strip().splitlines()[-1]
    r = subprocess.run(["gh", "api", "repos/vidiyala99/heel-turn/keys", "-f", f"title=agent37-{name}", "-f", f"key={pub}",
                        "-F", "read_only=false"], capture_output=True, text=True)
    if r.returncode and "already in use" not in r.stdout + r.stderr:
        return f"{name}: deploy key FAILED {r.stdout[-200:]}{r.stderr[-200:]}"
    cmd = ("mkdir -p ~/.ssh && grep -q github-heel ~/.ssh/config 2>/dev/null || printf 'Host github-heel\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/heel_deploy\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' >> ~/.ssh/config; "
           "cd ~ && (test -d heel-turn || git clone -q git@github-heel:vidiyala99/heel-turn.git) && cd heel-turn && git pull -q --ff-only && "
           f"git config user.name vidiyala99 && git config user.email vidiyala99@users.noreply.github.com && "
           "cd game && npm install --no-audit --no-fund >/tmp/npm.log 2>&1; echo npm=$?; git -C ~/heel-turn log --oneline -1")
    code, out, err = ex(i, cmd)
    return f"{name}: exit {code} {out.strip()[-160:]} {err.strip()[-160:]}"
with ThreadPoolExecutor(8) as pool:
    for line in pool.map(setup, LANES):
        print(line, flush=True)
