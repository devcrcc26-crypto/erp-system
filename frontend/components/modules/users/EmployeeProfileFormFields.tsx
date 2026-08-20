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
  address?: string;
  gender?: Gender;
  dateOfBirth?: Dayjs;
  nationalId?: string;
  nationality?: Nationality;
  employeeType?: EmployeeType;
  educationLevel?: EducationLevel;
  fieldOfStudy?: string;
  experienceStartDate?: Dayjs;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  leavePolicyId?: string;
}

const GENDER_OPTIONS: Gender[] = ['MALE', 'FEMALE'];
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

interface EmployeeProfileFormFieldsProps {
  mode: 'create' | 'edit';
  employeeIdReadOnly?: boolean;
}

export function EmployeeProfileFormFields({
  mode,
  employeeIdReadOnly = false,
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

  return (
    <>
      <div className="mb-2 mt-2 text-sm font-semibold text-slate-700">
        {t('users.sectionPersonalInformation')}
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
        <Form.Item label={t('hr.labels.middleName')} name="middleName">
          <Input />
        </Form.Item>
        <Form.Item label={t('users.genderLabel')} name="gender">
          <Select
            allowClear
            placeholder={t('common.select')}
            options={GENDER_OPTIONS.map((value) => ({
              value,
              label: t(`hr.gender.${value}`),
            }))}
          />
        </Form.Item>
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
        <Form.Item label={t('hr.labels.dateOfBirth')} name="dateOfBirth">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label={t('hr.labels.nationalId')} name="nationalId">
          <Input />
        </Form.Item>
      </div>
      <Form.Item label={t('hr.labels.address')} name="address">
        <Input.TextArea rows={2} />
      </Form.Item>

      <div className="mb-2 mt-4 text-sm font-semibold text-slate-700">
        {t('users.sectionEmergencyContact')}
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
        <Form.Item
          label={t('hr.labels.emergencyContactName')}
          name="emergencyContactName"
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={t('hr.labels.emergencyContactPhone')}
          name="emergencyContactPhone"
        >
          <Input type="tel" />
        </Form.Item>
      </div>

      <div className="mb-2 mt-4 text-sm font-semibold text-slate-700">
        {t('users.sectionEmploymentDetails')}
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
        <Form.Item
          label={t('hr.labels.employeeId')}
          name="employeeId"
          extra={
            mode === 'create' && !employeeIdReadOnly
              ? t('users.employeeIdAutoHint')
              : undefined
          }
        >
          <Input
            readOnly={employeeIdReadOnly || mode === 'edit'}
            placeholder={mode === 'create' ? t('users.employeeIdPlaceholder') : undefined}
          />
        </Form.Item>
        <Form.Item label={t('hr.labels.nationality')} name="nationality">
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
      <Form.Item label={t('hr.labels.employeeType')} name="employeeType">
        <Select
          allowClear
          placeholder={t('common.select')}
          options={EMPLOYEE_TYPE_OPTIONS.map((value) => ({
            value,
            label: t(`hr.employeeType.${value}`),
          }))}
        />
      </Form.Item>

      <div className="mb-2 mt-4 text-sm font-semibold text-slate-700">
        {t('users.sectionEducationExperience')}
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:gap-x-4">
        <Form.Item label={t('hr.labels.educationLevel')} name="educationLevel">
          <Select
            allowClear
            placeholder={t('common.select')}
            options={EDUCATION_LEVEL_OPTIONS.map((value) => ({
              value,
              label: t(`hr.educationLevel.${value}`),
            }))}
          />
        </Form.Item>
        <Form.Item label={t('hr.labels.fieldOfStudy')} name="fieldOfStudy">
          <Input placeholder={t('users.fieldOfStudyPlaceholder')} />
        </Form.Item>
      </div>
      <Form.Item label={t('hr.labels.experienceStartDate')} name="experienceStartDate">
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
      {yearsOfExperience !== null ? (
        <span className="mb-4 block text-sm text-gray-500">
          {t('hr.labels.yearsOfExperience')}: {yearsOfExperience}
        </span>
      ) : null}

      <div className="mb-2 mt-4 text-sm font-semibold text-slate-700">
        {t('users.sectionLeavePolicy')}
      </div>
      <Form.Item label={t('hr.labels.leavePolicyId')} name="leavePolicyId">
        <Select
          allowClear
          loading={leavePoliciesQuery.isLoading}
          placeholder={
            leavePolicyOptions.length === 0
              ? t('users.noLeavePoliciesHint')
              : t('common.select')
          }
          options={leavePolicyOptions}
          optionFilterProp="label"
        />
      </Form.Item>
    </>
  );
}

export function buildEmployeeProfilePayload(
  values: EmployeeProfileFormValues,
): Pick<
  CreateUserRequest,
  | 'employeeId'
  | 'middleName'
  | 'address'
  | 'gender'
  | 'dateOfBirth'
  | 'nationalId'
  | 'nationality'
  | 'employeeType'
  | 'educationLevel'
  | 'fieldOfStudy'
  | 'experienceStartDate'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'leavePolicyId'
> {
  return {
    employeeId: values.employeeId?.trim() || undefined,
    middleName: values.middleName?.trim() || undefined,
    address: values.address?.trim() || undefined,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth?.format('YYYY-MM-DD'),
    nationalId: values.nationalId?.trim() || undefined,
    nationality: values.nationality,
    employeeType: values.employeeType,
    educationLevel: values.educationLevel,
    fieldOfStudy: values.fieldOfStudy?.trim() || undefined,
    experienceStartDate: values.experienceStartDate?.format('YYYY-MM-DD'),
    emergencyContactName: values.emergencyContactName?.trim() || undefined,
    emergencyContactPhone: values.emergencyContactPhone?.trim() || undefined,
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
    address: user.address ?? undefined,
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
    emergencyContactName: user.emergencyContactName ?? undefined,
    emergencyContactPhone: user.emergencyContactPhone ?? undefined,
    leavePolicyId: user.leavePolicyId ?? undefined,
  };
}
