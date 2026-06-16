import FilterSection from '@/components/FilterSection';
import DashboardCharts from '@/components/charts/DashboardCharts';
import DashboardStats from '@/components/modules/dashboard/DashboardStats';
import { layout } from '@/lib/theme/layout';

export default function DashboardPage(): React.ReactNode {
  return (
    <div className={layout.pageStack}>
      <DashboardStats />
      <FilterSection />
      <DashboardCharts />
    </div>
  );
}
