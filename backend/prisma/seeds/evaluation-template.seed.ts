import { PrismaClient } from '@prisma/client';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

export async function seedEvaluationTemplate(
  prisma: PrismaClient,
  options?: { companyId?: string; actorUserId?: string },
): Promise<void> {
  const companyId = options?.companyId ?? COMPANY_ID;

  const existing = await prisma.evaluationTemplate.findFirst({
    where: { companyId, isActive: true },
  });
  if (existing) {
    console.log('  Evaluation template already exists, skipping');
    return;
  }

  let actorUserId = options?.actorUserId;
  if (!actorUserId) {
    const actor = await prisma.user.findFirst({
      where: { companyId, deletedAt: null, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!actor) {
      console.log('  No active user found, skipping evaluation template seed');
      return;
    }
    actorUserId = actor.id;
  }

  const template = await prisma.evaluationTemplate.create({
    data: {
      id: '00000000-0000-4000-8000-000000000e01',
      companyId,
      name: 'CCECC Ethiopia Standard Evaluation Form',
      description: 'Standard quarterly evaluation form for all employees',
      version: 1,
      isActive: true,
      createdBy: actorUserId,
      updatedBy: actorUserId,
      sections: {
        create: [
          {
            id: '00000000-0000-4000-8000-000000000e02',
            name: 'Work Performance',
            nameZh: '工作绩效',
            weight: 40,
            sortOrder: 1,
            createdBy: actorUserId,
            updatedBy: actorUserId,
            criteria: {
              create: [
                {
                  id: '00000000-0000-4000-8000-000000000e10',
                  name: 'Quality of Work Output',
                  nameZh: '工作质量',
                  description: 'Accuracy, thoroughness, and standard of completed work',
                  weight: 25,
                  sortOrder: 1,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e11',
                  name: 'Meeting Deadlines',
                  nameZh: '按时完成任务',
                  description: 'Ability to complete tasks on time',
                  weight: 25,
                  sortOrder: 2,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e12',
                  name: 'Technical Accuracy',
                  nameZh: '技术准确性',
                  description: 'Technical precision and correctness of work',
                  weight: 25,
                  sortOrder: 3,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e13',
                  name: 'Problem Solving',
                  nameZh: '问题解决能力',
                  description: 'Ability to identify and resolve issues independently',
                  weight: 25,
                  sortOrder: 4,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
              ],
            },
          },
          {
            id: '00000000-0000-4000-8000-000000000e03',
            name: 'Attitude & Discipline',
            nameZh: '态度与纪律',
            weight: 30,
            sortOrder: 2,
            createdBy: actorUserId,
            updatedBy: actorUserId,
            criteria: {
              create: [
                {
                  id: '00000000-0000-4000-8000-000000000e14',
                  name: 'Attendance & Punctuality',
                  nameZh: '出勤与准时',
                  description: 'Consistent attendance and arriving on time',
                  weight: 25,
                  sortOrder: 1,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e15',
                  name: 'Following Instructions',
                  nameZh: '执行指令',
                  description: 'Ability to follow directions from supervisors',
                  weight: 25,
                  sortOrder: 2,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e16',
                  name: 'Teamwork & Cooperation',
                  nameZh: '团队合作',
                  description: 'Collaboration with colleagues and team members',
                  weight: 25,
                  sortOrder: 3,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e17',
                  name: 'Communication',
                  nameZh: '沟通能力',
                  description: 'Clear and effective communication with team and management',
                  weight: 25,
                  sortOrder: 4,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
              ],
            },
          },
          {
            id: '00000000-0000-4000-8000-000000000e04',
            name: 'Professional Development',
            nameZh: '专业发展',
            weight: 20,
            sortOrder: 3,
            createdBy: actorUserId,
            updatedBy: actorUserId,
            criteria: {
              create: [
                {
                  id: '00000000-0000-4000-8000-000000000e18',
                  name: 'Learning & Skill Improvement',
                  nameZh: '学习与技能提升',
                  description: 'Actively improving technical and professional skills',
                  weight: 34,
                  sortOrder: 1,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e19',
                  name: 'Initiative & Innovation',
                  nameZh: '主动性与创新',
                  description: 'Proactively identifying improvements and new approaches',
                  weight: 33,
                  sortOrder: 2,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e1a',
                  name: 'Knowledge Sharing',
                  nameZh: '知识分享',
                  description: 'Sharing expertise and supporting colleagues',
                  weight: 33,
                  sortOrder: 3,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
              ],
            },
          },
          {
            id: '00000000-0000-4000-8000-000000000e05',
            name: 'Safety & Compliance',
            nameZh: '安全与合规',
            weight: 10,
            sortOrder: 4,
            createdBy: actorUserId,
            updatedBy: actorUserId,
            criteria: {
              create: [
                {
                  id: '00000000-0000-4000-8000-000000000e1b',
                  name: 'Following Safety Rules',
                  nameZh: '遵守安全规定',
                  description: 'Adherence to safety protocols and procedures',
                  weight: 50,
                  sortOrder: 1,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
                {
                  id: '00000000-0000-4000-8000-000000000e1c',
                  name: 'Compliance with Company Policies',
                  nameZh: '遵守公司政策',
                  description: 'Following company rules and regulations',
                  weight: 50,
                  sortOrder: 2,
                  createdBy: actorUserId,
                  updatedBy: actorUserId,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`  ✓ Evaluation template seeded: ${template.name}`);
}
