// Gap completion - new

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Select, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import {
  useCreateChangeRequest,
  useEligibleCrSubtasks,
  useNextCrNumber,
  usePackageCurrentEdvs,
} from '@/lib/query/change-requests';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useAllProjects } from '@/lib/query/projects';
import type {
  ChangeRequestReason,
  ProjectChangeRequest,
} from '@/lib/api/project-management.types';
import { standardDetailDrawerProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  useCapabilitiesReady,
} from '@/hooks/use-pm-capabilities';

const NO_REVIEWABLE_SUBTASKS_MESSAGE =
  'No subtasks with reviewable documents found. Documents must be submitted for review before a change request can be raised.';

const CHANGE_REASON_OPTIONS: Array<{
  value: ChangeRequestReason;
  label: string;
}> = [
  { value: 'CLIENT_REQUEST', label: 'Client Request' },
  { value: 'SITE_CONDITION', label: 'Site Condition' },
  { value: 'DESIGN_ERROR', label: 'Design Error / Omission' },
  { value: 'REGULATORY_COMPLIANCE', label: 'Regulatory Compliance' },
];

interface FormValues {
  linkedDesignPackageId: string;
  affectedEdvIds: string[];
  changeReason: ChangeRequestReason;
  title: string;
  description?: string;
}

export default function CreateChangeRequestDrawer({
  open,
  projectId: projectIdProp,
  showProjectSelector = false,
  initialLinkedDesignPackageId,
  onClose,
  onCreated,
}: {
  open: boolean;
  projectId?: string;
  showProjectSelector?: boolean;
  initialLinkedDesignPackageId?: string;
  onClose: () => void;
  onCreated: (created?: ProjectChangeRequest) => void;
}): React.ReactNode {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';

  const capabilitiesReady = useCapabilitiesReady();
  const projectsQuery = useAllProjects(
    {},
    open && showProjectSelector && capabilitiesReady,
  );

  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((project) => ({
        value: project.id,
        label: `${project.projectCode} - ${project.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const [form] = Form.useForm<FormValues>();
  const createMutation = useCreateChangeRequest(effectiveProjectId);
  const uploadDocument = useUploadDocumentToFolder();
  const messageApi = useAppMessage();
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const selectedPackageId = Form.useWatch('linkedDesignPackageId', form) as
    | string
    | undefined;

  const subtasksQuery = useEligibleCrSubtasks(
    effectiveProjectId,
    open && Boolean(effectiveProjectId),
  );
  const edvsQuery = usePackageCurrentEdvs(
    selectedPackageId ?? '',
    open && Boolean(selectedPackageId),
  );
  const nextNumberQuery = useNextCrNumber(
    selectedPackageId ?? '',
    open && Boolean(selectedPackageId),
  );

  const subtaskOptions = useMemo(
    () =>
      (subtasksQuery.data ?? []).map((pkg) => ({
        value: pkg.id,
        label: `${pkg.fullCode} - ${pkg.name}`,
      })),
    [subtasksQuery.data],
  );

  const subtasksLoaded =
    Boolean(effectiveProjectId) &&
    !subtasksQuery.isLoading &&
    subtasksQuery.isFetched;
  const noQualifyingSubtasks =
    subtasksLoaded && subtaskOptions.length === 0;

  const createDisabled =
    noQualifyingSubtasks ||
    (showProjectSelector &&
      !projectsQuery.isLoading &&
      projectOptions.length === 0);

  const edvOptions = useMemo(
    () =>
      (edvsQuery.data ?? []).map((edv) => ({
        value: edv.id,
        label: edv.display,
      })),
    [edvsQuery.data],
  );

  useEffect(() => {
    if (open && projectIdProp) {
      setSelectedProjectId(projectIdProp);
    }
    if (open && initialLinkedDesignPackageId) {
      form.setFieldValue('linkedDesignPackageId', initialLinkedDesignPackageId);
    }
  }, [open, projectIdProp, initialLinkedDesignPackageId, form]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setQueuedFiles([]);
      setUploading(false);
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  async function uploadQueuedFiles(folderId: string): Promise<void> {
    setUploading(true);
    await Promise.all(
      queuedFiles.map((file) =>
        uploadDocument.mutateAsync({ folderId, file }),
      ),
    );
  }

  async function handleSubmit(values: FormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        linkedDesignPackageId: values.linkedDesignPackageId,
        affectedEdvIds: values.affectedEdvIds,
        changeReason: values.changeReason,
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });

      if (queuedFiles.length > 0 && result.attachmentFolderId) {
        try {
          await uploadQueuedFiles(result.attachmentFolderId);
        } catch (uploadError) {
          notifyApiError(
            uploadError,
            'Change request created but file upload failed. Upload from the detail drawer.',
            messageApi,
          );
          form.resetFields();
          setQueuedFiles([]);
          onCreated(result);
          onClose();
          return;
        }
      }

      messageApi.success('Change request created');
      form.resetFields();
      setQueuedFiles([]);
      onCreated(result);
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create change request', messageApi);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer
      {...standardDetailDrawerProps}
      open={open}
      title="New change request"
      onClose={onClose}
      destroyOnHidden
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values) => void handleSubmit(values)}
      >
        {showProjectSelector && (
          <Form.Item label="Project" required>
            <Select
              showSearch
              placeholder="Select project"
              options={projectOptions}
              loading={projectsQuery.isLoading}
              optionFilterProp="label"
              value={selectedProjectId ?? undefined}
              onChange={(value: string) => {
                setSelectedProjectId(value);
                form.setFieldValue('linkedDesignPackageId', undefined);
                form.setFieldValue('affectedEdvIds', []);
              }}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Subtask"
          name="linkedDesignPackageId"
          rules={[{ required: true, message: 'Subtask is required' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select subtask"
            loading={subtasksQuery.isLoading}
            disabled={!effectiveProjectId}
            options={subtaskOptions}
            onChange={() => {
              form.setFieldValue('affectedEdvIds', []);
            }}
          />
        </Form.Item>

        {noQualifyingSubtasks ? (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title={NO_REVIEWABLE_SUBTASKS_MESSAGE}
          />
        ) : null}

        <Form.Item label="CR Number">
          <Input
            value={
              nextNumberQuery.data?.changeNumber ??
              (selectedPackageId
                ? 'Loading…'
                : 'Select a subtask first')
            }
            disabled
          />
        </Form.Item>

        <Form.Item
          label="Affected documents"
          name="affectedEdvIds"
          rules={[
            {
              required: true,
              type: 'array',
              min: 1,
              message: 'Select at least one document',
            },
          ]}
        >
          <Select
            mode="multiple"
            allowClear
            placeholder="Select affected documents"
            disabled={!selectedPackageId || edvOptions.length === 0}
            loading={edvsQuery.isLoading}
            options={edvOptions}
          />
        </Form.Item>

        <Form.Item
          label="Change reason"
          name="changeReason"
          rules={[{ required: true, message: 'Change reason is required' }]}
        >
          <Select
            placeholder="Select change reason"
            options={CHANGE_REASON_OPTIONS}
          />
        </Form.Item>

        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Title is required' }]}
        >
          <Input placeholder="Brief summary of the change" />
        </Form.Item>

        <Form.Item label="Description" name="description">
          <Input.TextArea rows={4} placeholder="Scope impact and rationale" />
        </Form.Item>

        <Form.Item label="Supporting documents (optional)">
          <Upload
            beforeUpload={(file) => {
              setQueuedFiles((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setQueuedFiles((prev) =>
                prev.filter((f) => f.name !== file.name || f.size !== file.size),
              );
            }}
            fileList={queuedFiles.map((f, i) => ({
              uid: `${f.name}-${i}`,
              name: f.name,
              status: 'done' as const,
            }))}
            multiple
          >
            <Button icon={<UploadOutlined />}>Select files</Button>
          </Upload>
        </Form.Item>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={createMutation.isPending || uploading}
            disabled={createDisabled}
          >
            Create
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}
