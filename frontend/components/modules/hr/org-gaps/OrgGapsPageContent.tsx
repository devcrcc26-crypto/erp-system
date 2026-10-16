'use client';

import { Card, Col, Row, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '@/components/ui/PageHeader/PageHeader';
import KPICard from '@/components/ui/KPICard/KPICard';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useOrgGapReport } from '@/lib/query/org-gaps';
import type { OrgGapEmployee } from '@/lib/api/org-gaps';

const P = 'pages.hr.orgGaps';

const employeeColumns: ColumnsType<OrgGapEmployee> = [
  { title: 'Employee ID', dataIndex: 'employeeId', key: 'employeeId', width: 120 },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Department', dataIndex: 'departmentName', key: 'departmentName' },
  { title: 'Discipline', dataIndex: 'disciplineName', key: 'disciplineName' },
];

export default function OrgGapsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { data, isLoading, isError } = useOrgGapReport();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Typography.Text type="danger">
        {t(`${P}.loadError`, 'Could not load org gap report.')}
      </Typography.Text>
    );
  }

  const { totals } = data;

  return (
    <div className="space-y-4">
      <PageHeader title={t(`${P}.title`)} showSearch={false} />
      <Typography.Paragraph type="secondary">{t(`${P}.description`)}</Typography.Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <KPICard label={t(`${P}.noSupervisor`)} value={String(totals.withoutSupervisor)} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KPICard label={t(`${P}.noDepartment`)} value={String(totals.withoutDepartment)} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KPICard label={t(`${P}.noDiscipline`)} value={String(totals.withoutDiscipline)} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KPICard
            label={t(`${P}.supervisorsNoAccount`)}
            value={String(totals.supervisorsWithoutAccount)}
          />
        </Col>
      </Row>

      {data.supervisorsWithoutAccount.length > 0 && (
        <Card title={t(`${P}.supervisorsNoAccount`, 'Supervisors without accounts')}>
          <ul className="list-disc pl-5">
            {data.supervisorsWithoutAccount.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t(`${P}.employeesNoSupervisor`, 'Employees without supervisor')}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
          columns={employeeColumns}
          dataSource={data.withoutSupervisor}
        />
      </Card>

      <Card title={t(`${P}.employeesNoDepartment`, 'Employees without department')}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
          columns={employeeColumns}
          dataSource={data.withoutDepartment}
        />
      </Card>

      <Card title={t(`${P}.employeesNoDiscipline`, 'Employees without discipline')}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
          columns={employeeColumns}
          dataSource={data.withoutDiscipline}
        />
      </Card>
    </div>
  );
}
