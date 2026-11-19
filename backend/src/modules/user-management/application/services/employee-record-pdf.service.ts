import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  deriveEducationLevel,
  deriveFieldOfStudy,
} from '../../domain/derived-education';
import { calculateYearsOfExperienceFromDates } from '../../domain/years-of-experience';
import {
  dash,
  humanize,
  isoDate,
  personName,
  renderDocumentPdf,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';

type AuditContext = { companyId: string; userId: string };

/**
 * Full employee profile PDF for HR export from the employee detail page.
 */
@Injectable()
export class EmployeeRecordPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds a printable employee record PDF for the given user.
   */
  async getPdf(
    ctx: AuditContext,
    userId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      include: {
        department: { select: { name: true } },
        position: { select: { title: true } },
        branch: { select: { name: true } },
        seniorityLevel: { select: { name: true } },
        reportsTo: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
            employeeId: true,
          },
        },
        educationRecords: {
          where: { deletedAt: null },
          orderBy: [{ graduationYear: 'desc' }, { createdAt: 'desc' }],
        },
        priorEmployments: {
          where: { deletedAt: null },
          orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }],
        },
        positionHistory: {
          where: { deletedAt: null },
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
          include: { position: { select: { title: true } } },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const educationLevel =
      deriveEducationLevel(
        user.educationRecords.map((row) => row.certificateType),
      ) ?? user.educationLevel;
    const fieldOfStudy =
      deriveFieldOfStudy(user.educationRecords) ?? user.fieldOfStudy;
    const yearsOfExperience = calculateYearsOfExperienceFromDates(
      user.employmentDate,
      user.priorEmployments.map((row) => row.dateFrom),
    );

    const address = [
      user.addressHouseNumber,
      user.addressWoreda,
      user.kebele,
      user.addressSubcity,
      user.addressCity,
      user.addressRegion,
      user.addressCountry,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');

    const emergency = Array.isArray(user.emergencyContacts)
      ? user.emergencyContacts
          .filter(
            (entry): entry is Record<string, unknown> =>
              !!entry && typeof entry === 'object' && !Array.isArray(entry),
          )
          .map((entry) => {
            const name = [entry.firstName, entry.middleName, entry.lastName]
              .map((part) => (typeof part === 'string' ? part.trim() : ''))
              .filter(Boolean)
              .join(' ');
            const relationship =
              typeof entry.relationship === 'string'
                ? entry.relationship.trim()
                : '';
            const phone =
              typeof entry.phone === 'string' ? entry.phone.trim() : '';
            return [name, relationship, phone].filter(Boolean).join(' · ');
          })
          .filter(Boolean)
      : [];

    const code = user.employeeId?.trim() || user.id.slice(0, 8);
    const buffer = await renderDocumentPdf({
      title: 'Employee Record',
      titleZh: '员工档案',
      number: code,
      status: user.employmentStatus,
      employee: {
        person: user,
        department: user.department?.name,
        extraRows: [
          ['Position / 职位', user.position?.title],
          ['Branch / 分支', user.branch?.name],
          ['Reports to / 上级', personName(user.reportsTo)],
        ],
      },
      sections: [
        {
          title: 'Personal / 个人信息',
          rows: [
            ['Gender / 性别', humanize(user.gender)],
            ['Date of birth / 出生日期', isoDate(user.dateOfBirth)],
            ['Place of birth / 出生地', user.placeOfBirth],
            ['Marital status / 婚姻状况', humanize(user.maritalStatus)],
            ['Nationality / 国籍', humanize(user.nationality)],
            ['National ID / 身份证号', user.nationalId],
            ['ID issue / 签发', isoDate(user.idIssueDate)],
            ['ID expiry / 到期', isoDate(user.idExpiryDate)],
            ['Blood type / 血型', user.bloodType],
            ['Phone / 电话', user.phone],
            ['Email / 邮箱', user.email],
            ['Address / 地址', address || null],
          ],
        },
        {
          title: 'Employment / 雇佣信息',
          rows: [
            ['Employee type / 员工类型', humanize(user.employeeType)],
            ['Employment date / 入职日期', isoDate(user.employmentDate)],
            ['Seniority / 职级', user.seniorityLevel?.name],
            ['Education level / 学历', humanize(educationLevel)],
            ['Field of study / 专业', fieldOfStudy],
            [
              'Years of experience / 工作年限',
              yearsOfExperience != null ? String(yearsOfExperience) : null,
            ],
            ['Pension number / 养老金号', user.pensionNumber],
            ['TIN / 税号', user.tin],
          ],
        },
        {
          title: 'Payroll / 薪酬账户',
          rows: [
            ['Bank / 银行', user.bankName],
            ['Branch / 分行', user.bankBranch],
            ['Account / 账号', user.bankAccountNumber],
            ['Include in payroll / 纳入工资', user.includeInPayroll ? 'Yes' : 'No'],
          ],
        },
      ],
      tables: [
        {
          title: 'Higher education / 高等教育',
          columns: [
            { header: 'Institute / 院校', weight: 3 },
            { header: 'Year / 年份', weight: 1 },
            { header: 'Major / 专业', weight: 2 },
            { header: 'Certificate / 证书', weight: 1.5 },
          ],
          rows: user.educationRecords.map((row) => ({
            cells: [
              row.instituteName,
              row.graduationYear,
              row.subjectMajor,
              row.certificateType,
            ],
          })),
          emptyText: 'No education records / 无学历记录',
        },
        {
          title: 'Prior employment / 过往工作经历',
          columns: [
            { header: 'Employer / 雇主', weight: 3 },
            { header: 'From / 起', weight: 1.4 },
            { header: 'To / 止', weight: 1.4 },
            { header: 'Position / 职位', weight: 2 },
          ],
          rows: user.priorEmployments.map((row) => ({
            cells: [
              row.employerName,
              isoDate(row.dateFrom),
              isoDate(row.dateTo),
              row.lastPosition,
            ],
          })),
          emptyText: 'No prior employment / 无过往工作经历',
        },
        {
          title: 'Position history / 职位与薪资历史',
          columns: [
            { header: 'Position / 职位', weight: 2.5 },
            { header: 'From / 起', weight: 1.4 },
            { header: 'To / 止', weight: 1.4 },
            { header: 'Salary override / 薪资覆盖', weight: 1.6 },
            { header: 'Note / 备注', weight: 2 },
          ],
          rows: user.positionHistory.map((row) => ({
            cells: [
              row.position?.title ?? '—',
              isoDate(row.effectiveFrom),
              row.effectiveTo ? isoDate(row.effectiveTo) : 'Current',
              row.salaryOverride != null ? String(row.salaryOverride) : '—',
              row.note,
            ],
          })),
          emptyText: 'No position history / 无职位历史',
        },
        {
          title: 'Emergency contacts / 紧急联系人',
          numbered: false,
          columns: [{ header: 'Contact / 联系人', weight: 1 }],
          rows: emergency.map((line) => ({ cells: [line] })),
          emptyText: 'No emergency contacts / 无紧急联系人',
        },
      ],
      notes: [
        `Generated ${isoDate(new Date())}  ·  Employee ${dash(code)}`,
        'This document is system-generated for HR use. / 本文件由系统生成，供人事使用。',
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `employee-record_${safeFilePart(code)}_${isoDate(new Date())}.pdf`,
    };
  }
}
