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
  loginName?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName: string | null;
  companyId: string;
  companyName: string;
  preferredLanguage: string | null;
  preferredTimezone: string | null;
  preferredDateFormat: string | null;
  mustChangePassword?: boolean;
  /**
   * First-login product tour finished or skipped. Undefined for sessions
   * persisted before the field existed (AppTour then falls back to /auth/me).
   */
  hasSeenTour?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
  user: AuthUser;
}

export interface LoginRequest {
  /** Full name (OA login) or email when the value contains "@". */
  identifier: string;
  password: string;
  deviceInfo?: string;
  /** @deprecated Prefer identifier */
  email?: string;
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
  isPrimary?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  loginName?: string | null;
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
  photoDocumentId?: string | null;
  /** First-login product tour finished or skipped. */
  hasSeenTour?: boolean;
  roles: ProfileRole[];
  /** Approver-only account: no HR processes of their own (no self field movement, leave …). */
  excludedFromHrProcesses?: boolean;
  // Read-only employment record returned by GET /auth/me (dates are YYYY-MM-DD).
  employeeId?: string | null;
  middleName?: string | null;
  departmentName?: string | null;
  departmentNameZh?: string | null;
  positionTitle?: string | null;
  positionTitleZh?: string | null;
  branchName?: string | null;
  reportsToName?: string | null;
  reportsToChineseName?: string | null;
  employeeType?: 'PERMANENT' | 'CONTRACT' | 'TEMPORARY' | 'FREELANCER' | null;
  nationality?: 'ETHIOPIAN' | 'CHINESE' | null;
  dateOfBirth?: string | null;
  placeOfBirth?: string | null;
  maritalStatus?: MaritalStatus | null;
  bloodType?: string | null;
  idCardIssued?: boolean;
  idCardIssuedAt?: string | null;
  idIssueDate?: string | null;
  idExpiryDate?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  educationLevel?: EducationLevel | null;
  fieldOfStudy?: string | null;
  employmentDate?: string | null;
  /** Current years of experience (recorded value grown since the as-of date). */
  yearsOfExperience?: number | null;
  yearsOfExperienceAsOf?: string | null;
  secondaryPhone?: string | null;
  seniorityLevelName?: string | null;
  seniorityLevelNameZh?: string | null;
  addressCountry?: string | null;
  addressRegion?: string | null;
  addressCity?: string | null;
  addressSubcity?: string | null;
  addressWoreda?: string | null;
  addressHouseNumber?: string | null;
  kebele?: string | null;
  emergencyContacts?: ProfileEmergencyContact[];
  pensionNumber?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountNumber?: string | null;
}

export interface ProfileEmergencyContact {
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
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

export interface SetEmailRequest {
  email: string;
}

export interface BulkOtpRow {
  employeeId: string;
  fullName: string;
  otp: string;
}

export interface BulkGenerateOtpResponse {
  rows: BulkOtpRow[];
  csv: string;
}

import type { UserDiscipline } from '@/lib/constants/user-discipline';

export type { UserDiscipline };

export type Gender = 'MALE' | 'FEMALE';
export type Nationality = 'ETHIOPIAN' | 'CHINESE';
export type EmployeeType =
  | 'PERMANENT'
  | 'CONTRACT'
  | 'TEMPORARY'
  | 'FREELANCER';
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED';

export type EducationLevel =
  | 'PHD'
  | 'MSC'
  | 'BSC'
  | 'DIPLOMA'
  | 'CERTIFICATE'
  | 'TECHNICIAN'
  | 'SECONDARY'
  | 'PRIMARY'
  | 'OTHER';

export interface EmergencyContact {
  firstName: string;
  middleName?: string;
  lastName: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

export interface EducationRecordInput {
  id?: string;
  instituteName: string;
  graduationYear?: number | null;
  subjectMajor?: string | null;
  certificateType?: string | null;
}

export interface PriorEmploymentInput {
  id?: string;
  employerName: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  lastPosition?: string | null;
}

export interface PositionHistoryEntry {
  id: string;
  userId: string;
  positionId: string | null;
  positionTitle: string | null;
  positionTitleZh: string | null;
  salaryOverride: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  seniorityLevelId?: string | null;
  seniorityLevel?: { id: string; name: string; nameZh: string | null } | null;
  reportsToUserId: string | null;
  reportsTo?: {
    id: string;
    firstName: string;
    lastName: string;
    chineseName: string | null;
    employeeId?: string | null;
  } | null;
  discipline: UserDiscipline | null;
  engineeringDisciplineId: string | null;
  engineeringDiscipline?: { id: string; name: string; nameZh: string | null } | null;
  employeeId?: string | null;
  middleName?: string | null;
  addressCountry?: string | null;
  addressRegion?: string | null;
  addressCity?: string | null;
  addressSubcity?: string | null;
  addressWoreda?: string | null;
  addressHouseNumber?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  nationalId?: string | null;
  placeOfBirth?: string | null;
  kebele?: string | null;
  maritalStatus?: MaritalStatus | null;
  bloodType?: string | null;
  idIssueDate?: string | null;
  idExpiryDate?: string | null;
  pensionNumber?: string | null;
  tin?: string | null;
  nationality?: Nationality | null;
  employeeType?: EmployeeType | null;
  educationLevel?: EducationLevel | null;
  fieldOfStudy?: string | null;
  employmentDate?: string | null;
  /** ACTIVE / INACTIVE (suspension, long leave …) / SEPARATED. */
  employmentStatus?: 'ACTIVE' | 'INACTIVE' | 'SEPARATED';
  /** Current value: recorded years plus the time since yearsOfExperienceAsOf. */
  yearsOfExperience?: number | null;
  yearsOfExperienceAsOf?: string | null;
  emergencyContacts?: EmergencyContact[] | null;
  educationRecords?: EducationRecordInput[] | null;
  priorEmployments?: PriorEmploymentInput[] | null;
  leavePolicyId?: string | null;
  leavePolicy?: { id: string; name: string } | null;
  workScheduleId?: string | null;
  workSchedule?: { id: string; name: string; isDefault: boolean } | null;
  profileFolderId?: string | null;
  photoDocumentId?: string | null;
  /** Company ID card issuance (HR-controlled). */
  idCardIssued?: boolean;
  idCardIssuedAt?: string | null;
  idCardIssuedBy?: string | null;
  idCardIssuedByName?: string | null;
  firstName: string;
  lastName: string;
  chineseName: string | null;
  loginName?: string | null;
  /** Approver only - excluded from HR processes (set by users.edit). */
  excludedFromHrProcesses?: boolean;
  excludedReason?: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone?: string | null;
  preferredLanguage: string | null;
  preferredTimezone: string | null;
  preferredDateFormat: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountNumber?: string | null;
  includeInPayroll?: boolean;
  attendanceMode?: 'SCANNER' | 'EXEMPT';
  isActive: boolean;
  mfaEnabled: boolean;
  mustChangePassword?: boolean;
  emailVerifiedAt: string | null;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  userRoles?: UserRoleAssignment[];
}

export interface CreateUserResponse extends User {
  invitationSent?: boolean;
  /** Present once when issueTemporaryPassword was requested. */
  temporaryPassword?: string;
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
  idCardIssued?: boolean;
}

export type BloodType =
  | 'A+'
  | 'A−'
  | 'B+'
  | 'B−'
  | 'AB+'
  | 'AB−'
  | 'O+'
  | 'O−';

export const BLOOD_TYPE_OPTIONS: readonly BloodType[] = [
  'A+',
  'A−',
  'B+',
  'B−',
  'AB+',
  'AB−',
  'O+',
  'O−',
] as const;

export interface CreateUserRequest {
  email?: string;
  firstName: string;
  lastName?: string;
  chineseName?: string;
  /** OA login name; defaults to full name when omitted. */
  loginName?: string;
  password?: string;
  /** Create login-ready account and return temporaryPassword once. */
  issueTemporaryPassword?: boolean;
  phone?: string;
  secondaryPhone?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  seniorityLevelId?: string;
  reportsToUserId?: string;
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
  addressWoreda?: string;
  addressHouseNumber?: string;
  gender?: Gender;
  dateOfBirth?: string;
  nationalId?: string;
  placeOfBirth?: string | null;
  kebele?: string | null;
  maritalStatus?: MaritalStatus | null;
  bloodType?: BloodType | null;
  idIssueDate?: string | null;
  idExpiryDate?: string | null;
  pensionNumber?: string | null;
  tin?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  employmentDate?: string;
  emergencyContacts?: EmergencyContact[];
  educationRecords?: EducationRecordInput[];
  priorEmployments?: PriorEmploymentInput[];
  leavePolicyId?: string;
  workScheduleId?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  includeInPayroll?: boolean;
  attendanceMode?: 'SCANNER' | 'EXEMPT';
}

export interface UpdateUserRequest {
  /** users.edit only (PATCH /users/:id); audited. */
  excludedFromHrProcesses?: boolean;
  excludedReason?: string | null;
  /** OA login name (users.edit); audited. */
  loginName?: string;
  firstName?: string;
  lastName?: string;
  chineseName?: string;
  phone?: string;
  secondaryPhone?: string;
  branchId?: string;
  departmentId?: string | null;
  positionId?: string | null;
  seniorityLevelId?: string | null;
  reportsToUserId?: string | null;
  leavePolicyId?: string | null;
  workScheduleId?: string | null;
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
  addressWoreda?: string;
  addressHouseNumber?: string;
  gender?: Gender;
  dateOfBirth?: string;
  nationalId?: string;
  placeOfBirth?: string | null;
  kebele?: string | null;
  maritalStatus?: MaritalStatus | null;
  bloodType?: BloodType | null;
  idIssueDate?: string | null;
  idExpiryDate?: string | null;
  pensionNumber?: string | null;
  tin?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  employmentDate?: string;
  emergencyContacts?: EmergencyContact[];
  educationRecords?: EducationRecordInput[];
  priorEmployments?: PriorEmploymentInput[];
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  includeInPayroll?: boolean;
  attendanceMode?: 'SCANNER' | 'EXEMPT';
}

export interface AssignUserRoleRequest {
  roleId: string;
  isPrimary?: boolean;
}

export type ImportRowStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'duplicate_in_file';

export interface ImportRowPreview {
  line: number;
  email?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  chineseName?: string;
  role: string;
  phone?: string;
  department?: string;
  position?: string;
  employeeId?: string;
  leavePolicy?: string;
  discipline?: string | null;
  gender?: string | null;
  nationality?: string | null;
  employeeType?: string | null;
  educationLevel?: string | null;
  dateOfBirth?: string;
  nationalId?: string;
  tin?: string;
  fieldOfStudy?: string;
  yearsOfExperience?: string;
  addressCountry?: string;
  addressRegion?: string;
  addressCity?: string;
  addressSubcity?: string;
  addressWoreda?: string;
  addressHouseNumber?: string;
  status: ImportRowStatus;
  message?: string;
  roleId?: string;
  departmentId?: string;
  positionId?: string;
  leavePolicyId?: string;
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

/** Shared preview row for HR Excel imports (contracts, leave, balances). */
export interface HrImportRowPreview {
  line: number;
  label: string;
  status: ImportRowStatus;
  message?: string;
}

export interface HrImportPreviewResult {
  valid: number;
  invalid: number;
  duplicate: number;
  warnings?: number;
  rows: HrImportRowPreview[];
}

export interface HrImportCommitError {
  line: number;
  label?: string;
  message: string;
}

export interface HrImportCommitResult {
  created: number;
  updated?: number;
  skipped: number;
  errors: HrImportCommitError[];
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

export interface AuditLogStats {
  total: number;
  userActions: number;
  systemJobs: number;
  integrations: number;
}

export interface AuthCapabilities {
  canManageUsers: boolean;
  canCreateUsers: boolean;
  /** users.edit - edit employees, login name, approver-only flag, reset password. */
  canEditUsers: boolean;
  canManageRoles: boolean;
  canEditRoles: boolean;
  canViewNotifications: boolean;
  canViewAuditLogs: boolean;
  canViewHr: boolean;
  canEditHr: boolean;
  /** contracts.view_salary — contract compensation on lists and exports. */
  canViewContractSalary: boolean;
  canViewLeave: boolean;
  canCreateLeave: boolean;
  canViewOvertime: boolean;
  canCreateOvertime: boolean;
  canAccessPayroll: boolean;
  canCreatePayroll: boolean;
  canEditPayroll: boolean;
  canApprovePayroll: boolean;
  canExportPayroll: boolean;
  /** announcements.create OR edit OR approve - opens /hr/announcements. */
  canManageAnnouncements?: boolean;
  /** announcements.approve - publish, schedule, archive, remind. */
  canPublishAnnouncements?: boolean;
  /** announcements.export - read statistics as Excel. */
  canExportAnnouncements?: boolean;
  canViewFlight: boolean;
  canCreateFlight: boolean;
  canManageFlight: boolean;
  canViewBusinessTrip: boolean;
  canCreateBusinessTrip: boolean;
  canManageBusinessTrip: boolean;
  canViewPurchaseRequest: boolean;
  canCreatePurchaseRequest: boolean;
  /** Company setting modules.projectManagement.enabled */
  modulesProjectManagementEnabled: boolean;
  isSystemAdministrator: boolean;
  /** True System Administrator role only (not Project Administrator). */
  isSystemAdmin: boolean;
  /** At least one active employee reports to this user (supervisor views). */
  hasDirectReports: boolean;
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
  canEditUsers: false,
  canManageRoles: false,
  canEditRoles: false,
  canViewNotifications: true,
  canViewAuditLogs: false,
  canViewHr: false,
  canEditHr: false,
  canViewContractSalary: false,
  canViewLeave: false,
  canCreateLeave: false,
  canViewOvertime: false,
  canCreateOvertime: false,
  canAccessPayroll: false,
  canCreatePayroll: false,
  canEditPayroll: false,
  canApprovePayroll: false,
  canExportPayroll: false,
  canManageAnnouncements: false,
  canPublishAnnouncements: false,
  canExportAnnouncements: false,
  canViewFlight: false,
  canCreateFlight: false,
  canManageFlight: false,
  canViewBusinessTrip: false,
  canCreateBusinessTrip: false,
  canManageBusinessTrip: false,
  canViewPurchaseRequest: false,
  canCreatePurchaseRequest: false,
  modulesProjectManagementEnabled: false,
  isSystemAdministrator: false,
  isSystemAdmin: false,
  hasDirectReports: false,
  pm: createEmptyPmCapabilities(),
  epc: { ...EMPTY_EPC_CAPABILITIES },
};
