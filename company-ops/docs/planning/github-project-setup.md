# GitHub Projects Setup (Board-First)

## Recommended Fields

- `Status` (single select): `Triage`, `Planned`, `This Week`, `In Progress`, `Review`, `Done`.
- `Priority` (single select): `p0`, `p1`, `p2`, `p3`.
- `Area` (single select): product, engineering, ops, security, customers, hiring.
- `Owner` (people): directly responsible individual.
- `Target Week` (text/date): week target.
- `Doc Required` (single select): `yes`, `no`.
- `Decision Due` (date): decision deadline if applicable.

## Recommended Views

- `Triage` - status is `Triage`.
- `This Week` - status in `This Week`, `In Progress`, `Review`.
- `Roadmap (Quarter)` - grouped by milestone/target.
- `Docs Debt` - `type:docs` or `Doc Required=yes`.
- `Incidents` - `type:incident` sorted by created date.

## Triage Workflow

1. New issues enter `Triage`.
2. Weekly triage sets owner, area, priority.
3. Move to `Planned` or close with reason.

## Weekly Planning Workflow

1. Monday: move selected `Planned` items to `This Week`.
2. During week: keep status current.
3. Friday: review shipped work, document outcomes, rollover unresolved items.
