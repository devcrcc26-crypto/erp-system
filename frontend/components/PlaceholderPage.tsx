import type { ComponentType } from "react";

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
    <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-md bg-slate-100">
        <Icon size={36} className="text-slate-400" strokeWidth={1.5} />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-slate-800">{title}</h2>
      <p className="max-w-sm text-sm text-slate-500">
        {description ??
          "This page is currently under construction. Check back soon, it's being built!"}
      </p>
      <span className="mt-6 inline-block rounded-full bg-orange-100 px-4 py-1.5 text-xs font-medium text-orange-600">
        Coming soon
      </span>
    </div>
  );
}
