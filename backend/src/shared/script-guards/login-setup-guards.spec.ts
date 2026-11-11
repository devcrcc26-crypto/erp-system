import {
  assertCredentialsPathGitignored,
  parseLoginSetupArgs,
} from './login-setup-guards';

describe('login-setup-guards', () => {
  it('parses dry-run by default (writes nothing when scripts honor apply=false)', () => {
    expect(parseLoginSetupArgs([])).toEqual({
      apply: false,
      allowRemote: false,
      reset: false,
      onlyIds: [],
    });
  });

  it('parses --apply --reset --only', () => {
    expect(
      parseLoginSetupArgs([
        '--apply',
        '--reset',
        '--only=a,b',
        '--allow-remote',
      ]),
    ).toEqual({
      apply: true,
      allowRemote: true,
      reset: true,
      onlyIds: ['a', 'b'],
    });
  });

  it('accepts backend/data/private/ as gitignored', () => {
    expect(() =>
      assertCredentialsPathGitignored(
        'node_modules/\nbackend/data/private/\n',
        'backend/data/private/initial-credentials.csv',
      ),
    ).not.toThrow();
  });
});
