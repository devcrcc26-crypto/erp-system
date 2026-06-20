import type { ComponentType } from 'react';
import { Empty, Tag } from 'antd';

type IconProps = { size?: number; className?: string; strokeWidth?: number };

export default function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-24">
      <Empty
        image={
          <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-md bg-slate-100">
            <Icon size={36} className="text-slate-400" strokeWidth={1.5} />
          </div>
        }
        description={
          <div className="text-center">
            <h2 className="mb-2 text-xl font-semibold text-slate-800">{title}</h2>
            <p className="mx-auto max-w-sm text-sm text-slate-500">
              {description ??
                "This page is currently under construction. Check back soon, it's being built!"}
            </p>
            <Tag
              color="orange"
              className="!mt-6 !rounded-full !border-orange-200 !bg-orange-100 !px-4 !py-1 !text-orange-600"
            >
              Coming soon
            </Tag>
          </div>
        }
      />
    </div>
  );
}
