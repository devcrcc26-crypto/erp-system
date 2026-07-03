export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  companyName: string;
  preferredLanguage: string | null;
  preferredTimezone: string | null;
  preferredDateFormat: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceInfo?: string;
}

export interface RefreshTokenRequest {
  sessionId: string;
  refreshToken: string;
}

export interface MessageResponse {
  message: string;
}

export interface ActivateAccountRequest {
  token: string;
  newPassword: string;
}

export interface ResendActivationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}

export interface ConfirmEmailChangeRequest {
  token: string;
}

export interface ProfileRole {
  id: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  pendingEmail: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  companyId: string;
  companyName: string;
  preferredLanguage: string | null;
  preferredTimezone: string | null;
  preferredDateFormat: string | null;
  emailVerifiedAt: string | null;
  roles: ProfileRole[];
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  preferredLanguage?: string;
  preferredTimezone?: string;
  preferredDateFormat?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeEmailRequest {
  newEmail: string;
}

export interface User {
  id: string;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  positionId: string | null;
  firstName: string;
  lastName: string;
  chineseName: string | null;
  email: string | null;
  phone: string | null;
  preferredLanguage: string | null;
  preferredTimezone: string | null;
  preferredDateFormat: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  emailVerifiedAt: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  userRoles?: UserRoleAssignment[];
}

export interface CreateUserResponse extends User {
  invitationSent?: boolean;
}

export interface UserRoleAssignment {
  id: string;
  roleId: string;
  role: {
    id: string;
    name: string;
  };
}

export interface UserDetail extends User {
  userRoles: UserRoleAssignment[];
}

export interface CreateUserRequest {
  email?: string;
  firstName: string;
  lastName: string;
  chineseName?: string;
  password?: string;
  phone?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  preferredLanguage?: string;
  preferredTimezone?: string;
  preferredDateFormat?: string;
  isActive?: boolean;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  chineseName?: string;
  phone?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  preferredLanguage?: string;
  preferredTimezone?: string;
  preferredDateFormat?: string;
  isActive?: boolean;
}

export interface AssignUserRoleRequest {
  roleId: string;
}

export type ImportRowStatus =
  | 'ok'
  | 'error'
  | 'duplicate'
  | 'duplicate_in_file';

export interface ImportRowPreview {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
  status: ImportRowStatus;
  message?: string;
  roleId?: string;
}

export interface ImportPreviewResult {
  valid: number;
  invalid: number;
  duplicate: number;
  rows: ImportRowPreview[];
}

export interface ImportCommitError {
  line: number;
  email: string;
  message: string;
}

export interface ImportCommitResult {
  created: number;
  skipped: number;
  invitationsSent: number;
  invitationsFailed: number;
  errors: ImportCommitError[];
}

export interface Role {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  parentRoleId: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parentRole?: { id: string; name: string } | null;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string | null;
}

export interface PermissionFlags {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export interface RolePermission extends PermissionFlags {
  id: string;
  roleId: string;
  permissionId: string;
  permission: Permission;
}

export interface RoleDetail extends Role {
  rolePermissions: RolePermission[];
}

export interface RolePermissionItem {
  permissionId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export interface UpdateRolePermissionsRequest {
  permissions: RolePermissionItem[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  parentRoleId?: string;
  isActive?: boolean;
}

export interface ReportExecutionResult {
  dataSource: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

import type { PmCapabilities } from '@/lib/api/project-management.types';
import { createEmptyPmCapabilities } from '@/lib/api/project-management.types';

export type AuditLogSource =
  | 'USER_ACTION'
  | 'SYSTEM_JOB'
  | 'API_INTEGRATION'
  | 'MIGRATION';

export interface AuditLogUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  companyId: string;
  sessionId: string | null;
  correlationId: string | null;
  batchId: string | null;
  source: AuditLogSource;
  module: string;
  action: string;
  recordType: string;
  recordId: string;
  recordReference: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  ipAddress: string | null;
  deviceInfo: string | null;
  createdAt: string;
  user: AuditLogUser | null;
}

export interface AuditLogQueryParams extends PaginationParams {
  module?: string;
  action?: string;
  userId?: string;
  recordType?: string;
  recordId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuthCapabilities {
  canManageUsers: boolean;
  canCreateUsers: boolean;
  canManageRoles: boolean;
  canEditRoles: boolean;
  canViewNotifications: boolean;
  canViewAuditLogs: boolean;
  isSystemAdministrator: boolean;
}

export interface EpcCapabilities {
  canViewReviewInbox: boolean;
  canViewMyComments: boolean;
  canViewEngineering: boolean;
  canUploadEngineeringDocuments: boolean;
  disciplineScopeBypass: boolean;
}

export const EMPTY_EPC_CAPABILITIES: EpcCapabilities = {
  canViewReviewInbox: false,
  canViewMyComments: false,
  canViewEngineering: false,
  canUploadEngineeringDocuments: false,
  disciplineScopeBypass: false,
};

export interface Capabilities extends AuthCapabilities {
  pm: PmCapabilities;
  epc: EpcCapabilities;
}

export const EMPTY_CAPABILITIES: Capabilities = {
  canManageUsers: false,
  canCreateUsers: false,
  canManageRoles: false,
  canEditRoles: false,
  canViewNotifications: false,
  canViewAuditLogs: false,
  isSystemAdministrator: false,
  pm: createEmptyPmCapabilities(),
  epc: { ...EMPTY_EPC_CAPABILITIES },
};
