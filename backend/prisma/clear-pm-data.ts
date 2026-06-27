import { FolderContextType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Deletes all projects and dependent PM/EPC records for a company.
 * Keeps company, users, roles, permissions - reference data intact.
 */
export async function clearAllProjectData(
  companyId: string = DEFAULT_COMPANY_ID,
): Promise<{ projectCount: number; projectCodes: string[] }> {
  const projects = await prisma.project.findMany({
    where: { companyId },
    select: { id: true, projectCode: true },
  });

  const projectIds = projects.map((row) => row.id);
  const projectCodes = projects.map((row) => row.projectCode);

  if (projectIds.length === 0) {
    return { projectCount: 0, projectCodes: [] };
  }

  const taskIds = (
    await prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const disciplineIds = (
    await prisma.taskDiscipline.findMany({
      where: {
        companyId,
        taskId: { in: taskIds },
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const packageIds = (
    await prisma.designPackage.findMany({
      where: { companyId, taskDisciplineId: { in: disciplineIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const sessionIds = (
    await prisma.reviewSession.findMany({
      where: {
        companyId,
        OR: [
          { taskDisciplineId: { in: disciplineIds } },
          { designPackageId: { in: packageIds } },
        ],
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const rfiIds = (
    await prisma.rfi.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const issueIds = (
    await prisma.issue.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const submittalIds = (
    await prisma.submittal.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const drawingIds = (
    await prisma.drawing.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const dailyLogIds = (
    await prisma.dailyLog.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const meetingIds = (
    await prisma.meeting.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const closeoutIds = (
    await prisma.closeout.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((row) => row.id);

  const projectFolderIds = (
    await prisma.documentFolder.findMany({
      where: {
        companyId,
        contextType: FolderContextType.PROJECT,
        contextId: { in: projectIds },
      },
      select: { id: true },
    })
  ).map((row) => row.id);

  const disciplineFolderIds = disciplineIds.length
    ? (
        await prisma.documentFolder.findMany({
          where: {
            companyId,
            contextType: FolderContextType.TASK_DISCIPLINE,
            contextId: { in: disciplineIds },
          },
          select: { id: true },
        })
      ).map((row) => row.id)
    : [];

  const rfiFolderIds = rfiIds.length
    ? (
        await prisma.documentFolder.findMany({
          where: {
            companyId,
            contextType: FolderContextType.RFI,
            contextId: { in: rfiIds },
          },
          select: { id: true },
        })
      ).map((row) => row.id)
    : [];

  const issueFolderIds = issueIds.length
    ? (
        await prisma.documentFolder.findMany({
          where: {
            companyId,
            contextType: FolderContextType.ISSUE,
            contextId: { in: issueIds },
          },
          select: { id: true },
        })
      ).map((row) => row.id)
    : [];

  const allFolderIds = [
    ...new Set([
      ...projectFolderIds,
      ...disciplineFolderIds,
      ...rfiFolderIds,
      ...issueFolderIds,
    ]),
  ];

  // ── EPC workflow ───────────────────────────────────────────────────────────
  if (sessionIds.length > 0) {
    await prisma.reviewSessionAttachment.deleteMany({
      where: { reviewSessionId: { in: sessionIds } },
    });
    await prisma.reviewComment.deleteMany({
      where: { reviewSessionId: { in: sessionIds } },
    });
    await prisma.reviewContextSnapshot.deleteMany({
      where: { reviewSessionId: { in: sessionIds } },
    });
    await prisma.reviewSession.deleteMany({ where: { id: { in: sessionIds } } });
  }

  const edvIds = disciplineIds.length
    ? (
        await prisma.engineeringDocumentVersion.findMany({
          where: {
            companyId,
            engineeringDocument: { taskDisciplineId: { in: disciplineIds } },
          },
          select: { id: true },
        })
      ).map((row) => row.id)
    : [];

  const workflowEntityIds = [
    ...edvIds,
    ...packageIds,
    ...sessionIds,
    ...disciplineIds,
  ];
  if (workflowEntityIds.length > 0) {
    await prisma.workflowEventLog.deleteMany({
      where: { companyId, entityId: { in: workflowEntityIds } },
    });
  }

  if (submittalIds.length > 0) {
    await prisma.submittalItem.deleteMany({
      where: { submittalId: { in: submittalIds } },
    });
    await prisma.submittalReview.deleteMany({
      where: { submittalId: { in: submittalIds } },
    });
  }

  if (packageIds.length > 0) {
    await prisma.designPackageAttachment.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });
    await prisma.submittalItem.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });
    await prisma.designPackageDependency.deleteMany({
      where: {
        OR: [
          { designPackageId: { in: packageIds } },
          { dependsOnPackageId: { in: packageIds } },
        ],
      },
    });
    await prisma.designPackageItem.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });
    await prisma.designPackage.deleteMany({ where: { id: { in: packageIds } } });
  }

  if (disciplineIds.length > 0) {
    await prisma.engineeringDocumentVersion.deleteMany({
      where: { engineeringDocument: { taskDisciplineId: { in: disciplineIds } } },
    });
    await prisma.engineeringDocument.deleteMany({
      where: { taskDisciplineId: { in: disciplineIds } },
    });
    await prisma.taskDisciplineReview.deleteMany({
      where: { taskDisciplineId: { in: disciplineIds } },
    });
    await prisma.deliverable.deleteMany({
      where: { taskDisciplineId: { in: disciplineIds } },
    });
    await prisma.taskDiscipline.deleteMany({ where: { id: { in: disciplineIds } } });
  }

  await prisma.externalReviewTrigger.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.projectChangeRequest.deleteMany({
    where: { projectId: { in: projectIds } },
  });

  // ── PM submodule children ──────────────────────────────────────────────────
  if (taskIds.length > 0) {
    await prisma.taskDependency.deleteMany({
      where: {
        OR: [
          { predecessorTaskId: { in: taskIds } },
          { successorTaskId: { in: taskIds } },
        ],
      },
    });
  }

  if (rfiIds.length > 0) {
    await prisma.rfiResponse.deleteMany({ where: { rfiId: { in: rfiIds } } });
  }

  if (drawingIds.length > 0) {
    await prisma.drawingVersion.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
    await prisma.drawingLink.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
  }

  if (dailyLogIds.length > 0) {
    await prisma.dailyLogWorkforce.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogEquipment.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogVisitor.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogIncident.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
  }

  if (meetingIds.length > 0) {
    await prisma.meetingAgendaItem.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
    await prisma.meetingAttendee.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
    await prisma.actionItem.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
  }

  if (closeoutIds.length > 0) {
    await prisma.closeoutChecklistItem.deleteMany({
      where: { closeoutId: { in: closeoutIds } },
    });
    await prisma.warranty.deleteMany({
      where: { closeoutId: { in: closeoutIds } },
    });
  }

  if (allFolderIds.length > 0) {
    const documentIds = (
      await prisma.document.findMany({
        where: { folderId: { in: allFolderIds } },
        select: { id: true },
      })
    ).map((row) => row.id);

    if (documentIds.length > 0) {
      await prisma.documentVersion.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    }

    await prisma.documentFolder.deleteMany({ where: { id: { in: allFolderIds } } });
  }

  await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.milestone.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.rfi.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.submittal.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.drawing.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.dailyLog.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.meeting.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.correspondence.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.risk.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.punchItem.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.closeout.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectTeam.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });

  return { projectCount: projectIds.length, projectCodes };
}

async function main(): Promise<void> {
  const companyId = process.env.SEED_COMPANY_ID ?? DEFAULT_COMPANY_ID;
  console.log(`Clearing all projects and PM/EPC data for company ${companyId}...`);

  const result = await clearAllProjectData(companyId);

  if (result.projectCount === 0) {
    console.log('No projects found - database is already clean.');
  } else {
    console.log(`Removed ${result.projectCount} project(s): ${result.projectCodes.join(', ')}`);
    console.log('  Including: tasks, disciplines, packages, review sessions, documents, RFIs, submittals, etc.');
  }

  console.log('Kept: company, admin user, roles, permissions, demo users.');
  console.log('Tip: set SEED_PM_DEMO=false in .env so future seeds skip demo projects.');
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error('Clear failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
