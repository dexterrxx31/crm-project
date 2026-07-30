import { cosineDistance, eq, inArray, sql } from "drizzle-orm";
import { embedQuery, embedTexts } from "@/lib/ai/voyage";
import { accounts, activities, contacts, deals, embeddings } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";

export type SubjectType = "account" | "contact" | "lead" | "deal" | "activity";

/**
 * Replaces every stored embedding for one source record with a fresh one.
 *
 * Delete-then-insert rather than upsert-by-chunk: a record's embeddable text
 * can shrink from one chunk to zero (e.g. a description gets cleared), and
 * there's no natural chunk key to upsert against — the source id is the only
 * stable identity, so it owns the whole set of rows under it.
 */
export async function embedAndStore(
  organizationId: string,
  sourceType: SubjectType,
  sourceId: string,
  chunks: string[],
): Promise<void> {
  const nonEmpty = chunks.map((c) => c.trim()).filter(Boolean);

  await tenantDb(organizationId, async (tx) => {
    await tx
      .delete(embeddings)
      .where(
        sql`${embeddings.sourceType} = ${sourceType} and ${embeddings.sourceId} = ${sourceId}`,
      );

    if (nonEmpty.length === 0) return;

    const vectors = await embedTexts(nonEmpty);
    await tx.insert(embeddings).values(
      nonEmpty.map((chunk, i) => ({
        organizationId,
        sourceType,
        sourceId,
        chunk,
        embedding: vectors[i],
      })),
    );
  });
}

function accountChunk(row: {
  name: string;
  industry: string | null;
  description: string | null;
}): string {
  return [row.name, row.industry, row.description].filter(Boolean).join(" — ");
}

function contactChunk(row: {
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
}): string {
  return [`${row.firstName} ${row.lastName}`, row.title, row.email].filter(Boolean).join(" — ");
}

function dealChunk(row: { name: string }): string {
  return row.name;
}

function activityChunk(row: { subject: string; body: string | null }): string {
  return [row.subject, row.body].filter(Boolean).join(" — ");
}

/** `not exists (an embedding for this row newer than its last edit)` — the staleness test every entity shares. */
function needsEmbedding(sourceType: SubjectType, idColumn: unknown, updatedAtColumn: unknown) {
  return sql`not exists (
    select 1 from ${embeddings} e
    where e.source_type = ${sourceType}
      and e.source_id = ${idColumn}
      and e.created_at >= ${updatedAtColumn}
  )`;
}

/**
 * Re-embeds one record by fetching it fresh — used by the Inngest
 * "on-change" function (Phase 6 wires the trigger). Fetching fresh rather
 * than trusting text carried on the event avoids embedding a stale version
 * if the record changed again between enqueue and processing. No-ops
 * (deletes any existing embedding) if the record no longer exists.
 */
export async function embedSourceRecord(
  organizationId: string,
  sourceType: "account" | "contact" | "deal" | "activity",
  sourceId: string,
): Promise<void> {
  const chunk = await tenantDb(organizationId, async (tx) => {
    switch (sourceType) {
      case "account": {
        const [row] = await tx.select().from(accounts).where(eq(accounts.id, sourceId)).limit(1);
        return row ? accountChunk(row) : null;
      }
      case "contact": {
        const [row] = await tx.select().from(contacts).where(eq(contacts.id, sourceId)).limit(1);
        return row ? contactChunk(row) : null;
      }
      case "deal": {
        const [row] = await tx.select().from(deals).where(eq(deals.id, sourceId)).limit(1);
        return row ? dealChunk(row) : null;
      }
      case "activity": {
        const [row] = await tx
          .select()
          .from(activities)
          .where(eq(activities.id, sourceId))
          .limit(1);
        return row ? activityChunk(row) : null;
      }
    }
  });

  await embedAndStore(organizationId, sourceType, sourceId, chunk ? [chunk] : []);
}

/**
 * Embeds every account, contact, deal and activity in the org that has no
 * embedding yet, or whose embedding predates its last edit.
 *
 * This is the manual/backfill path — Phase 6 wires an Inngest function that
 * calls the same per-record embedding on create/update so this becomes
 * incremental rather than a full sweep. Safe to re-run.
 */
export async function backfillEmbeddings(
  organizationId: string,
): Promise<{ accounts: number; contacts: number; deals: number; activities: number }> {
  const counts = { accounts: 0, contacts: 0, deals: 0, activities: 0 };

  const [staleAccounts, staleContacts, staleDeals, staleActivities] = await tenantDb(
    organizationId,
    async (tx) =>
      Promise.all([
        tx
          .select()
          .from(accounts)
          .where(needsEmbedding("account", accounts.id, accounts.updatedAt)),
        tx
          .select()
          .from(contacts)
          .where(needsEmbedding("contact", contacts.id, contacts.updatedAt)),
        tx
          .select()
          .from(deals)
          .where(needsEmbedding("deal", deals.id, deals.updatedAt)),
        tx
          .select()
          .from(activities)
          .where(needsEmbedding("activity", activities.id, activities.updatedAt)),
      ]),
  );

  // Each call opens and commits its own tenant transaction, so a failure
  // partway through a large backfill loses progress only on the one record
  // being embedded, not the whole sweep.
  for (const row of staleAccounts) {
    await embedAndStore(organizationId, "account", row.id, [accountChunk(row)]);
    counts.accounts += 1;
  }
  for (const row of staleContacts) {
    await embedAndStore(organizationId, "contact", row.id, [contactChunk(row)]);
    counts.contacts += 1;
  }
  for (const row of staleDeals) {
    await embedAndStore(organizationId, "deal", row.id, [dealChunk(row)]);
    counts.deals += 1;
  }
  for (const row of staleActivities) {
    await embedAndStore(organizationId, "activity", row.id, [activityChunk(row)]);
    counts.activities += 1;
  }

  return counts;
}

export type SemanticResult = {
  sourceType: SubjectType;
  sourceId: string;
  chunk: string;
  /** 0 (identical) to ~2 (opposite). Lower is closer. */
  distance: number;
};

/**
 * Nearest embeddings to `query` by cosine distance, using the HNSW index on
 * `embeddings.embedding` (see lib/db/schema.ts). Returns raw hits — callers
 * hydrate the source record (title, link) themselves, since that lookup
 * differs per `sourceType`.
 */
export async function semanticSearch(
  organizationId: string,
  query: string,
  opts: { types?: SubjectType[]; limit?: number } = {},
): Promise<SemanticResult[]> {
  const limit = Math.min(opts.limit ?? 8, 25);
  const queryVector = await embedQuery(query);

  return tenantDb(organizationId, async (tx) => {
    const distance = cosineDistance(embeddings.embedding, queryVector);

    let rows = await tx
      .select({
        sourceType: embeddings.sourceType,
        sourceId: embeddings.sourceId,
        chunk: embeddings.chunk,
        distance,
      })
      .from(embeddings)
      .orderBy(sql`${distance}`)
      .limit(limit * 3); // over-fetch, then filter by type in JS — types is a small, dynamic set

    if (opts.types && opts.types.length > 0) {
      const allowed = new Set(opts.types);
      rows = rows.filter((row) => allowed.has(row.sourceType as SubjectType));
    }

    return rows.slice(0, limit) as SemanticResult[];
  });
}

export type DuplicateCandidate = {
  a: { id: string; name: string; email: string | null };
  b: { id: string; name: string; email: string | null };
  similarity: number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fuzzy duplicate detection over contact identity (name + email + phone),
 * computed fresh rather than read from the `embeddings` table — that table
 * holds semantic-search chunks (title/description prose), a different vector
 * space than "does this look like the same person". Contact counts are small
 * enough that recomputing per call is cheap; this runs on demand, not on a
 * hot path.
 */
export async function findDuplicateContacts(
  organizationId: string,
  threshold = 0.9,
): Promise<DuplicateCandidate[]> {
  const rows = await tenantDb(organizationId, async (tx) =>
    tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts),
  );

  if (rows.length < 2) return [];

  const texts = rows.map((r) =>
    [`${r.firstName} ${r.lastName}`, r.email, r.phone].filter(Boolean).join(" "),
  );
  const vectors = await embedTexts(texts);

  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      if (similarity >= threshold) {
        candidates.push({
          a: {
            id: rows[i].id,
            name: `${rows[i].firstName} ${rows[i].lastName}`,
            email: rows[i].email,
          },
          b: {
            id: rows[j].id,
            name: `${rows[j].firstName} ${rows[j].lastName}`,
            email: rows[j].email,
          },
          similarity,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.similarity - a.similarity);
}

export type HydratedSemanticResult = SemanticResult & { title: string; href: string };

/**
 * Resolves each hit's display title and link. Batched per `sourceType`
 * (one query per type present in `results`, not one per hit) since a
 * semantic search page renders a handful of results at a time.
 */
export async function hydrateSemanticResults(
  organizationId: string,
  results: SemanticResult[],
): Promise<HydratedSemanticResult[]> {
  if (results.length === 0) return [];

  const idsByType = new Map<SubjectType, string[]>();
  for (const result of results) {
    const ids = idsByType.get(result.sourceType) ?? [];
    ids.push(result.sourceId);
    idsByType.set(result.sourceType, ids);
  }

  const titles = new Map<string, { title: string; href: string }>();

  await tenantDb(organizationId, async (tx) => {
    const accountIds = idsByType.get("account");
    if (accountIds) {
      const rows = await tx
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, accountIds));
      for (const row of rows)
        titles.set(`account:${row.id}`, { title: row.name, href: `/accounts/${row.id}` });
    }

    const contactIds = idsByType.get("contact");
    if (contactIds) {
      const rows = await tx
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(inArray(contacts.id, contactIds));
      for (const row of rows)
        titles.set(`contact:${row.id}`, {
          title: `${row.firstName} ${row.lastName}`,
          href: `/contacts/${row.id}`,
        });
    }

    const dealIds = idsByType.get("deal");
    if (dealIds) {
      const rows = await tx
        .select({ id: deals.id, name: deals.name })
        .from(deals)
        .where(inArray(deals.id, dealIds));
      for (const row of rows)
        titles.set(`deal:${row.id}`, { title: row.name, href: `/deals/${row.id}` });
    }

    const activityIds = idsByType.get("activity");
    if (activityIds) {
      const rows = await tx
        .select({
          id: activities.id,
          subject: activities.subject,
          relatedType: activities.relatedType,
          relatedId: activities.relatedId,
        })
        .from(activities)
        .where(inArray(activities.id, activityIds));
      for (const row of rows)
        titles.set(`activity:${row.id}`, {
          title: row.subject,
          href: `/${row.relatedType}s/${row.relatedId}`,
        });
    }
  });

  return results
    .map((result) => {
      const hydrated = titles.get(`${result.sourceType}:${result.sourceId}`);
      if (!hydrated) return null;
      return { ...result, ...hydrated };
    })
    .filter((r): r is HydratedSemanticResult => r !== null);
}
