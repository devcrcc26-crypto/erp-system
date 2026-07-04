import type { Project } from '@/lib/api/project-management.types';
import type { ProjectStatus } from '@/lib/constants/project-status';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';

export function groupProjectsByStatus(
  projects: Project[],
): Record<ProjectStatus, Project[]> {
  const grouped = PROJECT_STATUS_WORKFLOW.reduce(
    (accumulator, step) => {
      accumulator[step.key as ProjectStatus] = [];
      return accumulator;
    },
    {} as Record<ProjectStatus, Project[]>,
  );

  for (const project of projects) {
    if (grouped[project.status]) {
      grouped[project.status].push(project);
    }
  }

  return grouped;
}

export function countProjectsByStatus(
  projects: Project[],
): Record<ProjectStatus, number> {
  const grouped = groupProjectsByStatus(projects);
  return PROJECT_STATUS_WORKFLOW.reduce(
    (accumulator, step) => {
      const status = step.key as ProjectStatus;
      accumulator[status] = grouped[status].length;
      return accumulator;
    },
    {} as Record<ProjectStatus, number>,
  );
}
