import { EdvStatus } from './contracts/enums/edv-status.enum';
import {
  canTransitionEdvStatus,
  edvStatusAllowsComments,
  getAllowedEdvTransitions,
  transitionEdvStatus,
  validateNewRevisionUpload,
} from './edv-state-machine';

describe('edv-state-machine', () => {
  describe('canTransitionEdvStatus', () => {
    it('allows DRAFT → IN_REVIEW', () => {
      expect(canTransitionEdvStatus(EdvStatus.DRAFT, EdvStatus.IN_REVIEW).allowed).toBe(
        true,
      );
    });

    it('allows IN_REVIEW → APPROVED', () => {
      expect(
        canTransitionEdvStatus(EdvStatus.IN_REVIEW, EdvStatus.APPROVED).allowed,
      ).toBe(true);
    });

    it('allows IN_REVIEW → DRAFT (rework)', () => {
      expect(canTransitionEdvStatus(EdvStatus.IN_REVIEW, EdvStatus.DRAFT).allowed).toBe(
        true,
      );
    });

    it('allows APPROVED → LOCKED', () => {
      expect(canTransitionEdvStatus(EdvStatus.APPROVED, EdvStatus.LOCKED).allowed).toBe(
        true,
      );
    });

    it('allows APPROVED → IN_REVIEW (governance return)', () => {
      expect(
        canTransitionEdvStatus(EdvStatus.APPROVED, EdvStatus.IN_REVIEW).allowed,
      ).toBe(true);
    });

    it('blocks LOCKED → DRAFT', () => {
      expect(canTransitionEdvStatus(EdvStatus.LOCKED, EdvStatus.DRAFT).allowed).toBe(
        false,
      );
    });

    it('allows LOCKED → APPROVED unlock', () => {
      expect(
        canTransitionEdvStatus(EdvStatus.APPROVED, EdvStatus.LOCKED).allowed,
      ).toBe(true);
      expect(
        canTransitionEdvStatus(EdvStatus.LOCKED, EdvStatus.APPROVED).allowed,
      ).toBe(true);
    });

    it('blocks SUPERSEDED → any', () => {
      expect(
        canTransitionEdvStatus(EdvStatus.SUPERSEDED, EdvStatus.DRAFT).allowed,
      ).toBe(false);
    });

    it('blocks DRAFT → LOCKED (skip review)', () => {
      expect(canTransitionEdvStatus(EdvStatus.DRAFT, EdvStatus.LOCKED).allowed).toBe(
        false,
      );
    });
  });

  describe('transitionEdvStatus', () => {
    it('returns target status when valid', () => {
      expect(transitionEdvStatus(EdvStatus.DRAFT, EdvStatus.IN_REVIEW)).toBe(
        EdvStatus.IN_REVIEW,
      );
    });

    it('throws on invalid transition', () => {
      expect(() => transitionEdvStatus(EdvStatus.LOCKED, EdvStatus.DRAFT)).toThrow();
      expect(transitionEdvStatus(EdvStatus.LOCKED, EdvStatus.APPROVED)).toBe(
        EdvStatus.APPROVED,
      );
    });
  });

  describe('validateNewRevisionUpload', () => {
    it('rejects when active DRAFT exists', () => {
      const result = validateNewRevisionUpload({
        existingEdvStatuses: [EdvStatus.LOCKED, EdvStatus.DRAFT],
      });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('ACTIVE_DRAFT_EXISTS');
    });

    it('allows when no DRAFT and marks non-LOCKED for supersede', () => {
      const result = validateNewRevisionUpload({
        existingEdvStatuses: [
          EdvStatus.LOCKED,
          EdvStatus.APPROVED,
          EdvStatus.SUPERSEDED,
        ],
      });
      expect(result.allowed).toBe(true);
      expect(result.supersededStatuses).toEqual([EdvStatus.APPROVED]);
    });
  });

  describe('edvStatusAllowsComments', () => {
    it('allows IN_REVIEW and APPROVED', () => {
      expect(edvStatusAllowsComments(EdvStatus.IN_REVIEW)).toBe(true);
      expect(edvStatusAllowsComments(EdvStatus.APPROVED)).toBe(true);
    });

    it('denies LOCKED', () => {
      expect(edvStatusAllowsComments(EdvStatus.LOCKED)).toBe(false);
    });
  });

  describe('getAllowedEdvTransitions', () => {
    it('returns APPROVED unlock for LOCKED', () => {
      expect(getAllowedEdvTransitions(EdvStatus.LOCKED)).toEqual([
        EdvStatus.APPROVED,
      ]);
    });
  });
});
