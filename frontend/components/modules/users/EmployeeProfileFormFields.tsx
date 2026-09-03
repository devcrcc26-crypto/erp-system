'use client';

import { DatePicker, Form, Input, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo } from 'react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import EmergencyContactsField, {
  normalizeEmergencyContacts,
} from '@/components/modules/users/EmergencyContactsField';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useLeavePolicies } from '@/lib/query/leave-policy';
import type {
  CreateUserRequest,
  EducationLevel,
  EmergencyContact,
  EmployeeType,
  Gender,
  Nationality,
  User,
} from '@/lib/api/types';

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
  nationality?: Nationality;
  employeeType?: EmployeeType;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  experienceStartDate?: Dayjs;
  emergencyContacts?: EmergencyContact[];
  leavePolicyId?: string;
}

export const GENDER_OPTIONS: Gender[] = ['MALE', 'FEMALE'];
const NATIONALITY_OPTIONS: Nationality[] = ['ETHIOPIAN', 'CHINESE'];
const EMPLOYEE_TYPE_OPTIONS: EmployeeType[] = ['PERMANENT', 'CONTRACT', 'TEMPORARY'];
const EDUCATION_LEVEL_OPTIONS: EducationLevel[] = [
  'PHD',
  'MSC',
  'BSC',
  'DIPLOMA',
  'CERTIFICATE',
  'OTHER',
];

export type EmployeeProfileSection =
  | 'personal'
  | 'address'
  | 'emergency'
  | 'employment'
  | 'education'
  | 'leave';

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
  const leavePoliciesQuery = useLeavePolicies();
  const experienceStartDate = Form.useWatch('experienceStartDate') as Dayjs | undefined;

  const leavePolicyOptions = useMemo(
    () =>
      (leavePoliciesQuery.data ?? []).map((policy) => ({
        value: policy.id,
        label: policy.name,
      })),
    [leavePoliciesQuery.data],
  );

  const yearsOfExperience =
    experienceStartDate && dayjs.isDayjs(experienceStartDate)
      ? dayjs().diff(experienceStartDate, 'year')
      : null;

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
            <Form.Item label={t('users.form.dateOfBirth')} name="dateOfBirth">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('users.form.nationalId')} name="nationalId">
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
            <Form.Item label={t('users.form.addressCountry')} name="addressCountry">
              <Input />
            </Form.Item>
            <Form.Item label={t('users.form.addressRegion')} name="addressRegion">
              <Input />
            </Form.Item>
            <Form.Item label={t('users.form.addressCity')} name="addressCity">
              <Input />
            </Form.Item>
          </div>
          <div className="erp-form-grid-3">
            <Form.Item label={t('users.form.addressSubcity')} name="addressSubcity">
              <Input />
            </Form.Item>
            <Form.Item label={t('users.form.addressWoreda')} name="addressWoreda">
              <Input />
            </Form.Item>
            <Form.Item label={t('users.form.addressHouseNumber')} name="addressHouseNumber">
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
            <Form.Item label={t('users.form.nationality')} name="nationality">
              <Select
                allowClear
                placeholder={t('common.select')}
                options={NATIONALITY_OPTIONS.map((value) => ({
                  value,
                  label: t(`hr.nationality.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item label={t('users.form.employeeType')} name="employeeType">
              <Select
                allowClear
                placeholder={t('common.select')}
                options={EMPLOYEE_TYPE_OPTIONS.map((value) => ({
                  value,
                  label: t(`hr.employeeType.${value}`),
                }))}
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
                placeholder={t('common.select')}
                options={EDUCATION_LEVEL_OPTIONS.map((value) => ({
                  value,
                  label: t(`hr.educationLevel.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item label={t('users.form.fieldOfStudy')} name="fieldOfStudy">
              <Input placeholder={t('users.form.fieldOfStudyPlaceholder')} />
            </Form.Item>
            <Form.Item label={t('users.form.experienceStartDate')} name="experienceStartDate">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          {yearsOfExperience !== null ? (
            <span className="mb-4 block text-sm text-gray-500">
              {t('users.form.yearsOfExperience')}: {yearsOfExperience}
            </span>
          ) : null}
        </SectionShell>
      ) : null}

      {show('leave') ? (
        <SectionShell
          titleKey="users.sectionLeavePolicy"
          layout={layout}
          showSectionTitles={showSectionTitles}
          t={t}
        >
          <div className="erp-form-grid-3">
            <Form.Item label={t('users.form.leavePolicy')} name="leavePolicyId">
              <Select
                allowClear
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
          </div>
        </SectionShell>
      ) : null}
    </>
  );

  if (layout === 'sections') {
    return <div className="flex flex-col gap-6">{content}</div>;
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
  | 'nationality'
  | 'employeeType'
  | 'educationLevel'
  | 'fieldOfStudy'
  | 'experienceStartDate'
  | 'emergencyContacts'
  | 'leavePolicyId'
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
    nationality: values.nationality,
    employeeType: values.employeeType,
    educationLevel: values.educationLevel,
    fieldOfStudy: values.fieldOfStudy?.trim() || undefined,
    experienceStartDate: formatFormDate(values.experienceStartDate),
    emergencyContacts: normalizeEmergencyContacts(values.emergencyContacts),
    leavePolicyId: values.leavePolicyId,
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
    return { emergencyContacts: [] };
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
    nationality: user.nationality ?? undefined,
    employeeType: user.employeeType ?? undefined,
    educationLevel: user.educationLevel ?? undefined,
    fieldOfStudy: user.fieldOfStudy ?? undefined,
    experienceStartDate: user.experienceStartDate
      ? dayjs(user.experienceStartDate)
      : undefined,
    emergencyContacts: parseEmergencyContacts(user.emergencyContacts),
    leavePolicyId: user.leavePolicyId ?? undefined,
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
