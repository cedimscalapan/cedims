import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		version: {
			pollInterval: 60000
		},
		alias: {
			$components: 'src/lib/components',
			$stores: 'src/lib/stores'
		}
	}
};

export default config;
