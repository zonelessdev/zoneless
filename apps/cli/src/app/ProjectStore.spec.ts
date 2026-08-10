import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProjectStore, type ProjectBinding } from './ProjectStore';

describe('Project store', () => {
  let projectDirectory: string;

  beforeEach(async () => {
    projectDirectory = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'zoneless-project-'))
    );
  });

  afterEach(async () => {
    await fs.rm(projectDirectory, { force: true, recursive: true });
  });

  it('writes non-secret project metadata and finds it from a child directory', async () => {
    const childDirectory = path.join(projectDirectory, 'apps', 'api');
    await fs.mkdir(childDirectory, { recursive: true });
    const store = new ProjectStore();

    const located = await store.Bind(projectDirectory, CreateBinding());

    expect(located.path).toBe(
      path.join(projectDirectory, '.zoneless', 'project.json')
    );
    await expect(store.Find(childDirectory)).resolves.toMatchObject({
      binding: {
        liveProfile: 'acme-live',
        testProfile: 'acme-test',
        workspaceId: 'workspace-acme',
      },
      rootDirectory: projectDirectory,
    });
    expect(await fs.readFile(located.path, 'utf8')).not.toContain('api-key');
    expect((await fs.stat(located.path)).mode & 0o777).toBe(0o600);
  });

  it('refuses to replace a different workspace without explicit permission', async () => {
    const store = new ProjectStore();
    await store.Bind(projectDirectory, CreateBinding());

    await expect(
      store.Bind(projectDirectory, {
        ...CreateBinding(),
        platformName: 'Other',
        workspaceId: 'workspace-other',
      })
    ).rejects.toThrow(/already bound/);
    await expect(
      store.Bind(
        projectDirectory,
        {
          ...CreateBinding(),
          platformName: 'Other',
          workspaceId: 'workspace-other',
        },
        true
      )
    ).resolves.toMatchObject({
      binding: { workspaceId: 'workspace-other' },
    });
  });
});

function CreateBinding(): ProjectBinding {
  return {
    liveProfile: 'acme-live',
    platformName: 'Acme',
    profilePrefix: 'acme',
    testProfile: 'acme-test',
    version: 1,
    workspaceId: 'workspace-acme',
  };
}
