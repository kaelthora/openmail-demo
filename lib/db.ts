// DEMO MODE: Prisma disabled for Vercel deployment
// In-memory stub only — no @prisma/client, no SQLite, no connection attempts.
// Optional Maps keep POST→GET coherent within the same Node process (serverless instances may still reset).

type MockAccountRow = {
  id: string;
  email: string;
  provider: string | null;
  imapConfig: unknown;
  smtpConfig: unknown;
};

type MockBehaviorRow = {
  profileKey: string;
  memory: unknown;
  updatedAt: Date;
};

const mockAccountsById = new Map<string, MockAccountRow>();
const mockBehaviorByKey = new Map<string, MockBehaviorRow>();

function mockId(): string {
  const c = globalThis.crypto;
  return typeof c?.randomUUID === "function"
    ? c.randomUUID()
    : `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type PrismaStub = {
  email: {
    /** Stub: always [] — keeps API routes type-checking without Prisma generics. */
    findMany: (args?: unknown) => Promise<any[]>;
    /** Stub: always null (no persisted mail in DEMO MODE). */
    findUnique: (args?: unknown) => Promise<any>;
    createMany: (args?: unknown) => Promise<{ count: number }>;
  };
  account: {
    findMany: (args?: unknown) => Promise<MockAccountRow[]>;
    findUnique: (args: { where: { id: string } }) => Promise<MockAccountRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<MockAccountRow>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<MockAccountRow>;
    delete: (args: { where: { id: string } }) => Promise<Record<string, never>>;
  };
  userBehaviorProfile: {
    findUnique: (args: {
      where: { profileKey: string };
    }) => Promise<MockBehaviorRow | null>;
    upsert: (args: {
      where: { profileKey: string };
      create: { profileKey: string; memory: unknown };
      update: { memory: unknown };
    }) => Promise<Record<string, never>>;
  };
  $transaction: <R>(fn: (tx: PrismaStub) => Promise<R>) => Promise<R>;
};

function buildPrisma(): PrismaStub {
  const stub: PrismaStub = {
    email: {
      findMany: async () => [],
      findUnique: async () => null,
      createMany: async () => ({ count: 0 }),
    },
    account: {
      findMany: async () =>
        [...mockAccountsById.values()].sort((a, b) =>
          String(a.email).localeCompare(String(b.email))
        ),
      findUnique: async (args) => mockAccountsById.get(args.where.id) ?? null,
      create: async (args) => {
        const d = args.data;
        const row: MockAccountRow = {
          id: mockId(),
          email: typeof d.email === "string" ? d.email : "",
          provider: d.provider != null ? String(d.provider) : null,
          imapConfig: d.imapConfig,
          smtpConfig: d.smtpConfig,
        };
        mockAccountsById.set(row.id, row);
        return row;
      },
      update: async (args) => {
        const cur = mockAccountsById.get(args.where.id);
        if (!cur) {
          throw new Error("Record not found");
        }
        const d = args.data;
        const next: MockAccountRow = {
          id: args.where.id,
          email:
            d.email !== undefined && typeof d.email === "string"
              ? d.email
              : cur.email,
          provider:
            d.provider !== undefined
              ? d.provider != null
                ? String(d.provider)
                : null
              : cur.provider,
          imapConfig: d.imapConfig !== undefined ? d.imapConfig : cur.imapConfig,
          smtpConfig: d.smtpConfig !== undefined ? d.smtpConfig : cur.smtpConfig,
        };
        mockAccountsById.set(next.id, next);
        return next;
      },
      delete: async (args) => {
        mockAccountsById.delete(args.where.id);
        return {};
      },
    },
    userBehaviorProfile: {
      findUnique: async (args) => mockBehaviorByKey.get(args.where.profileKey) ?? null,
      upsert: async (args) => {
        const key = args.where.profileKey;
        const now = new Date();
        const existing = mockBehaviorByKey.get(key);
        if (existing) {
          existing.memory = args.update.memory;
          existing.updatedAt = now;
        } else {
          mockBehaviorByKey.set(key, {
            profileKey: key,
            memory: args.create.memory,
            updatedAt: now,
          });
        }
        return {};
      },
    },
    $transaction: async (fn) => fn(stub),
  };
  return stub;
}

/** Same API surface as PrismaClient delegates used by API routes. */
export const prisma = buildPrisma();
