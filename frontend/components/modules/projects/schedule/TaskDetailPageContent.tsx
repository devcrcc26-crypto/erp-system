'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import TaskDetailContent from '@/components/modules/projects/schedule/TaskDetailContent';
import TaskFormDrawer from '@/components/modules/projects/schedule/TaskFormDrawer';
import { useTask } from '@/lib/query/schedule';
import { useProject } from '@/lib/query/projects';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';

export default function TaskDetailPageContent({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}): React.ReactNode {
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const taskQuery = useTask(projectId, taskId);
  const projectQuery = useProject(projectId);
  const pm = usePmCapabilities();
  const canEditTask = pm.schedule.canEdit;

  if (taskQuery.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-6">
        <Spin />
      </div>
    );
  }

  if (!taskQuery.data) {
    return (
      <div className="p-6">
        <Link href={`/projects/${projectId}/schedule/tasks`}>
          <Button type="link" className="!px-0" icon={<ArrowLeftOutlined />}>
            Back to tasks
          </Button>
        </Link>
        <p className="mt-4 text-[14px] text-gray-500">Task not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link href={`/projects/${projectId}/schedule/tasks`}>
        <Button type="link" className="!px-0" icon={<ArrowLeftOutlined />}>
          Back to task
        </Button>
      </Link>
      <div className="mt-4">
        <TaskDetailContent
          projectId={projectId}
          projectName={projectQuery.data?.name}
          projectNumber={projectQuery.data?.projectCode}
          task={taskQuery.data}
          onEdit={canEditTask ? () => setTaskFormOpen(true) : undefined}
        />
      </div>

      <TaskFormDrawer
        open={taskFormOpen}
        projectId={projectId}
        task={taskQuery.data}
        onClose={() => setTaskFormOpen(false)}
        onSaved={() => {
          void taskQuery.refetch();
        }}
      />
    </div>
  );
}
