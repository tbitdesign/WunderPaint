<?php
/**
 * Local ML models (v1.27): download the browser-inference models to the site's
 * own uploads folder ONCE, then serve them from this domain. No model is
 * bundled in the plugin and nothing is fetched from a third-party CDN at run
 * time, the admin explicitly triggers a one-time server-side download.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Model manifest + capability-gated download/list REST routes.
 */
class ML_Models {

	/**
	 * Feature id => Hugging Face repo + display metadata. transformers.js loads
	 * these repos by their standard directory layout.
	 */
	const MODELS = array(
		'smart-select' => array(
			'repo'  => 'Xenova/slimsam-77-uniform',
			'label' => 'Smart Select (SlimSAM)',
			'mb'    => 40,
		),
		'depth'        => array(
			'repo'  => 'onnx-community/depth-anything-v2-small',
			'label' => 'Depth / background blur (Depth Anything V2)',
			'mb'    => 30,
		),
		'caption'      => array(
			// v1.138.0: Florence-2 replaced ViT-GPT2 after an A/B on real
			// library images (8x faster, far better captions, MIT).
			'repo'  => 'onnx-community/Florence-2-base-ft',
			'label' => 'Local alt text (Florence-2, MIT)',
			'mb'    => 280,
			// transformers.js loads only the MERGED decoder; the split
			// legacy decoders would duplicate ~190 MB.
			'skip'  => '#^onnx/decoder_(model|with_past_model)_quantized#',
		),
		'salience'     => array(
			'repo'  => 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
			'label' => 'Text importance for layouts (MiniLM, multilingual)',
			'mb'    => 135,
		),
		'image-search' => array(
			'repo'  => 'Xenova/siglip-base-patch16-224',
			'label' => 'Semantic image search (SigLIP, Apache-2.0)',
			'mb'    => 215,
			// The repo also ships a COMBINED text+vision graph that
			// duplicates the two split models the browser loads - skipping
			// it halves the download.
			'skip'  => '#^onnx/model#',
		),
		'object-removal' => array(
			// 20.10.2026: MI-GAN (Picsart AI Research, MIT, weights MIT too)
			// as the official ONNX pipeline by the paper's first author. It
			// crops around the hole, works at 512 px and blends back, about
			// 1.4 s per removal on one browser thread at any picture size.
			// A single file of a pinned commit, checked by its SHA-256: the
			// repository is a personal one and changed in September 2026.
			'repo'     => 'andraniksargsyan/migan',
			'label'    => 'Object removal (MI-GAN, MIT)',
			'mb'       => 28,
			'revision' => '406830d0fa60666da0071c342ad2fbc8f30c5c64',
			'files'    => array(
				'migan_pipeline_v2.onnx' => '6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b',
				'LICENSE'                => '13348eaaebc0b07b0faf3a92db04e0858737713a917d064b599c87cac05b571f',
			),
			'marker'   => 'migan_pipeline_v2.onnx',
		),
		'cutout'         => array(
			// 20.10.2026: BiRefNet lite (MIT) for cutouts that find the
			// whole subject. The published model wants 1024 px and needs
			// about 6 GB there, more than a browser can give; this is our own
			// export at 512 px (tools/export-birefnet.py), about 6 s and
			// 1.7 GB on one browser thread. No model host carries that
			// export, so it lies in the release "models-v1" of the public
			// plugin repository, checked by its SHA-256 like MI-GAN.
			'repo'   => 'tbitdesign/birefnet-lite-512',
			'label'  => 'Better cutouts (BiRefNet lite, MIT)',
			'mb'     => 95,
			'source' => 'https://github.com/tbitdesign/WunderPaint/releases/download/models-v1/',
			'files'  => array(
				'birefnet-lite-512.onnx' => '3b2bf44ace9fb126f61bffd0fac2da2319a873e23885a70a65c50611ad59a993',
				'BIREFNET-NOTICE.txt'    => '1849d870feb7d76395a377f96a37c7a0abc78a8648a492f7d1605f78889444b4',
			),
			'marker' => 'birefnet-lite-512.onnx',
		),
	);

	/**
	 * Opus-MT translation repos per site language (v1.138.0): captions come
	 * out of Florence-2 in English; one small local model turns them into
	 * the site's language. Only the matching repo is offered.
	 *
	 * @var string[]
	 */
	const TRANSLATE_REPOS = array(
		'de' => 'Xenova/opus-mt-en-de',
		'es' => 'Xenova/opus-mt-en-es',
		'fr' => 'Xenova/opus-mt-en-fr',
		'it' => 'Xenova/opus-mt-en-it',
		'nl' => 'Xenova/opus-mt-en-nl',
		// No 'pt' entry, and that is a known gap rather than an oversight:
		// a site in Brazilian Portuguese has a full UI translation but gets
		// its alt text in English. Xenova publishes no en-pt model; the only
		// route is the multi-target opus-mt-en-ROMANCE, which needs a
		// '>>por<<' token in front of the source text to pick Portuguese.
		// localizeCaption() in src/lib/caption.js passes the text through
		// unprefixed, so wiring the repo up without that change would return
		// some other Romance language - worse than English. (2026-07-25)
	);

	/**
	 * The model manifest incl. dynamic entries. English sites get no
	 * translation model (captions are already in the site language).
	 *
	 * @return array[] id => model descriptor.
	 */
	public static function models() {
		$models = self::MODELS;
		$lang   = strtolower( substr( (string) get_locale(), 0, 2 ) );
		if ( isset( self::TRANSLATE_REPOS[ $lang ] ) ) {
			$models['caption-translate'] = array(
				'repo'  => self::TRANSLATE_REPOS[ $lang ],
				'label' => 'Alt text in site language (Opus-MT en-' . $lang . ')',
				'mb'    => 130,
				'skip'  => '#^onnx/decoder_(model|with_past_model)_quantized#',
			);
		}
		return $models;
	}

	/**
	 * The translation repo for the site language, or '' for English sites.
	 *
	 * @return string
	 */
	public static function translate_repo() {
		$models = self::models();
		return isset( $models['caption-translate'] ) ? $models['caption-translate']['repo'] : '';
	}

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Absolute path to the local models directory.
	 *
	 * @return string
	 */
	public static function dir() {
		$up = wp_upload_dir();
		return trailingslashit( $up['basedir'] ) . 'wpie-models';
	}

	/**
	 * Public URL to the local models directory (served from this domain).
	 *
	 * @return string
	 */
	public static function url() {
		$up = wp_upload_dir();
		return trailingslashit( $up['baseurl'] ) . 'wpie-models';
	}

	/**
	 * Only administrators may download models to the server.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * A model is considered installed once its config.json is on disk, or
	 * the file its entry names as 'marker' (a repo without a config.json,
	 * such as the MI-GAN pipeline).
	 *
	 * @param string $id Feature id.
	 * @return bool
	 */
	public static function is_installed( $id ) {
		$models = self::models();
		if ( ! isset( $models[ $id ] ) ) {
			return false;
		}
		$marker = isset( $models[ $id ]['marker'] ) ? $models[ $id ]['marker'] : 'config.json';
		return file_exists( self::dir() . '/' . $models[ $id ]['repo'] . '/' . $marker );
	}

	// runtime_dir() and runtime_installed() stood here until 2026-07-25.
	// Both were leftovers from the era when the local-AI runtime was
	// downloaded into uploads: nothing called either of them, the path is
	// written out directly in helpers.php and class-rest-controller.php,
	// and runtime_installed() had degenerated into `return true`.
	// runtime_status() below is the live method.

	/**
	 * Client status for the bootstrap: whether the local-AI CPU runtime is
	 * present. It normally ships bundled under assets/ort/ (since v1.316), so
	 * a full install answers true. The slim wordpress.org review build leaves
	 * assets/ort/ out to stay under the 10 MB upload limit; there this returns
	 * false and the editor hides the local-AI features instead of loading a
	 * missing wasm. On every normal install nothing changes.
	 *
	 * @return array { installed, bundled, url }
	 */
	public static function runtime_status() {
		$present = is_dir( WPIE_DIR . 'assets/ort' );
		return array(
			'installed' => $present,
			'bundled'   => $present,
			'url'       => '',
		);
	}

	/**
	 * Register routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/ml-models',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'list_models' ),
				'permission_callback' => array( self::class, 'can_manage' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/ml-models/download',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'download' ),
				'permission_callback' => array( self::class, 'can_manage' ),
				'args'                => array(
					'id' => array( 'required' => true ),
				),
			)
		);
	}

	/**
	 * List models + install status.
	 *
	 * @return \WP_REST_Response
	 */
	public function list_models() {
		$out = array();
		foreach ( self::models() as $id => $m ) {
			$out[] = array(
				'id'        => $id,
				'repo'      => $m['repo'],
				'label'     => $m['label'],
				'mb'        => $m['mb'],
				'installed' => self::is_installed( $id ),
			);
		}
		return rest_ensure_response(
			array(
				'models'  => $out,
				'baseUrl' => self::url(),
			)
		);
	}

	/**
	 * Download one model's files (quantized ONNX + configs) from Hugging Face,
	 * or from the entry's own 'source' folder, into uploads, streaming each
	 * file to disk so large weights never load into PHP memory.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function download( \WP_REST_Request $req ) {
		$id     = sanitize_key( (string) $req->get_param( 'id' ) );
		$models = self::models();
		if ( ! isset( $models[ $id ] ) ) {
			return new \WP_Error( 'wpie_bad_model', __( 'Unknown model.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$repo = $models[ $id ]['repo'];
		// An entry with a fixed file list (20.10.2026) downloads exactly
		// those files from its pinned commit and checks each by SHA-256;
		// every other entry reads the repository's tree as before.
		$pinned   = isset( $models[ $id ]['files'] ) ? $models[ $id ]['files'] : null;
		$revision = isset( $models[ $id ]['revision'] ) ? $models[ $id ]['revision'] : 'main';
		// A model that is not on Hugging Face names its own download folder
		// ('source', e.g. a release of the plugin repository); it always
		// comes with a pinned file list, there is no tree to read.
		$source = isset( $models[ $id ]['source'] ) ? (string) $models[ $id ]['source'] : '';
		if ( '' !== $source && ! $pinned ) {
			return new \WP_Error( 'wpie_bad_model', __( 'Unknown model.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$files = $pinned ? array_keys( $pinned ) : self::fetch_tree( $repo );
		if ( is_wp_error( $files ) ) {
			return $files;
		}

		$base = self::dir() . '/' . $repo;
		if ( ! wp_mkdir_p( $base ) ) {
			return new \WP_Error( 'wpie_mkdir', __( 'Could not create the models folder (uploads not writable?).', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		self::protect_dir( self::dir() );

		$done    = 0;
		$skipped = 0;
		$errors  = array();

		foreach ( $files as $path ) {
			// Path safety: only forward, repo-relative paths.
			if ( '' === $path || false !== strpos( $path, '..' ) || '/' === $path[0] ) {
				continue;
			}
			// Extension guard (WPIE-020): the tree comes from an upstream
			// third party, so never let it place a server-executable file into
			// uploads even if that upstream is compromised or MITM'd. Model
			// trees only ever carry weights/config/text.
			$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
			if ( in_array( $ext, array( 'php', 'phtml', 'phtm', 'php3', 'php4', 'php5', 'php7', 'phps', 'pht', 'phar', 'htaccess', 'shtml', 'cgi', 'pl', 'py', 'sh', 'exe', 'so', 'dll' ), true ) ) {
				$errors[] = $path . ': blocked file type';
				continue;
			}
			// Only the quantized ONNX variant is used by the browser; skip the
			// full-precision duplicates to halve the download. A pinned file
			// list names exactly what is used, so it is not filtered.
			if ( ! $pinned && preg_match( '/\.onnx(_data)?$/', $path ) && ! preg_match( '/quantized/', $path ) ) {
				++$skipped;
				continue;
			}
			// Per-model skip pattern (v1.131.0), e.g. redundant combined graphs.
			if ( ! empty( $models[ $id ]['skip'] ) && preg_match( $models[ $id ]['skip'], $path ) ) {
				++$skipped;
				continue;
			}

			$dest = $base . '/' . $path;
			$want = $pinned ? strtolower( (string) $pinned[ $path ] ) : '';
			if ( file_exists( $dest ) && filesize( $dest ) > 0 ) {
				if ( '' === $want || hash_equals( $want, (string) hash_file( 'sha256', $dest ) ) ) {
					++$done;
					continue;
				}
				// A pinned file that does not match is fetched again.
				wp_delete_file( $dest );
			}
			if ( ! wp_mkdir_p( dirname( $dest ) ) ) {
				$errors[] = $path . ': mkdir failed';
				continue;
			}

			$res = wp_safe_remote_get(
				'' !== $source ? $source . $path : 'https://huggingface.co/' . $repo . '/resolve/' . rawurlencode( $revision ) . '/' . $path,
				array(
					'timeout'  => 300,
					'stream'   => true,
					'filename' => $dest,
				)
			);
			if ( is_wp_error( $res ) ) {
				wp_delete_file( $dest );
				$errors[] = $path . ': ' . $res->get_error_message();
				continue;
			}
			$code = wp_remote_retrieve_response_code( $res );
			if ( 200 !== (int) $code ) {
				wp_delete_file( $dest );
				$errors[] = $path . ': HTTP ' . $code;
				continue;
			}
			if ( '' !== $want && ! hash_equals( $want, (string) hash_file( 'sha256', $dest ) ) ) {
				// Not the file this plugin was tested with: never keep it.
				wp_delete_file( $dest );
				$errors[] = $path . ': checksum mismatch';
				continue;
			}
			++$done;
		}

		// The old ViT-GPT2 caption model is dead weight once Florence-2 is
		// on disk (v1.138.0): remove it quietly.
		if ( 'caption' === $id && self::is_installed( 'caption' ) ) {
			self::remove_repo( 'Xenova/vit-gpt2-image-captioning' );
		}

		return rest_ensure_response(
			array(
				'id'         => $id,
				'installed'  => self::is_installed( $id ),
				'downloaded' => $done,
				'skipped'    => $skipped,
				'errors'     => $errors,
			)
		);
	}

	/**
	 * Drop a hardening .htaccess into a model/runtime directory so a stray
	 * server-executable file cannot run even if one somehow lands there. Static
	 * model assets (onnx/wasm/js/json) are still served; only executable types
	 * are denied. Written once, only where missing, and harmless on nginx
	 * (which ignores .htaccess). Belt-and-suspenders with the download-time
	 * extension guard. (WPIE-020)
	 *
	 * @param string $dir Absolute directory path (must exist).
	 */
	private static function protect_dir( $dir ) {
		$file = trailingslashit( $dir ) . '.htaccess';
		if ( ! is_dir( $dir ) || file_exists( $file ) ) {
			return;
		}
		$rules  = "# WunderPaint: model assets are static; never execute code here.\n";
		$rules .= '<FilesMatch "\.(?i:php|phtml|phtm|php[0-9]|phps|pht|phar|cgi|pl|py|sh|shtml)(\.|$)">' . "\n";
		$rules .= "\t<IfModule mod_authz_core.c>\n\t\tRequire all denied\n\t</IfModule>\n";
		$rules .= "\t<IfModule !mod_authz_core.c>\n\t\tOrder allow,deny\n\t\tDeny from all\n\t</IfModule>\n";
		$rules .= "</FilesMatch>\n";
		file_put_contents( $file, $rules ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * Delete one repo directory inside the models dir (guarded).
	 *
	 * @param string $repo Repo id (owner/name).
	 */
	private static function remove_repo( $repo ) {
		$base = self::dir() . '/' . $repo;
		if ( ! is_dir( $base ) || false !== strpos( $repo, '..' ) ) {
			return;
		}
		$it = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $base, \FilesystemIterator::SKIP_DOTS ),
			\RecursiveIteratorIterator::CHILD_FIRST
		);
		foreach ( $it as $file ) {
			if ( $file->isDir() ) {
				@rmdir( (string) $file->getPathname() ); // phpcs:ignore
			} else {
				wp_delete_file( (string) $file->getPathname() );
			}
		}
		@rmdir( $base ); // phpcs:ignore
	}

	/**
	 * The recursive file list of a Hugging Face model repo (main branch).
	 *
	 * @param string $repo Repo id.
	 * @return array|\WP_Error Array of repo-relative file paths.
	 */
	private static function fetch_tree( $repo ) {
		// NOTE: do not url-encode $repo, the "owner/name" slash must stay a
		// slash in the API path (encoding it to %2F returns HTTP 400). $repo
		// comes only from the hardcoded MODELS map, so it is safe.
		$res = wp_safe_remote_get(
			'https://huggingface.co/api/models/' . $repo . '/tree/main?recursive=true',
			array( 'timeout' => 30 )
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $body ) ) {
			return new \WP_Error( 'wpie_tree', __( 'Could not read the model file list from Hugging Face.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		$files = array();
		foreach ( $body as $item ) {
			if ( isset( $item['type'], $item['path'] ) && 'file' === $item['type'] ) {
				$files[] = (string) $item['path'];
			}
		}
		return $files;
	}
}
