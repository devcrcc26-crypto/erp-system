import { BadRequestException, Injectable } from '@nestjs/common';
import { AnnouncementScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface AnnouncementAudience {
  audienceScope: AnnouncementScope;
  departmentIds: readonly string[];
  disciplineIds: readonly string[];
  roleIds: readonly string[];
  employeeIds: readonly string[];
}

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Turns an announcement audience into the active users it targets. Only
 * active, non-deleted users of the company are ever returned.
 */
@Injectable()
export class AnnouncementAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws when a targeted scope has nothing selected. */
  assertComplete(audience: AnnouncementAudience): void {
    const selected = this.selectedIds(audience);
    if (audience.audienceScope !== AnnouncementScope.ALL && selected.length === 0) {
      throw new BadRequestException('Select at least one recipient group for this audience.');
    }
  }

  /** Active user ids targeted by the audience (stable, de-duplicated). */
  async resolveUserIds(
    companyId: string,
    audience: AnnouncementAudience,
    db: Db = this.prisma,
  ): Promise<string[]> {
    const where = this.userWhere(companyId, audience);
    if (!where) {
      return [];
    }
    const users = await db.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return [...new Set(users.map((user) => user.id))];
  }

  /** Live recipient count for the audience picker. */
  async count(companyId: string, audience: AnnouncementAudience): Promise<number> {
    const where = this.userWhere(companyId, audience);
    if (!where) {
      return 0;
    }
    return this.prisma.user.count({ where });
  }

  private selectedIds(audience: AnnouncementAudience): readonly string[] {
    switch (audience.audienceScope) {
      case AnnouncementScope.DEPARTMENTS:
        return audience.departmentIds;
      case AnnouncementScope.DISCIPLINES:
        return audience.disciplineIds;
      case AnnouncementScope.ROLES:
        return audience.roleIds;
      case AnnouncementScope.EMPLOYEES:
        return audience.employeeIds;
      default:
        return [];
    }
  }

  private userWhere(
    companyId: string,
    audience: AnnouncementAudience,
  ): Prisma.UserWhereInput | null {
    const base: Prisma.UserWhereInput = { companyId, isActive: true, deletedAt: null };
    const ids = [...this.selectedIds(audience)];
    switch (audience.audienceScope) {
      case AnnouncementScope.ALL:
        return base;
      case AnnouncementScope.DEPARTMENTS:
        return ids.length > 0 ? { ...base, departmentId: { in: ids } } : null;
      case AnnouncementScope.DISCIPLINES:
        return ids.length > 0 ? { ...base, engineeringDisciplineId: { in: ids } } : null;
      case AnnouncementScope.ROLES:
        return ids.length > 0
          ? { ...base, userRoles: { some: { roleId: { in: ids }, deletedAt: null } } }
          : null;
      case AnnouncementScope.EMPLOYEES:
        return ids.length > 0 ? { ...base, id: { in: ids } } : null;
      default:
        return null;
    }
  }
}
