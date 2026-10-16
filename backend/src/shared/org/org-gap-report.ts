/**
 * Org-structure gap report (read-only). Pure so the HR endpoint and the
 * directory import script build exactly the same report.
 */

export interface OrgGapUserInput {
  id: string;
  employeeId: string | null;
  name: string;
  /** Approver-only accounts (excludedFromHrProcesses) are not employees here. */
  approverOnly: boolean;
  departmentId: string | null;
  departmentName: string | null;
  disciplineId: string | null;
  disciplineName: string | null;
  reportsToUserId: string | null;
  /** Manager is set but deleted, inactive or not ACTIVE employment. */
  reportsToVacant: boolean;
}

export interface OrgGapUnitInput {
  id: string;
  name: string;
  leaderUserId: string | null;
  leaderVacant: boolean;
}

export interface OrgGapEmployee {
  id: string;
  employeeId: string | null;
  name: string;
  departmentName: string | null;
  disciplineName: string | null;
}

export interface OrgGapUnit {
  id: string;
  name: string;
  members: number;
  /** NONE = no leader set; VACANT = leader set but inactive / not employed. */
  reason: 'NONE' | 'VACANT';
}

export interface OrgGapReport {
  totals: {
    employees: number;
    withoutSupervisor: number;
    withVacantSupervisor: number;
    withoutDepartment: number;
    withoutDiscipline: number;
    departmentsWithoutLeader: number;
    disciplinesWithoutLeader: number;
    supervisorsWithoutAccount: number;
  };
  withoutSupervisor: OrgGapEmployee[];
  withVacantSupervisor: OrgGapEmployee[];
  withoutDepartment: OrgGapEmployee[];
  withoutDiscipline: OrgGapEmployee[];
  departmentsWithoutLeader: OrgGapUnit[];
  disciplinesWithoutLeader: OrgGapUnit[];
  /** Supervisor names from the HR directory that have no user account yet. */
  supervisorsWithoutAccount: string[];
}

function toEmployee(user: OrgGapUserInput): OrgGapEmployee {
  return {
    id: user.id,
    employeeId: user.employeeId,
    name: user.name,
    departmentName: user.departmentName,
    disciplineName: user.disciplineName,
  };
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

function unitGaps(
  units: readonly OrgGapUnitInput[],
  memberCounts: Map<string, number>,
): OrgGapUnit[] {
  return units
    .filter((unit) => !unit.leaderUserId || unit.leaderVacant)
    .map((unit) => ({
      id: unit.id,
      name: unit.name,
      members: memberCounts.get(unit.id) ?? 0,
      reason: unit.leaderUserId ? ('VACANT' as const) : ('NONE' as const),
    }))
    .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
}

export function buildOrgGapReport(input: {
  users: readonly OrgGapUserInput[];
  departments: readonly OrgGapUnitInput[];
  disciplines: readonly OrgGapUnitInput[];
  supervisorsWithoutAccount?: readonly string[];
}): OrgGapReport {
  const employees = input.users.filter((user) => !user.approverOnly);

  const departmentMembers = new Map<string, number>();
  const disciplineMembers = new Map<string, number>();
  for (const user of employees) {
    if (user.departmentId) {
      departmentMembers.set(
        user.departmentId,
        (departmentMembers.get(user.departmentId) ?? 0) + 1,
      );
    }
    if (user.disciplineId) {
      disciplineMembers.set(
        user.disciplineId,
        (disciplineMembers.get(user.disciplineId) ?? 0) + 1,
      );
    }
  }

  const withoutSupervisor = employees
    .filter((u) => !u.reportsToUserId)
    .map(toEmployee)
    .sort(byName);
  const withVacantSupervisor = employees
    .filter((u) => u.reportsToUserId && u.reportsToVacant)
    .map(toEmployee)
    .sort(byName);
  const withoutDepartment = employees
    .filter((u) => !u.departmentId)
    .map(toEmployee)
    .sort(byName);
  const withoutDiscipline = employees
    .filter((u) => !u.disciplineId)
    .map(toEmployee)
    .sort(byName);
  const departmentsWithoutLeader = unitGaps(input.departments, departmentMembers);
  const disciplinesWithoutLeader = unitGaps(input.disciplines, disciplineMembers);
  const supervisorsWithoutAccount = [
    ...new Set(input.supervisorsWithoutAccount ?? []),
  ].sort((a, b) => a.localeCompare(b));

  return {
    totals: {
      employees: employees.length,
      withoutSupervisor: withoutSupervisor.length,
      withVacantSupervisor: withVacantSupervisor.length,
      withoutDepartment: withoutDepartment.length,
      withoutDiscipline: withoutDiscipline.length,
      departmentsWithoutLeader: departmentsWithoutLeader.length,
      disciplinesWithoutLeader: disciplinesWithoutLeader.length,
      supervisorsWithoutAccount: supervisorsWithoutAccount.length,
    },
    withoutSupervisor,
    withVacantSupervisor,
    withoutDepartment,
    withoutDiscipline,
    departmentsWithoutLeader,
    disciplinesWithoutLeader,
    supervisorsWithoutAccount,
  };
}
