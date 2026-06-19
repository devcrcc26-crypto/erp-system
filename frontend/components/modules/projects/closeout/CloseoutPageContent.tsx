'use client';

import { useEffect, useRef } from 'react';
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
import { layout } from '@/lib/theme/layout';

export default function CloseoutPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const closeoutQuery = useCloseout(projectId);
  const { refetch: refetchCloseout } = closeoutQuery;
  const initializeCloseout = useInitializeCloseout();
  const updateChecklist = useUpdateCloseoutChecklistItem();
  const initAttemptedRef = useRef(false);

  const closeout = closeoutQuery.data;
  const queryError =
    closeoutQuery.error instanceof ApiRequestError
      ? closeoutQuery.error
      : null;

  const projectNotFound =
    closeoutQuery.isError &&
    queryError?.status === 404 &&
    queryError.message === 'Project not found';

  const closeoutNotFound =
    closeoutQuery.isError &&
    queryError?.status === 404 &&
    queryError.message === 'Closeout not found';

  const apiUnavailable =
    closeoutQuery.isError &&
    queryError !== null &&
    (queryError.status === 404 || queryError.status === 0) &&
    !projectNotFound &&
    !closeoutNotFound;

  useEffect(() => {
    initAttemptedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (
      !closeoutNotFound ||
      initAttemptedRef.current ||
      initializeCloseout.isPending
    ) {
      return;
    }

    initAttemptedRef.current = true;

    void initializeCloseout
      .mutateAsync(projectId)
      .then(() => refetchCloseout())
      .catch((error: unknown) => {
        if (
          error instanceof ApiRequestError &&
          (error.status === 409 ||
            error.message === 'Closeout already exists for this project')
        ) {
          void refetchCloseout();
          return;
        }

        if (
          error instanceof ApiRequestError &&
          error.message === 'Project not found'
        ) {
          return;
        }

        initAttemptedRef.current = false;
      });
  }, [
    closeoutNotFound,
    initializeCloseout,
    initializeCloseout.isPending,
    projectId,
    refetchCloseout,
  ]);

  if (closeoutQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  return (
    <div className={layout.pageStack}>
      {projectNotFound && (
        <Alert
          type="warning"
          showIcon
          title="Project not found"
          description="This project no longer exists. Open it from the Projects list after a database reset."
        />
      )}

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
