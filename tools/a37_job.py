"""Launch a Claude Code job on an Agent37 lane: python tools/a37_job.py <instance> <job> <brief.md>
Uploads pstack-lite once, writes the brief, runs `claude -p` in the background on branch lane/<job>, log at ~/jobs/<job>.log."""
import base64, json, os, shlex, sys, urllib.request
KEY = os.environ["AGENT37_API_KEY"]
def ex(i, cmd, t=300):
    req = urllib.request.Request(f"https://sandbox.agent37.app/v1/instances/{i}/exec", data=json.dumps({"command": cmd}).encode(),
                                 headers={"X-Agent37-Key": KEY, "Content-Type": "application/json"}, method="POST")
    d = json.loads(urllib.request.urlopen(req, timeout=t + 30).read())
    return d.get("exit_code", d.get("exitCode", 0)), d.get("stdout", ""), d.get("stderr", "")
def upload(i, data, remote):
    b = base64.b64encode(data).decode()
    for n in range(0, max(len(b), 1), 60000):
        ex(i, f"printf %s {shlex.quote(b[n:n+60000])} | base64 -d {'>' if n == 0 else '>>'} {remote}")
inst, job, brief = sys.argv[1:4]
# Option 2 (Aakash 12:32): file edits auto-approved, shell limited to an allowlist; no force push, no push to main.
ALLOW = ("--allowedTools 'Read' 'Edit' 'Write' 'Glob' 'Grep' 'WebFetch' 'WebSearch' 'TodoWrite' "
         "'Bash(npm *)' 'Bash(npx *)' 'Bash(node *)' 'Bash(git add *)' 'Bash(git commit *)' 'Bash(git status*)' "
         "'Bash(git diff*)' 'Bash(git log*)' 'Bash(git push -u origin lane/*)' 'Bash(git push origin lane/*)' "
         "'Bash(git checkout *)' 'Bash(git pull*)' 'Bash(git fetch*)' 'Bash(python *)' 'Bash(python3 *)' 'Bash(uv *)' "
         "'Bash(pip *)' 'Bash(bruin *)' 'Bash(ls *)' 'Bash(cat *)' 'Bash(mkdir *)' 'Bash(curl -fsSL https://*)' "
         "'Bash(curl -LsSf https://getbruin.com/*)' 'Bash(sh *)' 'Bash(bash *)' "
         "--disallowedTools 'Bash(git push --force*)' 'Bash(git push -f*)' 'Bash(git push origin main*)'")
ENVS = " ".join(f"{k}={shlex.quote(v)}" for k, v in (a.split("=", 1) for a in sys.argv[4:])) or "HT=1"
here = os.path.dirname(__file__)
code, out, _ = ex(inst, "test -f ~/pstack/skills/poteto-mode/worker.md && echo have")
if "have" not in out:
    upload(inst, open(os.path.join(here, ".pstack-lite.tgz"), "rb").read(), "/tmp/pstack.tgz")
    ex(inst, "mkdir -p ~/pstack && tar xzf /tmp/pstack.tgz -C ~/pstack")
ex(inst, "mkdir -p ~/jobs")
upload(inst, open(brief, "rb").read(), f"~/jobs/{job}.md".replace("~", "/home/node"))
run = (f"export {ENVS}; source ~/.claude_token_env 2>/dev/null; export PATH=$HOME/.npm-global/bin:$PATH; cd ~/heel-turn && git fetch -q && "
       f"git checkout -q -B lane/{job} origin/main && claude -p \"$(cat ~/jobs/{job}.md)\" --model opus "
       f"--permission-mode acceptEdits {ALLOW} > ~/jobs/{job}.log 2>&1; echo LANE_DONE >> ~/jobs/{job}.log")
code, out, err = ex(inst, f"nohup bash -c {shlex.quote(run)} >/dev/null 2>&1 & echo launched")
print(inst, job, out.strip(), err.strip()[-200:])
