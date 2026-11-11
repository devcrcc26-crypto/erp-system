import { getEffectiveApprovalChain } from './approval-chain.util';

const baseDiscipline = {
  ownerUserId: 'disc-owner',
  reviewerUserId: 'disc-reviewer',
  disciplineLeadUserId: 'disc-lead',
  chiefUserId: 'disc-chief',
  instituteChiefUserId: 'disc-institute-chief',
  designerUserId: 'disc-designer',
  supportingDesignerUserId: null,
};

const emptyPackage = {
  designerUserId: null,
  supportingDesignerUserId: null,
  disciplineOwnerUserId: null,
  reviewerUserId: null,
  disciplinaryLeaderUserId: null,
  deptDeputyChiefUserId: null,
  instituteChiefUserId: null,
};

describe('getEffectiveApprovalChain', () => {
  it('falls back to discipline institute chief when subtask has no override', () => {
    const chain = getEffectiveApprovalChain(emptyPackage, baseDiscipline);
    expect(chain.instituteChiefUserId).toBe('disc-institute-chief');
  });

  it('uses subtask internal institute chief when set', () => {
    const chain = getEffectiveApprovalChain(
      { ...emptyPackage, instituteChiefUserId: 'pkg-institute-chief' },
      baseDiscipline,
    );
    expect(chain.instituteChiefUserId).toBe('pkg-institute-chief');
  });

  it('does not fall back to discipline when subtask has external institute chief', () => {
    const chain = getEffectiveApprovalChain(
      {
        ...emptyPackage,
        instituteChiefUserId: null,
        instituteChiefName: 'Prof. Li (external)',
      },
      baseDiscipline,
    );
    expect(chain.instituteChiefUserId).toBeNull();
  });
});
