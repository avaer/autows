const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');

module.exports = {
	entry: 'client.js',
	format: 'cjs',
	plugins: [
		resolve({
      preferBuiltins: false,
    }),
    commonjs(),
	],
  useStrict: false,
};
