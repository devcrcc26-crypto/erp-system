import type { ComponentType } from "react";

type IconProps = { size?: number; className?: string; width?: number | string; height?: number | string };

type StatCardProps = {
    label: string;
    value: string;
    icon: ComponentType<IconProps>;
    iconBg: string;
    iconColor: string;
}

export default function StatCard({
    label, value, icon: Icon, iconBg, iconColor
}: StatCardProps) {
    return (
        <div className="rounded-md bg-white p-4 shadow-sm md:p-6">
            <div className="flex items-center gap-3 md:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md md:h-12 md:w-12"
                    style={{ backgroundColor: iconBg, color: iconColor }}>
                    <Icon size={20} />
                </div>
                <div>
                    <p className="text-2xl font-bold text-slate-900 md:text-3xl">{value}</p>
                    <p className="text-xs text-slate-500 md:text-sm">{label}</p>
                </div>
            </div>
        </div>
    )
}