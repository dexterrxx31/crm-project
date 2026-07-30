/**
 * Demo seed. Idempotent — safe to re-run.
 *
 * Carries forward the two fixtures from the original prototype
 * (`customers.json` → accounts + contacts, `salesOrders.json` → a deal) and
 * fills in enough surrounding data that the dashboard, pipeline board and
 * semantic search have something real to show.
 *
 * Run with `bun run db:seed`.
 */
import { randomUUID } from "node:crypto";
import { eq, sql as raw } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, sql } from "@/lib/db";
import {
  accounts,
  activities,
  contacts,
  deals,
  leads,
  member,
  organization,
  pipelines,
  stages,
  tags,
  user,
} from "@/lib/db/schema";

const DEMO_EMAIL = "demo@synapse.crm";
const DEMO_PASSWORD = "synapse-demo-1234";
const DEMO_ORG_SLUG = "acme-sales";

/** Days from now, as a Date. */
function daysOut(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function ensureUser(): Promise<string> {
  const existing = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
  if (existing.length > 0) {
    console.log(`→ demo user already exists (${DEMO_EMAIL})`);
    return existing[0].id;
  }

  // Go through Better Auth so the password is hashed with its own scheme
  // rather than us hand-rolling a hash that signIn would later reject.
  await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo User" },
  });

  const created = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
  if (created.length === 0) throw new Error("failed to create the demo user");
  console.log(`→ created demo user ${DEMO_EMAIL}`);
  return created[0].id;
}

async function ensureOrg(userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, DEMO_ORG_SLUG))
    .limit(1);

  if (existing.length > 0) {
    console.log("→ demo organization already exists");
    return existing[0].id;
  }

  const orgId = randomUUID();
  await db.insert(organization).values({
    id: orgId,
    name: "Acme Sales",
    slug: DEMO_ORG_SLUG,
    createdAt: new Date(),
  });
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  console.log("→ created organization Acme Sales with an owner membership");
  return orgId;
}

async function seedCrmData(orgId: string, ownerId: string) {
  // RLS is FORCEd, so every statement in here needs the tenant variable set.
  // set_config(..., true) is transaction-scoped, which is exactly the guarantee
  // the withOrg wrapper relies on at runtime.
  await db.transaction(async (tx) => {
    await tx.execute(raw`select set_config('app.current_organization_id', ${orgId}, true)`);

    // Wipe prior demo rows so re-running produces the same result rather than
    // stacking duplicates. Order respects foreign keys.
    await tx.delete(activities);
    await tx.delete(deals);
    await tx.delete(leads);
    await tx.delete(contacts);
    await tx.delete(accounts);
    await tx.delete(stages);
    await tx.delete(pipelines);
    await tx.delete(tags);

    const [pipeline] = await tx
      .insert(pipelines)
      .values({ organizationId: orgId, name: "Sales Pipeline", isDefault: true })
      .returning();

    const stageRows = await tx
      .insert(stages)
      .values([
        {
          organizationId: orgId,
          pipelineId: pipeline.id,
          name: "Qualification",
          position: 1,
          probability: 10,
        },
        {
          organizationId: orgId,
          pipelineId: pipeline.id,
          name: "Discovery",
          position: 2,
          probability: 25,
        },
        {
          organizationId: orgId,
          pipelineId: pipeline.id,
          name: "Proposal",
          position: 3,
          probability: 50,
        },
        {
          organizationId: orgId,
          pipelineId: pipeline.id,
          name: "Negotiation",
          position: 4,
          probability: 75,
        },
        {
          organizationId: orgId,
          pipelineId: pipeline.id,
          name: "Closing",
          position: 5,
          probability: 90,
        },
      ])
      .returning();

    const stageByName = new Map(stageRows.map((s) => [s.name, s]));
    const stageId = (name: string) => {
      const found = stageByName.get(name);
      if (!found) throw new Error(`missing seeded stage: ${name}`);
      return found.id;
    };

    await tx.insert(tags).values([
      { organizationId: orgId, name: "enterprise", color: "violet" },
      { organizationId: orgId, name: "inbound", color: "emerald" },
      { organizationId: orgId, name: "at-risk", color: "rose" },
    ]);

    // --- Accounts (from the original customers.json "company" field) ---------
    const accountRows = await tx
      .insert(accounts)
      .values([
        {
          organizationId: orgId,
          ownerId,
          name: "TechNova Pvt Ltd",
          domain: "technova.example.com",
          industry: "Software",
          employeeCount: 240,
          description: "Long-standing customer on an annual CRM subscription. Renewal in Q3.",
        },
        {
          organizationId: orgId,
          ownerId,
          name: "InnoWorks Solutions",
          domain: "innoworks.example.com",
          industry: "Consulting",
          employeeCount: 85,
          description: "Inbound lead from the pricing page. Evaluating us against two competitors.",
        },
        {
          organizationId: orgId,
          ownerId,
          name: "Northwind Logistics",
          domain: "northwind.example.com",
          industry: "Logistics",
          employeeCount: 1200,
          description: "Enterprise prospect. Procurement is slow and security review is mandatory.",
        },
        {
          organizationId: orgId,
          ownerId,
          name: "Bluepeak Health",
          domain: "bluepeak.example.com",
          industry: "Healthcare",
          employeeCount: 430,
          description: "Compliance-heavy buyer. Needs an audit trail and role-based permissions.",
        },
      ])
      .returning();

    const accountByName = new Map(accountRows.map((a) => [a.name, a]));
    const accountId = (name: string) => {
      const found = accountByName.get(name);
      if (!found) throw new Error(`missing seeded account: ${name}`);
      return found.id;
    };

    // --- Contacts (the original customers.json records) ----------------------
    const contactRows = await tx
      .insert(contacts)
      .values([
        {
          organizationId: orgId,
          ownerId,
          accountId: accountId("TechNova Pvt Ltd"),
          firstName: "Rahul",
          lastName: "Sharma",
          email: "rahul.sharma@example.com",
          phone: "9876543210",
          title: "Head of Revenue Operations",
          status: "active",
        },
        {
          organizationId: orgId,
          ownerId,
          accountId: accountId("InnoWorks Solutions"),
          firstName: "Ananya",
          lastName: "Verma",
          email: "ananya.verma@example.com",
          phone: "9123456789",
          title: "Director of Sales",
          status: "lead",
        },
        {
          organizationId: orgId,
          ownerId,
          accountId: accountId("Northwind Logistics"),
          firstName: "Marcus",
          lastName: "Feld",
          email: "marcus.feld@example.com",
          phone: "5550138822",
          title: "VP Operations",
          status: "active",
        },
        {
          organizationId: orgId,
          ownerId,
          accountId: accountId("Bluepeak Health"),
          firstName: "Priya",
          lastName: "Nair",
          email: "priya.nair@example.com",
          phone: "5550194471",
          title: "Chief Information Officer",
          status: "active",
        },
      ])
      .returning();

    const contactByEmail = new Map(contactRows.map((c) => [c.email ?? "", c]));
    const contactId = (email: string) => contactByEmail.get(email)?.id;

    // --- Deals (SO-001 from salesOrders.json becomes the TechNova deal) ------
    const dealRows = await tx
      .insert(deals)
      .values([
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Closing"),
          accountId: accountId("TechNova Pvt Ltd"),
          contactId: contactId("rahul.sharma@example.com"),
          name: "TechNova — CRM Subscription renewal",
          amountCents: 500_000, // $5,000 — carried over from SO-001
          expectedCloseDate: daysOut(12),
          status: "open",
        },
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Proposal"),
          accountId: accountId("InnoWorks Solutions"),
          contactId: contactId("ananya.verma@example.com"),
          name: "InnoWorks — Team plan (25 seats)",
          amountCents: 1_800_000,
          expectedCloseDate: daysOut(26),
          status: "open",
        },
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Negotiation"),
          accountId: accountId("Northwind Logistics"),
          contactId: contactId("marcus.feld@example.com"),
          name: "Northwind — Enterprise rollout",
          amountCents: 9_600_000,
          expectedCloseDate: daysOut(45),
          status: "open",
        },
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Discovery"),
          accountId: accountId("Bluepeak Health"),
          contactId: contactId("priya.nair@example.com"),
          name: "Bluepeak — Compliance tier",
          amountCents: 4_200_000,
          expectedCloseDate: daysOut(60),
          status: "open",
        },
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Qualification"),
          accountId: accountId("Northwind Logistics"),
          name: "Northwind — Analytics add-on",
          amountCents: 1_100_000,
          expectedCloseDate: daysOut(90),
          status: "open",
        },
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Closing"),
          accountId: accountId("TechNova Pvt Ltd"),
          name: "TechNova — Onboarding services",
          amountCents: 750_000,
          expectedCloseDate: daysOut(-20),
          status: "won",
          closedAt: daysOut(-20),
        },
        {
          organizationId: orgId,
          ownerId,
          pipelineId: pipeline.id,
          stageId: stageId("Proposal"),
          accountId: accountId("Bluepeak Health"),
          name: "Bluepeak — Pilot programme",
          amountCents: 300_000,
          expectedCloseDate: daysOut(-8),
          status: "lost",
          lostReason: "Chose an incumbent vendor already approved by procurement.",
          closedAt: daysOut(-8),
        },
      ])
      .returning();

    const dealByName = new Map(dealRows.map((d) => [d.name, d]));

    // --- Leads --------------------------------------------------------------
    await tx.insert(leads).values([
      {
        organizationId: orgId,
        ownerId,
        firstName: "Sofia",
        lastName: "Almeida",
        email: "sofia.almeida@example.com",
        company: "Cedar Retail Group",
        title: "Head of Sales Enablement",
        source: "Webinar",
        status: "new",
      },
      {
        organizationId: orgId,
        ownerId,
        firstName: "Tom",
        lastName: "Okafor",
        email: "tom.okafor@example.com",
        company: "Lumen Manufacturing",
        title: "Operations Manager",
        source: "Inbound — pricing page",
        status: "working",
      },
      {
        organizationId: orgId,
        ownerId,
        firstName: "Hana",
        lastName: "Sato",
        email: "hana.sato@example.com",
        company: "Vertex Analytics",
        title: "Founder",
        source: "Referral",
        status: "qualified",
      },
    ]);

    // --- Activities: the timeline the AI features summarise and embed --------
    const technovaRenewal = dealByName.get("TechNova — CRM Subscription renewal");
    const northwind = dealByName.get("Northwind — Enterprise rollout");
    const innoworks = dealByName.get("InnoWorks — Team plan (25 seats)");

    await tx.insert(activities).values([
      {
        organizationId: orgId,
        ownerId,
        type: "call",
        subject: "Renewal check-in with Rahul",
        body: "Rahul confirmed budget is approved for the renewal. He wants the new reporting module included at no extra cost, otherwise he will push the decision to next quarter. Sounded positive overall.",
        relatedType: "deal",
        relatedId: technovaRenewal!.id,
      },
      {
        organizationId: orgId,
        ownerId,
        type: "meeting",
        subject: "Northwind security review",
        body: "Two-hour session with their infosec team. They need SOC 2 evidence, a data residency answer for the EU, and confirmation that we support SSO via Okta. Marcus is supportive but cannot sign until infosec clears it.",
        relatedType: "deal",
        relatedId: northwind!.id,
      },
      {
        organizationId: orgId,
        ownerId,
        type: "note",
        subject: "Competitive situation at InnoWorks",
        body: "Ananya mentioned they are also evaluating two other vendors. Price is not the deciding factor — onboarding speed is. She asked whether we can migrate their existing spreadsheet of roughly 4,000 contacts without manual work.",
        relatedType: "deal",
        relatedId: innoworks!.id,
      },
      {
        organizationId: orgId,
        ownerId,
        type: "email",
        subject: "Sent proposal to InnoWorks",
        body: "Emailed the 25-seat proposal with the migration addendum. Asked for a decision by the end of the month.",
        relatedType: "deal",
        relatedId: innoworks!.id,
      },
      {
        organizationId: orgId,
        ownerId,
        type: "task",
        subject: "Send SOC 2 report to Northwind infosec",
        body: "Marcus is blocked on this; infosec will not schedule the follow-up until they have it.",
        relatedType: "deal",
        relatedId: northwind!.id,
        dueAt: daysOut(2),
      },
      {
        organizationId: orgId,
        ownerId,
        type: "task",
        subject: "Confirm reporting module scope with Rahul",
        relatedType: "deal",
        relatedId: technovaRenewal!.id,
        dueAt: daysOut(-1), // deliberately overdue so the dashboard has something to flag
      },
      {
        organizationId: orgId,
        ownerId,
        type: "note",
        subject: "Account background",
        body: "TechNova has been a customer for three years. Historically renews without much negotiation, but this year they consolidated vendors so there is more scrutiny than usual.",
        relatedType: "account",
        relatedId: accountId("TechNova Pvt Ltd"),
      },
    ]);

    console.log(
      `→ seeded ${accountRows.length} accounts, ${contactRows.length} contacts, ${dealRows.length} deals, 3 leads, 7 activities`,
    );
  });
}

async function main() {
  const userId = await ensureUser();
  const orgId = await ensureOrg(userId);
  await seedCrmData(orgId, userId);

  console.log("\n✓ seed complete");
  console.log(`  sign in at http://localhost:3000/login`);
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("✗ seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
