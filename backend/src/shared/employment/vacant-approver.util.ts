/**
 * An approver who left, is inactive (suspension / long leave) or can't log in
 * can't act on a tier. Chains resolving to them fail with a vacancy message so
 * HR fills the position instead of the request silently skipping a tier.
 */
export function isVacantApprover(user: {
  deletedAt?: Date | null;
  isActive?: boolean | null;
  employmentStatus?: string | null;
}): boolean {
  return (
    Boolean(user.deletedAt) ||
    user.isActive === false ||
    (user.employmentStatus != null && user.employmentStatus !== 'ACTIVE')
  );
}

export function vacantApproverMessage(role: string): string {
  return `Approver position vacant: ${role} - ask HR`;
}
