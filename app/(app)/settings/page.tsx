import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackfillEmbeddingsButton } from "@/components/crm/backfill-embeddings-button";
import { PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrgContext } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { member, pipelines, stages, user } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { hasVoyageKey } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  // Membership lives on the auth tables (no RLS), so this reads via `db`.
  const members = await db
    .select({
      id: member.id,
      role: member.role,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, context.organizationId));

  const pipelineStages = await tenantDb(context.organizationId, async (tx) => {
    const [pipeline] = await tx
      .select()
      .from(pipelines)
      .where(eq(pipelines.isDefault, true))
      .limit(1);
    if (!pipeline) return [];
    return tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, pipeline.id))
      .orderBy(asc(stages.position));
  });

  return (
    <>
      <PageHeader title="Settings" description={context.organizationName} />

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {row.role}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline stages</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2">
              {pipelineStages.map((stage) => (
                <li
                  key={stage.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="mr-2 text-muted-foreground">{stage.position}.</span>
                    {stage.name}
                  </span>
                  <Badge variant="outline">{stage.probability}%</Badge>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Semantic search index</CardTitle>
            <CardDescription>
              {hasVoyageKey()
                ? 'Powers "similar meaning" results on the Search page. Rebuilds automatically as records change once Inngest is wired up; until then, run it manually after a bulk import.'
                : "Not configured — set VOYAGE_API_KEY to enable semantic search. Keyword search still works without it."}
            </CardDescription>
          </CardHeader>
          {hasVoyageKey() ? (
            <CardContent>
              <BackfillEmbeddingsButton />
            </CardContent>
          ) : null}
        </Card>
      </div>
    </>
  );
}
