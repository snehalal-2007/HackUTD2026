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

## Wording to reuse in the pitch

- "Own the entire vertical, from power to software"
- "Compute-hungry, security-conscious customers"
- "Architected around the customer"
- Set the demo's cooling-failure scenario in "the Spartanburg hall"

## Still unanswered

- Which signals their operators watch most (cooling, power, GPU health). This did not come up in the workshop; ask an NMC² representative directly.
