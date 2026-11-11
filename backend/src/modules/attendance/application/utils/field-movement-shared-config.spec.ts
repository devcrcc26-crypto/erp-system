import { existsSync, readFileSync } from 'fs';
import { AttendanceDayFlag, FieldMovementReason } from '@prisma/client';
import {
  SHARED_CONFIG_FILES,
  generatedFilePath,
  hasModuleImports,
  normalizeLineEndings,
  readSource,
  renderGenerated,
} from '../../../../../scripts/sync-shared-config';
import {
  FIELD_MOVEMENT_STORAGE_REASONS,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  type FieldMovementStorageReason,
} from './field-movement-field-rules';
import {
  ATTENDANCE_FLAGS_FOR_ISSUE,
  type AttendanceFlagForIssue,
  reasonTypesFromCompatibleReasons,
  selectionFromCompatibleReason,
} from './field-movement-issue-compatibility';

/** Compile-time exact type equality (ts-jest type-checks, so a mismatch fails the suite). */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

const storageReasonMatchesPrisma: Equals<
  FieldMovementStorageReason,
  FieldMovementReason
> = true;
const issueFlagMatchesPrisma: Equals<AttendanceFlagForIssue, AttendanceDayFlag> =
  true;
// issue-compatibility keeps local mirrors of these (it may not import siblings).
const mirroredSelectionMatches: Equals<
  ReturnType<typeof selectionFromCompatibleReason>,
  FieldMovementSelection
> = true;
const mirroredReasonTypeMatches: Equals<
  ReturnType<typeof reasonTypesFromCompatibleReasons>[number],
  FieldMovementReasonType
> = true;

describe('field-movement shared config', () => {
  it('type-level unions equal the Prisma enums and mirrored types', () => {
    expect([
      storageReasonMatchesPrisma,
      issueFlagMatchesPrisma,
      mirroredSelectionMatches,
      mirroredReasonTypeMatches,
    ]).toEqual([true, true, true, true]);
  });

  it('storage reasons equal Prisma FieldMovementReason values', () => {
    expect([...FIELD_MOVEMENT_STORAGE_REASONS].sort()).toEqual(
      Object.values(FieldMovementReason).sort(),
    );
  });

  it('issue flags equal Prisma AttendanceDayFlag values', () => {
    expect([...ATTENDANCE_FLAGS_FOR_ISSUE].sort()).toEqual(
      Object.values(AttendanceDayFlag).sort(),
    );
  });

  describe.each(SHARED_CONFIG_FILES.map((file) => [file]))('%s', (file) => {
    it('has no imports (pure, shareable with the frontend)', () => {
      expect(hasModuleImports(readSource(file))).toBe(false);
    });

    it('frontend generated copy is in sync (run `npm run sync:shared` in backend/)', () => {
      const target = generatedFilePath(file);
      expect(existsSync(target)).toBe(true);
      expect(normalizeLineEndings(readFileSync(target, 'utf8'))).toBe(
        renderGenerated(file, readSource(file)),
      );
    });
  });
});
