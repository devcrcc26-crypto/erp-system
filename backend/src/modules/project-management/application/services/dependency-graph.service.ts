import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  PackageDependencyEdge,
  wouldCreateDependencyCycle,
} from '../../domain/dependency-graph';

/**
 * Validates design package dependency graph integrity (cycle detection).
 */
@Injectable()
export class DependencyGraphService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts a new dependency edge would not create a cycle in the project graph.
   */
  async assertNoCycleOnAdd(
    companyId: string,
    projectId: string,
    dependentPackageId: string,
    prerequisitePackageId: string,
  ): Promise<void> {
    const edges = await this.loadProjectEdges(companyId, projectId);
    const candidate: PackageDependencyEdge = {
      dependentPackageId,
      prerequisitePackageId,
    };

    if (wouldCreateDependencyCycle(edges, candidate)) {
      throw new ConflictException(
        'Dependency would create a cycle in the design package graph',
      );
    }
  }

  /**
   * Returns all dependency edges for packages in a project.
   */
  async loadProjectEdges(
    companyId: string,
    projectId: string,
  ): Promise<PackageDependencyEdge[]> {
    const rows = await this.prisma.designPackageDependency.findMany({
      where: {
        companyId,
        designPackage: {
          deletedAt: null,
          taskDiscipline: {
            deletedAt: null,
            task: { projectId, deletedAt: null },
          },
        },
      },
      select: {
        designPackageId: true,
        dependsOnPackageId: true,
      },
    });

    return rows.map((row) => ({
      dependentPackageId: row.designPackageId,
      prerequisitePackageId: row.dependsOnPackageId,
    }));
  }
}
