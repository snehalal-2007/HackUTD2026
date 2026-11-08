# MESA Pitch Script: The SaaS Version

A three-minute pitch for MESA as a product: a hook with real outage numbers, the problem in the NMC² workshop's sentence format, then a walk through the console in the order an operator meets it. It complements [DEMO-VIDEO.md](DEMO-VIDEO.md), which has the tested recording setup, the replay timeline and troubleshooting. Use that file for setup; use this one for the story.

Every product claim below was checked against `main` at `7c35f2f`. Every number in the hook has a source at the bottom. If a number changes on screen, say what the screen says.

## The elevator pitch (30 seconds)

In the workshop's format ([nmc2-workshop-notes.md](nmc2-workshop-notes.md)):

> **When** a rack starts overheating twenty minutes before shift change, **the on-site operator** struggles to **get it owned, fixed and handed over** because the warning, the fix and the handover live in three different tools. **MESA** puts live telemetry, task ownership, in-place remediation and the shift handoff in one real-time console. It fixes hot racks without starting a second copy of anything, and every step lands in a tamper-evident log.
>
> **Measurable outcome:** every alert has an owner; every unfinished task is handed to the next shift by name; zero duplicate copies and zero seconds of downtime per fix, read straight off the screen.

One-liner for the DevPost tagline: **MESA keeps the world's compute running: one live console that owns, fixes and hands over every data-center problem.**

## Built with

| Layer | Technology | What it does in MESA |
|---|---|---|
| Real-time backend | **SpacetimeDB** (TypeScript module on Maincloud) | All state, incident rules, remediation and the hash-chained log live in one module. Clients read by subscription and write only through reducers. Scheduled reducers run with no client connected |
| Console | **React 19, Vite, Tailwind v4, shadcn/ui, ReUI** | The operator console, sign-in and home page |
| 3D and charts | **three.js**, **Liveline**, **recharts**, **d3-geo** | The data-hall floor, the live placement map, the streaming temperature chart, the sites map |
| Notifications | **Sonner** | Toasts when an incident opens or escalates |
| AI agent | **Claude** (Anthropic API) | Answers operator questions from live data and drafts incident and shift reports, labeled AI drafted. It can't change anything |
| Telemetry | **ClusterWise / OLCF Summit** dataset (CC BY 4.0), replayer on **Railway** | Real recorded GPU and CPU telemetry from 288 servers, replayed live as eight data centers |
| Hosting | **Vercel** (console), **Railway** (replayer), **Maincloud** (database) | |

## Honesty rules for this pitch

`AGENTS.md`: no fake functionality. Say these where they come up, or cut the line.

| Say it this way | Not this way |
|---|---|
| "Real telemetry from the Summit supercomputer, replayed live" | "Live data from our data centers" |
| "A simulated cluster on the real racks" | "Our production workloads" |
| "MESA moves the instance to the coolest ready rack" | "...within its region" (the target can be in another data center) |
| "...when the rack is still over the limit after two minutes" | "...in anticipated traffic" (moves are triggered by temperature, not traffic forecasts) |
| "Inspired by Linux kernel live patching and live migration" | "Using patterns found in new Linux kernels" (MESA borrows the idea; it doesn't read kernel data) |
| "GPU and CPU use, estimated from power draw" | "CPU usage" alone (the dataset has no utilization counters; the console labels it "est.") |
| "Simulated effect: minus 1.4 degrees" | "It cooled the rack" (telemetry is recorded; a move can't change it) |
| Handoff costs are "estimates you can edit" | Quoting the cost model as measured savings |
| The hook's numbers are other companies' outages | Implying MESA would have prevented them |

## Before you record

Use the setup in [DEMO-VIDEO.md section 3](DEMO-VIDEO.md#3-recording-setup-tested): a freshly wiped local database, two console windows on two ports, the replayer typed but not started. Differences for this script:

- **Sign in.** Each window starts at the sign-in page. Window A signs in as the incoming operator, window B as a second operator who is on shift. Signing in opens the console on **Floor**.
- **Leftovers to greet window A.** Beat 2 needs unfinished tasks from an earlier shift. Before recording: start the replayer, let incidents open, start a shift in window B (**My Queue**, pick a length such as **8 hours**), let B claim tasks, then **End shift & hand over** in B. Those tasks go back to the pool marked "left by" B's name. Start B's shift again so A has someone to reassign to. Then sign in window A.
- **Speed.** Replay at 4x (`--speed 4`, a batch every 2.5 s), the same as production. The two-minute throttle window is wall-clock time, so plan beat 4 around it (see DEMO-VIDEO.md's timeline; at 4x, re-time it once before recording).
- **The agent.** The AI Agent page needs `services/agent` running with an `ANTHROPIC_API_KEY` and its identity allow-listed (`.env.example`). It isn't deployed on Railway today. If it isn't running, cut beat 5.
- **Theme.** Dark, in both windows.

## The script

About 140 spoken words per minute. Target 2:55, hard stop 3:00.

| Time | Beat | On screen |
|---|---|---|
| 0:00 | 1. Hook | Title cards over the home page |
| 0:22 | 2. Problem, sign-in, My Queue | Sign in, My Queue |
| 0:55 | 3. Telemetry | Floor |
| 1:25 | 4. In-place remediation | Cluster |
| 2:05 | 5. Ask the agent | AI Agent |
| 2:20 | 6. Shift handoff | Shift Handoff |
| 2:40 | 7. Close | Log, Verify chain, end card |

### Beat 1. The hook (0:00 to 0:22)

**On screen:** the MESA home page (`/`) with three title cards, one per sentence:

1. "One bad update. 8.5 million machines. $5.4 billion lost by the Fortune 500 in a day."
2. "One DNS fault in one AWS region. Snapchat, Zoom, Signal and Slack down for about 15 hours."
3. "1 in 5 data-center outages now costs over $1 million."

**Say:**

> In July 2024, one bad software update crashed eight and a half million machines, and the Fortune 500 lost an estimated five point four billion dollars. Fifteen months later, a single fault in one AWS region took down Snapchat, Zoom, Signal and Slack for most of a day. One in five data-center outages now costs over a million dollars. MESA's mission is to make the next one smaller.

(68 words, about 29 s. If it runs long, drop the third sentence and keep card 3 on screen.)

**Optional security card**, if you have a spare 6 s: "Researchers found 9 flaws in the software that runs data-center power, and over 20,000 data-center management systems exposed online." Say: "And the systems that run power and cooling are a target too."

### Beat 2. The problem, sign-in and My Queue (0:22 to 0:55)

**On screen:** window A's sign-in page. Sign in. The console opens on Floor. Click **My Queue** and start an **8 hours** shift. The leftover tasks arrive first, each marked **left by** the previous operator. On one task, open **Give to someone on shift** and pick the operator in window B. The task leaves A's list; in window B it appears without a reload.

**Say:**

> Here's the problem. A rack starts overheating twenty minutes before shift change. The warning is in one tool, the discussion in a chat and the handover in a notebook, so nobody owns it. With MESA, an operator signs in and starts their shift, and the work left from the last shift is waiting, marked with who left it. This one belongs with my teammate, so I hand it over. It's on their screen instantly.

(74 words, about 32 s.)

### Beat 3. Telemetry (0:55 to 1:25)

**On screen:** click **Floor**. The data hall for Spartanburg, a block selected: status badge, hottest GPU, servers at or over 50 °C, power in kW, and the streaming temperature chart with the 55 °C limit and the dashed trend line. Click the **Jobs** tab: each server reads like "GPU 71% · CPU 38% (est.)", under "Usage is estimated from power draw." Keep the "ClusterWise (OLCF Summit), CC BY 4.0" credit readable for a moment.

**Say:**

> Aggregating the data is the easy part now. This is real telemetry from the Summit supercomputer, two hundred eighty-eight servers replayed live as eight data centers. GPU temperatures, power draw, and GPU and CPU use estimated from power stream in through SpacetimeDB every two and a half seconds. The chart scrolls with time, the limit is drawn in, and the trend is labeled as a trend.

(66 words, about 28 s.)

### Beat 4. In-place remediation (1:25 to 2:05)

**On screen:** click **Cluster**. Point at the **Simulated cluster** badge and the totals: **Instances 48**. In **Remediation runs**, a **Throttle in place** run with "decides in m:ss". Then the live migration: either wait for the automatic one, or click a throttled instance on a hot rack, then a highlighted **Ready** rack such as **b17**. The instance lifts, flies and lands. The caption reads "one transaction: no second copy, no gap". **Instances moved** and **Duplicates avoided** tick up; **Downtime 0 s**.

**Say:**

> What happens after a problem arises? Most teams start a second copy somewhere else and pay for capacity twice. MESA borrows from Linux kernel live patching and live migration and fixes things in place. First it throttles the hottest instance on the hot rack. If the rack is still over the limit two minutes later, it moves that instance to the coolest ready rack in one transaction. Forty-eight instances before and after. Zero seconds down.

(75 words, about 32 s.)

### Beat 5. Ask the agent (2:05 to 2:20)

**On screen:** click **AI Agent**. Click the suggestion **Which rack is hottest right now?** The thought-process panel fills on the right; the answer appears, labeled **AI drafted**.

**Say:**

> Need a hand catching up? Ask the agent. It reads the same live data, shows its working, and labels everything it writes. It can't change anything.

(26 words, about 11 s. Cut this beat if the agent service isn't running.)

### Beat 6. Shift handoff (2:20 to 2:40)

**On screen:** click **Shift Handoff**, tab **This shift (live)**. Scroll through the summary, the incidents, **Saved by automatic moving** and the **Action items**. Then go back to **My Queue** and click **End shift & hand over**.

**Say:**

> And when the shift ends, the handoff writes itself from the telemetry: what happened, what MESA fixed on its own, what it saved and what to do first. Anything unfinished goes to the next shift with my name on it.

(40 words, about 17 s.)

### Beat 7. The close (2:40 to 2:55)

**On screen:** click **Log**, then **Verify chain**: "Chain intact: N events verified". Cut to the end card.

**Say:**

> Every step is in a hash-chained log you can verify. MESA: one live console that owns, fixes and hands over every data-center problem. Built on SpacetimeDB, React, three.js and Claude.

(30 words, about 13 s.)

### Word count

| Beat | Slot | Words | At 140 wpm |
|---|---|---|---|
| 1 | 22 s | 68 | 29 s |
| 2 | 33 s | 74 | 32 s |
| 3 | 30 s | 66 | 28 s |
| 4 | 40 s | 75 | 32 s |
| 5 | 15 s | 26 | 11 s |
| 6 | 20 s | 40 | 17 s |
| 7 | 15 s | 30 | 13 s |
| Total | 175 s | 379 | 162 s |

Beat 1 runs 7 s over its slot; take the time from beat 4's slot, which has 8 s spare, or drop the hook's third sentence. Without beat 5 the total is about 2:40.

## Sources for the hook

| Claim | Source |
|---|---|
| CrowdStrike update, July 19, 2024: about 8.5 million Windows devices; $5.4 billion in direct losses for US Fortune 500 companies, excluding Microsoft | Parametrix estimate, reported by [Axios](https://www.axios.com/2024/07/24/fortune-500-crowdstrike-outage-impact) and [Parametrix](https://www.parametrixinsurance.com/in-the-news/crowdstrike-to-cost-fortune-500-5-4-billion-insured-loss-range-of-540-million-to-1-08-billion) |
| AWS us-east-1, October 20, 2025: DynamoDB DNS fault, about 15 hours, Snapchat, Zoom, Signal, Slack among those affected | [Parametrix](https://www.parametrixinsurance.com/blog/aws-us-east-1-outage-what-parametrix-monitored-in-real-time), [Akave](https://akave.com/blog/aws-us-east-1-outage-2025-cloud-resilience) |
| AWS loss estimate: $500 million to $650 million for US companies (not used on screen because estimates disagree widely) | [The Insurer](https://www.theinsurer.com/cyber-risk/news/aws-outage-will-cause-up-to-650-million-in-us-financial-losses-parametrix-2025-10-30) |
| 1 in 5 operators say their most recent major outage cost over $1 million | Uptime Institute Annual Outage Analysis 2025 ([Business Wire](https://www.businesswire.com/news/home/20250506733553/en/Uptime-Announces-Annual-Outage-Analysis-Report-2025)) and 2026 ([MSP Channel](https://www.msp-channel.com/news/72355/uptime-publishes-annual-outage-analysis-report-2026)) |
| 9 vulnerabilities in data-center power management software (CyberPower PowerPanel Enterprise, Dataprobe iBoot PDU), CVE-2023-3259 to 3267 | Trellix, DEF CON 2023 ([Help Net Security](https://www.helpnetsecurity.com/2023/08/14/vulnerabilities-data-center-solutions/)) |
| Over 20,000 data-center management (DCIM) systems exposed online | Cyble, 2022 ([DCD](https://datacenterdynamics.com/en/news/more-than-20000-data-center-management-and-monitoring-applications-exposed-online-researchers-warn)) |

Do not use the "hundreds of billions" figure that circulates for the AWS outage: it has no stated method. The CrowdStrike event was a bad software update, not a data-center failure, so the script says "one bad update".

## Where each beat lives in the code

| Beat | Source |
|---|---|
| Sign-in, home page | `apps/console/src/auth/*`, `apps/console/src/intro/*` |
| My Queue, leftovers, reassign | `module/src/reducers/queue.ts`, `apps/console/src/views/queue-view.tsx` |
| Floor, chart, per-server use | `apps/console/src/views/floor-view.tsx`, `components/floor/*`, [TELEMETRY.md](TELEMETRY.md) |
| Throttle, live migration | `module/src/lib/remediation.ts`, `components/cluster/*`, [CLUSTER-CYCLING.md](CLUSTER-CYCLING.md) |
| AI agent | `services/agent`, `apps/console/src/components/agent/*` |
| Shift handoff | `apps/console/src/views/handoff-view.tsx`, [SHIFT-HANDOFF.md](SHIFT-HANDOFF.md) |
| Hash-chained log | `module/src/lib/log.ts`, `apps/console/src/lib/event-chain.ts` |
