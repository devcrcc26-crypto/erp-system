'use client';

import { DatePicker, Form, Input, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useLeavePolicies } from '@/lib/query/leave-policies';
import type {
  CreateUserRequest,
  EducationLevel,
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
  addressHouseNumber?: string;
  gender?: Gender;
  dateOfBirth?: Dayjs;
  nationalId?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  experienceStartDate?: Dayjs;
  emergencyContactFirstName?: string;
  emergencyContactMiddleName?: string;
  emergencyContactLastName?: string;
  emergencyContactPhone?: string;
  emergencyContactEmail?: string;
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
}

export function EmployeeProfileFormFields({
  mode,
  employeeIdReadOnly = false,
  sections,
  showSectionTitles = true,
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

  const sectionTitle = (key: string): React.ReactNode =>
    showSectionTitles ? (
      <div className="mb-2 mt-2 text-sm font-semibold text-slate-700">{t(key)}</div>
    ) : null;

  return (
    <>
      {show('personal') ? (
        <>
          {sectionTitle('users.sectionPersonalInformation')}
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item label={t('users.form.dateOfBirth')} name="dateOfBirth">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('users.form.nationalId')} name="nationalId">
              <Input />
            </Form.Item>
          </div>
        </>
      ) : null}

      {show('address') ? (
        <>
          {sectionTitle('users.sectionAddress')}
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item label={t('users.form.addressCountry')} name="addressCountry">
              <Input />
            </Form.Item>
            <Form.Item label={t('users.form.addressRegion')} name="addressRegion">
              <Input />
            </Form.Item>
          </div>
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item label={t('users.form.addressCity')} name="addressCity">
              <Input />
            </Form.Item>
            <Form.Item label={t('users.form.addressSubcity')} name="addressSubcity">
              <Input />
            </Form.Item>
          </div>
          <Form.Item label={t('users.form.addressHouseNumber')} name="addressHouseNumber">
            <Input />
          </Form.Item>
        </>
      ) : null}

      {show('emergency') ? (
        <>
          {sectionTitle('users.sectionEmergencyContact')}
          <div className="grid gap-0 md:grid-cols-3 md:gap-x-4">
            <Form.Item
              label={t('users.form.emergencyContactFirstName')}
              name="emergencyContactFirstName"
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('users.form.emergencyContactMiddleName')}
              name="emergencyContactMiddleName"
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t('users.form.emergencyContactLastName')}
              name="emergencyContactLastName"
            >
              <Input />
            </Form.Item>
          </div>
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
            <Form.Item
              label={t('users.form.emergencyContactPhone')}
              name="emergencyContactPhone"
            >
              <Input type="tel" />
            </Form.Item>
            <Form.Item
              label={t('users.form.emergencyContactEmail')}
              name="emergencyContactEmail"
              normalize={(value: string) => value?.trim() ?? ''}
              rules={[
                {
                  validator: async (_rule, value: string | undefined) => {
                    const trimmed = value?.trim() ?? '';
                    if (!trimmed) {
                      return;
                    }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                      throw new Error(t('common.invalidEmail'));
                    }
                  },
                },
              ]}
            >
              <Input type="email" />
            </Form.Item>
          </div>
        </>
      ) : null}

      {show('employment') ? (
        <>
          {sectionTitle('users.sectionEmploymentDetails')}
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
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
          </div>
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
        </>
      ) : null}

      {show('education') ? (
        <>
          {sectionTitle('users.sectionEducationExperience')}
          <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
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
          </div>
          <Form.Item label={t('users.form.experienceStartDate')} name="experienceStartDate">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          {yearsOfExperience !== null ? (
            <span className="mb-4 block text-sm text-gray-500">
              {t('users.form.yearsOfExperience')}: {yearsOfExperience}
            </span>
          ) : null}
        </>
      ) : null}

      {show('leave') ? (
        <>
          {sectionTitle('users.sectionLeavePolicy')}
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
        </>
      ) : null}
    </>
  );
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
  | 'addressHouseNumber'
  | 'gender'
  | 'dateOfBirth'
  | 'nationalId'
  | 'nationality'
  | 'employeeType'
  | 'educationLevel'
  | 'fieldOfStudy'
  | 'experienceStartDate'
  | 'emergencyContactFirstName'
  | 'emergencyContactMiddleName'
  | 'emergencyContactLastName'
  | 'emergencyContactPhone'
  | 'emergencyContactEmail'
  | 'leavePolicyId'
> {
  return {
    employeeId: values.employeeId?.trim() || undefined,
    middleName: values.middleName?.trim() || undefined,
    addressCountry: values.addressCountry?.trim() || undefined,
    addressRegion: values.addressRegion?.trim() || undefined,
    addressCity: values.addressCity?.trim() || undefined,
    addressSubcity: values.addressSubcity?.trim() || undefined,
    addressHouseNumber: values.addressHouseNumber?.trim() || undefined,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth?.format('YYYY-MM-DD'),
    nationalId: values.nationalId?.trim() || undefined,
    nationality: values.nationality,
    employeeType: values.employeeType,
    educationLevel: values.educationLevel,
    fieldOfStudy: values.fieldOfStudy?.trim() || undefined,
    experienceStartDate: values.experienceStartDate?.format('YYYY-MM-DD'),
    emergencyContactFirstName: values.emergencyContactFirstName?.trim() || undefined,
    emergencyContactMiddleName: values.emergencyContactMiddleName?.trim() || undefined,
    emergencyContactLastName: values.emergencyContactLastName?.trim() || undefined,
    emergencyContactPhone: values.emergencyContactPhone?.trim() || undefined,
    emergencyContactEmail: values.emergencyContactEmail?.trim() || undefined,
    leavePolicyId: values.leavePolicyId,
  };
}

export function employeeProfileInitialValues(user?: User | null): EmployeeProfileFormValues {
  if (!user) {
    return {};
  }
  return {
    employeeId: user.employeeId ?? undefined,
    middleName: user.middleName ?? undefined,
    addressCountry: user.addressCountry ?? undefined,
    addressRegion: user.addressRegion ?? undefined,
    addressCity: user.addressCity ?? undefined,
    addressSubcity: user.addressSubcity ?? undefined,
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
    emergencyContactFirstName: user.emergencyContactFirstName ?? undefined,
    emergencyContactMiddleName: user.emergencyContactMiddleName ?? undefined,
    emergencyContactLastName: user.emergencyContactLastName ?? undefined,
    emergencyContactPhone: user.emergencyContactPhone ?? undefined,
    emergencyContactEmail: user.emergencyContactEmail ?? undefined,
    leavePolicyId: user.leavePolicyId ?? undefined,
  };
}

export function formatEmployeeAddress(values: Pick<
  EmployeeProfileFormValues,
  | 'addressCountry'
  | 'addressRegion'
  | 'addressCity'
  | 'addressSubcity'
  | 'addressHouseNumber'
>): string {
  return [
    values.addressCountry,
    values.addressRegion,
    values.addressCity,
    values.addressSubcity,
    values.addressHouseNumber,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

export function formatEmergencyContactName(values: Pick<
  EmployeeProfileFormValues,
  | 'emergencyContactFirstName'
  | 'emergencyContactMiddleName'
  | 'emergencyContactLastName'
>): string {
  return [
    values.emergencyContactFirstName,
    values.emergencyContactMiddleName,
    values.emergencyContactLastName,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}
