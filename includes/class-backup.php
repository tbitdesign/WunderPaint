<?php
/**
 * Backup & restore (v1.100.0): one portable ZIP with everything a site
 * builds inside the editor - settings incl. brand kits, dynamic templates,
 * designs, user library assets, Pro content templates, kit logo and
 * watermark files, uploaded custom fonts, installed editor extensions and
 * (optional) the per-attachment version store. Restore replaces the
 * stores and remaps kit logos/watermarks to freshly imported attachments,
 * so the archive works for reinstalls AND migrations to another site.
 * Deliberately NOT included (reproducible): local AI models and the
 * transformers runtime (re-downloaded on demand), search index vectors
 * (rebuilt automatically) and the monthly AI spend counter (restoring an
 * old count would undermine the budget limit).
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Backup module.
 */
class Backup {

	const FORMAT = 'wpie-backup@1';

	/**
	 * Option keys included verbatim (existing values only).
	 *
	 * @var string[]
	 */
	const OPTIONS = array(
		'wpie_templates',
		'wpie_designs',
		'wpie_user_library',
		'wpie_palettes',
		'wpie_3d_models',
		'wpie_ai_usage_log',
		'wpie_extensions_disabled',
		'wpie_content_templates', // Pro, when present.
		'wpie_automation_settings', // Pro, when present.
	);

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'admin_post_wpie_backup_export', array( $this, 'export' ) );
		add_action( 'admin_post_wpie_backup_import', array( $this, 'import' ) );
	}

	/**
	 * Permission + nonce gate for both endpoints.
	 *
	 * @param string $action Nonce action.
	 */
	private static function authorize( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'wunderpaint' ) );
		}
		check_admin_referer( $action );
	}

	/**
	 * Files of one store directory (flat, json + png only).
	 *
	 * @param string $dir Absolute directory.
	 * @return string[] Absolute paths.
	 */
	private static function store_files( $dir ) {
		// Two globs: GLOB_BRACE is unavailable on some builds (Alpine).
		return array_merge(
			glob( $dir . '/*.json' ) ?: array(),
			glob( $dir . '/*.png' ) ?: array()
		);
	}

	/**
	 * POST admin-post.php?action=wpie_backup_export : stream the ZIP.
	 */
	public function export() {
		self::authorize( 'wpie_backup_export' );

		$tmp = self::build_archive(
			! empty( $_POST['keys'] ), // phpcs:ignore WordPress.Security.NonceVerification.Missing
			! empty( $_POST['versions'] ), // phpcs:ignore WordPress.Security.NonceVerification.Missing
			! empty( $_POST['extensions'] ) // phpcs:ignore WordPress.Security.NonceVerification.Missing
		);
		if ( is_wp_error( $tmp ) ) {
			wp_die( esc_html( $tmp->get_error_message() ) );
		}

		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="wpie-backup-' . gmdate( 'Ymd-His' ) . '.zip"' );
		header( 'Content-Length: ' . (string) filesize( $tmp ) );
		readfile( $tmp ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		wp_delete_file( $tmp );
		exit;
	}

	/**
	 * Build the backup ZIP (also the base for scheduled S3 uploads later).
	 *
	 * @param bool $include_keys       Export API keys as plaintext.
	 * @param bool $include_versions   Include the per-attachment version store.
	 * @param bool $include_extensions Include installed editor extensions.
	 * @return string|\WP_Error Temp file path.
	 */
	public static function build_archive( $include_keys = false, $include_versions = false, $include_extensions = true ) {
		if ( ! class_exists( '\ZipArchive' ) ) {
			return new \WP_Error( 'wpie_no_zip', __( 'The PHP zip extension is required for backups.', 'wunderpaint' ) );
		}
		$tmp = wp_tempnam( 'wpie-backup' );
		$zip = new \ZipArchive();
		if ( true !== $zip->open( $tmp, \ZipArchive::OVERWRITE ) ) {
			return new \WP_Error( 'wpie_zip_open', __( 'Could not create the backup archive.', 'wunderpaint' ) );
		}

		// --- Options ---------------------------------------------------
		$settings = Helpers::get_settings();
		$secrets  = array();
		foreach ( Helpers::secret_fields() as $field ) {
			if ( $include_keys ) {
				// Obfuscation is keyed off the WP salts, so ciphertext is
				// useless on another site: export plaintext by choice.
				$plain = Helpers::deobfuscate( (string) ( $settings[ $field ] ?? '' ) );
				if ( '' !== $plain ) {
					$secrets[ $field ] = $plain;
				}
			}
			unset( $settings[ $field ] );
		}
		$options = array( 'wpie_settings' => $settings );
		if ( $secrets ) {
			$options['secrets_plain'] = $secrets;
		}
		foreach ( self::OPTIONS as $key ) {
			$value = get_option( $key, null );
			if ( null !== $value ) {
				$options[ $key ] = $value;
			}
		}
		$zip->addFromString( 'options.json', (string) wp_json_encode( $options ) );

		// --- Template + design stores -----------------------------------
		$counts = array(
			'templates'  => 0,
			'designs'    => 0,
			'logos'      => 0,
			'fonts'      => 0,
			'models'     => 0,
			'extensions' => 0,
			'versions'   => 0,
		);
		foreach ( self::store_files( Templates::dir() ) as $file ) {
			$zip->addFile( $file, 'templates/' . basename( $file ) );
			++$counts['templates'];
		}
		foreach ( self::store_files( Projects::dir() ) as $file ) {
			$zip->addFile( $file, 'designs/' . basename( $file ) );
			++$counts['designs'];
		}

		// --- Kit logo + watermark files (attachment ids differ across
		// sites, so the files travel with the archive and get re-imported).
		$logos = array();
		$seen  = array();
		foreach ( Settings::brand_kits( Helpers::get_settings() ) as $kit ) {
			foreach ( array( 'logo', 'watermark' ) as $field ) {
				$id   = (int) ( $kit[ $field ] ?? 0 );
				$path = $id ? get_attached_file( $id ) : '';
				if ( ! $path || ! file_exists( $path ) ) {
					continue;
				}
				$name = 'logos/' . $id . '-' . sanitize_file_name( basename( $path ) );
				if ( empty( $seen[ $name ] ) ) {
					$zip->addFile( $path, $name );
					$seen[ $name ] = true;
				}
				$logos[] = array(
					'kit'   => (string) ( $kit['id'] ?? '' ),
					'field' => $field,
					'id'    => $id,
					'file'  => $name,
				);
				++$counts['logos'];
			}
		}
		$zip->addFromString( 'logos.json', (string) wp_json_encode( $logos ) );

		// --- Uploaded custom fonts (files; the entries live in settings) --
		foreach ( Fonts::custom_fonts() as $font ) {
			$path = Fonts::dir() . '/' . (string) ( $font['file'] ?? '' );
			if ( ! empty( $font['file'] ) && file_exists( $path ) ) {
				$zip->addFile( $path, 'fonts/' . basename( $path ) );
				++$counts['fonts'];
			}
		}

		// --- 3D model library (GLBs; the index option travels above) ------
		$models_ix = get_option( Models_3D::OPTION, array() );
		foreach ( ( is_array( $models_ix ) ? $models_ix : array() ) as $rec ) {
			$file = basename( (string) ( $rec['file'] ?? '' ) );
			$path = trailingslashit( Models_3D::dir() ) . $file;
			if ( '' !== $file && is_file( $path ) ) {
				$zip->addFile( $path, 'models3d/' . $file );
				++$counts['models'];
				$thumb = preg_replace( '/\.glb$/', '.png', $path );
				if ( is_file( $thumb ) ) {
					$zip->addFile( $thumb, 'models3d/' . basename( $thumb ) );
				}
			}
		}

		// --- Installed editor extensions (user-installed packages) --------
		if ( $include_extensions ) {
			$base = Extensions::dir();
			foreach ( Extensions::all() as $ext ) {
				$dir = $base . $ext['slug'];
				$it  = new \RecursiveIteratorIterator(
					new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS )
				);
				foreach ( $it as $file ) {
					if ( $file->isFile() ) {
						$rel = substr( (string) $file->getPathname(), strlen( $base ) );
						$zip->addFile( (string) $file->getPathname(), 'extensions/' . str_replace( '\\', '/', $rel ) );
					}
				}
				++$counts['extensions'];
			}
		}

		// --- Version store (optional, can be huge) -----------------------
		if ( $include_versions ) {
			$meta = array();
			$base = \wpie_versions_dir();
			foreach ( glob( $base . '/*', GLOB_ONLYDIR ) ?: array() as $dir ) {
				$name = basename( $dir );
				if ( ! preg_match( '/^(\d+)-[a-zA-Z0-9]+$/', $name, $m ) ) {
					continue; // templates/, designs/ and strays.
				}
				$att_id = (int) $m[1];
				foreach ( glob( $dir . '/*' ) ?: array() as $file ) {
					if ( is_file( $file ) && 'index.php' !== basename( $file ) ) {
						$zip->addFile( $file, 'versions/' . $name . '/' . basename( $file ) );
						++$counts['versions'];
					}
				}
				$meta[] = array(
					'id'       => $att_id,
					'subdir'   => $name,
					'versions' => get_post_meta( $att_id, Versioning::META_VERSIONS, true ),
					'counter'  => get_post_meta( $att_id, Versioning::META_COUNTER, true ),
					'project'  => get_post_meta( $att_id, Versioning::META_PROJECT, true ),
					'psd'      => get_post_meta( $att_id, Versioning::META_PSD, true ),
				);
			}
			$zip->addFromString( 'versions.json', (string) wp_json_encode( $meta ) );
		}

		$zip->addFromString(
			'manifest.json',
			(string) wp_json_encode(
				array(
					'format'   => self::FORMAT,
					'created'  => gmdate( 'c' ),
					'home'     => home_url(),
					'version'  => WPIE_VERSION,
					'includes' => array(
						'keys'       => $include_keys,
						'versions'   => $include_versions,
						'extensions' => $include_extensions,
					),
					'counts'   => $counts,
				)
			)
		);
		$zip->close();
		return $tmp;
	}

	/**
	 * POST admin-post.php?action=wpie_backup_import : restore an archive.
	 * Replaces the template/design/library stores; settings are merged
	 * (current API keys survive unless the backup carries plaintext keys).
	 */
	public function import() {
		self::authorize( 'wpie_backup_import' );

		$file = $_FILES['backup'] ?? null; // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- validated below via UPLOAD_ERR_OK + is_uploaded_file(); values are sanitized where used.
		if ( ! $file || UPLOAD_ERR_OK !== (int) ( $file['error'] ?? -1 ) || ! is_uploaded_file( $file['tmp_name'] ) ) {
			self::back( 'error', __( 'No backup file received (check the server upload limit).', 'wunderpaint' ) );
		}

		$zip = new \ZipArchive();
		if ( true !== $zip->open( $file['tmp_name'] ) ) {
			self::back( 'error', __( 'The file is not a readable ZIP archive.', 'wunderpaint' ) );
		}
		$manifest = json_decode( (string) $zip->getFromName( 'manifest.json' ), true );
		$options  = json_decode( (string) $zip->getFromName( 'options.json' ), true );
		if ( ! is_array( $manifest ) || self::FORMAT !== ( $manifest['format'] ?? '' ) || ! is_array( $options ) ) {
			self::back( 'error', __( 'This is not a WunderPaint backup.', 'wunderpaint' ) );
		}

		// --- Options -----------------------------------------------------
		$current  = get_option( WPIE_OPTION, array() );
		$current  = is_array( $current ) ? $current : array();
		$imported = is_array( $options['wpie_settings'] ?? null ) ? $options['wpie_settings'] : array();
		foreach ( Helpers::secret_fields() as $field ) {
			unset( $imported[ $field ] ); // Never trust ciphertext from elsewhere.
		}
		$merged = array_merge( $current, $imported );
		// update_option() runs the registered sanitize callback (admin-post
		// context), and its secret handling treats any non-masked input as a
		// NEW plaintext key. Feeding stored ciphertext through would
		// double-obfuscate and destroy every key: strip secrets entirely
		// (sanitize keeps the stored values) and pass imported keys as
		// plaintext so sanitize obfuscates them exactly once.
		foreach ( Helpers::secret_fields() as $field ) {
			unset( $merged[ $field ] );
		}
		foreach ( (array) ( $options['secrets_plain'] ?? array() ) as $field => $plain ) {
			if ( in_array( $field, Helpers::secret_fields(), true ) && is_string( $plain ) && '' !== $plain ) {
				$merged[ $field ] = $plain;
			}
		}
		foreach ( self::OPTIONS as $key ) {
			if ( array_key_exists( $key, $options ) ) {
				update_option( $key, $options[ $key ], false );
			}
		}

		// --- Store files ---------------------------------------------------
		$restored = array(
			'templates' => self::restore_store( $zip, 'templates/', Templates::dir() ),
			'designs'   => self::restore_store( $zip, 'designs/', Projects::dir() ),
			'models'    => self::restore_models( $zip ),
		);

		// --- Kit logos + watermarks: import files, remap ids by kit -------
		$logos = json_decode( (string) $zip->getFromName( 'logos.json' ), true );
		$kits  = json_decode( (string) ( $merged['brand_kits'] ?? '' ), true );
		$kits  = is_array( $kits ) ? $kits : array();
		if ( is_array( $logos ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			$imported_files = array();
			foreach ( $logos as $entry ) {
				// Entries without 'field' come from pre-1.137 archives.
				$field = in_array( $entry['field'] ?? 'logo', array( 'logo', 'watermark' ), true ) ? ( $entry['field'] ?? 'logo' ) : 'logo';
				$file  = (string) ( $entry['file'] ?? '' );
				if ( isset( $imported_files[ $file ] ) ) {
					// Same attachment used by several kits/fields.
					$att_id = $imported_files[ $file ];
				} else {
					$data = $zip->getFromName( $file );
					if ( false === $data ) {
						continue;
					}
					$upload = wp_upload_bits( sanitize_file_name( basename( $file ) ), null, $data );
					if ( ! empty( $upload['error'] ) ) {
						continue;
					}
					$att_id = wp_insert_attachment(
						array(
							'post_mime_type' => (string) ( wp_check_filetype( $upload['file'] )['type'] ?? 'image/png' ),
							'post_title'     => 'watermark' === $field ? __( 'Brand watermark', 'wunderpaint' ) : __( 'Brand logo', 'wunderpaint' ),
							'post_status'    => 'inherit',
						),
						$upload['file']
					);
					if ( ! $att_id || is_wp_error( $att_id ) ) {
						continue;
					}
					wp_update_attachment_metadata( $att_id, wp_generate_attachment_metadata( $att_id, $upload['file'] ) );
					$imported_files[ $file ] = (int) $att_id;
				}
				foreach ( $kits as $i => $kit ) {
					if ( (string) ( $kit['id'] ?? '' ) === (string) ( $entry['kit'] ?? '' ) ) {
						$kits[ $i ][ $field ] = (int) $att_id;
					}
				}
			}
			$merged['brand_kits'] = (string) wp_json_encode( $kits );
		}
		update_option( WPIE_OPTION, $merged );

		// --- Version store (same-site restores) ---------------------------
		$versions_meta = json_decode( (string) $zip->getFromName( 'versions.json' ), true );
		$restored['versions'] = 0;
		if ( is_array( $versions_meta ) ) {
			$base = \wpie_versions_dir();
			for ( $i = 0; $i < $zip->numFiles; $i++ ) {
				$name = (string) $zip->getNameIndex( $i );
				if ( 0 !== strpos( $name, 'versions/' ) || false !== strpos( $name, '..' ) ) {
					continue;
				}
				$rel = substr( $name, 9 );
				if ( ! preg_match( '#^(\d+)-[a-zA-Z0-9]+/([^/]+)$#', $rel, $m ) ) {
					continue;
				}
				// Every other restore path has an extension allowlist; this one
				// did not, so an archive could drop a .php file straight into the
				// web reachable uploads tree. (F-M07, 2026-07-25 audit)
				if ( ! self::allowed_version_file( $m[2] ) ) {
					continue;
				}
				$target = $base . '/' . dirname( $rel ) . '/' . sanitize_file_name( $m[2] );
				wp_mkdir_p( dirname( $target ) );
				file_put_contents( $target, $zip->getFromIndex( $i ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				++$restored['versions'];
			}
			foreach ( $versions_meta as $entry ) {
				$att_id = (int) ( $entry['id'] ?? 0 );
				if ( ! $att_id || ! get_post( $att_id ) ) {
					continue;
				}
				// The subdir lands in a path in Versioning::dir_for(). It comes from
				// the archive, so slashes and .. must not survive. The legitimate
				// format is wp_generate_password( 16, false, false ), i.e. plain
				// alphanumerics. (F-M08, 2026-07-25 audit)
				$subdir = preg_replace( '/[^a-zA-Z0-9]/', '', (string) preg_replace( '/^\d+-/', '', (string) ( $entry['subdir'] ?? '' ) ) );
				if ( '' !== $subdir ) {
					update_post_meta( $att_id, Versioning::META_SUBDIR, $subdir );
				}
				update_post_meta( $att_id, Versioning::META_VERSIONS, $entry['versions'] ?? array() );
				update_post_meta( $att_id, Versioning::META_COUNTER, (int) ( $entry['counter'] ?? 1 ) );
				if ( ! empty( $entry['project'] ) ) {
					update_post_meta( $att_id, Versioning::META_PROJECT, (string) $entry['project'] );
				}
				if ( ! empty( $entry['psd'] ) ) {
					update_post_meta( $att_id, Versioning::META_PSD, (string) $entry['psd'] );
				}
			}
		}

		// --- Custom fonts + editor extensions ------------------------------
		$restored['fonts']      = self::restore_fonts( $zip );
		$restored['extensions'] = self::restore_extensions( $zip );

		$zip->close();
		self::back(
			'imported',
			sprintf(
				/* translators: 1: templates, 2: designs, 3: version files, 4: extensions, 5: font files, 6: 3D model files. */
				__( 'Backup restored: %1$d template files, %2$d design files, %3$d version files, %4$d extensions, %5$d font files, %6$d 3D models.', 'wunderpaint' ),
				(int) $restored['templates'],
				(int) $restored['designs'],
				(int) $restored['versions'],
				(int) $restored['extensions'],
				(int) $restored['fonts'],
				(int) $restored['models']
			)
		);
	}

	/**
	 * Restore 3D model library files: models3d/<id>.glb entries, validated
	 * by name pattern and the GLB magic bytes. The index option is already
	 * restored via OPTIONS; orphaned index rows simply stay unlisted until
	 * their file arrives.
	 *
	 * @param \ZipArchive $zip Archive.
	 * @return int Restored file count.
	 */
	private static function restore_models( $zip ) {
		$count = 0;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = (string) $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, 'models3d/' ) || false !== strpos( $name, '..' ) ) {
				continue;
			}
			$base = sanitize_file_name( basename( $name ) );
			if ( ! preg_match( '/^[a-z0-9]+\.(glb|png)$/', $base, $m ) ) {
				continue;
			}
			$bytes = (string) $zip->getFromIndex( $i );
			$magic = 'png' === $m[1] ? "\x89PNG" : 'glTF';
			if ( strlen( $bytes ) < 20 || substr( $bytes, 0, 4 ) !== $magic ) {
				continue;
			}
			if ( 'png' === $m[1] ) {
				// Thumbs restore silently alongside their models.
				if ( wp_mkdir_p( Models_3D::dir() ) ) {
					file_put_contents( trailingslashit( Models_3D::dir() ) . $base, $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				}
				continue;
			}
			if ( ! wp_mkdir_p( Models_3D::dir() ) ) {
				break;
			}
			file_put_contents( trailingslashit( Models_3D::dir() ) . $base, $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			++$count;
		}
		return $count;
	}

	/**
	 * Restore uploaded custom font files (their settings entries arrive
	 * through the merged options, referencing these exact file names).
	 *
	 * @param \ZipArchive $zip Archive.
	 * @return int Restored file count.
	 */
	private static function restore_fonts( $zip ) {
		$count = 0;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = (string) $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, 'fonts/' ) || false !== strpos( $name, '..' ) ) {
				continue;
			}
			$base = sanitize_file_name( basename( $name ) );
			$ext  = strtolower( (string) pathinfo( $base, PATHINFO_EXTENSION ) );
			if ( '' === $base || ! isset( Fonts::ALLOWED[ $ext ] ) ) {
				continue;
			}
			if ( ! wp_mkdir_p( Fonts::dir() ) ) {
				break;
			}
			file_put_contents( Fonts::dir() . '/' . $base, $zip->getFromIndex( $i ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			++$count;
		}
		return $count;
	}

	/**
	 * Restore editor extension packages: every slug present in the archive
	 * replaces its installed counterpart, other installed packages stay.
	 * Same validation as the installer (path safety, file-type whitelist,
	 * a working manifest), since an archive is just another upload.
	 *
	 * @param \ZipArchive $zip Archive.
	 * @return int Restored package count.
	 */
	private static function restore_extensions( $zip ) {
		if ( ! Extensions::can_manage() ) {
			return 0; // DISALLOW_FILE_MODS blocks code installs, backups too.
		}
		$slugs = array();
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = str_replace( '\\', '/', (string) $zip->getNameIndex( $i ) );
			if ( 0 !== strpos( $name, 'extensions/' ) || '/' === substr( $name, -1 ) ) {
				continue;
			}
			$rel = substr( $name, 11 );
			if ( false !== strpos( $rel, '..' ) || ! preg_match( '#^([a-z0-9_-]+)/(.+)$#', $rel, $m ) ) {
				continue;
			}
			$ext = strtolower( (string) pathinfo( $m[2], PATHINFO_EXTENSION ) );
			if ( ! in_array( $ext, Extensions::ALLOWED_EXT, true ) ) {
				continue;
			}
			$slugs[ $m[1] ][ $m[2] ] = $i;
		}
		$count = 0;
		foreach ( $slugs as $slug => $files ) {
			// Same guards as the ZIP installer: file count and total unpacked
			// size per package, plus the shared per-file writer that enforces
			// the extension allowlist, the size cap and the SVG sanitizer.
			// This path used to have none of that. (F-L15)
			if ( count( $files ) > Extensions::MAX_FILES ) {
				continue;
			}
			Extensions::remove_package( $slug );
			$target = Extensions::dir() . $slug . '/';
			wp_mkdir_p( $target );
			$bytes = 0;
			foreach ( $files as $rel => $index ) {
				$data = $zip->getFromIndex( $index );
				if ( false === $data ) {
					continue;
				}
				$bytes += strlen( $data );
				if ( $bytes > Extensions::MAX_UNCOMPRESSED_BYTES ) {
					break;
				}
				Extensions::write_package_file( $target, $rel, $data );
			}
			if ( Extensions::describe( $slug ) ) {
				++$count;
			} else {
				Extensions::remove_package( $slug ); // No usable manifest.
			}
		}
		return $count;
	}

	/**
	 * Replace one file store with the archive's entries.
	 *
	 * @param \ZipArchive $zip    Archive.
	 * @param string      $prefix Entry prefix ('templates/').
	 * @param string      $dir    Target directory.
	 * @return int Restored file count.
	 */
	private static function restore_store( $zip, $prefix, $dir ) {
		$has = false;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			if ( 0 === strpos( (string) $zip->getNameIndex( $i ), $prefix ) ) {
				$has = true;
				break;
			}
		}
		if ( ! $has ) {
			return 0;
		}
		foreach ( self::store_files( $dir ) as $file ) {
			wp_delete_file( $file );
		}
		$count = 0;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = (string) $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, $prefix ) || false !== strpos( $name, '..' ) ) {
				continue;
			}
			$base = sanitize_file_name( basename( $name ) );
			if ( ! preg_match( '/\.(json|png)$/', $base ) ) {
				continue;
			}
			file_put_contents( $dir . '/' . $base, $zip->getFromIndex( $i ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			++$count;
		}
		return $count;
	}

	/**
	 * Redirect back to the Backup tab with a notice.
	 *
	 * @param string $status 'imported' | 'error'.
	 * @param string $msg    Human message.
	 */
	private static function back( $status, $msg ) {
		wp_safe_redirect(
			add_query_arg(
				array(
					'page'        => WPIE_SETTINGS_SLUG,
					'wpie-backup' => $status,
					'wpie-msg'    => rawurlencode( $msg ),
				),
				admin_url( 'options-general.php' )
			) . '#wpie-tab-backup'
		);
		exit;
	}

	/**
	 * May a file from the version store of a backup archive be written to disk?
	 *
	 * The version directory lives under uploads and is served by the web
	 * server, so only inert media and project data belong there. Server
	 * executable extensions and dotfiles such as .htaccess or .user.ini are
	 * rejected outright, and a double extension like `x.php.png` is rejected as
	 * well because some server configurations still hand it to the PHP handler.
	 * (F-M07, 2026-07-25 audit)
	 *
	 * @param string $filename File name from the archive entry, no directory part.
	 * @return bool
	 */
	public static function allowed_version_file( $filename ) {
		$name = trim( (string) $filename );
		if ( '' === $name || '.' === $name[0] || $name !== basename( $name ) ) {
			return false;
		}
		// Deliberately no svg: it would sit web reachable under uploads and is
		// active content in the browser.
		$allowed = array( 'json', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'psd', 'gif', 'bmp' );
		$parts   = explode( '.', strtolower( $name ) );
		if ( count( $parts ) < 2 ) {
			return false;
		}
		array_shift( $parts );
		// Check EVERY extension segment, not just the last one.
		foreach ( $parts as $ext ) {
			if ( ! in_array( $ext, $allowed, true ) ) {
				return false;
			}
		}
		return true;
	}

}
