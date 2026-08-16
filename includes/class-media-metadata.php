<?php
/**
 * Metadata inspector and cleaner (v1.401.0): what is actually inside an image
 * file, and a way to take the private parts back out.
 *
 * WordPress hides this completely. A phone photo carries the exact spot it was
 * taken, the camera's serial number and the software that touched it, and all
 * of that stays in the original file the library serves under a public URL.
 * The inspector is the larger half of the feature: nobody cleans what nobody
 * can see.
 *
 * Reading uses PHP's own `exif_read_data` and `iptcparse` where they exist and
 * falls back to plain byte scanning where they do not, so the feature never
 * asks for exiftool, Imagick or any other server package.
 *
 * Removing is byte surgery on the container, never a re-encode: re-saving a
 * JPEG to drop its metadata would cost image quality for nothing.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Read and strip embedded image metadata.
 */
class Media_Metadata {

	/** Containers this class understands. */
	const MIMES = array( 'image/jpeg', 'image/png', 'image/webp' );

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		// Both reading and stripping act on ONE attachment's file, so both
		// must require edit rights on THAT attachment, not merely the editor
		// capability. The strip path always checked edit_post internally; the
		// read path did not, which let any upload_files user pull the full
		// EXIF/XMP - GPS coordinates, camera serial numbers - of any
		// attachment on the site, including other users' private uploads.
		// can_edit_attachment enforces the per-object check for both.
		$perm = array( REST_Controller::class, 'can_edit_attachment' );

		register_rest_route(
			WPIE_REST_NS,
			'/media-metadata/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_strip' ),
					'permission_callback' => $perm,
				),
			)
		);
	}

	/* ------------------------------- reading ------------------------------ */

	/**
	 * Everything readable in one attachment's original file.
	 *
	 * @param int $id Attachment id.
	 * @return array|\WP_Error Report.
	 */
	public static function read( $id ) {
		$id   = (int) $id;
		$path = get_attached_file( $id );
		if ( ! $path || ! file_exists( $path ) ) {
			return new \WP_Error(
				'wpie_no_file',
				__( 'The file for this image was not found.', 'wunderpaint' ),
				array( 'status' => 404 )
			);
		}

		$mime = (string) get_post_mime_type( $id );
		$out  = array(
			'mime'      => $mime,
			'supported' => in_array( $mime, self::MIMES, true ),
			'bytes'     => (int) filesize( $path ),
			'blocks'    => array(),
			'fields'    => array(),
			'gps'       => null,
		);
		if ( ! $out['supported'] ) {
			return $out;
		}

		if ( 'image/jpeg' === $mime ) {
			self::read_jpeg( $path, $out );
		} elseif ( 'image/png' === $mime ) {
			self::read_png( $path, $out );
		} else {
			self::read_webp( $path, $out );
		}

		// A file can carry blocks whose individual fields we do not surface.
		// Saying so is the difference between "nothing in here" and "nothing
		// I chose to show you".
		$out['empty'] = empty( $out['blocks'] );
		return $out;
	}

	/**
	 * Fields worth showing, grouped, with the labels the panel prints.
	 *
	 * Serial numbers are their own group on purpose: that is the field people
	 * are surprised by, and camera bodies have been traced through it.
	 *
	 * @return array<string,array<string,string>>
	 */
	public static function field_map() {
		return array(
			'capture'  => array(
				'DateTimeOriginal' => __( 'Taken', 'wunderpaint' ),
				'Make'             => __( 'Camera make', 'wunderpaint' ),
				'Model'            => __( 'Camera model', 'wunderpaint' ),
				'LensModel'        => __( 'Lens', 'wunderpaint' ),
				'ExposureTime'     => __( 'Exposure', 'wunderpaint' ),
				'FNumber'          => __( 'Aperture', 'wunderpaint' ),
				'ISOSpeedRatings'  => __( 'ISO', 'wunderpaint' ),
				'FocalLength'      => __( 'Focal length', 'wunderpaint' ),
			),
			'identity' => array(
				'BodySerialNumber'     => __( 'Camera serial number', 'wunderpaint' ),
				'SerialNumber'         => __( 'Serial number', 'wunderpaint' ),
				'InternalSerialNumber' => __( 'Internal serial number', 'wunderpaint' ),
				'LensSerialNumber'     => __( 'Lens serial number', 'wunderpaint' ),
				'CameraOwnerName'      => __( 'Camera owner', 'wunderpaint' ),
			),
			'software' => array(
				'Software'           => __( 'Software', 'wunderpaint' ),
				'ProcessingSoftware' => __( 'Processing software', 'wunderpaint' ),
				'Artist'             => __( 'Artist', 'wunderpaint' ),
				'Copyright'          => __( 'Copyright', 'wunderpaint' ),
			),
		);
	}

	/**
	 * Read a JPEG: EXIF through PHP's own parser, IPTC and XMP by hand.
	 *
	 * @param string $path File.
	 * @param array  $out  Report, by reference.
	 */
	private static function read_jpeg( $path, &$out ) {
		if ( function_exists( 'exif_read_data' ) ) {
			// Suppressed on purpose: a malformed EXIF block is a normal thing
			// to meet in the wild and must not turn into a PHP notice.
			$exif = @exif_read_data( $path, null, true ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( is_array( $exif ) ) {
				self::collect_exif( $exif, $out );
			}
		}

		$info = array();
		// getimagesize fills $info with the APP segments; same reasoning.
		@getimagesize( $path, $info ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( ! empty( $info['APP13'] ) && function_exists( 'iptcparse' ) ) {
			$iptc = @iptcparse( $info['APP13'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( is_array( $iptc ) && $iptc ) {
				$out['blocks'][] = 'iptc';
			}
		}
		self::scan_xmp( (string) file_get_contents( $path ), $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	}

	/**
	 * Pull the interesting values out of an exif_read_data() result.
	 *
	 * @param array $exif Sectioned EXIF.
	 * @param array $out  Report, by reference.
	 */
	private static function collect_exif( $exif, &$out ) {
		$flat = array();
		foreach ( $exif as $section => $values ) {
			if ( is_array( $values ) ) {
				foreach ( $values as $key => $value ) {
					$flat[ $key ] = $value;
				}
			}
		}
		if ( $flat ) {
			$out['blocks'][] = 'exif';
		}

		foreach ( self::field_map() as $group => $fields ) {
			foreach ( $fields as $key => $label ) {
				if ( ! isset( $flat[ $key ] ) || is_array( $flat[ $key ] ) ) {
					continue;
				}
				$value = trim( (string) $flat[ $key ] );
				if ( '' === $value ) {
					continue;
				}
				$out['fields'][] = array(
					'group' => $group,
					'key'   => $key,
					'label' => $label,
					'value' => self::pretty( $key, $value ),
				);
			}
		}

		$gps = self::gps_from_exif( $flat );
		if ( $gps ) {
			$out['gps']      = $gps;
			$out['blocks'][] = 'gps';
		}
	}

	/**
	 * Make a raw EXIF value readable.
	 *
	 * @param string $key   Field name.
	 * @param string $value Raw value.
	 * @return string
	 */
	private static function pretty( $key, $value ) {
		if ( 'FNumber' === $key || 'ExposureTime' === $key || 'FocalLength' === $key ) {
			// These arrive as "45/10" style rationals.
			if ( preg_match( '#^(\d+)/(\d+)$#', $value, $m ) && (int) $m[2] > 0 ) {
				$num = (int) $m[1] / (int) $m[2];
				if ( 'ExposureTime' === $key && $num > 0 && $num < 1 ) {
					return '1/' . (int) round( 1 / $num ) . ' s';
				}
				$num = round( $num, 1 );
				if ( 'FNumber' === $key ) {
					return 'f/' . $num;
				}
				return $num . ( 'FocalLength' === $key ? ' mm' : ' s' );
			}
		}
		return $value;
	}

	/**
	 * Decimal coordinates out of the EXIF GPS fields.
	 *
	 * @param array $flat Flattened EXIF.
	 * @return array|null {lat, lon, alt}
	 */
	private static function gps_from_exif( $flat ) {
		if ( empty( $flat['GPSLatitude'] ) || empty( $flat['GPSLongitude'] ) ) {
			return null;
		}
		$to_deg = static function ( $parts ) {
			if ( ! is_array( $parts ) ) {
				return null;
			}
			$vals = array();
			foreach ( array_slice( $parts, 0, 3 ) as $part ) {
				if ( preg_match( '#^(-?\d+)/(\d+)$#', (string) $part, $m ) && (int) $m[2] > 0 ) {
					$vals[] = (int) $m[1] / (int) $m[2];
				} else {
					$vals[] = (float) $part;
				}
			}
			while ( count( $vals ) < 3 ) {
				$vals[] = 0.0;
			}
			return $vals[0] + ( $vals[1] / 60 ) + ( $vals[2] / 3600 );
		};

		$lat = $to_deg( $flat['GPSLatitude'] );
		$lon = $to_deg( $flat['GPSLongitude'] );
		if ( null === $lat || null === $lon ) {
			return null;
		}
		if ( isset( $flat['GPSLatitudeRef'] ) && 'S' === strtoupper( substr( (string) $flat['GPSLatitudeRef'], 0, 1 ) ) ) {
			$lat = -$lat;
		}
		if ( isset( $flat['GPSLongitudeRef'] ) && 'W' === strtoupper( substr( (string) $flat['GPSLongitudeRef'], 0, 1 ) ) ) {
			$lon = -$lon;
		}

		$alt = null;
		if ( isset( $flat['GPSAltitude'] ) && preg_match( '#^(\d+)/(\d+)$#', (string) $flat['GPSAltitude'], $m ) && (int) $m[2] > 0 ) {
			$alt = round( (int) $m[1] / (int) $m[2] );
		}

		return array(
			'lat' => round( $lat, 6 ),
			'lon' => round( $lon, 6 ),
			'alt' => $alt,
		);
	}

	/**
	 * Read a PNG: walk the chunks and note which metadata ones are present.
	 *
	 * @param string $path File.
	 * @param array  $out  Report, by reference.
	 */
	private static function read_png( $path, &$out ) {
		$bytes = (string) file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		foreach ( self::png_chunks( $bytes ) as $chunk ) {
			if ( in_array( $chunk['type'], array( 'tEXt', 'iTXt', 'zTXt' ), true ) ) {
				$out['blocks'][] = 'text';
			} elseif ( 'eXIf' === $chunk['type'] ) {
				$out['blocks'][] = 'exif';
			}
		}
		$out['blocks'] = array_values( array_unique( $out['blocks'] ) );
		self::scan_xmp( $bytes, $out );
	}

	/**
	 * Read a WebP: RIFF chunks carry EXIF and XMP under their own names.
	 *
	 * @param string $path File.
	 * @param array  $out  Report, by reference.
	 */
	private static function read_webp( $path, &$out ) {
		$bytes = (string) file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		foreach ( self::riff_chunks( $bytes ) as $chunk ) {
			if ( 'EXIF' === $chunk['type'] ) {
				$out['blocks'][] = 'exif';
			}
		}
		$out['blocks'] = array_values( array_unique( $out['blocks'] ) );
		self::scan_xmp( $bytes, $out );
	}

	/**
	 * Note an XMP packet and lift the AI source type out of it, if present.
	 *
	 * @param string $bytes File contents.
	 * @param array  $out   Report, by reference.
	 */
	private static function scan_xmp( $bytes, &$out ) {
		if ( false === strpos( $bytes, '<x:xmpmeta' ) ) {
			return;
		}
		$out['blocks'][] = 'xmp';
		$out['blocks']   = array_values( array_unique( $out['blocks'] ) );

		if ( preg_match( '#<Iptc4xmpExt:DigitalSourceType>([^<]+)<#', $bytes, $m ) ) {
			$out['fields'][] = array(
				'group' => 'software',
				'key'   => 'DigitalSourceType',
				'label' => __( 'Digital source type', 'wunderpaint' ),
				'value' => self::source_type_label( trim( $m[1] ) ),
			);
		}
	}

	/**
	 * Human wording for an IPTC digital source type URI.
	 *
	 * @param string $uri Concept URI.
	 * @return string
	 */
	private static function source_type_label( $uri ) {
		$name = substr( strrchr( $uri, '/' ), 1 );
		$map  = array(
			'trainedAlgorithmicMedia'              => __( 'Fully AI-generated', 'wunderpaint' ),
			'compositeWithTrainedAlgorithmicMedia' => __( 'Partially AI-modified', 'wunderpaint' ),
			'digitalCapture'                       => __( 'Camera capture', 'wunderpaint' ),
		);
		return isset( $map[ $name ] ) ? $map[ $name ] : $uri;
	}

	/* ------------------------------ container ----------------------------- */

	/**
	 * Walk PNG chunks.
	 *
	 * @param string $bytes File.
	 * @return array<int,array{type:string,at:int,len:int}>
	 */
	private static function png_chunks( $bytes ) {
		$out = array();
		if ( "\x89PNG\r\n\x1a\n" !== substr( $bytes, 0, 8 ) ) {
			return $out;
		}
		$at  = 8;
		$max = strlen( $bytes );
		while ( $at + 12 <= $max ) {
			$len  = unpack( 'N', substr( $bytes, $at, 4 ) )[1];
			$type = substr( $bytes, $at + 4, 4 );
			if ( $len < 0 || $at + 12 + $len > $max ) {
				break;
			}
			$out[] = array(
				'type' => $type,
				'at'   => $at,
				'len'  => $len + 12,
			);
			if ( 'IEND' === $type ) {
				break;
			}
			$at += 12 + $len;
		}
		return $out;
	}

	/**
	 * Walk RIFF (WebP) chunks.
	 *
	 * @param string $bytes File.
	 * @return array<int,array{type:string,at:int,len:int}>
	 */
	private static function riff_chunks( $bytes ) {
		$out = array();
		if ( 'RIFF' !== substr( $bytes, 0, 4 ) || 'WEBP' !== substr( $bytes, 8, 4 ) ) {
			return $out;
		}
		$at  = 12;
		$max = strlen( $bytes );
		while ( $at + 8 <= $max ) {
			$type = substr( $bytes, $at, 4 );
			$len  = unpack( 'V', substr( $bytes, $at + 4, 4 ) )[1];
			// RIFF pads odd-sized chunk payloads to an even boundary.
			$full = 8 + $len + ( $len % 2 );
			if ( $len < 0 || $at + $full > $max ) {
				break;
			}
			$out[] = array(
				'type' => trim( $type ),
				'at'   => $at,
				'len'  => $full,
			);
			$at += $full;
		}
		return $out;
	}

	/**
	 * Walk JPEG segments.
	 *
	 * @param string $bytes File.
	 * @return array<int,array{marker:int,at:int,len:int,head:string}>
	 */
	private static function jpeg_segments( $bytes ) {
		$out = array();
		if ( "\xFF\xD8" !== substr( $bytes, 0, 2 ) ) {
			return $out;
		}
		$at  = 2;
		$max = strlen( $bytes );
		while ( $at + 4 <= $max ) {
			if ( "\xFF" !== $bytes[ $at ] ) {
				break;
			}
			$marker = ord( $bytes[ $at + 1 ] );
			// SOS starts the entropy-coded data; nothing beyond it is a segment.
			if ( 0xDA === $marker || 0xD9 === $marker ) {
				break;
			}
			$len = unpack( 'n', substr( $bytes, $at + 2, 2 ) )[1];
			if ( $len < 2 || $at + 2 + $len > $max ) {
				break;
			}
			$out[] = array(
				'marker' => $marker,
				'at'     => $at,
				'len'    => 2 + $len,
				'head'   => substr( $bytes, $at + 4, 32 ),
			);
			$at += 2 + $len;
		}
		return $out;
	}

	/* ------------------------------ stripping ----------------------------- */

	/**
	 * Remove metadata from an attachment's original AND every generated size.
	 *
	 * Thumbnails matter more than they look: the front end almost never serves
	 * the original, so cleaning only that would leave the very files visitors
	 * actually receive untouched.
	 *
	 * @param int    $id   Attachment id.
	 * @param string $what 'location' or 'all'.
	 * @return array|\WP_Error Result.
	 */
	public static function strip( $id, $what ) {
		$id   = (int) $id;
		$what = 'location' === $what ? 'location' : 'all';
		$path = get_attached_file( $id );
		if ( ! $path || ! file_exists( $path ) ) {
			return new \WP_Error(
				'wpie_no_file',
				__( 'The file for this image was not found.', 'wunderpaint' ),
				array( 'status' => 404 )
			);
		}
		if ( ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error(
				'wpie_denied',
				__( 'You cannot edit this image.', 'wunderpaint' ),
				array( 'status' => 403 )
			);
		}

		// Snapshot first: this rewrites files in place, and a mistake here is
		// otherwise unrecoverable.
		Versioning::snapshot(
			$id,
			'location' === $what
				? __( 'Before removing location data', 'wunderpaint' )
				: __( 'Before removing metadata', 'wunderpaint' )
		);

		$targets = array( $path );
		$meta    = wp_get_attachment_metadata( $id );
		$dir     = dirname( $path );
		if ( ! empty( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
			foreach ( $meta['sizes'] as $size ) {
				if ( empty( $size['file'] ) ) {
					continue;
				}
				$file = $dir . '/' . basename( (string) $size['file'] );
				if ( file_exists( $file ) ) {
					$targets[] = $file;
				}
			}
		}

		$changed = 0;
		$saved   = 0;
		foreach ( array_unique( $targets ) as $file ) {
			$before = (string) file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$after  = self::strip_bytes( $before, $file, $what );
			if ( $after === $before ) {
				continue;
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_put_contents_file_put_contents
			if ( false !== file_put_contents( $file, $after ) ) {
				++$changed;
				$saved += strlen( $before ) - strlen( $after );
			}
		}

		clearstatcache();
		return array(
			'files' => $changed,
			'bytes' => $saved,
			'read'  => self::read( $id ),
		);
	}

	/**
	 * Strip one file's bytes according to its container.
	 *
	 * @param string $bytes File contents.
	 * @param string $file  Path (for the extension).
	 * @param string $what  'location' or 'all'.
	 * @return string New bytes.
	 */
	public static function strip_bytes( $bytes, $file, $what ) {
		$ext = strtolower( (string) pathinfo( $file, PATHINFO_EXTENSION ) );
		if ( 'jpg' === $ext || 'jpeg' === $ext ) {
			return 'location' === $what
				? self::jpeg_without_gps( $bytes )
				: self::jpeg_without_meta( $bytes );
		}
		if ( 'png' === $ext ) {
			// PNG carries no GPS in practice; the location run is a no-op
			// rather than a surprise removal of everything else.
			return 'all' === $what ? self::png_without_meta( $bytes ) : $bytes;
		}
		if ( 'webp' === $ext ) {
			return 'all' === $what ? self::webp_without_meta( $bytes ) : $bytes;
		}
		return $bytes;
	}

	/**
	 * Drop every metadata segment from a JPEG, keeping the image data.
	 *
	 * @param string $bytes File.
	 * @return string
	 */
	public static function jpeg_without_meta( $bytes ) {
		$segments = self::jpeg_segments( $bytes );
		if ( ! $segments ) {
			return $bytes;
		}
		$out  = "\xFF\xD8";
		$last = 2;
		foreach ( $segments as $seg ) {
			// APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) and COM (comment).
			$drop = ( 0xE1 === $seg['marker'] || 0xED === $seg['marker'] || 0xFE === $seg['marker'] );
			if ( ! $drop ) {
				$out .= substr( $bytes, $seg['at'], $seg['len'] );
			}
			$last = $seg['at'] + $seg['len'];
		}
		return $out . substr( $bytes, $last );
	}

	/**
	 * Remove ONLY the GPS data from a JPEG's EXIF, leaving the rest intact.
	 *
	 * Deleting the pointer alone is not enough: the coordinates would still sit
	 * in the file for anyone with a hex editor, which is the opposite of the
	 * point. The values are therefore overwritten with zeroes first, and only
	 * then is the GPS entry taken out of IFD0.
	 *
	 * Nothing is moved or re-packed, so every other absolute TIFF offset stays
	 * valid.
	 *
	 * @param string $bytes File.
	 * @return string
	 */
	public static function jpeg_without_gps( $bytes ) {
		foreach ( self::jpeg_segments( $bytes ) as $seg ) {
			if ( 0xE1 !== $seg['marker'] || "Exif\0\0" !== substr( $seg['head'], 0, 6 ) ) {
				continue;
			}
			$tiff_at = $seg['at'] + 4 + 6;
			$tiff    = substr( $bytes, $tiff_at, $seg['len'] - 4 - 6 );
			$fixed   = self::tiff_without_gps( $tiff );
			if ( null === $fixed ) {
				return $bytes;
			}
			return substr( $bytes, 0, $tiff_at ) . $fixed . substr( $bytes, $tiff_at + strlen( $tiff ) );
		}
		return $bytes;
	}

	/**
	 * Blank the GPS IFD inside a TIFF block and unlink it from IFD0.
	 *
	 * @param string $tiff TIFF block (starts at the byte-order mark).
	 * @return string|null New block, or null when the structure is not
	 *                     understood (in which case nothing must be written).
	 */
	private static function tiff_without_gps( $tiff ) {
		if ( strlen( $tiff ) < 8 ) {
			return null;
		}
		$order = substr( $tiff, 0, 2 );
		if ( 'II' === $order ) {
			$short = 'v';
			$long  = 'V';
		} elseif ( 'MM' === $order ) {
			$short = 'n';
			$long  = 'N';
		} else {
			return null;
		}

		$ifd0 = unpack( $long, substr( $tiff, 4, 4 ) )[1];
		if ( $ifd0 + 2 > strlen( $tiff ) ) {
			return null;
		}
		$count = unpack( $short, substr( $tiff, $ifd0, 2 ) )[1];
		if ( $ifd0 + 2 + ( $count * 12 ) + 4 > strlen( $tiff ) ) {
			return null;
		}

		$gps_at  = -1;
		$gps_ifd = 0;
		for ( $i = 0; $i < $count; $i++ ) {
			$at  = $ifd0 + 2 + ( $i * 12 );
			$tag = unpack( $short, substr( $tiff, $at, 2 ) )[1];
			if ( 0x8825 === $tag ) {
				$gps_at  = $at;
				$gps_ifd = unpack( $long, substr( $tiff, $at + 8, 4 ) )[1];
				break;
			}
		}
		if ( $gps_at < 0 ) {
			return $tiff;
		}

		// 1. Overwrite the GPS values themselves.
		if ( $gps_ifd > 0 && $gps_ifd + 2 <= strlen( $tiff ) ) {
			$sizes  = array( 1 => 1, 2 => 1, 3 => 2, 4 => 4, 5 => 8, 7 => 1, 9 => 4, 10 => 8 );
			$gcount = unpack( $short, substr( $tiff, $gps_ifd, 2 ) )[1];
			if ( $gps_ifd + 2 + ( $gcount * 12 ) <= strlen( $tiff ) ) {
				for ( $i = 0; $i < $gcount; $i++ ) {
					$at    = $gps_ifd + 2 + ( $i * 12 );
					$type  = unpack( $short, substr( $tiff, $at + 2, 2 ) )[1];
					$n     = unpack( $long, substr( $tiff, $at + 4, 4 ) )[1];
					$width = isset( $sizes[ $type ] ) ? $sizes[ $type ] * $n : 0;
					if ( $width > 4 ) {
						$off = unpack( $long, substr( $tiff, $at + 8, 4 ) )[1];
						if ( $off > 0 && $off + $width <= strlen( $tiff ) ) {
							$tiff = substr_replace( $tiff, str_repeat( "\0", $width ), $off, $width );
						}
					}
				}
				// 2. Blank the GPS IFD table itself.
				$span = 2 + ( $gcount * 12 );
				$tiff = substr_replace( $tiff, str_repeat( "\0", $span ), $gps_ifd, $span );
			}
		}

		// 3. Take the pointer out of IFD0: pull the following entries forward,
		//    blank the freed slot and lower the entry count.
		$tail_at  = $gps_at + 12;
		$tail_len = ( $ifd0 + 2 + ( $count * 12 ) ) - $tail_at;
		if ( $tail_len > 0 ) {
			$tiff = substr_replace( $tiff, substr( $tiff, $tail_at, $tail_len ), $gps_at, $tail_len );
		}
		$tiff = substr_replace( $tiff, str_repeat( "\0", 12 ), $ifd0 + 2 + ( ( $count - 1 ) * 12 ), 12 );
		$tiff = substr_replace( $tiff, pack( $short, $count - 1 ), $ifd0, 2 );

		return $tiff;
	}

	/**
	 * Drop metadata chunks from a PNG.
	 *
	 * @param string $bytes File.
	 * @return string
	 */
	public static function png_without_meta( $bytes ) {
		$chunks = self::png_chunks( $bytes );
		if ( ! $chunks ) {
			return $bytes;
		}
		$drop = array( 'tEXt', 'iTXt', 'zTXt', 'eXIf' );
		$out  = substr( $bytes, 0, 8 );
		foreach ( $chunks as $chunk ) {
			if ( in_array( $chunk['type'], $drop, true ) ) {
				continue;
			}
			$out .= substr( $bytes, $chunk['at'], $chunk['len'] );
		}
		return $out;
	}

	/**
	 * Drop metadata chunks from a WebP, fixing the RIFF size field.
	 *
	 * @param string $bytes File.
	 * @return string
	 */
	public static function webp_without_meta( $bytes ) {
		$chunks = self::riff_chunks( $bytes );
		if ( ! $chunks ) {
			return $bytes;
		}
		$drop = array( 'EXIF', 'XMP' );
		$body = '';
		foreach ( $chunks as $chunk ) {
			if ( in_array( $chunk['type'], $drop, true ) ) {
				continue;
			}
			$body .= substr( $bytes, $chunk['at'], $chunk['len'] );
		}
		if ( '' === $body ) {
			return $bytes;
		}
		// The RIFF header counts everything after the size field itself.
		return 'RIFF' . pack( 'V', 4 + strlen( $body ) ) . 'WEBP' . $body;
	}

	/* -------------------------------- REST -------------------------------- */

	/**
	 * GET handler.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_get( $req ) {
		$out = self::read( (int) $req['id'] );
		return is_wp_error( $out ) ? $out : rest_ensure_response( $out );
	}

	/**
	 * POST handler.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_strip( $req ) {
		$out = self::strip( (int) $req['id'], (string) $req->get_param( 'what' ) );
		return is_wp_error( $out ) ? $out : rest_ensure_response( $out );
	}
}
