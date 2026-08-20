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
  chineseName: string | null;
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
  chineseName: string | null;
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

import type { UserDiscipline } from '@/lib/constants/user-discipline';

export type { UserDiscipline };

export type Gender = 'MALE' | 'FEMALE';
export type Nationality = 'ETHIOPIAN' | 'CHINESE';
export type EmployeeType = 'PERMANENT' | 'CONTRACT' | 'TEMPORARY';
export type EducationLevel = 'PHD' | 'MSC' | 'BSC' | 'DIPLOMA' | 'CERTIFICATE' | 'OTHER';

export interface LeavePolicySummary {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface UserProfileDocument {
  id: string;
  name: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  companyId: string;
  branchId: string | null;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  positionId: string | null;
  position?: { id: string; title: string } | null;
  discipline: UserDiscipline | null;
  engineeringDisciplineId: string | null;
  engineeringDiscipline?: { id: string; name: string; nameZh: string | null } | null;
  employeeId?: string | null;
  middleName?: string | null;
  addressCountry?: string | null;
  addressRegion?: string | null;
  addressCity?: string | null;
  addressSubcity?: string | null;
  addressHouseNumber?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  nationalId?: string | null;
  nationality?: Nationality | null;
  employeeType?: EmployeeType | null;
  educationLevel?: EducationLevel | null;
  fieldOfStudy?: string | null;
  experienceStartDate?: string | null;
  yearsOfExperience?: number | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  leavePolicyId?: string | null;
  leavePolicy?: { id: string; name: string } | null;
  profileFolderId?: string | null;
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
  isPrimary?: boolean;
  role: {
    id: string;
    name: string;
  };
}

export interface UserDetail extends User {
  userRoles: UserRoleAssignment[];
}

export interface UsersQueryParams extends PaginationParams {
  search?: string;
  disciplineId?: string;
  departmentId?: string;
  positionId?: string;
  isActive?: boolean;
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
  discipline?: UserDiscipline;
  engineeringDisciplineId?: string;
  preferredLanguage?: string;
  preferredTimezone?: string;
  preferredDateFormat?: string;
  isActive?: boolean;
  employeeId?: string;
  middleName?: string;
  addressCountry?: string;
  addressRegion?: string;
  addressCity?: string;
  addressSubcity?: string;
  addressHouseNumber?: string;
  gender?: Gender;
  dateOfBirth?: string;
  nationalId?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  experienceStartDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  leavePolicyId?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  chineseName?: string;
  phone?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  discipline?: UserDiscipline | null;
  engineeringDisciplineId?: string | null;
  preferredLanguage?: string;
  preferredTimezone?: string;
  preferredDateFormat?: string;
  isActive?: boolean;
  employeeId?: string;
  middleName?: string;
  addressCountry?: string;
  addressRegion?: string;
  addressCity?: string;
  addressSubcity?: string;
  addressHouseNumber?: string;
  gender?: Gender;
  dateOfBirth?: string;
  nationalId?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  experienceStartDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  leavePolicyId?: string | null;
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
  email?: string;
  firstName: string;
  lastName: string;
  chineseName?: string;
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
  email?: string;
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
  chineseName: string | null;
  email: string | null;
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
  canViewHr: boolean;
  canViewLeave: boolean;
  canCreateLeave: boolean;
  canViewOvertime: boolean;
  canCreateOvertime: boolean;
  canViewFlight: boolean;
  canCreateFlight: boolean;
  canManageFlight: boolean;
  canViewBusinessTrip: boolean;
  canCreateBusinessTrip: boolean;
  canManageBusinessTrip: boolean;
  canManagePerDiemRates: boolean;
  isSystemAdministrator: boolean;
}

export interface EpcCapabilities {
  canViewReviewInbox: boolean;
  canViewMyComments: boolean;
  canViewMyWork: boolean;
  canViewEngineering: boolean;
  canUploadEngineeringDocuments: boolean;
  disciplineScopeBypass: boolean;
  /** SysAdmin / MD / Project Manager / Project Administrator. */
  navFullAccess: boolean;
  navDepartmentLeader: boolean;
  navDisciplineLeader: boolean;
  navReviewerTier: boolean;
  navDesigner: boolean;
  navSupportingDesigner: boolean;
}

export const EMPTY_EPC_CAPABILITIES: EpcCapabilities = {
  canViewReviewInbox: false,
  canViewMyComments: false,
  canViewMyWork: false,
  canViewEngineering: false,
  canUploadEngineeringDocuments: false,
  disciplineScopeBypass: false,
  navFullAccess: false,
  navDepartmentLeader: false,
  navDisciplineLeader: false,
  navReviewerTier: false,
  navDesigner: false,
  navSupportingDesigner: false,
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
  canViewNotifications: true,
  canViewAuditLogs: false,
  canViewHr: false,
  canViewLeave: false,
  canCreateLeave: false,
  canViewOvertime: false,
  canCreateOvertime: false,
  canViewFlight: false,
  canCreateFlight: false,
  canManageFlight: false,
  canViewBusinessTrip: false,
  canCreateBusinessTrip: false,
  canManageBusinessTrip: false,
  canManagePerDiemRates: false,
  isSystemAdministrator: false,
  pm: createEmptyPmCapabilities(),
  epc: { ...EMPTY_EPC_CAPABILITIES },
};
