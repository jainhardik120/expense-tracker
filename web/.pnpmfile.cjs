const CLASSIC_TYPESCRIPT = 'npm:typescript@^6.0.3';

const needsClassicTypescript = (name) =>
  name === 'typescript-eslint' ||
  name === 'ts-api-utils' ||
  name === 'eslint-plugin-sonarjs' ||
  name.startsWith('@typescript-eslint/');

const readPackage = (pkg) => {
  if (!needsClassicTypescript(pkg.name)) {
    return pkg;
  }
  if (pkg.peerDependencies?.typescript !== undefined) {
    delete pkg.peerDependencies.typescript;
  }
  if (pkg.peerDependenciesMeta?.typescript !== undefined) {
    delete pkg.peerDependenciesMeta.typescript;
  }
  pkg.dependencies = { ...pkg.dependencies, typescript: CLASSIC_TYPESCRIPT };
  return pkg;
};

module.exports = { hooks: { readPackage } };
