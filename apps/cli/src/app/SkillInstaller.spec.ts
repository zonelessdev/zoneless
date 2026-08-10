import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  InstallAgentSkill,
  type SkillSourceLocations,
  ValidateAgentSkillId,
} from './SkillInstaller';

async function CreateFixture(): Promise<{
  projectDirectory: string;
  rootDirectory: string;
  sourceLocations: SkillSourceLocations;
}> {
  const rootDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zoneless-skill-installer-')
  );
  const projectDirectory = path.join(rootDirectory, 'project');
  const sourceLocations = {
    packagedSkillsDirectory: path.join(rootDirectory, 'package', 'skills'),
    sourceTreeSkillsDirectory: path.join(rootDirectory, 'source', 'skills'),
  };
  await fs.mkdir(projectDirectory, { recursive: true });
  return { projectDirectory, rootDirectory, sourceLocations };
}

async function WriteSkill(
  skillsDirectory: string,
  skillDirectory: string,
  contents: string
): Promise<void> {
  const skillPath = path.join(skillsDirectory, skillDirectory, 'SKILL.md');
  await fs.mkdir(path.dirname(skillPath), { recursive: true });
  await fs.writeFile(skillPath, contents);
}

describe('Skill installer', () => {
  it('installs the default payments skill from the source tree', async () => {
    const fixture = await CreateFixture();
    await WriteSkill(
      fixture.sourceLocations.sourceTreeSkillsDirectory,
      'zoneless-payments',
      '# Payments source skill\n'
    );

    try {
      const result = await InstallAgentSkill(
        fixture.projectDirectory,
        undefined,
        fixture.sourceLocations
      );

      expect(result).toEqual({
        object: 'skill_install',
        ok: true,
        path: path.join(
          fixture.projectDirectory,
          '.agents',
          'skills',
          'zoneless-payments',
          'SKILL.md'
        ),
        skill: 'payments',
      });
      expect(await fs.readFile(result.path, 'utf8')).toBe(
        '# Payments source skill\n'
      );
    } finally {
      await fs.rm(fixture.rootDirectory, { force: true, recursive: true });
    }
  });

  it('installs the payments skill for the legacy store alias', async () => {
    const fixture = await CreateFixture();
    await WriteSkill(
      fixture.sourceLocations.sourceTreeSkillsDirectory,
      'zoneless-payments',
      '# Payments source skill\n'
    );

    try {
      const result = await InstallAgentSkill(
        fixture.projectDirectory,
        'store',
        fixture.sourceLocations
      );

      expect(result.skill).toBe('payments');
      expect(result.path).toBe(
        path.join(
          fixture.projectDirectory,
          '.agents',
          'skills',
          'zoneless-payments',
          'SKILL.md'
        )
      );
    } finally {
      await fs.rm(fixture.rootDirectory, { force: true, recursive: true });
    }
  });

  it('installs the marketplace skill from a packed package', async () => {
    const fixture = await CreateFixture();
    await WriteSkill(
      fixture.sourceLocations.packagedSkillsDirectory,
      'zoneless-marketplace',
      '# Marketplace packaged skill\n'
    );

    try {
      const result = await InstallAgentSkill(
        fixture.projectDirectory,
        'marketplace',
        fixture.sourceLocations
      );

      expect(result.skill).toBe('marketplace');
      expect(result.path).toBe(
        path.join(
          fixture.projectDirectory,
          '.agents',
          'skills',
          'zoneless-marketplace',
          'SKILL.md'
        )
      );
      expect(await fs.readFile(result.path, 'utf8')).toBe(
        '# Marketplace packaged skill\n'
      );
    } finally {
      await fs.rm(fixture.rootDirectory, { force: true, recursive: true });
    }
  });

  it('rejects skill values outside the finite allowlist', () => {
    expect(() => ValidateAgentSkillId('../zoneless-marketplace')).toThrow(
      /marketplace, payments/
    );
    expect(() => ValidateAgentSkillId('zoneless-marketplace')).toThrow(
      /marketplace, payments/
    );
  });
});
