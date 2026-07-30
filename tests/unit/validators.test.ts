import { describe, expect, it } from "vitest";
import {
  accountInputSchema,
  activityInputSchema,
  closeDealSchema,
  contactInputSchema,
  convertLeadSchema,
  dealInputSchema,
  moveDealSchema,
} from "@/lib/validators/crm";

describe("accountInputSchema", () => {
  it("requires a name", () => {
    const result = accountInputSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("turns blank optional fields into undefined rather than empty strings", () => {
    const result = accountInputSchema.parse({ name: "Acme", domain: "  " });
    expect(result.domain).toBeUndefined();
  });

  it("rejects an employee count above the sanity cap", () => {
    const result = accountInputSchema.safeParse({ name: "Acme", employeeCount: 50_000_000 });
    expect(result.success).toBe(false);
  });
});

describe("contactInputSchema", () => {
  it("accepts a blank email as unset rather than invalid", () => {
    const result = contactInputSchema.parse({ firstName: "Ada", lastName: "Lovelace", email: "" });
    expect(result.email).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    const result = contactInputSchema.safeParse({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("treats the account picker's 'none' sentinel as unset", () => {
    const result = contactInputSchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      accountId: "none",
    });
    expect(result.accountId).toBeUndefined();
  });
});

describe("dealInputSchema amount preprocessing", () => {
  it("converts a dollar string to integer cents", () => {
    const result = dealInputSchema.parse({
      name: "Big Deal",
      stageId: "3fbf1e6a-0000-4000-8000-000000000000",
      amount: "1,250.50",
    });
    expect(result.amount).toBe(125050);
  });

  it("converts a numeric dollar amount to cents", () => {
    const result = dealInputSchema.parse({
      name: "Big Deal",
      stageId: "3fbf1e6a-0000-4000-8000-000000000000",
      amount: 12.5,
    });
    expect(result.amount).toBe(1250);
  });

  it("defaults a blank amount to zero", () => {
    const result = dealInputSchema.parse({
      name: "Big Deal",
      stageId: "3fbf1e6a-0000-4000-8000-000000000000",
      amount: "",
    });
    expect(result.amount).toBe(0);
  });

  it("rejects a negative amount", () => {
    const result = dealInputSchema.safeParse({
      name: "Big Deal",
      stageId: "3fbf1e6a-0000-4000-8000-000000000000",
      amount: "-5",
    });
    expect(result.success).toBe(false);
  });

  it("requires stageId to be a uuid", () => {
    const result = dealInputSchema.safeParse({
      name: "Big Deal",
      stageId: "not-a-uuid",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("moveDealSchema", () => {
  it("accepts a bare id/stageId pair", () => {
    const result = moveDealSchema.safeParse({
      id: "3fbf1e6a-0000-4000-8000-000000000000",
      stageId: "3fbf1e6a-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
  });
});

describe("closeDealSchema", () => {
  it("accepts won without a lost reason", () => {
    const result = closeDealSchema.safeParse({
      id: "3fbf1e6a-0000-4000-8000-000000000000",
      status: "won",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a status outside won/lost", () => {
    const result = closeDealSchema.safeParse({
      id: "3fbf1e6a-0000-4000-8000-000000000000",
      status: "open",
    });
    expect(result.success).toBe(false);
  });
});

describe("convertLeadSchema", () => {
  it("coerces the checkbox 'on' value to a boolean true", () => {
    const result = convertLeadSchema.parse({
      id: "3fbf1e6a-0000-4000-8000-000000000000",
      accountName: "Acme",
      createDeal: "on",
    });
    expect(result.createDeal).toBe(true);
  });

  it("treats an absent checkbox as false, not a validation error", () => {
    const result = convertLeadSchema.parse({
      id: "3fbf1e6a-0000-4000-8000-000000000000",
      accountName: "Acme",
      createDeal: undefined,
    });
    expect(result.createDeal).toBe(false);
  });
});

describe("activityInputSchema", () => {
  it("requires relatedType to be one of the CRM entities activities can attach to", () => {
    const result = activityInputSchema.safeParse({
      type: "call",
      subject: "Intro call",
      relatedType: "organization",
      relatedId: "3fbf1e6a-0000-4000-8000-000000000000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed activity", () => {
    const result = activityInputSchema.safeParse({
      type: "note",
      subject: "Left voicemail",
      relatedType: "deal",
      relatedId: "3fbf1e6a-0000-4000-8000-000000000000",
    });
    expect(result.success).toBe(true);
  });
});
