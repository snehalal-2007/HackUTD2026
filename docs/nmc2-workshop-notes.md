# NMC² Workshop Notes

Notes from the NMC² sponsor workshop at HackUTD 2026 (Saturday, Nov 7), summarized from the talk and Q&A. Use these for the pitch wording and for decisions about what MESA models.

## What NMC² said about itself

- **Vertically integrated.** NMC² owns the whole stack: power generation, the building, the hardware and the software. They contrasted this with neoclouds such as CoreWeave, which buy hardware but rent space and power. They believe the industry will move toward their model: harder to build, better in almost every way.
- **Own power.** The site generates its own power from natural gas.
- **Spartanburg site.** They converted a former factory into a data center rather than buying a prebuilt warehouse. Their website covers the initial proposals for it.
- **Positioning.** Started on the general-compute side and is moving partly toward how neoclouds operate, but it is not a traditional neocloud. Similar competitors, different business model.
- **Customers.** Private, compute-hungry (HPC) and security-conscious. Many will not use AWS because it does not meet their security requirements.
- **How they sell.** They architect each solution directly with the customer around that customer's requirements. Large clouds cannot reshape how they serve one customer; that is the niche NMC² occupies.
- **Security is the unique value proposition.** They are hiring heavily into security and expect it to become roughly half the company within a year.
- **Growth.** From under 250 people in February to over 400 about eight months later, and aiming to double again. Most staff are in Dallas, a small team is in London, and many are on site at Spartanburg. They are hiring across software, hardware and security.
- **Scaling small teams.** Most of the growth worked by scaling small teams rather than adding layers.
- **Security org.** The security organization was recently reorganized. Today most security engineers build systems: a secured SDLC (recently finished) and runtime monitoring of VMs (in progress). They are also hiring on the operations side: red team, blue team, automation and security playbooks. Much of the current work is reactive, given how fast the site was stood up; the goal is to automate it.
- **Program management is new.** NMC² recently added a program manager; historically it had none. The role is still being shaped.
- **Confidentiality.** Some details are not shared publicly, consistent with their security focus.
- **No sponsorship program** (answered in Q&A).

## What this means for MESA

1. **Model the chain from power to rack.** Because NMC² owns its power, failures can start upstream of the servers. The simulated hall should link these layers:
   - Power plant: natural gas generator output, gas supply pressure, switchgear
   - Power distribution: UPS, then the power units feeding racks
   - Cooling: cooling units feeding rack inlet temperatures
   - Compute: GPU node temperature and power draw (HPC)

   Linked layers make "cascade awareness" a strong demo: gas pressure drops, the generator derates, the UPS carries load, and alerts appear in order, each with an owner.
2. **Treat security as core.** The honeypot, the hash-chained event log with a Verify button, and role checks in every reducer should be part of the main story. A tamper-evident record of who knew what and when is what security-conscious customers want.
3. **Show the affected customer.** NMC² builds per customer, so tag each asset with the tenant it serves. Alerts and handoff items then name the affected customer.
4. **Fast hiring means many new operators.** New staff on shift is exactly when handoffs go wrong, which supports the handoff lock and the AI handoff brief.

## How NMC² wants problems and solutions framed

The workshop asked teams to fill in one sentence, and to define the problem fully before naming a solution:

> **When** [situation], **[user]** struggles to **[core task]** because **[why]**. **Our solution** [product] lets them [do the task better]. **How did we fix it, and what is the measurable outcome?**

- Pick one user. The workshop suggested on-site technicians first.
- Their warm-up example: a CPU overheats and a node goes down; the technician struggles to diagnose it for lack of data and a way to understand it; an aggregated dashboard helps them diagnose and fix it faster.
- A second example raised in the room: a generator goes down. Redundancy avoids a single point of failure, but someone still has to notice, own and coordinate the response.

### MESA in that format

**Main statement (shift change):**

> **When** a cooling unit starts failing twenty minutes before shift change, **the on-site technician** struggles to **make sure the problem has an owner and is handed over** because the warning lives in one tool, the discussion in a chat channel and the handover in an end-of-night log, so it gets missed or handed over badly. **Our solution**, MESA, gives every alert an owner and an acknowledgment deadline, escalates it automatically if nobody responds, predicts when racks will cross their limit, and will not let the shift end until the incoming technician accepts each open issue.
>
> **Measurable outcome:** no alert goes unowned past its deadline, no open issue is left unaccepted at shift end, and the team is warned minutes before the limit is crossed, not after.

**Power:**

> **When** gas pressure drops and a generator derates, **the technician** struggles to **see what is affected downstream and who is responding** because power, cooling and compute alerts arrive separately. **MESA** links the chain from generator to UPS to racks and gives each alert an owner and a runbook step.
>
> **Outcome:** time from the first warning to an owner acknowledging it.

**Security:**

> **When** someone probes the facility's systems, **the security operator** struggles to **notice and contain it** because probes look like ordinary traffic. **MESA's** honeypot turns any probe into a critical alert with an owner and quarantines the attacker's identity.
>
> **Outcome:** seconds from first probe to containment, with a tamper-evident record for the customer.

### Measure the outcome live

Every MESA action is written to `event_log` with a timestamp, so the console can compute the outcome from real demo data instead of claiming it. An **Outcomes** panel shows:

- **Mean time to acknowledge:** alert raised until an owner acknowledges it
- **Escalations:** how many alerts needed one, and how fast they fired
- **Handoff completeness:** items accepted out of items open at shift end (the lock forces 100%)
- **Warning lead time:** minutes between the predicted-breach alert and the limit actually being crossed

## Wording to reuse in the pitch

- "Own the entire vertical, from power to software"
- "Compute-hungry, security-conscious customers"
- "Architected around the customer"
- Set the demo's cooling-failure scenario in "the Spartanburg hall"
- Close with the measured outcome from the Outcomes panel, in the workshop's sentence format

## Still unanswered

- Which signals their operators watch most (cooling, power, GPU health). This did not come up in the workshop; ask an NMC² representative directly.
- How their technicians hand over open issues at shift change today (written log, chat, tickets).
