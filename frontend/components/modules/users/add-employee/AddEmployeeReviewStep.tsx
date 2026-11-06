'use client';

import { useEffect, useMemo } from 'react';
import { Avatar, Form, Radio, Tag } from 'antd';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined } from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useUser } from '@/lib/query/users';
import { useLeavePolicies } from '@/lib/query/leave-policy';
import { useWorkScheduleList } from '@/lib/query/work-schedule';
import {
  useDepartments,
  useEngineeringDisciplineOptions,
  usePositions,
  useSeniorityLevels,
} from '@/lib/query/org';
import { tokens } from '@/lib/theme/tokens';
import { formatUserName } from '@/lib/utils/user-display';
import {
  formatRoleDisplayName,
  getRoleColor,
} from '@/lib/utils/role-colors';
import { formatEmployeeAddress } from '@/components/modules/users/EmployeeProfileFormFields';
import type { AddEmployeeFormValues } from './add-employee.types';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import type { PendingEmployeeDocument } from './AddEmployeePendingDocuments';

interface AddEmployeeReviewStepProps {
  values: AddEmployeeFormValues;
  pendingDocuments: PendingEmployeeDocument[];
  pendingPhoto?: File | null;
  mode?: 'create' | 'edit';
}

interface EmergencyContactRow {
  key: number;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  email: string;
}

function ReviewValue({ value }: { value: string }): React.ReactNode {
  if (!value || value === '-') {
    return <span className="erp-users-dash">-</span>;
  }
  return <span className="erp-review-field-value">{value}</span>;
}

function ReviewField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactNode {
  return (
    <div className={`erp-review-field${wide ? ' erp-review-field--wide' : ''}`}>
      <p className="erp-review-field-label">{label}</p>
      <ReviewValue value={value} />
    </div>
  );
}

/** A titled part of a merged review card; parts are divided by a rule. */
function ReviewSubsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-review-subsection">
      <h4 className="erp-review-subsection-title">{title}</h4>
      {children}
    </div>
  );
}

function ReviewSection({
  title,
  count,
  children,
  flush = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  flush?: boolean;
}): React.ReactNode {
  return (
    <section className="erp-review-section">
      <div className="erp-review-section-header">
        <h3 className="erp-review-section-title">{title}</h3>
        {typeof count === 'number' ? (
          <span className="erp-users-count-pill">{count.toLocaleString()}</span>
        ) : null}
      </div>
      <div className={flush ? 'p-0' : 'erp-review-section-body'}>{children}</div>
    </section>
  );
}

/**
 * Add/Edit Employee final review - confirmation layout aligned with Users chrome.
 */
export default function AddEmployeeReviewStep({
  values,
  pendingDocuments,
  pendingPhoto = null,
  mode = 'create',
}: AddEmployeeReviewStepProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const roleAssignments = [...(values.roleAssignments ?? [])].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  );
  const primaryRoleName =
    roleAssignments.find((role) => role.isPrimary)?.roleName ??
    roleAssignments[0]?.roleName ??
    null;
  const reportsToQuery = useUser(
    values.reportsToUserId ?? '',
    Boolean(values.reportsToUserId),
  );
  const reportsToName = reportsToQuery.data
    ? formatUserName(reportsToQuery.data)
    : '-';

  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, true);
  const positionsQuery = usePositions({ page: 1, limit: 100 }, true);
  const seniorityLevelsQuery = useSeniorityLevels();
  const { options: disciplineOptions } = useEngineeringDisciplineOptions(
    true,
    true,
  );
  const leavePoliciesQuery = useLeavePolicies();
  const workSchedulesQuery = useWorkScheduleList();

  const departmentName =
    (departmentsQuery.data?.data ?? []).find(
      (d) => d.id === values.departmentId,
    )?.name ?? '-';
  const positionName =
    (positionsQuery.data?.data ?? []).find((p) => p.id === values.positionId)
      ?.title ?? '-';
  const seniorityName =
    (seniorityLevelsQuery.data ?? []).find((l) => l.id === values.seniorityLevelId)
      ?.name ?? '-';
  const disciplineName =
    disciplineOptions.find((d) => d.value === values.engineeringDisciplineId)
      ?.label ?? '-';
  const leavePolicyName =
    (leavePoliciesQuery.data ?? []).find((p) => p.id === values.leavePolicyId)
      ?.name ?? '-';
  const selectedWorkSchedule = (workSchedulesQuery.data ?? []).find(
    (schedule) => schedule.id === values.workScheduleId,
  );
  const workScheduleName = selectedWorkSchedule
    ? selectedWorkSchedule.isDefault
      ? `${selectedWorkSchedule.name} (${t('hr.workSchedule.defaultBadge')})`
      : selectedWorkSchedule.name
    : t('hr.workSchedule.noSchedule');

  const fullName = [values.firstName, values.middleName, values.lastName]
    .filter(Boolean)
    .join(' ');
  const initials =
    `${values.firstName?.charAt(0) ?? ''}${values.lastName?.charAt(0) ?? ''}`.toUpperCase();
  const hasEmail = Boolean(values.email?.trim());
  const accessMethod =
    values.accountAccessMethod === 'temporaryPassword'
      ? 'temporaryPassword'
      : 'invite';
  const emailDisplay = values.email?.trim() || t('users.noEmailNoLogin');
  const employeeIdDisplay =
    values.employeeId?.trim() || t('users.form.autoGenerated');
  const statusLabel = values.isActive
    ? t('users.statusActive')
    : t('users.statusInactive');
  const statusDot = values.isActive ? '#16a34a' : '#94a3b8';
  const address = formatEmployeeAddress(values) || '-';
  const emergencyContacts = values.emergencyContacts ?? [];

  const reviewHint =
    mode === 'edit'
      ? t('users.form.reviewEditHelp')
      : !hasEmail
        ? t('users.form.reviewRecordOnlyHelp')
        : accessMethod === 'temporaryPassword'
          ? t('users.form.reviewTemporaryPasswordHelp')
          : t('users.form.reviewInviteHelp');

  const photoPreviewUrl = useMemo(
    () => (pendingPhoto ? URL.createObjectURL(pendingPhoto) : null),
    [pendingPhoto],
  );

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const emergencyRows: EmergencyContactRow[] = emergencyContacts.map(
    (contact, index) => ({
      key: index,
      firstName: contact.firstName?.trim() || '-',
      middleName: contact.middleName?.trim() || '-',
      lastName: contact.lastName?.trim() || '-',
      phone: contact.phone?.trim() || '-',
      email: contact.email?.trim() || '-',
    }),
  );

  const emergencyColumns: ColumnsType<EmergencyContactRow> = [
    {
      title: t('common.name'),
      key: 'name',
      render: (_: unknown, row: EmergencyContactRow) => {
        const name = [row.firstName, row.middleName, row.lastName]
          .filter((part) => part && part !== '-')
          .join(' ');
        if (!name) {
          return <span className="erp-users-dash">-</span>;
        }
        return (
          <div className="min-w-0">
            <div className="erp-users-name">{name}</div>
            {row.email !== '-' ? (
              <div className="erp-users-email mt-0.5">{row.email}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('users.form.emergencyContactPhone'),
      dataIndex: 'phone',
      key: 'phone',
      width: 160,
      render: (value: string) =>
        value === '-' ? (
          <span className="erp-users-dash">-</span>
        ) : (
          <span className="erp-users-cell-strong">{value}</span>
        ),
    },
    {
      title: t('users.form.emergencyContactEmail'),
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (value: string) =>
        value === '-' ? (
          <span className="erp-users-dash">-</span>
        ) : (
          <span className="erp-users-email">{value}</span>
        ),
    },
  ];

  return (
    <div className="erp-employee-review">
      <div className="erp-review-notice">{reviewHint}</div>

      {mode === 'create' && hasEmail ? (
        <section className="erp-review-section">
          <div className="erp-review-section-header">
            <h3 className="erp-review-section-title">
              {t('users.form.accountAccessMethod')}
            </h3>
          </div>
          <div className="erp-review-section-body">
            <Form.Item name="accountAccessMethod" className="mb-0">
              <Radio.Group className="flex flex-col gap-2">
                <Radio value="invite">
                  <span className="erp-users-cell-strong">
                    {t('users.form.accessInvite')}
                  </span>
                  <span className="erp-users-cell-sub ml-2">
                    {t('users.form.accessInviteHint')}
                  </span>
                </Radio>
                <Radio value="temporaryPassword">
                  <span className="erp-users-cell-strong">
                    {t('users.form.accessTemporaryPassword')}
                  </span>
                  <span className="erp-users-cell-sub ml-2">
                    {t('users.form.accessTemporaryPasswordHint')}
                  </span>
                </Radio>
              </Radio.Group>
            </Form.Item>
          </div>
        </section>
      ) : null}

      <div className="erp-pro-card erp-review-identity">
        <div className="erp-review-identity-body">
          <Avatar
            size={72}
            shape="square"
            className="erp-users-avatar erp-review-avatar"
            src={photoPreviewUrl ?? undefined}
            icon={!photoPreviewUrl && !initials ? <UserOutlined /> : undefined}
            style={{
              backgroundColor: photoPreviewUrl
                ? undefined
                : tokens.colorPrimaryLight,
              color: tokens.colorPrimary,
              fontSize: 22,
              fontWeight: 650,
            }}
          >
            {initials}
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="erp-users-id-chip">{employeeIdDisplay}</span>
              <span className="erp-users-status">
                <span
                  aria-hidden
                  className="erp-users-status-dot"
                  style={{ background: statusDot }}
                />
                {statusLabel}
              </span>
              {primaryRoleName ? (
                <Tag
                  color={getRoleColor(primaryRoleName)}
                  className="m-0"
                  style={{ fontWeight: 600 }}
                >
                  {formatRoleDisplayName(primaryRoleName)}
                </Tag>
              ) : null}
              {mode === 'create' ? (
                <span className="erp-users-role-tag">
                  {!hasEmail
                    ? t('users.createUser')
                    : accessMethod === 'temporaryPassword'
                      ? t('users.form.accessTemporaryPassword')
                      : t('users.sendInvitation')}
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <h2 className="erp-users-name m-0 text-[22px] leading-tight">
                {fullName || '-'}
              </h2>
              {values.chineseName ? (
                <span className="erp-users-name-alt">{values.chineseName}</span>
              ) : null}
            </div>
            <p className="erp-users-email m-0 mt-1.5">{emailDisplay}</p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[positionName !== '-' ? positionName : null, departmentName !== '-' ? departmentName : null]
                .filter(Boolean)
                .join(' · ') || '-'}
            </p>
          </div>
        </div>

        <div className="erp-review-meta-bar">
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('common.department')}</p>
              <p className="erp-employee-meta-value">{departmentName}</p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('common.position')}</p>
              <p className="erp-employee-meta-value">{positionName}</p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('users.form.reportsTo')}</p>
              <p className="erp-employee-meta-value">{reportsToName}</p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('users.form.phone')}</p>
              <p className="erp-employee-meta-value">
                {values.phone?.trim() || '-'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="erp-review-grid">
        <ReviewSection title={t('users.sectionAccountAccess')}>
          <div className="erp-review-fields">
            <ReviewField label={t('users.form.email')} value={emailDisplay} />
            {values.loginName?.trim() ? (
              <ReviewField
                label={t('users.loginName')}
                value={values.loginName.trim()}
              />
            ) : null}
            <ReviewField
              label={t('users.form.phone')}
              value={values.phone?.trim() || '-'}
            />
            <ReviewField
              label={t('users.form.secondaryPhone')}
              value={values.secondaryPhone?.trim() || '-'}
            />
            <div className="erp-review-field erp-review-field--wide">
              <p className="erp-review-field-label">{t('users.form.roles')}</p>
              {roleAssignments.length === 0 ? (
                <ReviewValue value="-" />
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {roleAssignments.map((assignment) => (
                    <Tag
                      key={assignment.roleId}
                      color={getRoleColor(assignment.roleName)}
                      style={{
                        margin: 0,
                        fontWeight: assignment.isPrimary ? 600 : 400,
                      }}
                    >
                      {formatRoleDisplayName(assignment.roleName)}
                      {assignment.isPrimary ? ' ★' : ''}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
            <ReviewField
              label={t('users.form.activeAccount')}
              value={
                values.isActive ? t('common.active') : t('common.inactive')
              }
            />
            {values.excludedFromHrProcesses ? (
              <ReviewField
                label={t('users.approverOnlySwitch')}
                value={
                  values.excludedReason?.trim()
                    ? `${t('common.yes')} - ${values.excludedReason.trim()}`
                    : t('common.yes')
                }
              />
            ) : null}
          </div>
        </ReviewSection>

        <ReviewSection title={t('users.reviewPersonalContact')}>
          <ReviewSubsection title={t('users.sectionPersonalInformation')}>
            <div className="erp-review-fields">
              <ReviewField
                label={t('users.form.gender')}
                value={values.gender ? t(`hr.gender.${values.gender}`) : '-'}
              />
              <ReviewField
                label={t('users.form.dateOfBirth')}
                value={
                  values.dateOfBirth
                    ? dayjs(values.dateOfBirth).format('YYYY-MM-DD')
                    : '-'
                }
              />
              <ReviewField
                label={t('users.form.nationality')}
                value={
                  values.nationality
                    ? t(`hr.nationality.${values.nationality}`)
                    : '-'
                }
              />
              <ReviewField
                label={t('users.form.nationalId')}
                value={values.nationalId?.trim() || '-'}
              />
            </div>
          </ReviewSubsection>
          <ReviewSubsection title={t('users.sectionAddress')}>
            <div className="erp-review-fields">
              <ReviewField
                label={t('users.form.addressCountry')}
                value={values.addressCountry?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.addressRegion')}
                value={values.addressRegion?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.addressCity')}
                value={values.addressCity?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.addressSubcity')}
                value={values.addressSubcity?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.addressWoreda')}
                value={values.addressWoreda?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.addressHouseNumber')}
                value={values.addressHouseNumber?.trim() || '-'}
              />
              <ReviewField
                label={t('users.detailFullAddress')}
                value={address}
                wide
              />
            </div>
          </ReviewSubsection>
        </ReviewSection>

        <ReviewSection title={t('users.reviewEmploymentCompensation')}>
          <ReviewSubsection title={t('users.sectionEmploymentDetails')}>
            <div className="erp-review-fields">
              <ReviewField
                label={t('users.form.employeeId')}
                value={employeeIdDisplay}
              />
              <ReviewField
                label={t('users.form.employeeType')}
                value={
                  values.employeeType
                    ? t(`hr.employeeType.${values.employeeType}`)
                    : '-'
                }
              />
              <ReviewField
                label={t('users.form.employmentDate')}
                value={
                  values.employmentDate
                    ? dayjs(values.employmentDate).format('YYYY-MM-DD')
                    : '-'
                }
              />
            </div>
          </ReviewSubsection>
          <ReviewSubsection title={t('users.sectionOrganizationAssignment')}>
            <div className="erp-review-fields">
              <ReviewField
                label={t('users.form.department')}
                value={departmentName}
              />
              <ReviewField
                label={t('users.form.position')}
                value={positionName}
              />
              <ReviewField
                label={t('users.form.seniority')}
                value={seniorityName}
              />
              <ReviewField
                label={t('users.form.discipline')}
                value={disciplineName}
              />
              <ReviewField
                label={t('users.form.reportsTo')}
                value={reportsToName}
                wide
              />
            </div>
          </ReviewSubsection>
          <ReviewSubsection title={t('users.sectionPayrollDetails')}>
            <div className="erp-review-fields">
              <ReviewField
                label={t('users.form.includeInPayroll')}
                value={
                  values.includeInPayroll ?? true
                    ? t('common.yes')
                    : t('common.no')
                }
              />
              <ReviewField
                label={t('users.form.attendanceMode')}
                value={
                  (values.attendanceMode ?? 'SCANNER') === 'EXEMPT'
                    ? t('users.form.attendanceModeExempt')
                    : t('users.form.attendanceModeScanner')
                }
              />
              <ReviewField
                label={t('users.form.bankName')}
                value={values.bankName?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.bankBranch')}
                value={values.bankBranch?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.bankAccountNumber')}
                value={values.bankAccountNumber?.trim() || '-'}
              />
              <ReviewField
                label={t('users.form.tin')}
                value={values.tin?.trim() || '-'}
              />
            </div>
          </ReviewSubsection>
        </ReviewSection>

        <ReviewSection title={t('users.sectionEducationExperience')}>
          <div className="erp-review-fields">
            <ReviewField
              label={t('users.form.educationLevel')}
              value={
                values.educationLevel
                  ? t(`hr.educationLevel.${values.educationLevel}`)
                  : '-'
              }
            />
            <ReviewField
              label={t('users.form.fieldOfStudy')}
              value={values.fieldOfStudy?.trim() || '-'}
            />
            <ReviewField
              label={t('users.form.yearsOfExperience')}
              value={
                values.yearsOfExperience != null
                  ? t('users.yearsValue', { years: values.yearsOfExperience })
                  : '-'
              }
            />
          </div>
        </ReviewSection>

        <ReviewSection title={t('users.sectionLeavePolicy')}>
          <div className="erp-review-fields">
            <ReviewField
              label={t('users.form.leavePolicy')}
              value={leavePolicyName}
            />
            <ReviewField
              label={t('users.form.workSchedule')}
              value={workScheduleName}
            />
          </div>
        </ReviewSection>

        <ReviewSection title={t('users.form.profileDocuments')}>
          <div className="erp-review-fields">
            <ReviewField
              label={t('users.profilePhoto')}
              value={
                pendingPhoto
                  ? pendingPhoto.name
                  : t('users.form.noPhotoSelected')
              }
            />
            <ReviewField
              label={t('users.form.profileDocuments')}
              value={
                pendingDocuments.length > 0
                  ? t('users.form.documentsCount', {
                      count: pendingDocuments.length,
                    })
                  : t('users.form.noDocumentsSelected')
              }
            />
          </div>
          {pendingDocuments.length > 0 ? (
            <ul className="erp-review-doc-list">
              {pendingDocuments.map((doc, index) => (
                <li
                  key={`${doc.file.name}-${index}`}
                  className="erp-review-doc-item"
                >
                  <ProfileFileTypeIcon
                    name={doc.file.name}
                    fileType={doc.file.type}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="erp-users-cell-strong block truncate">
                      {doc.file.name}
                    </span>
                    <span className="erp-users-cell-sub block">
                      {doc.label
                        ? `${doc.label} · ${profileFileMetaLine(doc.file.name, doc.file.type, doc.file.size)}`
                        : profileFileMetaLine(
                            doc.file.name,
                            doc.file.type,
                            doc.file.size,
                          )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </ReviewSection>
      </div>

      <ReviewSection
        title={t('users.sectionEmergencyContact')}
        count={emergencyContacts.length}
        flush
      >
        <DataTable<EmergencyContactRow>
          rowKey="key"
          className="erp-pro-table erp-users-table erp-employee-review-table"
          size="middle"
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={emergencyColumns}
          dataSource={emergencyRows}
          locale={{
            emptyText: (
              <div className="erp-emergency-contacts__empty border-0 py-8">
                {t('users.form.noEmergencyContacts')}
              </div>
            ),
          }}
        />
      </ReviewSection>
    </div>
  );
}
