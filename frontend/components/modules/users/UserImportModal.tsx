'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/hr/import-export/hr-import-v2.css';

import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Select,
  Spin,
  Upload,
} from 'antd';
import ExcelJS from 'exceljs';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  ListChecks,
  Pencil,
  Upload as UploadIcon,
} from 'lucide-react';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ImportCommitResult,
  ImportPreviewResult,
  ImportRowPreview,
  ImportRowStatus,
} from '@/lib/api/types';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  downloadUserImportTemplate,
  useImportPreview,
  useImportUsers,
} from '@/lib/query/users';
import {
  useDepartments,
  useEngineeringDisciplines,
  usePositions,
} from '@/lib/query/org';
import { useRoles } from '@/lib/query/roles';
import { useLeavePolicies } from '@/lib/query/leave-policy';
import { useIsSystemAdmin } from '@/hooks/use-auth-capabilities';
import { SYSTEM_ADMINISTRATOR_ROLE } from '@/lib/constants/protected-accounts';
import {
  DRAWER_WIDTH_SUBMITTAL,
  detailDrawerStyles,
  responsiveDetailDrawerClassName,
} from '@/lib/theme/layout';
import { formatUserName } from '@/lib/utils/user-display';

type ImportStep = 'upload' | 'preview' | 'result';
type RowFilter = 'all' | 'ok' | 'error' | 'duplicate';

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type EditableImportFields = {
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
  discipline?: string;
  gender?: string;
  nationality?: string;
  employeeType?: string;
  educationLevel?: string;
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
};

const WORKBOOK_COLUMNS: Array<keyof EditableImportFields> = [
  'email',
  'firstName',
  'lastName',
  'middleName',
  'chineseName',
  'role',
  'phone',
  'discipline',
  'gender',
  'department',
  'position',
  'employeeId',
  'nationality',
  'employeeType',
  'dateOfBirth',
  'nationalId',
  'tin',
  'educationLevel',
  'fieldOfStudy',
  'yearsOfExperience',
  'addressCountry',
  'addressRegion',
  'addressCity',
  'addressSubcity',
  'addressWoreda',
  'addressHouseNumber',
  'leavePolicy',
];

const GENDER_OPTIONS = ['MALE', 'FEMALE'];
const NATIONALITY_OPTIONS = ['ETHIOPIAN', 'CHINESE'];
const EMPLOYEE_TYPE_OPTIONS = [
  'PERMANENT',
  'CONTRACT',
  'TEMPORARY',
  'FREELANCER',
];
const EDUCATION_OPTIONS = [
  'PHD',
  'MSC',
  'BSC',
  'DIPLOMA',
  'CERTIFICATE',
  'OTHER',
];

type CatalogSource = 'role' | 'department' | 'position' | 'discipline' | 'leavePolicy';

type EditFieldSpec = {
  name: keyof EditableImportFields;
  /** Fixed enum values; labels from `${labelKey}.${value}`. */
  options?: string[];
  labelKey?: string;
  /** Catalog list, same as the add/edit employee form. Values are names, which the import matches on. */
  source?: CatalogSource;
  placeholder?: string;
};

const DATE_PLACEHOLDER = 'YYYY-MM-DD or DD/MM/YYYY';

/** Correction form, grouped like the employee profile. Labels: users.import.fields.* */
const EDIT_SECTIONS: Array<{ key: string; fields: EditFieldSpec[] }> = [
  {
    key: 'identity',
    fields: [
      { name: 'firstName' },
      { name: 'lastName' },
      { name: 'middleName' },
      { name: 'chineseName' },
      { name: 'email' },
      { name: 'phone' },
    ],
  },
  {
    key: 'job',
    fields: [
      { name: 'role', source: 'role' },
      { name: 'employeeId' },
      { name: 'position', source: 'position' },
      { name: 'department', source: 'department' },
      { name: 'discipline', source: 'discipline' },
      { name: 'employeeType', options: EMPLOYEE_TYPE_OPTIONS, labelKey: 'hr.employeeType' },
      { name: 'leavePolicy', source: 'leavePolicy' },
      { name: 'yearsOfExperience', placeholder: 'e.g. 8 or 6.5' },
    ],
  },
  {
    key: 'personal',
    fields: [
      { name: 'gender', options: GENDER_OPTIONS, labelKey: 'hr.gender' },
      { name: 'nationality', options: NATIONALITY_OPTIONS, labelKey: 'hr.nationality' },
      { name: 'dateOfBirth', placeholder: DATE_PLACEHOLDER },
      { name: 'educationLevel', options: EDUCATION_OPTIONS, labelKey: 'hr.educationLevel' },
      { name: 'fieldOfStudy' },
      { name: 'tin' },
      { name: 'nationalId' },
    ],
  },
  {
    key: 'address',
    fields: [
      { name: 'addressCountry' },
      { name: 'addressRegion' },
      { name: 'addressCity' },
      { name: 'addressSubcity' },
      { name: 'addressWoreda' },
      { name: 'addressHouseNumber' },
    ],
  },
];

const EDIT_FIELDS = EDIT_SECTIONS.flatMap((section) => section.fields);

function statusLabel(status: ImportRowStatus, t: TranslateFn): string {
  switch (status) {
    case 'ok':
      return t('users.import.ready');
    case 'warning':
      return t('hr.import.warning');
    case 'error':
      return t('users.import.invalid');
    case 'duplicate':
      return t('users.import.duplicate');
    case 'duplicate_in_file':
      return t('users.import.duplicateInFile');
    default:
      return status;
  }
}

function statusVariant(status: ImportRowStatus): StatusBadgeVariant {
  switch (status) {
    case 'ok':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'duplicate':
    case 'duplicate_in_file':
      return 'warning';
    default:
      return 'default';
  }
}

function pluralKey(
  count: number,
  singularKey: string,
  pluralKeyName: string,
): string {
  return count === 1 ? singularKey : pluralKeyName;
}

function inferFocusField(message?: string): keyof EditableImportFields | null {
  if (!message) {
    return null;
  }
  const lower = message.toLowerCase();
  const checks: Array<[string, keyof EditableImportFields]> = [
    ['firstname', 'firstName'],
    ['lastname', 'lastName'],
    ['email', 'email'],
    ['chinesename', 'chineseName'],
    ['middlename', 'middleName'],
    ['role', 'role'],
    ['phone', 'phone'],
    ['position', 'position'],
    ['department', 'department'],
    ['leavepolicy', 'leavePolicy'],
    ['discipline', 'discipline'],
    ['gender', 'gender'],
    ['nationality', 'nationality'],
    ['employeetype', 'employeeType'],
    ['educationlevel', 'educationLevel'],
    ['dateofbirth', 'dateOfBirth'],
    ['yearsofexperience', 'yearsOfExperience'],
    ['nationalid', 'nationalId'],
    ['tin', 'tin'],
    ['fieldofstudy', 'fieldOfStudy'],
    ['employeeid', 'employeeId'],
  ];
  for (const [needle, field] of checks) {
    if (lower.includes(needle)) {
      return field;
    }
  }
  return null;
}

function rowToEditable(row: ImportRowPreview): EditableImportFields {
  return {
    email: row.email ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    middleName: row.middleName ?? '',
    chineseName: row.chineseName ?? '',
    role: row.role ?? '',
    phone: row.phone ?? '',
    department: row.department ?? '',
    position: row.position ?? '',
    employeeId: row.employeeId ?? '',
    leavePolicy: row.leavePolicy ?? '',
    discipline: row.discipline ?? '',
    gender: row.gender ?? '',
    nationality: row.nationality ?? '',
    employeeType: row.employeeType ?? '',
    educationLevel: row.educationLevel ?? '',
    dateOfBirth: row.dateOfBirth ?? '',
    nationalId: row.nationalId ?? '',
    tin: row.tin ?? '',
    fieldOfStudy: row.fieldOfStudy ?? '',
    yearsOfExperience: row.yearsOfExperience ?? '',
    addressCountry: row.addressCountry ?? '',
    addressRegion: row.addressRegion ?? '',
    addressCity: row.addressCity ?? '',
    addressSubcity: row.addressSubcity ?? '',
    addressWoreda: row.addressWoreda ?? '',
    addressHouseNumber: row.addressHouseNumber ?? '',
  };
}

async function buildWorkbookFile(
  rows: ImportRowPreview[],
  fileName: string,
): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Users');
  sheet.addRow([...WORKBOOK_COLUMNS]);
  // Preserve original Excel line numbers so re-preview maps edits correctly
  const sorted = [...rows].sort((a, b) => a.line - b.line);
  let nextLine = 2;
  for (const row of sorted) {
    while (nextLine < row.line) {
      sheet.addRow([]);
      nextLine += 1;
    }
    const editable = rowToEditable(row);
    sheet.addRow(WORKBOOK_COLUMNS.map((key) => editable[key] ?? ''));
    nextLine += 1;
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function ImportStepTabs({
  step,
  labels,
}: {
  step: ImportStep;
  labels: { upload: string; preview: string; result: string };
}): React.ReactNode {
  const steps: ImportStep[] = ['upload', 'preview', 'result'];
  const activeIndex = steps.indexOf(step);

  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label="Import steps">
      {steps.map((key, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={key}
            className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? 'bg-emerald-600 text-white'
                  : active
                    ? 'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-600'
                    : 'bg-slate-100 text-slate-500'
              }`}
              aria-hidden
            >
              {done ? <CheckCircle2 size={15} strokeWidth={2.25} /> : index + 1}
            </span>
            <span
              className={`truncate text-sm ${
                active ? 'font-semibold text-slate-900' : done ? 'font-medium text-slate-700' : 'text-slate-500'
              }`}
            >
              {labels[key]}
            </span>
            {index < steps.length - 1 ? (
              <span
                className={`mx-1 h-px min-w-6 flex-1 ${done ? 'bg-emerald-600' : 'bg-slate-200'}`}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function UserImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (summary: string) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importPreview = useImportPreview();
  const importUsers = useImportUsers();
  const [editForm] = Form.useForm<EditableImportFields>();

  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [sendInvitations, setSendInvitations] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [isRevalidating, setIsRevalidating] = useState(false);

  const editingRow =
    editingLine !== null
      ? (preview?.rows.find((row) => row.line === editingLine) ?? null)
      : null;
  const focusField = inferFocusField(editingRow?.message);

  const catalogsEnabled = editingRow !== null;
  const viewerIsAdmin = useIsSystemAdmin();
  const rolesQuery = useRoles({ page: 1, limit: 100 }, { enabled: catalogsEnabled });
  const departmentsQuery = useDepartments({ page: 1, limit: 100 }, catalogsEnabled);
  const positionsQuery = usePositions({ page: 1, limit: 100 }, catalogsEnabled);
  const disciplinesQuery = useEngineeringDisciplines(
    { page: 1, limit: 200, activeOnly: true },
    catalogsEnabled,
  );
  const leavePoliciesQuery = useLeavePolicies(catalogsEnabled);

  const catalogOptions = useMemo<
    Record<CatalogSource, Array<{ value: string; label: string }>>
  >(
    () => ({
      role: (rolesQuery.data?.data ?? [])
        .filter(
          (role) =>
            role.isActive !== false &&
            (role.name !== SYSTEM_ADMINISTRATOR_ROLE || viewerIsAdmin),
        )
        .map((role) => ({ value: role.name, label: role.name })),
      department: (departmentsQuery.data?.data ?? []).map((department) => ({
        value: department.name,
        label: department.name,
      })),
      position: (positionsQuery.data?.data ?? [])
        .filter((position) => position.isActive)
        .map((position) => ({
          value: position.title,
          label: position.titleZh
            ? `${position.title} / ${position.titleZh}`
            : position.title,
        })),
      discipline: (disciplinesQuery.data?.data ?? []).map((discipline) => ({
        value: discipline.name,
        label: discipline.nameZh
          ? `${discipline.name} (${discipline.nameZh})`
          : discipline.name,
      })),
      leavePolicy: (leavePoliciesQuery.data ?? []).map((policy) => ({
        value: policy.name,
        label: policy.name,
      })),
    }),
    [
      rolesQuery.data,
      departmentsQuery.data,
      positionsQuery.data,
      disciplinesQuery.data,
      leavePoliciesQuery.data,
      viewerIsAdmin,
    ],
  );
  const catalogLoading: Record<CatalogSource, boolean> = {
    role: rolesQuery.isLoading,
    department: departmentsQuery.isLoading,
    position: positionsQuery.isLoading,
    discipline: disciplinesQuery.isLoading,
    leavePolicy: leavePoliciesQuery.isLoading,
  };
  const catalogPlaceholder: Record<CatalogSource, string> = {
    role: t('common.select'),
    department: t('users.filterDepartment'),
    position: t('users.filterPosition'),
    discipline: t('common.selectDiscipline'),
    leavePolicy:
      !leavePoliciesQuery.isLoading && catalogOptions.leavePolicy.length === 0
        ? t('users.form.noLeavePoliciesHint')
        : t('common.select'),
  };

  const filteredRows = useMemo(() => {
    if (!preview) {
      return [];
    }
    if (rowFilter === 'all') {
      return preview.rows;
    }
    if (rowFilter === 'ok') {
      return preview.rows.filter((row) => row.status === 'ok');
    }
    if (rowFilter === 'error') {
      return preview.rows.filter((row) => row.status === 'error');
    }
    return preview.rows.filter(
      (row) =>
        row.status === 'duplicate' || row.status === 'duplicate_in_file',
    );
  }, [preview, rowFilter]);

  async function handleDownloadTemplate(): Promise<void> {
    setErrorMessage(null);
    setIsDownloadingTemplate(true);
    try {
      await downloadUserImportTemplate();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('users.import.downloadError'),
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  }

  async function handleFileChange(file: File): Promise<void> {
    setErrorMessage(null);
    setSelectedFile(file);
    setPreview(null);
    setResult(null);
    setEditingLine(null);
    setRowFilter('all');

    try {
      const previewResult = await importPreview.mutateAsync(file);
      setPreview(previewResult);
      setStep('preview');
      if (previewResult.invalid > 0) {
        setRowFilter('error');
      }
    } catch (error) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('users.import.readError'),
      );
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile || !preview || preview.valid === 0) {
      return;
    }

    setErrorMessage(null);

    try {
      const commitResult = await importUsers.mutateAsync({
        file: selectedFile,
        sendInvitations,
      });
      setResult(commitResult);
      setStep('result');
      setEditingLine(null);

      const summary = sendInvitations
        ? t('users.import.summary', {
            created: commitResult.created,
            sent: commitResult.invitationsSent,
          })
        : t(
            pluralKey(
              commitResult.created,
              'users.import.created',
              'users.import.createdPlural',
            ),
            { count: commitResult.created },
          );
      onImported(summary);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('users.import.importError'),
      );
    }
  }

  function handleReset(): void {
    setStep('upload');
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setErrorMessage(null);
    setEditingLine(null);
    setRowFilter('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function openEditRow(row: ImportRowPreview): void {
    setEditingLine(row.line);
    editForm.setFieldsValue(rowToEditable(row));
  }

  function closeEditRow(): void {
    setEditingLine(null);
    editForm.resetFields();
  }

  async function handleApplyEdit(): Promise<void> {
    if (!preview || editingLine === null) {
      return;
    }

    const values = await editForm.validateFields();
    setErrorMessage(null);
    setIsRevalidating(true);

    try {
      const nextRows = preview.rows.map((row) =>
        row.line === editingLine
          ? {
              ...row,
              ...values,
              email: values.email?.trim() || undefined,
              firstName: values.firstName.trim(),
              lastName: values.lastName?.trim() ?? '',
              role: values.role?.trim() ?? '',
            }
          : row,
      );

      const fileName = selectedFile?.name ?? 'employee-import.xlsx';
      const rebuilt = await buildWorkbookFile(nextRows, fileName);
      const previewResult = await importPreview.mutateAsync(rebuilt);
      setSelectedFile(rebuilt);
      setPreview(previewResult);

      const updated = previewResult.rows.find((row) => row.line === editingLine);
      if (updated && updated.status === 'ok') {
        setEditingLine(null);
        editForm.resetFields();
        if (previewResult.invalid === 0) {
          setRowFilter('all');
        }
      } else if (updated) {
        editForm.setFieldsValue(rowToEditable(updated));
        setRowFilter('error');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('users.import.readError'),
      );
    } finally {
      setIsRevalidating(false);
    }
  }

  const isBusy =
    importPreview.isPending || importUsers.isPending || isRevalidating;
  const validCount = preview?.valid ?? 0;
  const inviteableCount =
    preview?.rows.filter((row) => row.status === 'ok' && row.email).length ?? 0;

  const drawerTitle = editingRow
    ? t('users.import.editTitle', { line: editingRow.line })
    : t('users.import.title');

  const focusSpec = focusField
    ? (EDIT_FIELDS.find((field) => field.name === focusField) ?? null)
    : null;

  function renderEditField(field: EditFieldSpec, isFocus: boolean): React.ReactNode {
    const label = (
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span>{t(`users.import.fields.${field.name}`)}</span>
        <code className="bg-transparent text-xs font-normal text-slate-500">
          {field.name}
        </code>
      </span>
    );
    return (
      <Form.Item
        key={field.name}
        name={field.name}
        label={label}
        rules={
          field.name === 'firstName'
            ? [{ required: true, message: t('common.requiredFirstName') }]
            : undefined
        }
        extra={isFocus ? t('users.import.issueFieldHint') : undefined}
        className={
          isFocus
            ? 'erp-user-import-field--focus [&_.ant-form-item-extra]:!mt-1.5 [&_.ant-form-item-extra]:!text-xs [&_.ant-form-item-extra]:!text-slate-600'
            : undefined
        }
      >
        {field.source ? (
          <Select
            allowClear
            showSearch
            autoFocus={isFocus}
            loading={catalogLoading[field.source]}
            placeholder={catalogPlaceholder[field.source]}
            options={catalogOptions[field.source]}
            optionFilterProp="label"
          />
        ) : field.options ? (
          <Select
            allowClear
            autoFocus={isFocus}
            placeholder={t('common.select')}
            options={field.options.map((value) => ({
              value,
              label: field.labelKey ? t(`${field.labelKey}.${value}`) : value,
            }))}
          />
        ) : (
          <Input autoFocus={isFocus} placeholder={field.placeholder} />
        )}
      </Form.Item>
    );
  }

  const fileName = selectedFile?.name ?? '';
  const headerIcon = editingRow ? (
    <Pencil size={18} strokeWidth={2} />
  ) : step === 'result' ? (
    <CheckCircle2 size={19} strokeWidth={2} />
  ) : step === 'preview' ? (
    <ListChecks size={19} strokeWidth={2} />
  ) : (
    <FileSpreadsheet size={19} strokeWidth={2} />
  );
  const headerSubtitle = editingRow
    ? t('users.import.editSubtitle', { line: editingRow.line, file: fileName })
    : step === 'result'
      ? t('users.import.headerDone')
      : step === 'preview' && preview
        ? t('users.import.headerReview', {
            file: fileName,
            count: preview.rows.length,
          })
        : t('users.import.headerUpload');
  const editingName = editingRow
    ? formatUserName(editingRow) || t('users.import.unnamed')
    : '';

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {step === 'result' ? (
        <Button type="primary" onClick={onClose}>
          {t('common.done')}
        </Button>
      ) : editingRow ? (
        <>
          <Button
            onClick={closeEditRow}
            disabled={isBusy}
            icon={<ArrowLeft size={14} />}
          >
            {t('users.import.cancelEdit')}
          </Button>
          <Button
            type="primary"
            onClick={() => void handleApplyEdit()}
            loading={isRevalidating}
          >
            {t('users.import.applyFix')}
          </Button>
        </>
      ) : (
        <>
          {step === 'preview' ? (
            <Button onClick={handleReset} disabled={isBusy}>
              {t('users.import.chooseAnotherFile')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {step === 'preview' ? (
            <Button
              type="primary"
              onClick={() => void handleImport()}
              loading={importUsers.isPending}
              disabled={!preview || preview.valid === 0}
            >
              {t(
                pluralKey(
                  validCount,
                  'users.import.importUsers',
                  'users.import.importUsersPlural',
                ),
                { count: validCount },
              )}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <Drawer
      open
      placement="right"
      size={DRAWER_WIDTH_SUBMITTAL}
      className={`${responsiveDetailDrawerClassName} erp-user-import-drawer erp-hr-travel-modal erp-hr-import-v2`}
      styles={{
        ...detailDrawerStyles,
        header: {
          ...(detailDrawerStyles as { header?: React.CSSProperties }).header,
          height: 'auto',
          minHeight: 68,
          padding: '12px 20px',
        },
      }}
      onClose={onClose}
      footer={footer}
      destroyOnHidden
      mask={{ closable: !isBusy }}
      closable={!isBusy}
      title={
        <div className="flex min-w-0 items-center gap-3 py-1">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              editingRow
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-600/10 text-emerald-800'
            }`}
            aria-hidden
          >
            {headerIcon}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2 text-base leading-snug font-semibold text-slate-900">
              <span className="shrink-0">{drawerTitle}</span>
              {editingRow ? (
                <span className="truncate text-sm font-medium text-slate-500">
                  {editingName}
                </span>
              ) : null}
            </div>
            <p className="m-0 mt-0.5 truncate text-[13px] leading-snug font-normal text-slate-600">
              {headerSubtitle}
            </p>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!editingRow ? (
          <ImportStepTabs
            step={step}
            labels={{
              upload: t('users.import.stepUpload'),
              preview: t('users.import.stepReview'),
              result: t('users.import.stepDone'),
            }}
          />
        ) : null}

        <div className="flex min-w-0 flex-col gap-4">
          {step === 'upload' ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] sm:p-5">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-800"
                  aria-hidden
                >
                  <FileSpreadsheet size={20} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold text-slate-900">
                    {t('users.import.templateTitle')}
                  </p>
                  <p className="m-0 mt-0.5 text-[13px] leading-snug text-slate-500">
                    {t('users.import.templateHint')}
                  </p>
                </div>
                <Button
                  icon={<Download size={15} />}
                  onClick={() => void handleDownloadTemplate()}
                  loading={isDownloadingTemplate}
                  className="!rounded-[10px]"
                >
                  {t('users.import.downloadTemplate')}
                </Button>
              </div>

              <Upload.Dragger
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                showUploadList={false}
                beforeUpload={(file: File) => {
                  void handleFileChange(file);
                  return false;
                }}
                disabled={isBusy}
                className="[&_.ant-upload-btn]:!p-0 [&_.ant-upload-drag]:!rounded-2xl [&_.ant-upload-drag]:!border-2 [&_.ant-upload-drag]:!border-dashed [&_.ant-upload-drag]:!border-slate-300 [&_.ant-upload-drag]:!bg-slate-50 [&_.ant-upload-drag]:!transition-colors [&_.ant-upload-drag:hover]:!border-emerald-500 [&_.ant-upload-drag:hover]:!bg-emerald-50/50"
              >
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <span
                    className="flex size-14 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]"
                    aria-hidden
                  >
                    {importPreview.isPending ? (
                      <Spin />
                    ) : (
                      <UploadIcon size={24} strokeWidth={1.9} />
                    )}
                  </span>
                  <p className="m-0 text-base font-semibold text-slate-900">
                    {importPreview.isPending
                      ? t('users.import.checking')
                      : t('users.import.dropHint')}
                  </p>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {t('users.import.fileTypes')}
                  </span>
                  <p className="m-0 max-w-xl text-[13px] leading-relaxed text-slate-500">
                    {t('users.import.requiredColumns')}
                  </p>
                </div>
              </Upload.Dragger>

              <p className="m-0 flex items-start gap-2 px-1 text-[13px] leading-relaxed text-slate-600">
                <Info size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
                <span>{t('users.import.description')}</span>
              </p>
            </div>
          ) : null}

          {step === 'preview' && preview && editingRow ? (
            <Form
              form={editForm}
              layout="vertical"
              requiredMark={false}
              className="flex flex-col gap-4 [&_.ant-form-item]:!mb-3.5 [&_.ant-form-item-label]:!pb-1 [&_.ant-form-item-label>label]:!text-[13px] [&_.ant-form-item-label>label]:!font-medium [&_.ant-form-item-label>label]:!text-slate-700 [&_.ant-input]:!rounded-[10px] [&_.ant-select-selector]:!rounded-[10px]"
            >
              <section
                aria-labelledby="import-issue-title"
                className="overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1px_#fecaca,0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]"
              >
                <div className="flex items-start gap-3 bg-red-50 px-4 py-3.5 sm:px-5">
                  <span
                    className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-red-600 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                    aria-hidden
                  >
                    <AlertCircle size={17} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3
                        id="import-issue-title"
                        className="m-0 text-sm font-semibold text-slate-900"
                      >
                        {t('users.import.issueTitle')}
                      </h3>
                      <StatusBadge
                        label={statusLabel(editingRow.status, t)}
                        variant={statusVariant(editingRow.status)}
                      />
                    </div>
                    <p className="m-0 mt-1 text-sm font-medium text-red-700">
                      {editingRow.message || '-'}
                    </p>
                  </div>
                </div>
                <div className="px-4 pt-4 pb-1 sm:px-5">
                  {focusSpec ? (
                    renderEditField(focusSpec, true)
                  ) : (
                    <p className="m-0 pb-3 text-[13px] text-slate-600">
                      {t('users.import.issueNoFieldHint')}
                    </p>
                  )}
                </div>
              </section>

              {EDIT_SECTIONS.map((section) => {
                const fields = section.fields.filter(
                  (field) => field.name !== focusSpec?.name,
                );
                return (
                  <section
                    key={section.key}
                    aria-labelledby={`import-section-${section.key}`}
                    className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]"
                  >
                    <h3
                      id={`import-section-${section.key}`}
                      className="m-0 border-b border-slate-100 px-4 pt-3.5 pb-3 text-[15px] font-semibold text-slate-900 sm:px-5"
                    >
                      {t(`users.import.sections.${section.key}`)}
                    </h3>
                    <div className="grid gap-x-4 px-4 pt-4 pb-1 sm:grid-cols-2 sm:px-5">
                      {fields.map((field) => renderEditField(field, false))}
                    </div>
                  </section>
                );
              })}
            </Form>
          ) : null}

          {step === 'preview' && preview && !editingRow ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {selectedFile ? (
                  <div className="inline-flex max-w-full items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-1 text-[13px] font-medium text-slate-700">
                    <FileSpreadsheet size={14} strokeWidth={2} className="shrink-0 text-emerald-700" aria-hidden />
                    <span className="truncate">{selectedFile.name}</span>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="tablist">
                  {(
                    [
                      ['all', t('users.import.filterAll'), preview.rows.length],
                      ['ok', t('users.import.ready'), preview.valid],
                      ['error', t('users.import.invalid'), preview.invalid],
                      [
                        'duplicate',
                        t('users.import.duplicate'),
                        preview.duplicate,
                      ],
                    ] as Array<[RowFilter, string, number]>
                  ).map(([key, label, count]) => {
                    const selected = rowFilter === key;
                    const tone =
                      key === 'ok'
                        ? 'text-emerald-700'
                        : key === 'error'
                          ? 'text-red-700'
                          : key === 'duplicate'
                            ? 'text-amber-700'
                            : 'text-slate-900';
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border-0 px-3.5 py-2.5 text-left transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                          selected
                            ? 'bg-[#f0faf6] shadow-[inset_0_0_0_2px_#1d9e75]'
                            : 'bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] hover:bg-slate-50'
                        }`}
                        onClick={() => setRowFilter(key)}
                      >
                        <span className="text-xs font-medium text-slate-600">{label}</span>
                        <strong className={`text-xl leading-tight font-semibold tabular-nums ${count > 0 ? tone : 'text-slate-400'}`}>
                          {count}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)] [&_.ant-table-thead>tr>th]:!bg-[#f7f8fa] [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-thead>tr>th]:!font-semibold [&_.ant-table-thead>tr>th]:!tracking-[0.04em] [&_.ant-table-thead>tr>th]:!text-gray-600 [&_.ant-table-thead>tr>th]:!uppercase [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!border-0 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!p-0">
                <DataTable
                  rowKey="line"
                  className="erp-pro-table erp-users-table"
                  size="small"
                  dataSource={filteredRows}
                  scroll={{ x: true, y: 'calc(100vh - 380px)' }}
                  pagination={false}
                  locale={{
                    emptyText: t('users.import.noRowsFilter'),
                  }}
                  rowClassName={(row) =>
                    row.status === 'error'
                      ? 'erp-import-row--error'
                      : row.status === 'duplicate' ||
                          row.status === 'duplicate_in_file'
                        ? 'erp-import-row--warning'
                        : ''
                  }
                  columns={[
                    {
                      title: t('users.import.line'),
                      dataIndex: 'line',
                      width: 64,
                      render: (value: number) => (
                        <span className="erp-users-id-chip">{value}</span>
                      ),
                    },
                    {
                      title: t('users.import.name'),
                      key: 'name',
                      width: 160,
                      render: (_, row) => (
                        <span className="erp-users-cell-strong">
                          {formatUserName(row) || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('common.email'),
                      key: 'email',
                      width: 180,
                      render: (_, row) => (
                        <span className="erp-users-cell-sub">
                          {row.email || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('common.role'),
                      key: 'role',
                      width: 120,
                      render: (_, row) => (
                        <span className="erp-users-cell-sub">
                          {row.role?.trim() || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('users.import.position'),
                      key: 'position',
                      width: 140,
                      render: (_, row) => (
                        <span className="erp-users-cell-sub">
                          {row.position || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('common.status'),
                      key: 'status',
                      width: 120,
                      render: (_, row) => (
                        <StatusBadge
                          label={statusLabel(row.status, t)}
                          variant={statusVariant(row.status)}
                        />
                      ),
                    },
                    {
                      title: t('users.import.message'),
                      key: 'message',
                      ellipsis: true,
                      render: (_, row) => (
                        <span
                          className={
                            row.status === 'error'
                              ? 'text-[13px] font-medium text-red-700'
                              : 'erp-users-cell-sub'
                          }
                        >
                          {row.message || '-'}
                        </span>
                      ),
                    },
                    {
                      title: '',
                      key: 'actions',
                      width: 88,
                      fixed: 'right',
                      render: (_, row) =>
                        row.status === 'error' ? (
                          <Button
                            size="small"
                            type="link"
                            className="!px-1 !font-semibold"
                            icon={<Pencil size={13} />}
                            onClick={() => openEditRow(row)}
                          >
                            {t('users.import.editRow')}
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 px-4 py-3">
                <Checkbox
                  checked={sendInvitations}
                  disabled={inviteableCount === 0}
                  onChange={(event: { target: { checked: boolean } }) =>
                    setSendInvitations(event.target.checked)
                  }
                >
                  {t('users.import.sendInvitationsNow')}
                </Checkbox>
                {sendInvitations && inviteableCount > 0 ? (
                  <p className="m-0 pl-6 text-xs leading-snug text-slate-600">
                    {t('users.import.invitationHint', {
                      count: inviteableCount,
                    })}
                  </p>
                ) : null}
                {inviteableCount === 0 && validCount > 0 ? (
                  <p className="m-0 pl-6 text-xs leading-snug text-slate-600">
                    {t('users.import.recordOnlyHint')}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 'result' && result ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <span
                  className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700"
                  aria-hidden
                >
                  <CheckCircle2 size={28} strokeWidth={2} />
                </span>
                <p className="m-0 text-lg font-semibold text-slate-900">{t('users.import.doneTitle')}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-0.5 rounded-xl bg-[#f0faf6] px-4 py-3">
                  <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                    {result.created}
                  </span>
                  <span className="text-[13px] text-slate-600">
                    {t(
                      pluralKey(
                        result.created,
                        'users.import.created',
                        'users.import.createdPlural',
                      ),
                      { count: result.created },
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]">
                  <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                    {result.skipped}
                  </span>
                  <span className="text-[13px] text-slate-600">
                    {t(
                      pluralKey(
                        result.skipped,
                        'users.import.skipped',
                        'users.import.skippedPlural',
                      ),
                      { count: result.skipped },
                    )}
                  </span>
                </div>
                {sendInvitations ? (
                  <div className="flex flex-col gap-0.5 rounded-xl bg-[#f0faf6] px-4 py-3">
                    <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {result.invitationsSent}
                    </span>
                    <span className="text-[13px] text-slate-600">
                      {t(
                        pluralKey(
                          result.invitationsSent,
                          'users.import.invitationsSent',
                          'users.import.invitationsSentPlural',
                        ),
                        { count: result.invitationsSent },
                      )}
                    </span>
                  </div>
                ) : null}
              </div>

              {sendInvitations && result.invitationsFailed > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  title={t(
                    pluralKey(
                      result.invitationsFailed,
                      'users.import.invitationsFailed',
                      'users.import.invitationsFailedPlural',
                    ),
                    { count: result.invitationsFailed },
                  )}
                />
              ) : null}

              {result.errors.length > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  title={t('users.import.errorsTitle')}
                  description={
                    <ul className="mt-1 list-disc pl-5">
                      {result.errors.map((error) => (
                        <li key={`${error.line}-${error.email ?? 'no-email'}`}>
                          {t('users.import.errorLine', {
                            line: error.line,
                            email: error.email ?? t('users.noEmailNoLogin'),
                            message: error.message,
                          })}
                        </li>
                      ))}
                    </ul>
                  }
                />
              ) : null}
            </div>
          ) : null}

          {errorMessage ? (
            <Alert
              type="error"
              showIcon
              title={errorMessage}
              className="!rounded-xl"
            />
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
