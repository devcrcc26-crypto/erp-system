'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Select } from 'antd';
import { useSearchParams } from 'next/navigation';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import type { EdvStatus } from '@/lib/api/epc.types';
import { useChangeRequests } from '@/lib/query/change-requests';
import {
  useTriggerRevision,
} from '@/lib/query/engineering-documents';
import { useEngineeringDocumentVersionHistory } from '@/lib/query/epc-workspace';
import { useRfis } from '@/lib/query/rfis';
import { useSubmittals } from '@/lib/query/submittals';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  parseRevisionTriggerParams,
  type RevisionTriggerSource,
} from '@/lib/utils/revision-trigger-url';
import { layout } from '@/lib/theme/layout';

interface TriggerRevisionFormValues {
  triggerSource: RevisionTriggerSource;
  triggerEntityId: string;
}

const TRIGGER_SOURCE_OPTIONS: Array<{
  value: RevisionTriggerSource;
  label: string;
}> = [
  { value: 'RFI', label: 'RFI' },
  { value: 'CHANGE_REQUEST', label: 'Change request' },
  { value: 'SUBMITTAL_REVIEW', label: 'Submittal review' },
];

function describeEligibility(
  entries: Array<{ status: EdvStatus | string }>,
): { canTrigger: boolean; reason: string | null } {
  if (entries.length === 0) {
    return {
      canTrigger: false,
      reason: 'Register at least one revision before triggering an external revision.',
    };
  }

  const hasLocked = entries.some((entry) => entry.status === 'LOCKED');
  const hasDraft = entries.some((entry) => entry.status === 'DRAFT');

  if (!hasLocked) {
    return {
      canTrigger: false,
      reason:
        'A locked revision is required. Lock the current revision through the internal review workflow first.',
    };
  }

  if (hasDraft) {
    return {
      canTrigger: false,
      reason:
        'An active draft revision already exists. Complete or supersede it before starting another external revision.',
    };
  }

  return { canTrigger: true, reason: null };
}

/**
 * Starts the external revision loop for an engineering document (RFI / CR / submittal).
 */
export default function TriggerRevisionPanel({
  projectId,
  engineeringDocumentId,
}: {
  projectId: string;
  engineeringDocumentId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const searchParams = useSearchParams();
  const urlContext = parseRevisionTriggerParams(searchParams);

  const [modalOpen, setModalOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  const [form] = Form.useForm<TriggerRevisionFormValues>();

  const historyQuery = useEngineeringDocumentVersionHistory(
    engineeringDocumentId,
    !permLoading && lens.canViewEngineering,
  );
  const triggerRevision = useTriggerRevision();

  const triggerSource = Form.useWatch('triggerSource', form) as
    | RevisionTriggerSource
    | undefined;

  const rfisQuery = useRfis(
    projectId,
    { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    modalOpen && triggerSource === 'RFI',
  );
  const changeRequestsQuery = useChangeRequests(
    projectId,
    { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    modalOpen && triggerSource === 'CHANGE_REQUEST',
  );
  const submittalsQuery = useSubmittals(
    projectId,
    { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
    modalOpen && triggerSource === 'SUBMITTAL_REVIEW',
  );

  const eligibility = useMemo(
    () => describeEligibility(historyQuery.data ?? []),
    [historyQuery.data],
  );

  const entityOptions = useMemo(() => {
    if (triggerSource === 'RFI') {
      return (rfisQuery.data?.data ?? []).map((rfi) => ({
        value: rfi.id,
        label: `${rfi.rfiNumber} - ${rfi.title}`,
      }));
    }
    if (triggerSource === 'CHANGE_REQUEST') {
      return (changeRequestsQuery.data?.data ?? []).map((cr) => ({
        value: cr.id,
        label: `${cr.changeNumber} - ${cr.title}`,
      }));
    }
    if (triggerSource === 'SUBMITTAL_REVIEW') {
      return (submittalsQuery.data?.data ?? []).map((submittal) => ({
        value: submittal.id,
        label: `${submittal.submittalNumber} - ${submittal.title}`,
      }));
    }
    return [];
  }, [
    changeRequestsQuery.data?.data,
    rfisQuery.data?.data,
    submittalsQuery.data?.data,
    triggerSource,
  ]);

  useEffect(() => {
    if (!urlContext || autoOpened || !eligibility.canTrigger || !lens.canEditEngineering) {
      return;
    }
    form.setFieldsValue({
      triggerSource: urlContext.triggerSource,
      triggerEntityId: urlContext.triggerEntityId,
    });
    setModalOpen(true);
    setAutoOpened(true);
  }, [
    autoOpened,
    eligibility.canTrigger,
    form,
    lens.canEditEngineering,
    urlContext,
  ]);

  function openModal(): void {
    form.setFieldsValue({
      triggerSource: urlContext?.triggerSource ?? 'RFI',
      triggerEntityId: urlContext?.triggerEntityId,
    });
    setModalOpen(true);
  }

  function closeModal(): void {
    setModalOpen(false);
    form.resetFields();
  }

  async function handleSubmit(values: TriggerRevisionFormValues): Promise<void> {
    try {
      const result = await triggerRevision.mutateAsync({
        projectId,
        engineeringDocumentId,
        body: {
          triggerSource: values.triggerSource,
          triggerEntityId: values.triggerEntityId,
        },
      });
      messageApi.success(
        result.newEdvId
          ? 'Draft revision created - upload your revised file above, then check Version history below.'
          : 'External revision triggered successfully.',
      );
      closeModal();
      void historyQuery.refetch();
      document.getElementById('version-history')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      notifyApiError(error, 'Failed to trigger revision', messageApi);
    }
  }

  if (permLoading || historyQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering) {
    return null;
  }

  return (
    <>
      <FormLayout
        title="External revision"
        description="Start a new draft revision when an RFI, change request, or submittal review requires design changes."
        className="erp-trigger-revision-panel"
        extra={
          lens.canEditEngineering ? (
            <Button
              type="primary"
              onClick={openModal}
              disabled={!eligibility.canTrigger || historyQuery.isLoading}
            >
              Trigger revision
            </Button>
          ) : undefined
        }
      >
        {urlContext && (
          <Alert
            type="info"
            showIcon
            className="!mb-3"
            title="Revision context from link"
            description={`Triggered by ${urlContext.triggerSource.replace('_', ' ').toLowerCase()}. Select the document and confirm to start the external revision loop.`}
          />
        )}

        {historyQuery.isLoading ? (
          <p className={layout.drawerMutedText}>Checking revision eligibility…</p>
        ) : eligibility.reason ? (
          <Alert type="warning" showIcon title={eligibility.reason} />
        ) : (
          <p className={layout.drawerMutedText}>
            Creates a new draft revision from the latest locked version and records
            the external trigger in the workflow history.
          </p>
        )}
      </FormLayout>

      <Modal
        title="Trigger external revision"
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText="Trigger revision"
        confirmLoading={triggerRevision.isPending}
        destroyOnHidden
      >
        <Form<TriggerRevisionFormValues>
          form={form}
          layout="vertical"
          className="erp-drawer-form mt-4"
          onFinish={(values: TriggerRevisionFormValues) =>
            void handleSubmit(values)
          }
        >
          <Form.Item
            label="Trigger source"
            name="triggerSource"
            rules={[{ required: true, message: 'Select a trigger source' }]}
          >
            <Select
              options={TRIGGER_SOURCE_OPTIONS}
              onChange={() => form.setFieldValue('triggerEntityId', undefined)}
            />
          </Form.Item>
          <Form.Item
            label="Source record"
            name="triggerEntityId"
            rules={[{ required: true, message: 'Select the source record' }]}
          >
            <Select
              showSearch
              placeholder="Select RFI, change request, or submittal"
              loading={
                rfisQuery.isLoading ||
                changeRequestsQuery.isLoading ||
                submittalsQuery.isLoading
              }
              options={entityOptions}
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
