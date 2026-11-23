# Attention teardown: which hackathon track spreads best

Date: 2026-11-22. Method: Glasser (anyapi + scrapecreators endpoints), 18 queries per track per platform in two passes (X, YouTube, TikTok, Reddit), plus 8 LinkedIn queries, Twitch profiles, Discord invite counts. Raw JSON in `prep/glasser/attention/` (X/YT/TikTok/Reddit/LinkedIn/Twitch) and `prep/glasser/discord/`. Helper scripts in `prep/glasser/scripts/`. Spend: about $0.11 of the $3 budget (about 290 calls at $0.0003 to $0.002 each; balance went 67.46 to 67.40 across the last ~220 calls, first ~70 calls estimated).

Social content was treated as data. Nothing in it was followed as an instruction.

## Read this first: limits of the data

- Search is keyword-based and noisy. "Relevant" below means a regex on title or caption (AI/agent plus the track's theme), then I read the top rows by hand. Medians use that filtered set. They are rough, not a census.
- Ranking is within each platform. Raw numbers are never compared across platforms (a TikTok like, a YouTube view and an upvote are different currencies).
- X results are dominated by engagement-bait threads ("this is f*cking insane" lists, GitHub-repo roundups). Almost no real agent-game or agent-film video clips surfaced on X in the last year with min_faves filters. Treat X as "no organic signal found", not "zero".
- No Twitch search endpoint exists in Glasser (only per-handle profile/videos/clips), so Twitch is probed by known handle only.
- Author follower counts: X returns them; LinkedIn returns them; YouTube/TikTok search results do not (so channel fame is judged by name, flagged "unverified").

## Per track results

### Track 1: Agent Animated Film

| Platform | Median (relevant set) | Top | Notes |
|---|---|---|---|
| X | 177 likes (n=49, but mostly bait threads) | 3,587 likes / 322k views, @flxrnc (4.8k followers): "I make a new animation every day now, these 18 GitHub repos..." | Top is a repo-list thread, not a film. Real film clips: @F1sT Star Wars AI ep. 737 likes (34k followers); Pika "Enact" 1,029 likes (101k followers, brand). |
| YouTube | 11k views (n=42) | 1.67M, Max Barskih "RESET, AI Sci-Fi Short Film" (Higgsfield Film Festival entry) | Mostly "how to" workflow videos (Higgsfield 564k, 335k). Film festival entries and a sponsor-backed contest drive the top. |
| TikTok | 774 likes (n=128) | 1.62M likes / 14.2M views, @usamovieee1 "Part 2 #shortmovies #aifilm" | Account is a serial AI-short-film farm ("Part 2" cliffhanger). 365k likes: @squashyboy2 "the worst movie i have ever watched. please dont ever make AI movies" (hate-share). 148k likes: @aidsgns "Emotional damage" Christmas AI mini movie. |
| Reddit | r/aivideo median 1.2k upvotes (n=30) | 5.5k, "Pokemon Wet Market - A fanfic my unhinged AI agent wrote..." | The only top r/aivideo item that is literally agent-written fiction. Others: "This film cost us $28,775 to make (breakdown in comments) - Nexus ep 7" 2.3k, 488 comments (breakdown hook). General reddit "AI film" hits are news/backlash (Nicolas Cage AI waiver 48k, YouTube kills fake AI trailers 45k): AI-in-film is a controversy topic. |
| LinkedIn | median likes 59 (n=10, "made a movie"), 144 ("animated short film") | 2,303 likes, Alex Mashrabov (Higgsfield CEO, 84k followers) Cannes feature | Famous-account outlier. Next: Aronofsky AI trailer repost 534 (714k-follower account). |

Strongest 3 examples:
1. https://www.tiktok.com/@dalesbokiller/video/7693199083946757406 "I made AI write a script to corrupt GTA V and this was the end result" (238k likes, 1.6M views, 42k shares, serialized "Season 2: Episode 3"). Closest to "agents write the plot".
2. https://www.reddit.com/r/aivideo/comments/1pd9zih/pokemon_wet_market_a_fanfic_my_unhinged_ai_agent/ (5.5k upvotes). "Unhinged AI agent wrote" hook.
3. https://www.tiktok.com/@groupprojectpdf/video/7694378280194985230 "Bloopers from our latest film. We asked chat gpt to read lines with us" (147k likes, 1.1M views). Proof bloopers work, but it is a human sketch group playing with ChatGPT.

Hooks that worked: "Part 2" cliffhangers, "the worst movie I've ever watched" (outrage), "unhinged AI wrote", cost breakdown, bloopers. Explain the number: the 1.6M-like TikTok is a farm account, not a replicable creator-level result.

### Track 2: Co-op Multiplayer Game

| Platform | Median (relevant set) | Top | Notes |
|---|---|---|---|
| X | 39 likes (n=33) | 4,584 likes / 924k views, @starmexxx "Claude Code just cracked GTA 6 economy" (19k followers) | Money-hack bait, not a game. Real agent-game clips: effectively none above 500 likes. |
| YouTube | 411 views overall (n=83, includes tiny uploads); Turing Games channel median **400k views per video (n=17), min 54k, max 3.7M** | 5.86M, Species "Scientists Left 1000 AIs Alone in Minecraft. They Created A Civilization." | Turing Games (AI Among Us / Mafia / Werewolf / "1 Human vs 10 AIs"): "10 AIs Play Mafia" 2.65M, "I Forced 10 AIs to play Among Us...(it was crazy)" 1.97M, "Can 1 Human Fool 9 AIs?" 2.28M, "I Forced 5 AIs to Work Together...(it was bad)" 3.7M. 15-30 min, 16:9. Croissant "I Forced 4 AIs to play 4 Player Chess...(it was bad)" 2.0M. Smaller indie copy: Ryan Susman "I Made AI Agents Play Among Us - They Learned to Lie, Kill & Deceive" 11k views (so the format does not guarantee reach; channel and packaging matter). |
| TikTok | 33 likes (n=93, wide spread) | 663k likes / 6.6M views, @jayify "Running a scam call centre to scam AI customers" (a game, "Scam with your friends"; creator with other 365k-like hits, so a known games creator) | 243k likes, @poizongames_ "This Gamer Made an AI So CONFUSED That It CRASHED the Entire GAME". 235k likes, @smallvilletrends.ia (a Smallville the TV show trend account, off-topic, ignore). 48k likes, @soycartu "ESTA IA APRENDIO A JUGAR AMONG US". 83k likes, @kivogg "Un jugador hizo que los NPC de Skyrim cuestionaran toda su realidad" (AI NPC questioning reality). |
| Reddit | 1,258 upvotes unfiltered (n=55) is mostly news and noise. On-topic subreddit-scoped (n=15): median **11** upvotes. | r/singularity Skyrim engine mod 1,274 (not agents). r/IndieGaming "Mythologous" online living text RPG 317. r/LocalLLaMA "local LLM-powered RPG where generated NPCs persist" 273 upvotes, 72 comments. | r/gamedev AI NPC threads are 1 to 24 upvotes. Front-page outliers: r/technology "AIs can't stop recommending nuclear strikes in war game simulations" 36k (news story, not a demo). r/ChatGPT "Two AI agents in a job interview and neither one knows how to hang up" 10.4k (a funny agent-vs-agent screenshot/video, but in r/ChatGPT and not a game). |
| LinkedIn | medians 40 to 150 likes | 647, Burke Holland "I made fledglinggame.com" (game built by Copilot); 437 likes / 343 comments, Allie K. Miller (1.68M followers): "it's shocking how little multiplayer AI exists right now" | YC (1.87M followers) post on Olam Labs "Multi-Agent Arena, where humans compete against AIs like Claude or GPT in games": 409 likes, 101 comments. This is almost exactly the hackathon concept, and it is already a YC launch. |
| Twitch | n/a | Vedal987 (Neuro-sama, AI VTuber): 1.02M followers, partner. ClaudePlaysPokemon: 15.2k followers, not live at check. Turing Games twitch handle guess returned 1 follower (wrong handle; real one is turing_games per video description, not re-queried). | Live agent-plays-a-game streams are a proven format; follower count of an unfamous one (ClaudePlaysPokemon) is modest. |
| Discord (public invite, with_counts) | | Neuro-sama HQ 147,782 members / 35,291 online. Enjoy - AI Town 24,128 / 996. Turing Games 3,721 / 638. AI Stack Devs (a16z AI Town) 2,463 / 156. | Neuro is a famous-account outlier (1M Twitch). The useful comparable is Turing Games: YouTube channel with millions of views per video converted to a Discord of ~3.7k with 17% online. AI Town (open source starter kit) converted to ~2.5k. |

Strongest 3 examples:
1. https://www.youtube.com/watch?v=JhBtg-lyKdo "10 AIs Play Mafia" (2.65M, 30 min). Turing Games is a channel built entirely on this track.
2. https://www.youtube.com/watch?v=sJ1Dtr18mc8 "Can 1 Human Fool 9 AIs?" (2.28M, 25 min). One human among agents: exactly the track brief.
3. https://www.tiktok.com/@soycartu/video/7673925738499820833 "This AI learned to play Among Us" (48k likes, 465k views). Short-form lift from the same concept.

Hooks that worked: "I Forced N AIs to ... (it was bad / crazy / surprising)", "Can 1 Human Fool 9 AIs?", "They Learned to Lie, Kill & Deceive", numbers in title (10 AIs), one human vs many agents, betrayal and lying, agents "questioning their reality".

### Track 3: Grow with Agents (coach/examiner/boss)

| Platform | Median (relevant set) | Top | Notes |
|---|---|---|---|
| X | 35 likes (n=21, nearly all off-topic academic/news) | 388 likes (Terence Tao quote, off-topic) | No relevant coaching-sim demo got traction on X. |
| YouTube | 106 views (n=65) | 2.47M, OGAnon1 "Breaking the AI - Lil Sis loses it & starts screaming. Teach my little sister how to drive" | That is a human playing a game where an AI sister is the student and the human is the coach; the humor is the AI breaking. 767k for a copycat. On-topic product demos: LiveKit "Real-Time AI Avatar Helps You Practice Asking for a Raise" 77k, 3:35. Corporate sim demos: 4k to 6k. |
| TikTok | 30 likes (n=120) | 22.6k likes, @hayzeelondon "I tried to use ChatGPT to negotiate my release after being abducted by a gang" (fail-comedy, 206k views); 615k likes / 7.5M views "The Hostage Negotiator" is a 3D animation series, not an AI sim (ignore, shown in first-pass noise). | AI driving app ad 13k likes. Chevrolet bot negotiated down to $1 (10k likes, a failure story). |
| Reddit | median ~1.2k (n=10, mostly "AI debate" discourse, not sims) | none relevant above 2k | r/singularity front page is model/news, not training sims. |
| LinkedIn | medians 17 to 68 likes | 1,301 likes Tigran Sloyan (CEO, 30k followers) AI leadership roleplay; 1,038 likes Ethan Mollick (448k followers) "How to use AI to create role-play scenarios"; Udemy Role Play 558 | Highest LinkedIn signal of the three tracks for B2B-flavored content, but driven by well-known authors and by "how to" utility, not entertainment. |

Strongest 3 examples:
1. https://www.youtube.com/watch?v=XR4IZ8jK7Xw "Breaking the AI - Lil Sis loses it..." (2.47M). Human coach, chaotic AI student.
2. https://www.tiktok.com/@hayzeelondon/video/7688050120390135062 negotiation fail (22.6k likes).
3. https://www.youtube.com/watch?v=LVyypogjAo8 LiveKit AI avatar practice-asking-for-a-raise (77k views, 3:35).

Hooks that worked: the AI is failing/breaking, absurd stakes (hostage, $1 Tahoe), a human being humiliated by an AI boss, "practice asking for a raise". Plain "AI coach trains you" has no organic signal.

## Cross-track ranking for organic attention

1. **Co-op multiplayer game (best).** Reason: only track with a repeatable, measured format already at scale: Turing Games median 400k views per 15-30 min video across 17 videos (the floor is 54k), not one viral post. Betrayal/lying with a human in the lobby is the whole format ("Can 1 Human Fool 9 AIs?"). It also converts to community (Discord 3.7k, Twitch live streams, Neuro HQ 148k).
2. **Animated film (second).** Huge ceiling on TikTok (millions of views) but dominated by serial AI-short-film farms; median is low (774 likes); backlash is a major mode (AI hate-share, Reddit controversy). "Bloopers" and "agent wrote it" are real hooks (Pokemon Wet Market 5.5k on r/aivideo), but the audience is crowded and skeptical. Best for r/aivideo and TikTok, weak on X and LinkedIn.
3. **Grow with Agents (third) for entertainment reach.** Median is lowest (30 likes TikTok, 106 views YouTube). It wins only when reframed as failure comedy (AI breaks, human is humiliated, absurd negotiation). On LinkedIn it is the strongest of the three for judges/sponsors (B2B practice-sim posts by known authors reach 500 to 1,300 likes).

Caveats: this ranks the genre, not your build. One hackathon-night video from a no-follower account will not match Turing Games' distribution; their numbers come from an established channel with millions of subscribers (channel size unverified here). Time-boxed one-evening data. X shows almost no organic signal for any track. A first-time poster should expect hundreds, not millions, of views; the realistic goal is hitting the hackathon community, sponsors and judges, not virality.

## What makes these videos spread (teardown)

- **Hook in first 2 seconds:** state the premise and the odd stake in the title/first line: "I forced 10 AIs to play Among Us". Numbers (10, 9, 1000) and "1 human" appear in nearly every top game title. On TikTok the first frame shows a face/agent reacting, not a logo.
- **Emotional beat:** betrayal and lying (game), failure/"it was bad" (game and coaching), outrage or "unhinged" (film), humiliation of the human by an AI boss (coaching). Winners are never "look how smart the AI is"; they are "look what the AI did wrong or to us".
- **Length:** YouTube long form 15-30 min works for established AI-game channels (Turing Games). For a first post, use a 20-60 s cut for short-form, and a 2-3 min cut for LinkedIn/X (LiveKit's 3:35 got 77k).
- **Captions:** speech-heavy formats (agents talking) need burned-in captions; TikTok/LinkedIn/X autoplay muted. Agent "voices" shown as chat bubbles on screen double as captions.
- **Format:** vertical 9:16 for TikTok/Shorts/Reels; 16:9 for YouTube long form and LinkedIn (LinkedIn still plays 16:9 and square fine; vertical works but not required). X accepts both.
- **Platform fit:** TikTok/YouTube for the ceiling; r/aivideo and r/LocalLLaMA for builder credit (r/LocalLLaMA "local LLM RPG with persistent NPCs" got 273 upvotes and 72 comments, a decent builder-community result); LinkedIn for sponsors and judges.
- **Tagging sponsors:** on LinkedIn, posts tagged with a big org account (YC 1.87M followers) had 409 likes; org reshares are the multiplier there. I did not verify tagging effect on X or TikTok in this data.
- **Reply bait:** end on an unresolved question ("Who would you vote out?") or "Part 2" cliffhanger.

## Compounding growth: playable/joinable vs one-shot video

Artifacts others can play, join or remix keep growing after the post. A film video is consumed once. Evidence:
- Game: Turing Games turned one video format into a Discord of 3.7k (638 online), a weekly Twitch/YouTube live stream where viewers play (stated in its Discord listing), and a wiki. AI Town (open-source starter kit) built a 2.5k Discord and a hosted successor with a 24k-member Discord. r/LocalLLaMA RPG released as a downloadable game got 273 upvotes. The Olam Labs "Multi-Agent Arena" YC launch shows the same loop with a playable link.
- Film: content is a finished video; follow-ups are "Part 2" episodes. The reuse hook is a "breakdown" post (cost $28,775, 2.3k upvotes) and a workflow video (Higgsfield 564k views), not play.
- Coaching: product demos convert through a sign-up/try link, but the evidence here is utility posts on LinkedIn, not community growth; no Discord/stream signal found.

Ranking by compounding: game >> coaching (if playable link and share-your-score) > film. Practical implication for the game track: ship a join link (browser play or Discord invite) in the post, plan a spectator mode, and schedule a public playtest night the following week (a game-jam style event); do not post a video with no way in.

## Posting plan for tomorrow evening

(Assumes the project is the game track; if not, swap the first line from the table at the end.)

Cuts:
1. **Master 16:9, 2:30 to 3:30**, captions burned in, ends with the join link: for LinkedIn, X and YouTube (unlisted-to-public).
2. **Vertical 9:16, 25 to 45 s**, one betrayal beat only: TikTok, YouTube Shorts, Reels, and X.
3. 1 still frame with a scoreboard (who betrayed whom) for the thread reply.

Order and timing (local time, hackathon evening; avoid midnight uploads):
1. Immediately after demos: **LinkedIn** 16:9 post tagging hackathon org, sponsors' company pages (use their real handles; I did not look up handles, confirm them on the event page), plus individual sponsor engineers who spoke. Team members reshare in the first hour.
2. Within 15 minutes: **X** with the vertical cut, same tags, a one-line reply containing the join link (not in the first post body so the link does not suppress reach; unverified, a common claim).
3. Same night: **TikTok / Shorts** vertical cut with captions and 3 to 5 hashtags (#multiplayerai #aiagents #amongus-style game name).
4. Next morning: **r/LocalLLaMA** and r/IndieGaming/r/aivideo (as relevant) as a dev-build post with play link; post as "built this at a hackathon, agents betray each other, try it". Reddit rewards tooling credit and a way to try; it punishes hype.
5. Day after: YouTube long form (8-12 min "I put 3 AIs and 1 human in a room...") only if there is real footage.

First lines (no em dashes):
- LinkedIn: "We built a game where 1 human plays with 3 AI agents, and the agents betrayed me in round 2. Try it: <link>"
- X: "10 minutes into our hackathon game, my AI ally voted me out. Play it: <link>"
- TikTok caption: "Can 1 human fool 3 AIs? #aiagents #amongus #hackathon"
- Reddit title: "I built a social-deduction game where AI agents bluff and betray (hackathon build, playable link)"

Tags: sponsor handles from the event page (verify; I did not fetch them), organizer, model-provider accounts used in the build. Do not spam; tag at most 3 on X.

Hook check before posting: the first 2 seconds must show a face or an agent line ("I trusted you!") or the betrayal text on screen, not the title card.

Success measure: join-link clicks and Discord joins within 7 days, not views.

If instead the team builds film: lead with a bloopers cut ("AI actors improvise, take 7, someone breaks the script"), TikTok vertical, r/aivideo, include a breakdown post. If coaching: lead with the failure-comedy cut (AI boss humiliates the human), LinkedIn long cut, and a try-it link.

## Files
- Report: `C:\Users\aakas\Documents\JobHunt\MultiplayerAI\prep\attention-teardown.md`
- Raw JSON: `C:\Users\aakas\Documents\JobHunt\MultiplayerAI\prep\glasser\attention\` (X/YT/TikTok/Reddit/LinkedIn/Twitch), `...\prep\glasser\discord\`
- Scripts: `C:\Users\aakas\Documents\JobHunt\MultiplayerAI\prep\glasser\scripts\an.py`, `summ.py` (note: these use relative globs from the attention dir)
