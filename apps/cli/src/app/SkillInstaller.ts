import fs from 'node:fs/promises';
import path from 'node:path';
import { CliError, InvalidInput } from './Errors';
import { exitCodes, type AgentSkillId } from './Types';

const defaultAgentSkillId: AgentSkillId = 'store';
const skillDirectories: Record<AgentSkillId, string> = {
  marketplace: 'zoneless-marketplace',
  store: 'zoneless-store',
};

export interface SkillSourceLocations {
  packagedSkillsDirectory: string;
  sourceTreeSkillsDirectory: string;
}

export interface SkillInstallResult {
  object: 'skill_install';
  ok: true;
  path: string;
  skill: AgentSkillId;
}

export async function InstallAgentSkill(
  projectDirectory = process.cwd(),
  skillIdValue: string = defaultAgentSkillId,
  sourceLocations: SkillSourceLocations = DefaultSourceLocations()
): Promise<SkillInstallResult> {
  const skillId = ValidateAgentSkillId(skillIdValue);
  const skillDirectory = skillDirectories[skillId];
  const sourcePath = await ResolveSkillSource(skillDirectory, sourceLocations);
  const destinationPath = path.join(
    projectDirectory,
    '.agents',
    'skills',
    skillDirectory,
    'SKILL.md'
  );
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  if (path.resolve(sourcePath) !== path.resolve(destinationPath)) {
    await fs.copyFile(sourcePath, destinationPath);
  }
  return {
    object: 'skill_install',
    ok: true,
    path: destinationPath,
    skill: skillId,
  };
}

export function ValidateAgentSkillId(
  skillIdValue: string | undefined
): AgentSkillId {
  const skillId = skillIdValue ?? defaultAgentSkillId;
  if (!Object.prototype.hasOwnProperty.call(skillDirectories, skillId)) {
    throw InvalidInput(
      `--skill must be one of: ${Object.keys(skillDirectories).join(', ')}.`
    );
  }
  return skillId as AgentSkillId;
}

function DefaultSourceLocations(): SkillSourceLocations {
  return {
    packagedSkillsDirectory: path.resolve(__dirname, '../../skills'),
    sourceTreeSkillsDirectory: path.resolve(process.cwd(), '.agents', 'skills'),
  };
}

async function ResolveSkillSource(
  skillDirectory: string,
  sourceLocations: SkillSourceLocations
): Promise<string> {
  const candidates = [
    path.join(
      sourceLocations.packagedSkillsDirectory,
      skillDirectory,
      'SKILL.md'
    ),
    path.join(
      sourceLocations.sourceTreeSkillsDirectory,
      skillDirectory,
      'SKILL.md'
    ),
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
    `The packaged ${skillDirectory} skill could not be found.`,
    'skill_not_found',
    exitCodes.apiError
  );
}
