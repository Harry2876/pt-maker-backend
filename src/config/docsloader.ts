import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

export function loadSpec(): object {
  // Load the foundation swagger.yaml (info, servers, global components)
  const mainFile = path.join(__dirname, '../../docs/swagger.yaml');
  const main = yaml.load(fs.readFileSync(mainFile, 'utf8')) as any;

  // Ensure top-level containers exist
  main.paths = {};
  main.components = main.components ?? {};
  main.components.schemas = main.components.schemas ?? {};
  main.components.parameters = main.components.parameters ?? {};
  main.components.responses = main.components.responses ?? {};

  // Load every .yaml file in docs/paths/ and deep-merge paths + components
  const pathsDir = path.join(__dirname, '../../docs/paths');
  const files = fs.readdirSync(pathsDir).filter(f => f.endsWith('.yaml'));

  for (const file of files) {
    const filePath = path.join(pathsDir, file);
    const module = yaml.load(fs.readFileSync(filePath, 'utf8')) as any;
    if (!module) continue;

    // Merge paths
    if (module.paths) {
      Object.assign(main.paths, module.paths);
    }

    // Merge component sub-sections so $ref schemas in path files resolve correctly
    const mc = module.components ?? {};
    if (mc.schemas)    Object.assign(main.components.schemas,    mc.schemas);
    if (mc.parameters) Object.assign(main.components.parameters, mc.parameters);
    if (mc.responses)  Object.assign(main.components.responses,  mc.responses);
  }

  return main;
}