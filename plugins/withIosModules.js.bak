const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withIosModules(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      if (!podfileContent.includes('use_modular_headers!')) {
        const targetName = config.modRequest.projectName;
        const targetRegex = new RegExp(`target '${targetName}' do`);

        const replacement = `use_modular_headers!\n\ntarget '${targetName}' do`;

        if (podfileContent.match(targetRegex)) {
            podfileContent = podfileContent.replace(
              targetRegex,
              replacement
            );
        } else {
            const platformRegex = /platform :ios, '.*'/;
             podfileContent = podfileContent.replace(
              platformRegex,
              `$&\nuse_modular_headers!`
            );
        }

        fs.writeFileSync(podfilePath, podfileContent);
      }
      return config;
    },
  ]);
};