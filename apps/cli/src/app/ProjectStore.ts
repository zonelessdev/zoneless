import fs from 'node:fs/promises';
import path from 'node:path';
import { InvalidInput } from './Errors';

const bindingDirectoryName = '.zoneless';
const bindingFileName = 'project.json';

export interface ProjectBinding {
  liveProfile: string;
  platformName: string;
  profilePrefix?: string;
  testProfile: string;
  version: 1;
  workspaceId: string;
}

export interface LocatedProjectBinding {
  binding: ProjectBinding;
  path: string;
  rootDirectory: string;
}

export class ProjectStore {
  async Find(
    startDirectory: string = process.cwd()
  ): Promise<LocatedProjectBinding | null> {
    let directory = path.resolve(startDirectory);

    while (true) {
      const bindingPath = path.join(
        directory,
        bindingDirectoryName,
        bindingFileName
      );
      try {
        const contents = await fs.readFile(bindingPath, 'utf8');
        return {
          binding: ParseProjectBinding(contents, bindingPath),
          path: bindingPath,
          rootDirectory: directory,
        };
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') throw error;
      }

      const parentDirectory = path.dirname(directory);
      if (parentDirectory === directory) return null;
      directory = parentDirectory;
    }
  }

  async Bind(
    rootDirectory: string,
    binding: ProjectBinding,
    allowOverwrite = false
  ): Promise<LocatedProjectBinding> {
    ValidateProjectBinding(binding);
    const resolvedRoot = path.resolve(rootDirectory);
    const directory = path.join(resolvedRoot, bindingDirectoryName);
    const bindingPath = path.join(directory, bindingFileName);
    const existing = await this.Find(resolvedRoot);

    if (
      existing?.rootDirectory === resolvedRoot &&
      existing.binding.workspaceId !== binding.workspaceId &&
      !allowOverwrite
    ) {
      throw InvalidInput(
        `This project is already bound to "${existing.binding.platformName}". Use --new-platform or remove ${existing.path} before rebinding it.`
      );
    }

    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${bindingPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(binding, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(temporaryPath, bindingPath);

    return {
      binding,
      path: bindingPath,
      rootDirectory: resolvedRoot,
    };
  }
}

function ParseProjectBinding(
  contents: string,
  bindingPath: string
): ProjectBinding {
  let binding: ProjectBinding;
  try {
    binding = JSON.parse(contents) as ProjectBinding;
  } catch {
    throw InvalidInput(`Invalid Zoneless project binding at ${bindingPath}.`);
  }
  ValidateProjectBinding(binding);
  return binding;
}

function ValidateProjectBinding(binding: ProjectBinding): void {
  if (
    binding.version !== 1 ||
    !binding.platformName ||
    !binding.workspaceId ||
    !binding.testProfile ||
    !binding.liveProfile
  ) {
    throw InvalidInput('The Zoneless project binding is incomplete.');
  }
}
