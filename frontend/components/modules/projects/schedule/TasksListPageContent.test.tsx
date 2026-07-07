import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TasksListPageContent from './TasksListPageContent';

const mockUseAllTasks = vi.fn();
const mockUseTaskDependencies = vi.fn();
const mockUsePermissionsLoading = vi.fn();

vi.mock('@/lib/query/schedule', () => ({
  useAllTasks: (...args: unknown[]) => mockUseAllTasks(...args),
  useTaskDependencies: (...args: unknown[]) => mockUseTaskDependencies(...args),
}));

vi.mock('@/components/modules/projects/ProjectModuleGate', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-pm-capabilities', () => ({
  usePermissionsLoading: () => mockUsePermissionsLoading(),
}));

vi.mock('@/components/modules/projects/schedule/TasksPanel', () => ({
  default: () => <div data-testid="tasks-panel" />,
}));

describe('TasksListPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePermissionsLoading.mockReturnValue(false);
    mockUseAllTasks.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: [] },
      error: null,
    });
    mockUseTaskDependencies.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
      error: null,
    });
  });

  it('renders the task list summary export action', () => {
    render(<TasksListPageContent projectId="project-1" />);

    expect(
      screen.getByRole('button', { name: /export task list \(summary\)/i }),
    ).toBeInTheDocument();
  });
});
