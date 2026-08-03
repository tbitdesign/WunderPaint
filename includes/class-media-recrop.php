<?php
/**
 * Smart Recrop (v1.375.0): WordPress crops its hard-crop sizes (thumbnail
 * and friends) dead center, which beheads portraits in every theme grid.
 * These routes let the editor set the crop window per image and per
 * registered size. Only the generated size files are ever rewritten - the
 * original upload is never touched, and file names stay stable so nothing
 * breaks in published content.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Per-size recrop REST routes.
 */
class Media_Recrop {

	const META_KEY = '_wpie_recrop';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * REST routes: GET /media/recrop-info, POST /media/recrop.
	 */
	public function register_routes() {
		$id_arg = array(
			'type'     => 'integer',
			'required' => true,
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media/recrop-info',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_info' ),
				'permission_callback' => array( $this, 'can_recrop' ),
				'args'                => array( 'id' => $id_arg ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media/recrop',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_recrop' ),
				'permission_callback' => array( $this, 'can_recrop' ),
				'args'                => array(
					'id'   => $id_arg,
					'size' => array(
						'type'     => 'string',
						'required' => true,
					),
					'rect' => array(
						'type'     => 'object',
						'required' => true,
					),
				),
			)
		);
	}

	/**
	 * Recropping is editing the attachment.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return bool
	 */
	public function can_recrop( $request ) {
		$id = (int) $request['id'];
		return $id > 0 && current_user_can( 'edit_post', $id ) && wp_attachment_is_image( $id );
	}

	/**
	 * Snap a crop box to the target ratio: keep its center, cover as much
	 * as possible, and stay inside the image.
	 *
	 * @param array $rect  { x, y, w, h } in full-image pixels.
	 * @param float $ratio Target width / height.
	 * @param int   $img_w Image width.
	 * @param int   $img_h Image height.
	 * @return array { x, y, w, h } integers, ratio-true, in bounds.
	 */
	public static function fit_rect( $rect, $ratio, $img_w, $img_h ) {
		$ratio = $ratio > 0 ? (float) $ratio : 1.0;
		$w     = max( 1.0, (float) ( $rect['w'] ?? 0 ) );
		$h     = max( 1.0, (float) ( $rect['h'] ?? 0 ) );
		$cx    = (float) ( $rect['x'] ?? 0 ) + $w / 2;
		$cy    = (float) ( $rect['y'] ?? 0 ) + $h / 2;
		// Grow the smaller dimension onto the ratio (cover, never trim).
		if ( $w / $h > $ratio ) {
			$h = $w / $ratio;
		} else {
			$w = $h * $ratio;
		}
		// Shrink to fit the image, keeping the ratio.
		$scale = min( 1.0, $img_w / $w, $img_h / $h );
		$w    *= $scale;
		$h    *= $scale;
		$x     = max( 0.0, min( $cx - $w / 2, $img_w - $w ) );
		$y     = max( 0.0, min( $cy - $h / 2, $img_h - $h ) );
		$w     = (int) round( $w );
		$h     = (int) round( $h );
		$x     = (int) min( round( $x ), $img_w - $w );
		$y     = (int) min( round( $y ), $img_h - $h );
		return array(
			'x' => max( 0, $x ),
			'y' => max( 0, $y ),
			'w' => $w,
			'h' => $h,
		);
	}

	/**
	 * GET /media/recrop-info: the full-size reference plus every hard-crop
	 * size this attachment actually has, with the remembered crop rects.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_info( $request ) {
		$id   = (int) $request['id'];
		$file = get_attached_file( $id );
		$meta = wp_get_attachment_metadata( $id );
		$src  = wp_get_attachment_image_src( $id, 'full' );
		if ( ! $file || ! file_exists( $file ) || ! $src || empty( $meta['sizes'] ) ) {
			return new \WP_Error(
				'wpie_recrop_no_file',
				__( 'The image file could not be found.', 'wunderpaint' ),
				array( 'status' => 404 )
			);
		}
		$registered = wp_get_registered_image_subsizes();
		$saved      = get_post_meta( $id, self::META_KEY, true );
		$saved      = is_array( $saved ) ? $saved : array();
		$dir        = dirname( $file );
		$sizes      = array();
		foreach ( $meta['sizes'] as $name => $info ) {
			if ( empty( $registered[ $name ]['crop'] ) ) {
				continue; // Soft-crop sizes only scale, nothing to place.
			}
			$size_src = wp_get_attachment_image_src( $id, $name );
			if ( ! $size_src ) {
				continue;
			}
			$path    = $dir . '/' . $info['file'];
			$bust    = file_exists( $path ) ? '?v=' . filemtime( $path ) : '';
			$sizes[] = array(
				'name'   => $name,
				'width'  => (int) $info['width'],
				'height' => (int) $info['height'],
				'url'    => $size_src[0] . $bust,
				'rect'   => isset( $saved[ $name ] ) ? $saved[ $name ] : null,
			);
		}
		return rest_ensure_response(
			array(
				'original' => array(
					'url'    => $src[0],
					'width'  => (int) $src[1],
					'height' => (int) $src[2],
				),
				'sizes'    => array_values( $sizes ),
			)
		);
	}

	/**
	 * POST /media/recrop.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_recrop( $request ) {
		$rect = $request->get_param( 'rect' );
		if ( ! is_array( $rect ) ) {
			return new \WP_Error(
				'wpie_recrop_bad_rect',
				__( 'Invalid crop rectangle.', 'wunderpaint' ),
				array( 'status' => 400 )
			);
		}
		$result = $this->recrop(
			(int) $request['id'],
			sanitize_key( $request['size'] ),
			$rect
		);
		return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
	}

	/**
	 * Recrop one generated size from the full-size file.
	 *
	 * @param int    $id   Attachment id.
	 * @param string $size Registered size name.
	 * @param array  $rect { x, y, w, h } in full-image pixels.
	 * @return array|\WP_Error { ok, size, url, rect }.
	 */
	public function recrop( $id, $size, $rect ) {
		$file = get_attached_file( $id );
		$meta = wp_get_attachment_metadata( $id );
		$src  = wp_get_attachment_image_src( $id, 'full' );
		if ( ! $file || ! file_exists( $file ) || ! $src || empty( $meta['sizes'][ $size ] ) ) {
			return new \WP_Error(
				'wpie_recrop_no_size',
				__( 'This size does not exist for the image.', 'wunderpaint' ),
				array( 'status' => 404 )
			);
		}
		$registered = wp_get_registered_image_subsizes();
		if ( empty( $registered[ $size ]['crop'] ) ) {
			return new \WP_Error(
				'wpie_recrop_soft_size',
				__( 'This size is scaled, not cropped - there is nothing to place.', 'wunderpaint' ),
				array( 'status' => 400 )
			);
		}
		$info = $meta['sizes'][ $size ];
		$tw   = (int) $info['width'];
		$th   = (int) $info['height'];
		if ( $tw < 1 || $th < 1 ) {
			return new \WP_Error(
				'wpie_recrop_bad_size',
				__( 'This size has no usable dimensions.', 'wunderpaint' ),
				array( 'status' => 400 )
			);
		}
		$fit = self::fit_rect( $rect, $tw / $th, (int) $src[1], (int) $src[2] );
		if ( $fit['w'] < 8 || $fit['h'] < 8 ) {
			return new \WP_Error(
				'wpie_recrop_tiny',
				__( 'The crop window is too small.', 'wunderpaint' ),
				array( 'status' => 400 )
			);
		}
		$editor = wp_get_image_editor( $file );
		if ( is_wp_error( $editor ) ) {
			return $editor;
		}
		$step = $editor->crop( $fit['x'], $fit['y'], $fit['w'], $fit['h'] );
		if ( is_wp_error( $step ) ) {
			return $step;
		}
		// The window already has the target ratio; crop-resize guarantees
		// the exact pixel size against rounding.
		$step = $editor->resize( $tw, $th, true );
		if ( is_wp_error( $step ) ) {
			return $step;
		}
		$target = dirname( $file ) . '/' . $info['file'];
		$saved  = $editor->save( $target, get_post_mime_type( $id ) );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		if ( ! empty( $saved['filesize'] ) ) {
			$meta['sizes'][ $size ]['filesize'] = (int) $saved['filesize'];
		}
		wp_update_attachment_metadata( $id, $meta );
		$rects          = get_post_meta( $id, self::META_KEY, true );
		$rects          = is_array( $rects ) ? $rects : array();
		$rects[ $size ] = $fit;
		update_post_meta( $id, self::META_KEY, $rects );
		$size_src = wp_get_attachment_image_src( $id, $size );
		return array(
			'ok'   => true,
			'size' => $size,
			'url'  => ( $size_src ? $size_src[0] : '' ) . '?v=' . (string) filemtime( $target ),
			'rect' => $fit,
		);
	}
}
