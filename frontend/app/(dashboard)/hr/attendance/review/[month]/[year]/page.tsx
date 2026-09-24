import AttendanceReviewPageContent from '@/components/modules/hr/attendance/AttendanceReviewPageContent';

export default async function AttendanceReviewPage({
  params,
}: {
  params: Promise<{ month: string; year: string }>;
}): Promise<React.ReactNode> {
  const { month, year } = await params;
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);

  return (
    <AttendanceReviewPageContent month={monthNum} year={yearNum} />
  );
}
