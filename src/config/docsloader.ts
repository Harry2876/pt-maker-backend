import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

export function loadSpec(): object {
  // Load the foundation swagger.yaml (info, servers, components)
  const mainFile = path.join(__dirname, '../../docs/swagger.yaml');
  const main = yaml.load(fs.readFileSync(mainFile, 'utf8')) as any;

  // Load every .yaml file in docs/paths/ and merge into paths
  const pathsDir = path.join(__dirname, '../../docs/paths');
  const files = fs.readdirSync(pathsDir).filter(f => f.endsWith('.yaml'));

  main.paths = {};

  for (const file of files) {
    const filePath = path.join(pathsDir, file);
    const module = yaml.load(fs.readFileSync(filePath, 'utf8')) as any;
    if (module && module.paths) {
      Object.assign(main.paths, module.paths);
    }
  }

  return main;
}