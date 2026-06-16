'use client';

import { useEffect } from 'react';
import { Alert, Checkbox, Descriptions, Spin } from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { CLOSEOUT_WORKFLOW } from '@/lib/api/workflow';
import {
  useCloseout,
  useInitializeCloseout,
  useUpdateCloseoutChecklistItem,
} from '@/lib/query/closeout';
import { ApiRequestError } from '@/lib/api/errors';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function CloseoutPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const closeoutQuery = useCloseout(projectId);
  const initializeCloseout = useInitializeCloseout();
  const updateChecklist = useUpdateCloseoutChecklistItem();

  const closeout = closeoutQuery.data;
  const apiUnavailable =
    closeoutQuery.isError &&
    closeoutQuery.error instanceof ApiRequestError &&
    (closeoutQuery.error.status === 404 || closeoutQuery.error.status === 0);

  useEffect(() => {
    if (
      closeoutQuery.isError &&
      closeoutQuery.error instanceof ApiRequestError &&
      closeoutQuery.error.status === 404
    ) {
      void initializeCloseout.mutateAsync(projectId).then(() => {
        void closeoutQuery.refetch();
      });
    }
  }, [closeoutQuery, initializeCloseout, projectId]);

  if (closeoutQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          title="Closeout API is initializing. Please refresh in a moment."
        />
      )}

      {closeout && (
        <>
          <WorkflowStepper
            steps={CLOSEOUT_WORKFLOW}
            currentStatus={closeout.status}
          />

          <FormLayout title="Closeout summary">
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Practical completion">
                {formatProjectDate(closeout.practicalCompletionDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Defects liability end">
                {formatProjectDate(closeout.defectsLiabilityEndDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Final completion">
                {formatProjectDate(closeout.finalCompletionDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Final settlement">
                {closeout.finalSettlement ?? '—'}
              </Descriptions.Item>
            </Descriptions>
          </FormLayout>

          <FormLayout title="Checklist">
            <div className="space-y-3">
              {closeout.checklistItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 rounded border border-slate-200 p-3"
                >
                  <Checkbox
                    checked={item.isComplete}
                    onChange={(event: CheckboxChangeEvent) => {
                      void updateChecklist
                        .mutateAsync({
                          projectId,
                          itemId: item.id,
                          body: { isComplete: event.target.checked },
                        })
                        .then(() => {
                          void closeoutQuery.refetch();
                        });
                    }}
                  />
                  <span className="text-sm text-slate-700">
                    <strong>{item.category}:</strong> {item.description}
                  </span>
                </label>
              ))}
            </div>
          </FormLayout>
        </>
      )}
    </div>
  );
}
