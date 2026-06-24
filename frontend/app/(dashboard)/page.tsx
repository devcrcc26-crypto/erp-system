// UI polish pass — styles only, no logic changes

import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import DashboardStats from '@/components/modules/dashboard/DashboardStats';

export default function DashboardPage(): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <DashboardStats />
      <FilterSection />
      <DashboardCharts />
    </div>
  );
}
