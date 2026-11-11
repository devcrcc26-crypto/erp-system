/**
 * Small in-memory stand-in for the Prisma calls AnnouncementService and
 * NotificationService make. `where` objects are evaluated for real (equality,
 * in / gt / lte, AND / OR, nested relations, none / some), so the tests check
 * the actual filters the service sends rather than a hand-written mock reply.
 */
import { randomUUID } from 'crypto';

type Row = Record<string, unknown>;
type Where = Record<string, unknown> | undefined;

export interface FakeUser extends Row {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  engineeringDisciplineId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  email: string | null;
  preferredLanguage: string | null;
}

const OPERATORS = new Set(['in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'contains', 'equals', 'mode']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  );
}

function asComparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function matchesOperators(value: unknown, condition: Record<string, unknown>): boolean {
  const v = asComparable(value);
  for (const [op, raw] of Object.entries(condition)) {
    const target = asComparable(raw);
    switch (op) {
      case 'in':
        if (!(raw as unknown[]).map(asComparable).includes(v)) return false;
        break;
      case 'notIn':
        if ((raw as unknown[]).map(asComparable).includes(v)) return false;
        break;
      case 'gt':
        if (v === null || v === undefined || !((v as number) > (target as number))) return false;
        break;
      case 'gte':
        if (v === null || v === undefined || !((v as number) >= (target as number))) return false;
        break;
      case 'lt':
        if (v === null || v === undefined || !((v as number) < (target as number))) return false;
        break;
      case 'lte':
        if (v === null || v === undefined || !((v as number) <= (target as number))) return false;
        break;
      case 'not':
        if (v === target) return false;
        break;
      case 'equals':
        if (v !== target) return false;
        break;
      case 'contains':
        if (typeof v !== 'string' || !v.toLowerCase().includes(String(raw).toLowerCase())) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

export function matches(record: Row, where: Where): boolean {
  if (!where) {
    return true;
  }
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) {
      continue;
    }
    if (key === 'AND') {
      if (!(condition as Where[]).every((part) => matches(record, part))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(condition as Where[]).some((part) => matches(record, part))) return false;
      continue;
    }
    const value = record[key];
    if (Array.isArray(value) && isPlainObject(condition) && ('none' in condition || 'some' in condition)) {
      const items = value as Row[];
      if ('none' in condition && items.some((item) => matches(item, condition.none as Where))) return false;
      if ('some' in condition && !items.some((item) => matches(item, condition.some as Where))) return false;
      continue;
    }
    if (isPlainObject(condition)) {
      const keys = Object.keys(condition);
      if (keys.length > 0 && keys.every((k) => OPERATORS.has(k))) {
        if (!matchesOperators(value, condition)) return false;
      } else if (!isPlainObject(value) || !matches(value as Row, condition)) {
        return false;
      }
      continue;
    }
    if (asComparable(value) !== asComparable(condition)) {
      return false;
    }
  }
  return true;
}

export class FakePrisma {
  users: FakeUser[] = [];
  announcements: Row[] = [];
  recipients: Row[] = [];
  notifications: Row[] = [];

  private recipientView(recipient: Row): Row {
    return {
      ...recipient,
      announcement: this.announcementView(
        this.announcements.find((a) => a.id === recipient.announcementId) ?? {},
      ),
      user: this.users.find((u) => u.id === recipient.userId) ?? {},
    };
  }

  private announcementView(announcement: Row): Row {
    return {
      ...announcement,
      recipients: this.recipients.filter((r) => r.announcementId === announcement.id),
      creator: this.users.find((u) => u.id === announcement.createdBy) ?? null,
      attachmentFolder: null,
    };
  }

  user = {
    findMany: async ({ where }: { where?: Where } = {}) =>
      this.users.filter((u) => matches(u, where)).map((u) => ({ ...u })),
    findFirst: async ({ where }: { where?: Where } = {}) =>
      this.users.find((u) => matches(u, where)) ?? null,
    count: async ({ where }: { where?: Where } = {}) =>
      this.users.filter((u) => matches(u, where)).length,
  };

  announcement = {
    create: async ({ data }: { data: Row }) => {
      const row = {
        id: randomUUID(),
        status: 'DRAFT',
        deletedAt: null,
        publishAt: null,
        publishedAt: null,
        contentEditedAt: null,
        archivedAt: null,
        attachmentFolderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.announcements.push(row);
      return { ...row };
    },
    findFirst: async ({ where }: { where?: Where } = {}) => {
      const row = this.announcements.find((a) => matches(this.announcementView(a), where));
      return row ? this.announcementView(row) : null;
    },
    findMany: async ({ where }: { where?: Where } = {}) =>
      this.announcements
        .filter((a) => matches(this.announcementView(a), where))
        .map((a) => this.announcementView(a)),
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const row = this.announcements.find((a) => a.id === where.id);
      if (!row) throw new Error('not found');
      return { ...row };
    },
    count: async ({ where }: { where?: Where } = {}) =>
      this.announcements.filter((a) => matches(this.announcementView(a), where)).length,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.announcements.find((a) => a.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const rows = this.announcements.filter((a) => matches(this.announcementView(a), where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
  };

  announcementRecipient = {
    createMany: async ({ data }: { data: Row[] }) => {
      let count = 0;
      for (const item of data) {
        const exists = this.recipients.some(
          (r) => r.announcementId === item.announcementId && r.userId === item.userId,
        );
        if (!exists) {
          this.recipients.push({ id: randomUUID(), readAt: null, acknowledgedAt: null, ...item });
          count += 1;
        }
      }
      return { count };
    },
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), readAt: null, acknowledgedAt: null, ...data };
      this.recipients.push(row);
      return { ...row };
    },
    findUnique: async ({
      where,
    }: {
      where: { announcementId_userId: { announcementId: string; userId: string } };
    }) => {
      const key = where.announcementId_userId;
      const row = this.recipients.find(
        (r) => r.announcementId === key.announcementId && r.userId === key.userId,
      );
      return row ? { ...row } : null;
    },
    findMany: async ({ where, take }: { where?: Where; take?: number } = {}) => {
      const rows = this.recipients
        .map((r) => this.recipientView(r))
        .filter((r) => matches(r, where));
      return take ? rows.slice(0, take) : rows;
    },
    count: async ({ where }: { where?: Where } = {}) =>
      this.recipients.map((r) => this.recipientView(r)).filter((r) => matches(r, where)).length,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.recipients.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const rows = this.recipients.filter((r) => matches(this.recipientView(r), where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
    groupBy: async ({ where }: { where?: Where }) => {
      const rows = this.recipients.filter((r) => matches(r, where));
      const ids = [...new Set(rows.map((r) => r.announcementId as string))];
      return ids.map((announcementId) => {
        const group = rows.filter((r) => r.announcementId === announcementId);
        return {
          announcementId,
          _count: {
            _all: group.length,
            readAt: group.filter((r) => r.readAt).length,
            acknowledgedAt: group.filter((r) => r.acknowledgedAt).length,
          },
        };
      });
    },
  };

  department = { findMany: async () => [] };
  discipline = { findMany: async () => [] };
  role = { findMany: async () => [] };

  notificationPreference = { findFirst: async () => null };
  notificationTemplate = { findFirst: async () => null };

  notification = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), ...data };
      this.notifications.push(row);
      return row;
    },
    update: async ({ data }: { data: Row }) => data,
  };

  private sequence = 0;

  $queryRaw = async () => {
    this.sequence += 1;
    return [{ nextval: BigInt(this.sequence) }];
  };

  $transaction = async <T>(fn: (tx: this) => Promise<T>): Promise<T> => fn(this);
}
