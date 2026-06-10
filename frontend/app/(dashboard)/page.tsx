import DashboardHeader from "@/components/DashboardHeader";
import FilterSection from "@/components/FilterSection";
import DashboardCharts from "@/components/charts/DashboardCharts";
import StatCard from "@/components/StatCard";
import { Network, ListTodo, PieChart } from "lucide-react";
import ThreePeopleIcon from "@/components/ThreePeopleIcon";

export default function DashboardPage() {
  return (
    <div className="space-y-4 md:space-y-6">

      <section className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
        <StatCard
          label="Projects"
          value="19"
          icon={Network}
          iconBg="#dbeafe"
          iconColor="#2563eb"
        />
        <StatCard
          label="Tasks"
          value="37"
          icon={ListTodo}
          iconBg="#fef3c7"
          iconColor="#d97706"
        />
        <StatCard
          label="Team Members"
          value="69"
          icon={ThreePeopleIcon}
          iconBg="#dcfce7"
          iconColor="#16a34a"
        />
        <StatCard
          label="Completion Rate"
          value="63%"
          icon={PieChart}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
        />
      </section>

      <FilterSection />
      <DashboardCharts />
    </div>
  );
}
