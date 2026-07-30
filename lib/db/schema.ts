import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export * from "./auth-schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const contactStatusEnum = pgEnum("contact_status", ["lead", "active", "inactive"]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "working",
  "qualified",
  "unqualified",
  "converted",
]);

export const dealStatusEnum = pgEnum("deal_status", ["open", "won", "lost"]);

export const activityTypeEnum = pgEnum("activity_type", [
  "call",
  "meeting",
  "email",
  "note",
  "task",
]);

/** Polymorphic target for activities, embeddings and insights. */
export const subjectTypeEnum = pgEnum("subject_type", ["account", "contact", "lead", "deal"]);

export const insightKindEnum = pgEnum("insight_kind", ["lead_score", "deal_health"]);

// ---------------------------------------------------------------------------
// Shared column builders
// ---------------------------------------------------------------------------

/**
 * Every business table carries this. RLS policies compare it against the
 * `app.current_organization_id` session variable set by the withOrg wrapper,
 * so a query that forgets its tenant filter returns nothing rather than
 * leaking across organizations.
 */
const orgId = () =>
  text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

const createdAt = () => timestamp("created_at").defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

// ---------------------------------------------------------------------------
// Accounts — companies
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    website: text("website"),
    phone: text("phone"),
    description: text("description"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("accounts_org_idx").on(table.organizationId),
    index("accounts_owner_idx").on(table.ownerId),
    index("accounts_name_idx").on(table.organizationId, table.name),
  ],
);

// ---------------------------------------------------------------------------
// Contacts — people, optionally attached to an account
// ---------------------------------------------------------------------------

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    status: contactStatusEnum("status").default("lead").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("contacts_org_idx").on(table.organizationId),
    index("contacts_account_idx").on(table.accountId),
    index("contacts_email_idx").on(table.organizationId, table.email),
  ],
);

// ---------------------------------------------------------------------------
// Leads — unqualified, convertible into account + contact + deal
// ---------------------------------------------------------------------------

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    source: text("source"),
    status: leadStatusEnum("status").default("new").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    // Set on conversion so a converted lead links to what it became.
    convertedContactId: uuid("converted_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    convertedAccountId: uuid("converted_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("leads_org_idx").on(table.organizationId),
    index("leads_status_idx").on(table.organizationId, table.status),
  ],
);

// ---------------------------------------------------------------------------
// Pipelines and stages
// ---------------------------------------------------------------------------

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("pipelines_org_idx").on(table.organizationId)],
);

export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** Default win probability for deals sitting in this stage, 0-100. */
    probability: integer("probability").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("stages_org_idx").on(table.organizationId),
    uniqueIndex("stages_pipeline_position_uidx").on(table.pipelineId, table.position),
  ],
);

// ---------------------------------------------------------------------------
// Deals — opportunities
// ---------------------------------------------------------------------------

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "restrict" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    /** Minor units (cents). Avoids float drift and numeric-as-string handling. */
    amountCents: bigint("amount_cents", { mode: "number" }).default(0).notNull(),
    currency: text("currency").default("USD").notNull(),
    expectedCloseDate: timestamp("expected_close_date"),
    status: dealStatusEnum("status").default("open").notNull(),
    lostReason: text("lost_reason"),
    closedAt: timestamp("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("deals_org_idx").on(table.organizationId),
    index("deals_stage_idx").on(table.stageId),
    index("deals_account_idx").on(table.accountId),
    index("deals_status_idx").on(table.organizationId, table.status),
    index("deals_close_date_idx").on(table.organizationId, table.expectedCloseDate),
  ],
);

// ---------------------------------------------------------------------------
// Activities — the timeline: calls, meetings, emails, notes, tasks
// ---------------------------------------------------------------------------

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    type: activityTypeEnum("type").notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    /** Polymorphic target — which record this activity hangs off. */
    relatedType: subjectTypeEnum("related_type").notNull(),
    relatedId: uuid("related_id").notNull(),
    /** Only meaningful for type = "task". */
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("activities_org_idx").on(table.organizationId),
    index("activities_related_idx").on(table.relatedType, table.relatedId),
    index("activities_due_idx").on(table.organizationId, table.dueAt),
  ],
);

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    color: text("color").default("slate").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("tags_org_name_uidx").on(table.organizationId, table.name)],
);

export const taggings = pgTable(
  "taggings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    subjectType: subjectTypeEnum("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("taggings_unique_uidx").on(table.tagId, table.subjectType, table.subjectId),
    index("taggings_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

// ---------------------------------------------------------------------------
// AI insights — scores and reasoning produced by background jobs
// ---------------------------------------------------------------------------

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    subjectType: subjectTypeEnum("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    kind: insightKindEnum("kind").notNull(),
    /** 0-100. */
    score: integer("score").notNull(),
    reasoning: text("reasoning").notNull(),
    nextAction: text("next_action"),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("ai_insights_org_idx").on(table.organizationId),
    index("ai_insights_subject_idx").on(table.subjectType, table.subjectId),
    // Newest insight per subject is the one the UI shows.
    index("ai_insights_recent_idx").on(table.subjectType, table.subjectId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Embeddings — Voyage voyage-3 output is 1024-dimensional
// ---------------------------------------------------------------------------

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    sourceType: subjectTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    /** Which activity/field the chunk came from, for citation in search results. */
    chunk: text("chunk").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("embeddings_org_idx").on(table.organizationId),
    index("embeddings_source_idx").on(table.sourceType, table.sourceId),
    index("embeddings_vector_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_log_org_idx").on(table.organizationId, table.createdAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  organization: one(organization, {
    fields: [accounts.organizationId],
    references: [organization.id],
  }),
  owner: one(user, { fields: [accounts.ownerId], references: [user.id] }),
  contacts: many(contacts),
  deals: many(deals),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contacts.organizationId],
    references: [organization.id],
  }),
  account: one(accounts, { fields: [contacts.accountId], references: [accounts.id] }),
  owner: one(user, { fields: [contacts.ownerId], references: [user.id] }),
  deals: many(deals),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  organization: one(organization, {
    fields: [leads.organizationId],
    references: [organization.id],
  }),
  owner: one(user, { fields: [leads.ownerId], references: [user.id] }),
  convertedContact: one(contacts, {
    fields: [leads.convertedContactId],
    references: [contacts.id],
  }),
  convertedAccount: one(accounts, {
    fields: [leads.convertedAccountId],
    references: [accounts.id],
  }),
}));

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  organization: one(organization, {
    fields: [pipelines.organizationId],
    references: [organization.id],
  }),
  stages: many(stages),
  deals: many(deals),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, { fields: [stages.pipelineId], references: [pipelines.id] }),
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  organization: one(organization, {
    fields: [deals.organizationId],
    references: [organization.id],
  }),
  account: one(accounts, { fields: [deals.accountId], references: [accounts.id] }),
  contact: one(contacts, { fields: [deals.contactId], references: [contacts.id] }),
  pipeline: one(pipelines, { fields: [deals.pipelineId], references: [pipelines.id] }),
  stage: one(stages, { fields: [deals.stageId], references: [stages.id] }),
  owner: one(user, { fields: [deals.ownerId], references: [user.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  organization: one(organization, {
    fields: [activities.organizationId],
    references: [organization.id],
  }),
  owner: one(user, { fields: [activities.ownerId], references: [user.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  taggings: many(taggings),
}));

export const taggingsRelations = relations(taggings, ({ one }) => ({
  tag: one(tags, { fields: [taggings.tagId], references: [tags.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Pipeline = typeof pipelines.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type AiInsight = typeof aiInsights.$inferSelect;
export type Embedding = typeof embeddings.$inferSelect;

/** Raw SQL helper used by the withOrg wrapper to scope a transaction. */
export const setCurrentOrg = (organizationId: string) =>
  sql`select set_config('app.current_organization_id', ${organizationId}, true)`;
