import fs from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './Errors';
import { exitCodes } from './Types';

export interface SkillInstallResult {
  object: 'skill_install';
  ok: true;
  path: string;
}

export async function InstallAgentSkill(
  projectDirectory = process.cwd()
): Promise<SkillInstallResult> {
  const sourcePath = await ResolveSkillSource();
  const destinationPath = path.join(
    projectDirectory,
    '.agents',
    'skills',
    'zoneless-store',
    'SKILL.md'
  );
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  return {
    object: 'skill_install',
    ok: true,
    path: destinationPath,
  };
}

async function ResolveSkillSource(): Promise<string> {
  const candidates = [
    path.resolve(__dirname, '../../skills/zoneless-store/SKILL.md'),
    path.resolve(process.cwd(), '.agents/skills/zoneless-store/SKILL.md'),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next package/source-tree location.
    }
  }
  throw new CliError(
    'The packaged zoneless-store skill could not be found.',
    'skill_not_found',
    exitCodes.apiError
  );
}
