<?php
/**
 * WordPress' own AI client as a fallback provider.
 *
 * WordPress 7.0 ships an AI client (`wp_ai_client_prompt()`): the site owner
 * picks and configures a provider ONCE, at site level, and every plugin can
 * use it without asking for its own key. The wordpress.org review of
 * 8 August 2026 asked us to consider it, and the answer here is: yes, but as
 * a fallback, not as a replacement.
 *
 * WHEN THIS RUNS
 * Only when the plugin has no key of its own for the job at hand. A site
 * that entered an OpenAI, Gemini or Anthropic key keeps using it, because
 * that path carries things this one cannot: the model choice per tier, the
 * token accounting behind the monthly budget, web search, and the image
 * operations that need a mask (inpaint, outpaint, variations). A site that
 * entered nothing used to see "no provider configured"; it now gets whatever
 * the site owner set up in WordPress.
 *
 * WHAT IT CANNOT DO
 * The core client reports no token counts, so a request that runs through
 * here is billed by the site owner's own provider account and recorded with
 * zero usage in this plugin's cost log. That is honest rather than
 * convenient: inventing numbers would corrupt the budget the user set.
 *
 * The standalone Studio and the Pro plugin share this file's caller but not
 * its environment - outside WordPress there is no core client at all, which
 * is exactly why the direct providers stay.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Thin adapter over the core AI client.
 */
class AI_Core {

	/**
	 * Whether the core client exists and this request may use it.
	 *
	 * `wp_supports_ai()` is the site's own switch (the WP_AI_SUPPORT constant
	 * and the `wp_supports_ai` filter), so a site that turned AI off stays
	 * off. A site can also switch off just this fallback and keep core AI for
	 * other plugins, through the filter below.
	 *
	 * @return bool
	 */
	public static function available() {
		if ( ! function_exists( 'wp_ai_client_prompt' ) ) {
			return false;
		}
		// Written as a guarded block rather than an early return because that
		// is the shape Plugin Check recognises as a version guard: this
		// plugin supports WordPress 6.4, where neither function exists.
		$supported = false;
		if ( function_exists( 'wp_supports_ai' ) ) {
			$supported = wp_supports_ai();
		}
		if ( ! $supported ) {
			return false;
		}
		/**
		 * Filters whether this plugin may fall back to the WordPress AI client.
		 *
		 * @since 1.392.0
		 *
		 * @param bool $use Whether the fallback is allowed. Default true.
		 */
		return (bool) apply_filters( 'wpie_use_core_ai', true );
	}

	/**
	 * Flatten what the callers pass as a prompt into plain text.
	 *
	 * `$user` is either a string or this plugin's Anthropic-shaped content
	 * blocks. Image blocks are dropped rather than converted: the core client
	 * takes files, but an inline vision request that silently loses its image
	 * would produce a confident answer about nothing. Callers that need
	 * vision keep needing a key of their own, and say so.
	 *
	 * @param string|array $user Prompt or content blocks.
	 * @return array { text: string, had_image: bool }
	 */
	private static function flatten( $user ) {
		if ( is_string( $user ) ) {
			return array(
				'text'      => $user,
				'had_image' => false,
			);
		}
		$parts     = array();
		$had_image = false;
		foreach ( (array) $user as $block ) {
			if ( is_string( $block ) ) {
				$parts[] = $block;
				continue;
			}
			if ( ! is_array( $block ) ) {
				continue;
			}
			if ( isset( $block['type'] ) && 'text' === $block['type'] ) {
				$parts[] = (string) ( $block['text'] ?? '' );
			} elseif ( isset( $block['type'] ) && 'image' === $block['type'] ) {
				$had_image = true;
			}
		}
		return array(
			'text'      => trim( implode( "\n\n", array_filter( $parts, 'strlen' ) ) ),
			'had_image' => $had_image,
		);
	}

	/**
	 * Start a prompt on the core client.
	 *
	 * The single place this plugin names `wp_ai_client_prompt()`, inside the
	 * `function_exists()` block that keeps it safe on the WordPress 6.4 this
	 * plugin still supports. available() has said yes before any caller gets
	 * here; the guard is what makes the version difference explicit to a
	 * reader and to Plugin Check.
	 *
	 * @param string $text Initial prompt text.
	 * @return object|null Builder, or null when the client is absent.
	 */
	private static function prompt( $text ) {
		if ( function_exists( 'wp_ai_client_prompt' ) ) {
			return wp_ai_client_prompt( $text );
		}
		return null;
	}

	/**
	 * The error a caller gets when this path cannot serve the request.
	 *
	 * @param string $why Sentence explaining what is missing.
	 * @return \WP_Error
	 */
	private static function cannot( $why ) {
		return new \WP_Error( 'wpie_ai_core_unsupported', $why, array( 'status' => 400 ) );
	}

	/**
	 * Usage record for a call whose token counts nobody can see.
	 *
	 * @return array { in, out, model }
	 */
	private static function no_usage() {
		return array(
			'in'    => 0,
			'out'   => 0,
			// Shows up verbatim in the cost log, so it says what happened
			// instead of naming a model this plugin never chose.
			'model' => 'wordpress-ai-client',
		);
	}

	/**
	 * A structured (JSON schema) completion.
	 *
	 * @param string       $system System instruction.
	 * @param string|array $user   Prompt or content blocks.
	 * @param array        $schema JSON Schema for the answer.
	 * @param array        $opts   { max_tokens: int }.
	 * @return array|\WP_Error { data: array, usage: array }.
	 */
	public static function text_structured( $system, $user, $schema, $opts = array() ) {
		if ( ! self::available() ) {
			return self::cannot( __( 'No AI provider is configured.', 'wunderpaint' ) );
		}
		$flat = self::flatten( $user );
		if ( $flat['had_image'] ) {
			return self::cannot( __( 'This feature sends an image to the model. Add your own API key in the settings to use it.', 'wunderpaint' ) );
		}
		if ( '' === $flat['text'] ) {
			return self::cannot( __( 'Nothing to send.', 'wunderpaint' ) );
		}

		$builder = self::prompt( $flat['text'] );
		if ( ! $builder ) {
			return self::cannot( __( 'No AI provider is configured.', 'wunderpaint' ) );
		}
		if ( '' !== (string) $system ) {
			$builder = $builder->using_system_instruction( (string) $system );
		}
		if ( ! empty( $opts['max_tokens'] ) ) {
			$builder = $builder->using_max_tokens( (int) $opts['max_tokens'] );
		}
		$builder = $builder->as_json_response( is_array( $schema ) ? $schema : null );

		$text = $builder->generate_text();
		if ( is_wp_error( $text ) ) {
			return $text;
		}
		// The plugin's own providers run answers through JSON_Repair for
		// exactly this case, so the fallback gets the same second chance
		// rather than failing where the direct path would have recovered.
		$data = JSON_Repair::decode_with_repair( (string) $text );
		if ( ! is_array( $data ) ) {
			return new \WP_Error(
				'wpie_ai_shape',
				__( 'The model did not answer in the expected format.', 'wunderpaint' ),
				array( 'status' => 502 )
			);
		}
		return array(
			'data'  => $data,
			'usage' => self::no_usage(),
		);
	}

	/**
	 * A plain text/vision completion.
	 *
	 * @param string       $system     System instruction.
	 * @param string|array $content    Prompt or content blocks.
	 * @param int          $max_tokens Response budget.
	 * @return array|\WP_Error { text: string, usage: array }.
	 */
	public static function text_completion( $system, $content, $max_tokens = 0 ) {
		if ( ! self::available() ) {
			return self::cannot( __( 'No AI provider is configured.', 'wunderpaint' ) );
		}
		$flat = self::flatten( $content );
		if ( $flat['had_image'] ) {
			return self::cannot( __( 'This feature sends an image to the model. Add your own API key in the settings to use it.', 'wunderpaint' ) );
		}
		if ( '' === $flat['text'] ) {
			return self::cannot( __( 'Nothing to send.', 'wunderpaint' ) );
		}

		$builder = self::prompt( $flat['text'] );
		if ( ! $builder ) {
			return self::cannot( __( 'No AI provider is configured.', 'wunderpaint' ) );
		}
		if ( '' !== (string) $system ) {
			$builder = $builder->using_system_instruction( (string) $system );
		}
		if ( $max_tokens > 0 ) {
			$builder = $builder->using_max_tokens( (int) $max_tokens );
		}
		$text = $builder->generate_text();
		if ( is_wp_error( $text ) ) {
			return $text;
		}
		return array(
			'text'  => (string) $text,
			'usage' => self::no_usage(),
		);
	}

	/**
	 * Generate images from a prompt.
	 *
	 * Only plain generation. Editing, inpainting, outpainting and variations
	 * need a mask and an input image, which this path has no way to express,
	 * so those keep asking for a key of their own.
	 *
	 * @param string $prompt Prompt.
	 * @param int    $count  How many images.
	 * @return array|\WP_Error { images: string[] } as data URIs.
	 */
	public static function images( $prompt, $count = 1 ) {
		if ( ! self::available() ) {
			return self::cannot( __( 'No AI provider is configured.', 'wunderpaint' ) );
		}
		$prompt = trim( (string) $prompt );
		if ( '' === $prompt ) {
			return self::cannot( __( 'Nothing to send.', 'wunderpaint' ) );
		}
		$count   = max( 1, min( 4, (int) $count ) );
		$builder = self::prompt( $prompt );
		if ( ! $builder ) {
			return self::cannot( __( 'No AI provider is configured.', 'wunderpaint' ) );
		}

		$files = $count > 1 ? $builder->generate_images( $count ) : $builder->generate_image();
		if ( is_wp_error( $files ) ) {
			return $files;
		}
		$images = array();
		foreach ( is_array( $files ) ? $files : array( $files ) as $file ) {
			// The SDK hands back a File that is either inline bytes or a
			// remote URL. Both are usable by the editor: it loads a data URI
			// directly and fetches a URL through the existing image proxy.
			if ( is_object( $file ) && method_exists( $file, 'getDataUri' ) ) {
				$uri = $file->getDataUri();
				if ( $uri ) {
					$images[] = $uri;
					continue;
				}
			}
			if ( is_object( $file ) && method_exists( $file, 'getUrl' ) ) {
				$url = $file->getUrl();
				if ( $url ) {
					$images[] = esc_url_raw( (string) $url );
				}
			}
		}
		if ( ! $images ) {
			return new \WP_Error( 'wpie_ai_empty', __( 'The model returned no image.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array( 'images' => $images );
	}
}
