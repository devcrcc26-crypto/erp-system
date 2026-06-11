import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import DashboardStats from '@/components/modules/dashboard/DashboardStats';

export default function DashboardPage(): React.ReactNode {
  return (
    <div className="space-y-4 md:space-y-6">
      <DashboardStats />
      <FilterSection />
      <DashboardCharts />
    </div>
  );
}
