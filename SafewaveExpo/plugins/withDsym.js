const { withPodfile } = require('@expo/config-plugins');

const DSYM_SNIPPET = `
    # Generate dSYM for Pods and Hermes (fix Upload Symbols for TestFlight)
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['DEBUG_INFORMATION_FORMAT'] = 'dwarf-with-dsym'
      end
    end`;

function withDsym(config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents || '';
    if (contents.includes('DEBUG_INFORMATION_FORMAT')) return config;

    // Insert dSYM config inside the existing post_install block
    const marker = 'post_install do |installer|';
    const idx = contents.indexOf(marker);
    if (idx === -1) return config;

    const insertPos = idx + marker.length;
    config.modResults.contents =
      contents.slice(0, insertPos) + '\n' + DSYM_SNIPPET + contents.slice(insertPos);

    return config;
  });
}

module.exports = withDsym;
