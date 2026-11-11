import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/lib/api/project-management.types';
import type { PaginationMeta } from '@/lib/api/types';
import { fetchAllScheduleTasks, SCHEDULE_PAGE_SIZE } from '@/lib/query/schedule';

vi.mock('@/lib/api/client', () => ({
  apiGetPaginated: vi.fn(),
}));

import { apiGetPaginated } from '@/lib/api/client';

const mockedApiGetPaginated = vi.mocked(apiGetPaginated);

function makeTask(id: string, name: string): Task {
  return { id, name } as Task;
}

function makePage(
  tasks: Task[],
  meta: Partial<PaginationMeta> & Pick<PaginationMeta, 'total' | 'page' | 'pages'>,
) {
  return {
    data: tasks,
    meta: {
      limit: SCHEDULE_PAGE_SIZE,
      ...meta,
    },
  };
}

describe('fetchAllScheduleTasks', () => {
  const projectId = 'project-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the first page when meta.pages is 1 without fetching additional pages', async () => {
    const firstPage = makePage([makeTask('task-1', 'Task 1')], {
      total: 1,
      page: 1,
      pages: 1,
    });
    mockedApiGetPaginated.mockResolvedValueOnce(firstPage);

    const result = await fetchAllScheduleTasks(projectId);

    expect(mockedApiGetPaginated).toHaveBeenCalledTimes(1);
    expect(result).toEqual(firstPage);
  });

  it('fetches remaining pages in parallel and merges all task data', async () => {
    const firstPage = makePage([makeTask('task-1', 'Task 1')], {
      total: 3,
      page: 1,
      pages: 3,
    });
    const secondPage = makePage([makeTask('task-2', 'Task 2')], {
      total: 3,
      page: 2,
      pages: 3,
    });
    const thirdPage = makePage([makeTask('task-3', 'Task 3')], {
      total: 3,
      page: 3,
      pages: 3,
    });

    mockedApiGetPaginated.mockImplementation(async (url: string) => {
      if (url.includes('page=1')) {
        return firstPage;
      }
      if (url.includes('page=2')) {
        return secondPage;
      }
      if (url.includes('page=3')) {
        return thirdPage;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchAllScheduleTasks(projectId);

    expect(mockedApiGetPaginated).toHaveBeenCalledTimes(3);
    expect(result.data).toHaveLength(3);
    expect(result.meta).toEqual({
      total: 3,
      page: 1,
      limit: 3,
      pages: 1,
    });
  });

  it('preserves page order when merging parallel results', async () => {
    mockedApiGetPaginated.mockImplementation(async (url: string) => {
      if (url.includes('page=1')) {
        return makePage(
          [makeTask('task-1', 'A'), makeTask('task-2', 'B')],
          { total: 5, page: 1, pages: 3 },
        );
      }
      if (url.includes('page=2')) {
        return makePage([makeTask('task-3', 'C'), makeTask('task-4', 'D')], {
          total: 5,
          page: 2,
          pages: 3,
        });
      }
      if (url.includes('page=3')) {
        return makePage([makeTask('task-5', 'E')], {
          total: 5,
          page: 3,
          pages: 3,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fetchAllScheduleTasks(projectId);

    expect(result.data.map((task) => task.id)).toEqual([
      'task-1',
      'task-2',
      'task-3',
      'task-4',
      'task-5',
    ]);
  });

  it('throws when any parallel page fetch fails', async () => {
    mockedApiGetPaginated.mockImplementation(async (url: string) => {
      if (url.includes('page=1')) {
        return makePage([makeTask('task-1', 'Task 1')], {
          total: 3,
          page: 1,
          pages: 3,
        });
      }
      if (url.includes('page=2')) {
        throw new Error('Page 2 failed');
      }
      if (url.includes('page=3')) {
        return makePage([makeTask('task-3', 'Task 3')], {
          total: 3,
          page: 3,
          pages: 3,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(fetchAllScheduleTasks(projectId)).rejects.toThrow('Page 2 failed');
  });
});
