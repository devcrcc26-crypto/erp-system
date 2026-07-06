'use client';

import Link from 'next/link';
import { Button, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import TaskDetailContent from '@/components/modules/projects/schedule/TaskDetailContent';
import { useTasks } from '@/lib/query/schedule';
import { useProject } from '@/lib/query/projects';

export default function TaskDetailPageContent({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}): React.ReactNode {
  const tasksQuery = useTasks(projectId, { page: 1, limit: 200 });
  const projectQuery = useProject(projectId);
  const task = tasksQuery.data?.data.find((entry) => entry.id === taskId);

  if (tasksQuery.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-6">
        <Spin />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6">
        <Link href={`/projects/${projectId}/schedule`}>
          <Button type="link" className="!px-0" icon={<ArrowLeftOutlined />}>
            Back to schedule
          </Button>
        </Link>
        <p className="mt-4 text-[14px] text-gray-500">Task not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link href={`/projects/${projectId}/schedule`}>
        <Button type="link" className="!px-0" icon={<ArrowLeftOutlined />}>
          Back to schedule
        </Button>
      </Link>
      <div className="mt-4">
        <TaskDetailContent
          projectId={projectId}
          projectName={projectQuery.data?.name}
          projectNumber={projectQuery.data?.projectCode}
          task={task}
        />
      </div>
    </div>
  );
}
