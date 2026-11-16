const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

module.exports = {
	...defaultConfig,
	entry: {
		index: './src/index.js',
		'media-button': './src/media-button.js',
		'elementor-host': './src/elementor-host.js',
		'block-editor': './src/block-editor.js',
		'render-runtime': './src/render-runtime.js',
	},
	output: {
		...defaultConfig.output,
		// Lazy chunks (content packs, icon/emoji libs) are fetched by the
		// webpack runtime WITHOUT the enqueue version param, so browsers
		// cache them across plugin updates; a content hash in the filename
		// is the only reliable cache buster (v1.56.1).
		chunkFilename: '[name].[contenthash:8].js',
		// Files that travel as assets rather than as code (the vectorizer's
		// wasm, the onnxruntime ESM bundle) default to a bare content hash,
		// which lands in build/ as a binary nobody can place by looking at
		// it. Keeping the source name in front of the hash makes every file
		// in build/ say what it is - asked for by the wordpress.org review
		// on 13.08.2026 (v1.403.0).
		assetModuleFilename: '[name].[contenthash:8][ext]',
	},
	module: {
		...defaultConfig.module,
		rules: [
			// WASM binaries (VTracer) ship as plain assets and are loaded
			// with `new URL( …, import.meta.url )` at run time (v1.124).
			// Their filename comes from output.assetModuleFilename above.
			{ test: /\.wasm$/, type: 'asset/resource' },
			...defaultConfig.module.rules,
		],
	},
	resolve: {
		...defaultConfig.resolve,
		// onnxruntime-web ships an "extern wasm" export condition: pick it so
		// ORT loads the wasm from env.wasm.wasmPaths (assets/ort/) at runtime
		// instead of webpack inlining/emitting it (v1.316). '...' keeps the
		// default webpack condition names.
		conditionNames: [ 'onnxruntime-web-use-extern-wasm', '...' ],
		alias: {
			...( defaultConfig.resolve && defaultConfig.resolve.alias ),
			// vtracer-wasm's default loader references 'vtracer_bg.wasm',
			// but the shipped binary is vtracer.wasm (v1.124).
			'vtracer_bg.wasm': path.resolve(
				__dirname,
				'node_modules/vtracer-wasm/vtracer.wasm'
			),
			// Force the CPU/SIMD-only onnxruntime-web build (no WebGPU/jsep):
			// transformers.js imports the full 'onnxruntime-web' (~20 MB jsep
			// wasm); the '/wasm' entry is the ~10 MB CPU build we ship (v1.316).
			'onnxruntime-web$': 'onnxruntime-web/wasm',
		},
		fallback: {
			...( defaultConfig.resolve && defaultConfig.resolve.fallback ),
			// ag-psd's CJS build guards its Node `util` require behind
			// feature detection; browsers use the native TextDecoder.
			util: false,
			zlib: false,
			fs: false,
			path: false,
			// libheif's Emscripten glue asks for crypto in its Node branch
			// too; the browser takes crypto.getRandomValues.
			crypto: false,
		},
	},
	optimization: {
		...defaultConfig.optimization,
		splitChunks: {
			...defaultConfig.optimization.splitChunks,
			cacheGroups: {
				...defaultConfig.optimization.splitChunks.cacheGroups,
				// The HEIC decoder (lib/heic.js) lands in a file named after the
				// library: build/libheif.<hash>.js next to libheif.<hash>.wasm.
				// webpack's default vendor group would otherwise move the glue
				// into a numbered chunk, and a reviewer could no longer tell
				// from build/ which file is the third-party code readme.txt
				// names (20.10.2026). Not "heic": that is the name of the
				// importing chunk, and a group with the same name is dropped.
				libheif: {
					test: /[\\/]node_modules[\\/]libheif-js[\\/]/,
					name: 'libheif',
					chunks: 'async',
					enforce: true,
				},
			},
		},
	},
};
