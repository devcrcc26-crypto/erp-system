'use client';

import { Input } from 'antd';
import { SearchOutlined, MenuOutlined } from '@ant-design/icons';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';

export default function PageHeader({
  title,
  onMenuClick,
  searchPlaceholder = 'Search projects...',
  showSearch = true,
}: {
  title: string;
  onMenuClick?: () => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
}): React.ReactNode {
  return (
    <header
      className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-6 py-5 shadow-sm md:px-8 md:py-6"
      style={{ borderRadius: 8 }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="mt-1 shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <MenuOutlined style={{ fontSize: 22 }} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{title}</h1>
          {showSearch && (
            <div className="mt-2 w-full sm:w-[50%] md:w-[40%] lg:w-[30%]">
              <Input
                prefix={<SearchOutlined className="text-slate-400" />}
                placeholder={searchPlaceholder}
                allowClear
              />
            </div>
          )}
        </div>
      </div>

      <HeaderActions />
    </header>
  );
}
