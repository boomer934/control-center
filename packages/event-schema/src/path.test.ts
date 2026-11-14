import { describe, expect, it } from 'vitest';
import { makeTextCleaner, maskHome, toFileRef } from './path';

const CWD = 'C:\\fixtures\\workspace';

describe('toFileRef', () => {
  it('makes workspace paths relative, whatever the separator or case', () => {
    expect(toFileRef(CWD, 'C:\\fixtures\\workspace\\src\\cart.js')).toEqual({
      path: 'src/cart.js',
      external: false,
    });
    expect(toFileRef(CWD, 'c:/Fixtures/Workspace/README.md')).toEqual({
      path: 'README.md',
      external: false,
    });
    expect(toFileRef(CWD, 'src\\index.js')).toEqual({ path: 'src/index.js', external: false });
    expect(toFileRef(CWD, './test/../src/a.js')).toEqual({ path: 'src/a.js', external: false });
  });

  it('flags paths outside the workspace and masks the home directory', () => {
    expect(toFileRef(CWD, 'C:\\Users\\someone\\.claude\\settings.json')).toEqual({
      path: '~/.claude/settings.json',
      external: true,
    });
    expect(toFileRef(CWD, '..\\other\\x.js')).toEqual({
      path: 'C:/fixtures/other/x.js',
      external: true,
    });
    expect(toFileRef(CWD, 'C:\\fixtures\\workspace-2\\a.js').external).toBe(true);
  });

  it('works with POSIX workspaces', () => {
    expect(toFileRef('/home/ada/project', '/home/ada/project/src/a.ts')).toEqual({
      path: 'src/a.ts',
      external: false,
    });
    expect(toFileRef('/home/ada/project', '/home/ada/.bashrc')).toEqual({
      path: '~/.bashrc',
      external: true,
    });
  });
});

describe('maskHome', () => {
  it('masks Windows, Linux and macOS homes', () => {
    expect(maskHome('C:\\Users\\ada\\x')).toBe('~/x');
    expect(maskHome('/home/ada/x')).toBe('~/x');
    expect(maskHome('/Users/ada/x')).toBe('~/x');
    expect(maskHome('D:\\data\\x')).toBe('D:/data/x');
  });
});

describe('makeTextCleaner', () => {
  const clean = makeTextCleaner(CWD);

  it('replaces the workspace root with . in every form', () => {
    expect(clean('cd C:\\fixtures\\workspace && ls')).toBe('cd . && ls');
    expect(clean('at file:///C:/fixtures/workspace/test/a.js:10:10')).toBe(
      'at file:///./test/a.js:10:10',
    );
    expect(clean('"C:\\\\fixtures\\\\workspace\\\\src"')).toBe('".\\\\src"');
  });

  it('masks any home directory and redacts secrets', () => {
    expect(clean('C:\\Users\\ada\\AppData\\x and /home/bob/y')).toBe('~\\AppData\\x and ~/y');
    expect(clean(`export TOKEN=${['abcd', 'efgh', '1234'].join('')}`)).toBe(
      'export TOKEN=<redacted:assignment>',
    );
  });
});
