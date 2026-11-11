'use client';

import { Drawer } from 'antd';
import TaskDetailContent from '@/components/modules/projects/schedule/TaskDetailContent';
import type { Task } from '@/lib/api/project-management.types';
import { useProject } from '@/lib/query/projects';
import { wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';

export default function TaskDetailDrawer({
  open,
  projectId,
  task,
  onClose,
  onEdit,
}: {
  open: boolean;
  projectId: string;
  task: Task | null;
  onClose: () => void;
  onEdit?: (task: Task) => void;
}): React.ReactNode {
  const projectQuery = useProject(projectId, open);

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title={task ? formatLocalizedName(task) : 'Task details'}
      onClose={onClose}
    >
      {task && (
        <TaskDetailContent
          projectId={projectId}
          projectName={projectQuery.data?.name}
          projectNumber={projectQuery.data?.projectCode}
          task={task}
          onEdit={onEdit ? () => onEdit(task) : undefined}
        />
      )}
    </Drawer>
  );
}
