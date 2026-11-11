'use client';

import { Steps } from 'antd';
import {
  getWorkflowStepIndex,
  type WorkflowStep,
} from '@/lib/api/workflow';

/**
 * Visual workflow progress for PM entities (RFI, submittal, issue, etc.).
 */
export default function WorkflowStepper({
  steps,
  currentStatus,
  size = 'small',
  className,
}: {
  steps: WorkflowStep[];
  currentStatus: string;
  size?: 'small' | 'default';
  className?: string;
}): React.ReactNode {
  const currentIndex = getWorkflowStepIndex(steps, currentStatus);

  return (
    <Steps
      size={size}
      current={currentIndex}
      className={className}
      items={steps.map((step, index) => ({
        title: step.label,
        status:
          index < currentIndex
            ? 'finish'
            : index === currentIndex
              ? 'process'
              : 'wait',
      }))}
    />
  );
}
