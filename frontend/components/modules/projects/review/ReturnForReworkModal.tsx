'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Input, Select, Space, Tooltip, Upload } from 'antd';
import { CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import type { CommentSeverity } from '@/lib/api/epc.types';
import { useReturnPackageForRework } from '@/lib/query/design-packages';
import { useDisciplineUploadFolder } from '@/lib/query/engineering-documents';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { wideDetailDrawerProps } from '@/lib/theme/layout';

interface CommentRowFile {
  tempId: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  versionId?: string;
  fileName: string;
}

interface CommentRow {
  id: string;
  selectedDoc: string;
  summary: string;
  severity: CommentSeverity;
  files: CommentRowFile[];
}

function newEmptyRow(): CommentRow {
  return {
    id: crypto.randomUUID(),
    selectedDoc: '',
    summary: '',
    severity: 'MODERATE',
    files: [],
  };
}

function isRowValid(row: CommentRow): boolean {
  return (
    Boolean(row.selectedDoc) &&
    (row.summary.trim().length > 0 || row.files.length >= 1) &&
    row.files.every((f) => f.status !== 'error')
  );
}

export default function ReturnForReworkModal({
  open,
  onClose,
  projectId,
  taskDisciplineId,
  packageId,
  reviewSessionId,
  availableDocuments,
  defaultAssigneeId,
  defaultAssigneeLabel,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
  reviewSessionId: string;
  availableDocuments: readonly { value: string; label: string }[];
  defaultAssigneeId: string;
  defaultAssigneeLabel: string;
  onSuccess: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const returnPackage = useReturnPackageForRework();
  const uploadDocument = useUploadDocumentToFolder();
  const uploadFolderQuery = useDisciplineUploadFolder(projectId, taskDisciplineId);
  const [rows, setRows] = useState<CommentRow[]>([newEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRows([newEmptyRow()]);
      setSubmitting(false);
    }
  }, [open, defaultAssigneeId]);

  function resetState(): void {
    setRows([newEmptyRow()]);
  }

  function updateRow(rowId: string, patch: Partial<CommentRow>): void {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function updateRowFile(
    rowId: string,
    tempId: string,
    patch: Partial<CommentRowFile>,
  ): void {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              files: row.files.map((f) => (f.tempId === tempId ? { ...f, ...patch } : f)),
            }
          : row,
      ),
    );
  }

  function addRow(): void {
    setRows((prev) => [...prev, newEmptyRow()]);
  }

  function removeRow(rowId: string): void {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
  }

  function addFileToRow(rowId: string, file: File): void {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              files: [
                ...row.files,
                {
                  tempId: crypto.randomUUID(),
                  file,
                  status: 'pending',
                  fileName: file.name,
                },
              ],
            }
          : row,
      ),
    );
  }

  function removeFileFromRow(rowId: string, tempId: string): void {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, files: row.files.filter((f) => f.tempId !== tempId) }
          : row,
      ),
    );
  }

  const canSubmit =
    rows.length >= 1 &&
    rows.every(isRowValid) &&
    !submitting &&
    Boolean(defaultAssigneeId);

  const disabledReasons: string[] = [];
  if (!defaultAssigneeId) {
    disabledReasons.push('No designer is assigned on this subtask.');
  }
  rows.forEach((row, index) => {
    const label = rows.length > 1 ? `Row ${index + 1}: ` : '';
    if (!row.selectedDoc) {
      disabledReasons.push(`${label}select a document.`);
    }
    if (row.summary.trim().length === 0 && row.files.length === 0) {
      disabledReasons.push(`${label}add a comment summary or attach a file.`);
    }
    if (row.files.some((f) => f.status === 'error')) {
      disabledReasons.push(`${label}remove or retry the failed file upload.`);
    }
  });

  async function uploadPendingFiles(): Promise<CommentRow[] | null> {
    const folderId = uploadFolderQuery.data?.id;
    if (!folderId) {
      messageApi.error('Upload folder is not ready');
      return null;
    }

    const pendingUploads = rows.flatMap((row) =>
      row.files
        .filter((f) => f.status === 'pending' || f.status === 'error')
        .map((f) => ({ rowId: row.id, file: f })),
    );

    pendingUploads.forEach(({ rowId, file }) => {
      updateRowFile(rowId, file.tempId, { status: 'uploading' });
    });

    const uploadedByTempId = new Map<string, string>();
    let hasError = false;

    const results = await Promise.allSettled(
      pendingUploads.map(async ({ file }) => {
        const record = await uploadDocument.mutateAsync({ folderId, file: file.file });
        if (!record.currentVersionId) {
          throw new Error('Upload did not return a file version');
        }
        return record.currentVersionId;
      }),
    );

    results.forEach((result, index) => {
      const { rowId, file } = pendingUploads[index];
      if (result.status === 'fulfilled') {
        uploadedByTempId.set(file.tempId, result.value);
        updateRowFile(rowId, file.tempId, { status: 'done', versionId: result.value });
      } else {
        hasError = true;
        updateRowFile(rowId, file.tempId, { status: 'error' });
      }
    });

    if (hasError) {
      messageApi.error('One or more files failed to upload');
      return null;
    }

    return rows.map((row) => ({
      ...row,
      files: row.files.map((f) =>
        uploadedByTempId.has(f.tempId)
          ? { ...f, status: 'done' as const, versionId: uploadedByTempId.get(f.tempId) }
          : f,
      ),
    }));
  }

  async function handleSubmit(): Promise<void> {
    if (!defaultAssigneeId) {
      messageApi.error('No designer is assigned on this subtask');
      return;
    }

    setSubmitting(true);
    try {
      const resolvedRows = await uploadPendingFiles();
      if (!resolvedRows) {
        return;
      }

      await returnPackage.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
        body: {
          reviewSessionId,
          comments: resolvedRows.map((row) => ({
            engineeringDocumentVersionId: row.selectedDoc,
            body: row.summary.trim() || undefined,
            severity: row.severity,
            commentDocumentVersionId: row.files[0]?.versionId,
            commentFileIds: row.files
              .slice(1)
              .map((f) => f.versionId)
              .filter((id): id is string => Boolean(id)),
            assignedToUserId: defaultAssigneeId,
          })),
        },
      });

      messageApi.success('Subtask returned for rework');
      resetState();
      onSuccess();
    } catch (error) {
      notifyApiError(error, 'Failed to return subtask for rework', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose(): void {
    resetState();
    onClose();
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      title="Return for rework"
      open={open}
      onClose={handleClose}
      destroyOnHidden
      footer={
        <div className="flex flex-col items-end gap-2">
          {!canSubmit && !submitting && disabledReasons.length > 0 && (
            <ul className="w-full list-disc pl-5 text-xs text-red-500">
              {disabledReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Tooltip title={!canSubmit ? disabledReasons.join(' ') : undefined}>
              <span>
                <Button
                  danger
                  type="primary"
                  disabled={!canSubmit}
                  loading={submitting}
                  onClick={() => void handleSubmit()}
                >
                  Return for rework
                </Button>
              </span>
            </Tooltip>
          </div>
        </div>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Add at least one comment before returning.
      </p>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border border-slate-200 p-3 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Document (required)</label>
              <Select
                className="w-full"
                placeholder="Select document"
                options={[...availableDocuments]}
                value={row.selectedDoc || undefined}
                onChange={(value: string) => updateRow(row.id, { selectedDoc: value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Comment summary (optional when file attached)
              </label>
              <Input.TextArea
                rows={2}
                value={row.summary}
                onChange={(event) => updateRow(row.id, { summary: event.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Attach files</label>
              <Upload
                multiple
                showUploadList={false}
                beforeUpload={(file: File) => {
                  addFileToRow(row.id, file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>Attach file</Button>
              </Upload>
              {row.files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {row.files.map((f) => (
                    <li
                      key={f.tempId}
                      className="flex items-center justify-between text-sm text-slate-600"
                    >
                      <span>
                        {f.fileName}{' '}
                        {f.status === 'uploading' && '(uploading…)'}
                        {f.status === 'error' && (
                          <span className="text-red-500">(failed)</span>
                        )}
                        {f.status === 'done' && '(attached)'}
                      </span>
                      <CloseCircleOutlined
                        className="cursor-pointer text-slate-400 hover:text-red-500"
                        onClick={() => removeFileFromRow(row.id, f.tempId)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Severity</label>
              <Select
                className="w-full"
                value={row.severity}
                onChange={(value: CommentSeverity) => updateRow(row.id, { severity: value })}
                options={[
                  { value: 'MINOR', label: 'Minor' },
                  { value: 'MODERATE', label: 'Moderate' },
                  { value: 'MAJOR', label: 'Major' },
                ]}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Assigned to</label>
              <Input
                disabled
                value={defaultAssigneeLabel}
                placeholder="No designer assigned on this subtask"
              />
            </div>

            {rows.length > 1 && (
              <Button danger onClick={() => removeRow(row.id)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>

      <Space className="mt-4">
        <Button onClick={addRow}>+ Add another comment</Button>
      </Space>
    </Drawer>
  );
}
