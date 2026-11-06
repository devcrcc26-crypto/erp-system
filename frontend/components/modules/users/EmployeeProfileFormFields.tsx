'use client';

import { Checkbox, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import { useCanEditHr } from '@/hooks/use-auth-capabilities';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo } from 'react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FormFieldGroupLabel from '@/components/modules/users/FormFieldGroupLabel';
import EmergencyContactsField, {
  normalizeEmergencyContacts,
} from '@/components/modules/users/EmergencyContactsField';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useLeavePolicies } from '@/lib/query/leave-policy';
import { useWorkScheduleList } from '@/lib/query/work-schedule';
import type {
  CreateUserRequest,
  EducationLevel,
  EmergencyContact,
  EmployeeType,
  Gender,
  Nationality,
  User,
} from '@/lib/api/types';
import {
  ADDRESS_MAX,
  HOUSE_NUMBER_MAX,
  addressFieldRules,
  dateOfBirthRules,
  disableExperienceDates,
  disableFutureDates,
  employeeIdRules,
  employmentDateRules,
  fieldOfStudyRules,
  nationalIdRules,
} from '@/lib/validation/user-fields';

export interface EmployeeProfileFormValues {
  employeeId?: string;
  middleName?: string;
  addressCountry?: string;
  addressRegion?: string;
  addressCity?: string;
  addressSubcity?: string;
  addressWoreda?: string;
  addressHouseNumber?: string;
  gender?: Gender;
  dateOfBirth?: Dayjs;
  nationalId?: string;
  tin?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  employmentDate?: Dayjs;
  /** Years of experience as of today (shown value; grows automatically). */
  yearsOfExperience?: number | null;
  /** Display only: when the stored value was recorded. Never sent. */
  yearsOfExperienceAsOf?: string;
  emergencyContacts?: EmergencyContact[];
  leavePolicyId?: string;
  workScheduleId?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  includeInPayroll?: boolean;
  attendanceMode?: 'SCANNER' | 'EXEMPT';
}

export const GENDER_OPTIONS: Gender[] = ['MALE', 'FEMALE'];
const NATIONALITY_OPTIONS: Nationality[] = ['ETHIOPIAN', 'CHINESE'];
const EMPLOYEE_TYPE_OPTIONS: EmployeeType[] = [
  'PERMANENT',
  'CONTRACT',
  'TEMPORARY',
  'FREELANCER',
];
export const EDUCATION_LEVEL_OPTIONS: EducationLevel[] = [
  'PHD',
  'MSC',
  'BSC',
  'DIPLOMA',
  'TECHNICIAN',
  'CERTIFICATE',
  'SECONDARY',
  'PRIMARY',
  'OTHER',
];

/** Upper bound for years of experience (matches the API). */
export const YEARS_OF_EXPERIENCE_MAX = 70;

export type EmployeeProfileSection =
  | 'personal'
  | 'address'
  | 'emergency'
  | 'employment'
  | 'education'
  | 'leave'
  | 'payroll';

interface EmployeeProfileFormFieldsProps {
  mode: 'create' | 'edit';
  employeeIdReadOnly?: boolean;
  sections?: EmployeeProfileSection[];
  showSectionTitles?: boolean;
  layout?: 'default' | 'sections';
}

function SectionShell({
  titleKey,
  layout,
  showSectionTitles,
  children,
  t,
}: {
  titleKey: string;
  layout: 'default' | 'sections';
  showSectionTitles: boolean;
  children: React.ReactNode;
  t: (key: string) => string;
}): React.ReactNode {
  if (layout === 'sections') {
    return <FormLayout title={t(titleKey)} variant="pro">{children}</FormLayout>;
  }

  return (
    <>
      {showSectionTitles ? (
        <div className="mb-2 mt-2 text-sm font-semibold text-slate-700">{t(titleKey)}</div>
      ) : null}
      {children}
    </>
  );
}

export function EmployeeProfileFormFields({
  mode,
  employeeIdReadOnly = false,
  sections,
  showSectionTitles = true,
  layout = 'default',
}: EmployeeProfileFormFieldsProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const canEditHr = useCanEditHr();
  const leavePoliciesQuery = useLeavePolicies();
  const workSchedulesQuery = useWorkScheduleList();
  // Display-only value with no Form.Item, so watch it from the store.
  const yearsOfExperienceAsOf = Form.useWatch('yearsOfExperienceAsOf', {
    preserve: true,
  }) as string | undefined;
  const dateOfBirth = Form.useWatch('dateOfBirth') as Dayjs | undefined;
  const selectedWorkScheduleId = Form.useWatch('workScheduleId') as string | undefined;

  const leavePolicyOptions = useMemo(
    () =>
      (leavePoliciesQuery.data ?? []).map((policy) => ({
        value: policy.id,
        label: policy.name,
      })),
    [leavePoliciesQuery.data],
  );

  const workScheduleOptions = useMemo(
    () =>
      (workSchedulesQuery.data ?? [])
        .filter(
          (schedule) => schedule.isActive || schedule.id === selectedWorkScheduleId,
        )
        .map((schedule) => ({
          value: schedule.id,
          label: schedule.isDefault
            ? `${schedule.name} (${t('hr.workSchedule.defaultBadge')})`
            : schedule.name,
        })),
    [workSchedulesQuery.data, selectedWorkScheduleId, t],
  );

  const visibleSections = sections ?? [
    'personal',
    'address',
    'emergency',
    'employment',
    'education',
    'leave',
  ];
  const show = (section: EmployeeProfileSection): boolean =>
    visibleSections.includes(section);

  const content = (
    <>
      {show('personal') ? (
        <SectionShell
          titleKey="users.sectionPersonalInformation"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <div className="erp-form-grid-3">
            <Form.Item
              label={t('users.form.dateOfBirth')}
              name="dateOfBirth"
              rules={dateOfBirthRules(t)}
            >
              <DatePicker className="!w-full" disabledDate={disableFutureDates} />
            </Form.Item>
            <Form.Item label={t('users.form.nationality')} name="nationality">
              <Select
                allowClear
                className="!w-full"
                placeholder={t('common.select')}
                options={NATIONALITY_OPTIONS.map((value) => ({
                  value,
                  label: t(`hr.nationality.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item
              label={t('users.form.nationalId')}
              name="nationalId"
              rules={nationalIdRules(t)}
            >
              <Input />
            </Form.Item>
          </div>
        </SectionShell>
      ) : null}

      {show('address') ? (
        <SectionShell
          titleKey="users.sectionAddress"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <div className="erp-form-grid-3">
            <Form.Item
              label={t('users.form.addressCountry')}
              name="addressCountry"
              rules={addressFieldRules(t, ADDRESS_MAX)}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('users.form.addressRegion')}
              name="addressRegion"
              rules={addressFieldRules(t, ADDRESS_MAX)}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('users.form.addressCity')}
              name="addressCity"
              rules={addressFieldRules(t, ADDRESS_MAX)}
            >
              <Input />
            </Form.Item>
          </div>
          <div className="erp-form-grid-3">
            <Form.Item
              label={t('users.form.addressSubcity')}
              name="addressSubcity"
              rules={addressFieldRules(t, ADDRESS_MAX)}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('users.form.addressWoreda')}
              name="addressWoreda"
              rules={addressFieldRules(t, ADDRESS_MAX)}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('users.form.addressHouseNumber')}
              name="addressHouseNumber"
              rules={addressFieldRules(t, HOUSE_NUMBER_MAX)}
            >
              <Input />
            </Form.Item>
          </div>
        </SectionShell>
      ) : null}

      {show('emergency') ? (
        <SectionShell
          titleKey="users.sectionEmergencyContact"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <EmergencyContactsField />
        </SectionShell>
      ) : null}

      {show('employment') ? (
        <SectionShell
          titleKey="users.sectionEmploymentDetails"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <div className="erp-form-grid-3">
            <Form.Item
              label={t('users.form.employeeId')}
              name="employeeId"
              rules={employeeIdRules(t)}
              extra={
                mode === 'create' && !employeeIdReadOnly
                  ? t('users.form.employeeIdAutoHint')
                  : undefined
              }
            >
              <Input
                readOnly={employeeIdReadOnly || mode === 'edit'}
                placeholder={mode === 'create' ? t('users.form.employeeIdPlaceholder') : undefined}
              />
            </Form.Item>
            <Form.Item label={t('users.form.employeeType')} name="employeeType">
              <Select
                allowClear
                className="!w-full"
                placeholder={t('common.select')}
                options={EMPLOYEE_TYPE_OPTIONS.map((value) => ({
                  value,
                  label: t(`hr.employeeType.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item
              label={t('users.form.employmentDate')}
              name="employmentDate"
              dependencies={['dateOfBirth']}
              rules={employmentDateRules(t)}
            >
              <DatePicker
                className="!w-full"
                disabledDate={disableExperienceDates(dateOfBirth)}
              />
            </Form.Item>
          </div>
        </SectionShell>
      ) : null}

      {show('education') ? (
        <SectionShell
          titleKey="users.sectionEducationExperience"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <div className="erp-form-grid-3">
            <Form.Item label={t('users.form.educationLevel')} name="educationLevel">
              <Select
                allowClear
                className="!w-full"
                placeholder={t('common.select')}
                options={EDUCATION_LEVEL_OPTIONS.map((value) => ({
                  value,
                  label: t(`hr.educationLevel.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item
              label={t('users.form.fieldOfStudy')}
              name="fieldOfStudy"
              rules={fieldOfStudyRules(t)}
            >
              <Input placeholder={t('users.form.fieldOfStudyPlaceholder')} />
            </Form.Item>
            <Form.Item
              label={t('users.form.yearsOfExperience')}
              name="yearsOfExperience"
              extra={
                yearsOfExperienceAsOf
                  ? t('users.form.yearsOfExperienceRecordedHint', {
                      date: dayjs(yearsOfExperienceAsOf).format('YYYY-MM-DD'),
                    })
                  : t('users.form.yearsOfExperienceHint')
              }
              rules={[
                {
                  type: 'number',
                  min: 0,
                  max: YEARS_OF_EXPERIENCE_MAX,
                  message: t('users.form.yearsOfExperienceInvalid', {
                    max: YEARS_OF_EXPERIENCE_MAX,
                  }),
                },
              ]}
            >
              <InputNumber
                min={0}
                max={YEARS_OF_EXPERIENCE_MAX}
                step={0.5}
                precision={1}
                className="!w-full"
                placeholder={t('users.form.yearsOfExperiencePlaceholder')}
              />
            </Form.Item>
          </div>
        </SectionShell>
      ) : null}

      {show('leave') ? (
        <SectionShell
          titleKey="users.sectionLeavePolicy"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <div className="erp-form-grid-2">
            <Form.Item label={t('users.form.leavePolicy')} name="leavePolicyId">
              <Select
                allowClear
                className="!w-full"
                loading={leavePoliciesQuery.isLoading}
                placeholder={
                  leavePolicyOptions.length === 0
                    ? t('users.form.noLeavePoliciesHint')
                    : t('common.select')
                }
                options={leavePolicyOptions}
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item
              label={t('users.form.workSchedule')}
              name="workScheduleId"
              extra={t('users.form.workScheduleHint')}
            >
              <Select
                allowClear={mode === 'create'}
                showSearch
                className="!w-full"
                loading={workSchedulesQuery.isLoading}
                placeholder={
                  workScheduleOptions.length === 0
                    ? t('users.form.noWorkSchedulesHint')
                    : t('hr.workSchedule.selectSchedule')
                }
                options={workScheduleOptions}
                optionFilterProp="label"
              />
            </Form.Item>
          </div>
        </SectionShell>
      ) : null}

      {show('payroll') ? (
        <SectionShell
          titleKey="users.sectionPayrollDetails"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <p className="erp-users-cell-sub mb-4 mt-0">
            {t('users.form.payrollDetailsHint')}
          </p>
          <FormFieldGroupLabel>{t('users.form.groupPayrollSettings')}</FormFieldGroupLabel>
          <div className="erp-form-grid-2">
            <Form.Item
              label={t('users.form.payrollInclusion')}
              name="includeInPayroll"
              valuePropName="checked"
              initialValue={true}
            >
              <Checkbox disabled={!canEditHr}>
                {t('users.form.includeInPayroll')}
              </Checkbox>
            </Form.Item>
            <Form.Item
              label={t('users.form.attendanceMode')}
              name="attendanceMode"
              initialValue="SCANNER"
              extra={t('users.form.attendanceModeHint')}
            >
              <Select
                disabled={!canEditHr}
                className="!w-full"
                options={[
                  {
                    value: 'SCANNER',
                    label: t('users.form.attendanceModeScanner'),
                  },
                  {
                    value: 'EXEMPT',
                    label: t('users.form.attendanceModeExempt'),
                  },
                ]}
              />
            </Form.Item>
          </div>
          <FormFieldGroupLabel divider>{t('users.form.groupBankTax')}</FormFieldGroupLabel>
          <div className="erp-form-grid-2">
            <Form.Item label={t('users.form.bankName')} name="bankName">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item label={t('users.form.bankBranch')} name="bankBranch">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item
              label={t('users.form.bankAccountNumber')}
              name="bankAccountNumber"
            >
              <Input maxLength={64} autoComplete="off" />
            </Form.Item>
            <Form.Item
              label={t('users.form.tin')}
              name="tin"
              extra={t('users.form.tinHint')}
              rules={[
                {
                  validator: async (_, value: string | undefined) => {
                    const trimmed = value?.trim() ?? '';
                    if (!trimmed) {
                      return;
                    }
                    if (!/^\d{10}$/.test(trimmed)) {
                      throw new Error(t('users.form.tinInvalid'));
                    }
                  },
                },
              ]}
            >
              <Input maxLength={10} autoComplete="off" placeholder="0000000000" />
            </Form.Item>
          </div>
        </SectionShell>
      ) : null}
    </>
  );

  if (layout === 'sections') {
    return <div className="erp-employee-form-sections">{content}</div>;
  }

  return content;
}

/** Ant Design may return ISO strings for DatePicker values after step unmount. */
function formatFormDate(value: Dayjs | string | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value.format('YYYY-MM-DD') : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = dayjs(trimmed);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : trimmed;
  }
  return undefined;
}

export function buildEmployeeProfilePayload(
  values: EmployeeProfileFormValues,
): Pick<
  CreateUserRequest,
  | 'employeeId'
  | 'middleName'
  | 'addressCountry'
  | 'addressRegion'
  | 'addressCity'
  | 'addressSubcity'
  | 'addressWoreda'
  | 'addressHouseNumber'
  | 'gender'
  | 'dateOfBirth'
  | 'nationalId'
  | 'tin'
  | 'nationality'
  | 'employeeType'
  | 'educationLevel'
  | 'fieldOfStudy'
  | 'employmentDate'
  | 'yearsOfExperience'
  | 'emergencyContacts'
  | 'leavePolicyId'
  | 'workScheduleId'
  | 'bankName'
  | 'bankBranch'
  | 'bankAccountNumber'
  | 'includeInPayroll'
  | 'attendanceMode'
> {
  return {
    employeeId: values.employeeId?.trim() || undefined,
    middleName: values.middleName?.trim() || undefined,
    addressCountry: values.addressCountry?.trim() || undefined,
    addressRegion: values.addressRegion?.trim() || undefined,
    addressCity: values.addressCity?.trim() || undefined,
    addressSubcity: values.addressSubcity?.trim() || undefined,
    addressWoreda: values.addressWoreda?.trim() || undefined,
    addressHouseNumber: values.addressHouseNumber?.trim() || undefined,
    gender: values.gender,
    dateOfBirth: formatFormDate(values.dateOfBirth),
    nationalId: values.nationalId?.trim() || undefined,
    tin: values.tin?.trim() || undefined,
    nationality: values.nationality,
    employeeType: values.employeeType,
    educationLevel: values.educationLevel,
    fieldOfStudy: values.fieldOfStudy?.trim() || undefined,
    employmentDate: formatFormDate(values.employmentDate),
    // null clears; the API keeps the as-of date when the shown value is unchanged.
    yearsOfExperience: values.yearsOfExperience ?? null,
    emergencyContacts: normalizeEmergencyContacts(values.emergencyContacts),
    leavePolicyId: values.leavePolicyId,
    workScheduleId: values.workScheduleId,
    bankName: values.bankName?.trim() || undefined,
    bankBranch: values.bankBranch?.trim() || undefined,
    bankAccountNumber: values.bankAccountNumber?.trim() || undefined,
    includeInPayroll: values.includeInPayroll ?? true,
    attendanceMode: values.attendanceMode ?? 'SCANNER',
  };
}

function parseEmergencyContacts(value: User['emergencyContacts']): EmergencyContact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is EmergencyContact =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as EmergencyContact).firstName === 'string' &&
      typeof (item as EmergencyContact).lastName === 'string',
  );
}

export function employeeProfileInitialValues(user?: User | null): EmployeeProfileFormValues {
  if (!user) {
    return {
      emergencyContacts: [],
      includeInPayroll: true,
      attendanceMode: 'SCANNER',
    };
  }
  return {
    employeeId: user.employeeId ?? undefined,
    middleName: user.middleName ?? undefined,
    addressCountry: user.addressCountry ?? undefined,
    addressRegion: user.addressRegion ?? undefined,
    addressCity: user.addressCity ?? undefined,
    addressSubcity: user.addressSubcity ?? undefined,
    addressWoreda: user.addressWoreda ?? undefined,
    addressHouseNumber: user.addressHouseNumber ?? undefined,
    gender: user.gender ?? undefined,
    dateOfBirth: user.dateOfBirth ? dayjs(user.dateOfBirth) : undefined,
    nationalId: user.nationalId ?? undefined,
    tin: user.tin ?? undefined,
    nationality: user.nationality ?? undefined,
    employeeType: user.employeeType ?? undefined,
    educationLevel: user.educationLevel ?? undefined,
    fieldOfStudy: user.fieldOfStudy ?? undefined,
    employmentDate: user.employmentDate ? dayjs(user.employmentDate) : undefined,
    yearsOfExperience: user.yearsOfExperience ?? undefined,
    yearsOfExperienceAsOf: user.yearsOfExperienceAsOf ?? undefined,
    emergencyContacts: parseEmergencyContacts(user.emergencyContacts),
    leavePolicyId: user.leavePolicyId ?? undefined,
    workScheduleId: user.workScheduleId ?? undefined,
    bankName: user.bankName ?? undefined,
    bankBranch: user.bankBranch ?? undefined,
    bankAccountNumber: user.bankAccountNumber ?? undefined,
    includeInPayroll: user.includeInPayroll ?? true,
    attendanceMode: user.attendanceMode ?? 'SCANNER',
  };
}

export function formatEmployeeAddress(values: Pick<
  EmployeeProfileFormValues,
  | 'addressCountry'
  | 'addressRegion'
  | 'addressCity'
  | 'addressSubcity'
  | 'addressWoreda'
  | 'addressHouseNumber'
>): string {
  return [
    values.addressCountry,
    values.addressRegion,
    values.addressCity,
    values.addressSubcity,
    values.addressWoreda,
    values.addressHouseNumber,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}
