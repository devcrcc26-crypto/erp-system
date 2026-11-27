import { describe, expect, it } from 'vitest';
import { EMPTY_CAPABILITIES, type Capabilities } from '@/lib/api/types';
import { canAccessRoute, isHrRouteAllowed } from '@/lib/permissions/route-access';

function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return { ...structuredClone(EMPTY_CAPABILITIES), ...overrides };
}

function can(pathname: string, overrides: Partial<Capabilities> = {}, ready = true): boolean {
  return canAccessRoute(pathname, { capabilities: capabilities(overrides), ready });
}

describe('canAccessRoute', () => {
  it('keeps open routes open for a plain employee', () => {
    for (const path of [
      '/',
      '/dashboard',
      '/approvals',
      '/approvals/abc',
      '/approvals/new/leave-request',
      '/profile',
      '/announcements',
      '/help',
      '/notifications',
      '/unauthorized',
      '/users/abc',
    ]) {
      expect(can(path), path).toBe(true);
    }
  });

  it('denies gated routes until capabilities load, but not open ones', () => {
    expect(can('/audit-logs', { canViewAuditLogs: true }, false)).toBe(false);
    expect(can('/hr/payroll', { canViewHr: true }, false)).toBe(false);
    expect(can('/projects', { isSystemAdministrator: true }, false)).toBe(false);
    expect(can('/approvals', {}, false)).toBe(true);
  });

  it('gates audit logs on audit.view', () => {
    expect(can('/audit-logs')).toBe(false);
    expect(can('/audit-logs/123')).toBe(false);
    expect(can('/audit-logs/123', { canViewAuditLogs: true })).toBe(true);
  });

  it('gates user create, edit and list on the matching users permission', () => {
    expect(can('/users')).toBe(false);
    expect(can('/users', { canManageUsers: true })).toBe(true);
    expect(can('/users/new', { canManageUsers: true })).toBe(false);
    expect(can('/users/new', { canCreateUsers: true })).toBe(true);
    expect(can('/users/abc/edit', { canManageUsers: true })).toBe(false);
    expect(can('/users/abc/edit', { canEditUsers: true })).toBe(true);
  });

  it('gates company vehicles on hr.view like the sidebar', () => {
    expect(can('/organization/vehicles')).toBe(false);
    expect(can('/organization/vehicles/v1/edit')).toBe(false);
    expect(can('/organization/vehicles', { canViewHr: true })).toBe(true);
  });

  it('applies the settings rule (hidden from HR, kept for System Administrators)', () => {
    expect(can('/settings')).toBe(false);
    expect(can('/settings', { canManageRoles: true })).toBe(true);
    expect(can('/settings', { canManageRoles: true, canViewHr: true })).toBe(false);
    expect(
      can('/settings', { canManageRoles: true, canViewHr: true, isSystemAdministrator: true }),
    ).toBe(true);
  });

  it('applies the PM module gate used by the proxy', () => {
    expect(can('/projects')).toBe(false);
    expect(can('/projects/p1/review-inbox')).toBe(false);
    expect(can('/projects', { modulesProjectManagementEnabled: true })).toBe(true);
    expect(can('/projects', { isSystemAdministrator: true })).toBe(true);
  });

  it('ignores query strings and trailing slashes', () => {
    expect(can('/audit-logs/?page=2')).toBe(false);
    expect(can('/users/new/')).toBe(false);
  });
});

describe('isHrRouteAllowed', () => {
  it('lets hr.view open every HR route', () => {
    const caps = capabilities({ canViewHr: true });
    expect(isHrRouteAllowed('/hr/public-holidays', caps)).toBe(true);
    expect(isHrRouteAllowed('/hr/payroll', caps)).toBe(true);
  });

  it('lets employees open self-service routes only', () => {
    const caps = capabilities();
    expect(isHrRouteAllowed('/hr/leave-requests/abc', caps)).toBe(true);
    expect(isHrRouteAllowed('/hr/overtime', caps)).toBe(true);
    expect(isHrRouteAllowed('/hr/work-from-home', caps)).toBe(true);
    expect(isHrRouteAllowed('/hr/public-holidays', caps)).toBe(false);
    expect(isHrRouteAllowed('/hr/leave-policy', caps)).toBe(false);
    expect(isHrRouteAllowed('/hr/my-team', caps)).toBe(false);
    expect(isHrRouteAllowed('/hr/payroll', caps)).toBe(false);
  });

  it('opens team lists to supervisors', () => {
    const caps = capabilities({ hasDirectReports: true });
    expect(isHrRouteAllowed('/hr/my-team', caps)).toBe(true);
    expect(isHrRouteAllowed('/hr/business-trips/abc', caps)).toBe(true);
    expect(isHrRouteAllowed('/hr/public-holidays', caps)).toBe(false);
  });

  it('opens module routes to their capability holders', () => {
    expect(isHrRouteAllowed('/hr/payroll', capabilities({ canAccessPayroll: true }))).toBe(true);
    expect(
      isHrRouteAllowed('/hr/announcements', capabilities({ canManageAnnouncements: true })),
    ).toBe(true);
    expect(
      isHrRouteAllowed('/hr/purchase-requests', capabilities({ canViewPurchaseRequest: true })),
    ).toBe(true);
    expect(isHrRouteAllowed('/hr/id-cards', capabilities({ canManageUsers: true }))).toBe(true);
  });
});
