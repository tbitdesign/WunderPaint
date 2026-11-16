<?php
/**
 * AI Studio Buttons (spec 2026-09-16): the site option behind the AI Studio
 * panel - own buttons, hidden ids, order - and its REST routes.
 *
 * Admins write, every editor user reads. Nothing here runs an AI call; the
 * runner is src/lib/ai-buttons.js, and the built-in button ids live in the
 * same file's table. This class does not know them: unknown ids in `hidden`
 * or `order` are dropped by the client on read, own buttons are recognised
 * by their `btn_` prefix, so an own button can never wear a built-in id.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AI_Buttons {

	const OPTION     = 'wpie_ai_buttons';
	const MAX_CUSTOM = 100;
	const MAX_TITLE  = 60;
	const MAX_DESC   = 200;
	const MAX_PROMPT = 2000;

	const INPUTS = array( 'layer', 'document', 'text', 'none' );

	/** Which results an input can have; the spec's combination table. */
	const OUTPUTS_FOR = array(
		'layer'    => array( 'replace', 'newLayer' ),
		'document' => array( 'newLayer' ),
		'text'     => array( 'replaceText', 'alternatives' ),
		'none'     => array( 'newLayer' ),
	);

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * May the current user write the button set? Admins only, by design:
	 * no per-group release, no personal buttons (Thomas, 16.09.2026).
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * The empty config.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'custom' => array(),
			'hidden' => array(),
			'order'  => array(
				'local' => array(),
				'cloud' => array(),
			),
		);
	}

	/**
	 * The stored config, re-validated on the way out so a hand-edited or
	 * half-migrated option can never reach the editor in a shape the panel
	 * does not expect.
	 *
	 * @return array
	 */
	public static function read() {
		$raw = get_option( self::OPTION, array() );
		// LENIENT on the way out, and that is not a detail: read() runs on
		// every editor boot, and a strict refusal here returns the empty
		// defaults - one deleted reference image would make every preset
		// vanish from the panel, for everyone (found 16.09.2026).
		$clean = self::sanitize( is_array( $raw ) ? $raw : array(), false );
		return is_wp_error( $clean ) ? self::defaults() : $clean;
	}

	/**
	 * Client shape: the config plus the resolved image URLs per own button
	 * (large for the runner, thumbnail for the dialog). The attachment id
	 * stays the stored truth.
	 *
	 * @return array
	 */
	public static function client_data() {
		$data = self::read();
		foreach ( $data['custom'] as &$button ) {
			$id                     = (int) $button['refImageId'];
			$button['refImageUrl']  = $id ? (string) wp_get_attachment_image_url( $id, 'large' ) : '';
			$button['refThumbUrl']  = $id ? (string) wp_get_attachment_image_url( $id, 'thumbnail' ) : '';
		}
		unset( $button );
		return $data;
	}

	/**
	 * Validate a config. Pure: no option is read or written. The first
	 * problem refuses the whole set (status 400) instead of silently
	 * dropping the record - a button that vanishes on save with a success
	 * message is worse than a save that says no.
	 *
	 * @param mixed $raw    Untrusted config.
	 * @param bool  $strict Check the reference images against the Media
	 *                      Library. True on the way in (a save), false on
	 *                      the way out (see read()).
	 * @return array|\WP_Error Clean config, or the refusal.
	 */
	public static function sanitize( $raw, $strict = true ) {
		$raw    = is_array( $raw ) ? $raw : array();
		$out    = self::defaults();
		$seen   = array();
		$custom = isset( $raw['custom'] ) && is_array( $raw['custom'] ) ? array_values( $raw['custom'] ) : array();

		if ( count( $custom ) > self::MAX_CUSTOM ) {
			return self::refuse(
				sprintf(
					/* translators: %d: maximum number of own AI presets. */
					__( 'This site holds at most %d own AI presets.', 'wunderpaint' ),
					self::MAX_CUSTOM
				)
			);
		}

		foreach ( $custom as $button ) {
			$button = is_array( $button ) ? $button : array();
			$id     = isset( $button['id'] ) ? (string) $button['id'] : '';
			if ( ! preg_match( '/^btn_[a-z0-9]{4,24}$/', $id ) || isset( $seen[ $id ] ) ) {
				return self::refuse( __( 'An AI preset has an invalid id.', 'wunderpaint' ) );
			}
			$seen[ $id ] = true;

			$input  = isset( $button['input'] ) ? (string) $button['input'] : '';
			$output = isset( $button['output'] ) ? (string) $button['output'] : '';
			if ( ! in_array( $input, self::INPUTS, true ) || ! in_array( $output, self::OUTPUTS_FOR[ $input ], true ) ) {
				return self::refuse( __( 'An AI preset combines an input and a result that do not fit.', 'wunderpaint' ) );
			}

			$title  = mb_substr( sanitize_text_field( (string) ( $button['title'] ?? '' ) ), 0, self::MAX_TITLE );
			$prompt = mb_substr( sanitize_textarea_field( (string) ( $button['prompt'] ?? '' ) ), 0, self::MAX_PROMPT );
			if ( '' === trim( $title ) || '' === trim( $prompt ) ) {
				return self::refuse( __( 'An AI preset needs a title and a prompt.', 'wunderpaint' ) );
			}

			// A text button sends no image, so it keeps no reference either.
			$ref = 'text' === $input ? 0 : absint( $button['refImageId'] ?? 0 );
			if ( $ref && $strict ) {
				if ( ! get_post( $ref ) ) {
					// Deleted from the Media Library. The dialog already
					// shows such a preset as missing its reference; clearing
					// the dead id keeps saving unblocked instead of refusing
					// the whole set over a picture nobody can bring back.
					$ref = 0;
				} elseif ( ! wp_attachment_is_image( $ref ) ) {
					return self::refuse( __( 'The reference image of an AI preset is not an image in the Media Library.', 'wunderpaint' ) );
				}
			}

			$out['custom'][] = array(
				'id'          => $id,
				'title'       => $title,
				'description' => mb_substr( sanitize_text_field( (string) ( $button['description'] ?? '' ) ), 0, self::MAX_DESC ),
				'input'       => $input,
				'prompt'      => $prompt,
				'refImageId'  => $ref,
				'output'      => $output,
				'source'      => sanitize_key( (string) ( $button['source'] ?? '' ) ),
			);
		}

		$out['hidden']         = self::id_list( $raw['hidden'] ?? array() );
		$out['order']['local'] = self::id_list( $raw['order']['local'] ?? array() );
		$out['order']['cloud'] = self::id_list( $raw['order']['cloud'] ?? array() );
		return $out;
	}

	/**
	 * A list of ids as the client spells them. Built-in ids are camelCase
	 * (`enhanceDesign`), so this keeps case where sanitize_key() would not.
	 *
	 * @param mixed $list Anything.
	 * @return string[] Unique, non-empty ids.
	 */
	private static function id_list( $list ) {
		$list = is_array( $list ) ? $list : array();
		$out  = array();
		foreach ( $list as $key ) {
			$key = preg_replace( '/[^A-Za-z0-9_]/', '', (string) $key );
			if ( '' !== $key ) {
				$out[] = $key;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * A refusal the REST layer hands back as 400.
	 *
	 * @param string $message Translated reason.
	 * @return \WP_Error
	 */
	private static function refuse( $message ) {
		return new \WP_Error( 'wpie_ai_buttons_invalid', $message, array( 'status' => 400 ) );
	}

	/**
	 * REST: GET reads for every editor user, POST replaces the whole set for
	 * admins (the dialog edits locally and saves once, like Brand Kits).
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/ai-buttons',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_save' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
			)
		);
	}

	/**
	 * GET /ai-buttons.
	 *
	 * @return \WP_REST_Response
	 */
	public function rest_get() {
		return rest_ensure_response( self::client_data() );
	}

	/**
	 * POST /ai-buttons { config }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_save( \WP_REST_Request $request ) {
		$clean = self::sanitize( $request->get_param( 'config' ) );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		update_option( self::OPTION, $clean, false );
		return rest_ensure_response( self::client_data() );
	}
}
