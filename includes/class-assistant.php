<?php
/**
 * Help Assistant (v1.253): an in-editor chatbot grounded in the bundled
 * knowledge base (includes/data/help-kb.json, generated from the docs
 * glossary by tools/build-help-kb.js - one section per
 * feature, panel and slider).
 *
 * Two-stage flow, no vector store needed and language-agnostic:
 *   1. A small, fast text model picks the relevant sections from a
 *      compact title index (works for German questions over the English
 *      corpus, which plain keyword search would miss).
 *   2. The answer call gets those sections' full text plus the catalog
 *      of interactive tours and returns { answer, tour } as validated
 *      JSON; the client offers "Show me" when a tour id comes back.
 *
 * Both calls run through AI_Provider::text_structured, so every
 * configured provider (Anthropic, OpenAI, Gemini) works and the cost
 * tracking / monthly budget apply automatically.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * REST surface for the in-editor Help Assistant.
 */
class Assistant {

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/assistant/chat',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_chat' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * What a section costs, in one short suffix.
	 *
	 * The knowledge base covers the whole product, Pro and every extension
	 * included, and until v1.355.0 it carried no tier at all. The assistant
	 * therefore walked users through dialogs their installation does not
	 * have, without a word about a licence or an add-on. It cannot filter by
	 * what is installed, so the honest fix is to hand the model the tier and
	 * let it say so (audit 2026-07-28).
	 *
	 * @since 1.355.0
	 *
	 * @param array $sec Knowledge base section.
	 * @return string ' [Pro]' or '' - empty means the free plugin covers it.
	 */
	private static function tier_note( $sec ) {
		$badges = isset( $sec['badges'] ) && is_array( $sec['badges'] ) ? $sec['badges'] : array();
		$tiers  = array();
		foreach ( $badges as $b ) {
			$b = trim( (string) $b );
			if ( '' !== $b && ! in_array( $b, $tiers, true ) ) {
				$tiers[] = $b;
			}
		}
		return $tiers ? ' [' . implode( ', ', $tiers ) . ']' : '';
	}

	/**
	 * Knowledge base sections (cached per request).
	 *
	 * @return array [{id, page, group, title, badges, keywords, text}]
	 */
	private static function kb() {
		static $kb = null;
		if ( null !== $kb ) {
			return $kb;
		}
		$file = WPIE_DIR . 'includes/data/help-kb.json';
		$raw  = is_readable( $file ) ? file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$data = json_decode( (string) $raw, true );
		$kb   = is_array( $data ) && ! empty( $data['sections'] ) ? $data['sections'] : array();
		return $kb;
	}

	/**
	 * Interactive tours the client can start; ids mirror HELP_GUIDES in
	 * src/help/guides.js plus the 'welcome' onboarding tour. Keep both
	 * lists in sync when adding a guide.
	 *
	 * @return array id => description for the prompt.
	 */
	private static function tours() {
		return array(
			'welcome'          => 'A general tour of the editor: tool rail, canvas, panels, menus, asset library, automation and saving.',
			'add-text'         => 'Add a text layer and style it: text tool, typing on the canvas, character settings, styles and effects.',
			'crop'             => 'Crop an image with ratios and social-media safe zones.',
			'remove-bg'        => 'Remove an image background locally via the AI Studio panel.',
			'auto-fix'         => 'Auto-fix a photo with one-click corrections in the Adjust panel.',
			'dynamic-template' => 'Turn a design into a dynamic template: bind text and images to post fields and preview with a real post.',
		);
	}

	/**
	 * Lexical fallback retrieval when the section-picking call fails:
	 * scores title/keyword/text hits of the question's words.
	 *
	 * @param string $question User question.
	 * @param int    $limit    Max sections.
	 * @return array Section ids.
	 */
	private static function lexical_sections( $question, $limit = 6 ) {
		$words = preg_split( '/[^\p{L}\p{N}]+/u', mb_strtolower( $question ) );
		$words = array_filter(
			(array) $words,
			static function ( $w ) {
				return mb_strlen( $w ) > 2;
			}
		);
		$scored = array();
		foreach ( self::kb() as $sec ) {
			$title = mb_strtolower( $sec['title'] . ' ' . implode( ' ', (array) ( $sec['keywords'] ?? array() ) ) );
			$text  = mb_strtolower( (string) $sec['text'] );
			$score = 0;
			foreach ( $words as $w ) {
				if ( false !== mb_strpos( $title, $w ) ) {
					$score += 4;
				}
				if ( false !== mb_strpos( $text, $w ) ) {
					$score += 1;
				}
			}
			if ( $score > 0 ) {
				$scored[ $sec['id'] ] = $score;
			}
		}
		arsort( $scored );
		return array_slice( array_keys( $scored ), 0, $limit );
	}

	/**
	 * POST /assistant/chat { messages: [{role: user|assistant, content}] }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_chat( \WP_REST_Request $request ) {
		$messages = $request->get_param( 'messages' );
		if ( ! is_array( $messages ) || empty( $messages ) ) {
			return new \WP_Error( 'wpie_bad_chat', __( 'Empty question.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		// Sanitize + cap the transcript: the last 8 turns are plenty.
		$clean = array();
		foreach ( array_slice( array_values( $messages ), -8 ) as $m ) {
			$role    = ( isset( $m['role'] ) && 'assistant' === $m['role'] ) ? 'assistant' : 'user';
			$content = trim( wp_strip_all_tags( (string) ( $m['content'] ?? '' ) ) );
			if ( '' !== $content ) {
				$clean[] = array(
					'role'    => $role,
					'content' => mb_substr( $content, 0, 2000 ),
				);
			}
		}
		$last = end( $clean );
		if ( ! $clean || 'user' !== $last['role'] ) {
			return new \WP_Error( 'wpie_bad_chat', __( 'Empty question.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$question = $last['content'];

		$ai = Plugin::instance()->module( 'ai' );
		if ( ! $ai instanceof AI_Provider ) {
			return new \WP_Error( 'wpie_no_ai', __( 'AI is not available.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		// Each chat spends two paid model calls, so hold it to the same
		// per-user rate limit as /ai/* instead of leaving it uncapped. (WPIE-016)
		$limited = AI_Provider::rate_limit();
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}

		// ------------------------- stage 1: pick sections ------------------
		$index = '';
		foreach ( self::kb() as $sec ) {
			$index .= $sec['id'] . ' | ' . $sec['group'] . ' > ' . $sec['title'] . self::tier_note( $sec ) . "\n";
		}
		$pick_schema = array(
			'type'       => 'object',
			'required'   => array( 'sections' ),
			'properties' => array(
				'sections' => array(
					'type'     => 'array',
					'maxItems' => 6,
					'items'    => array( 'type' => 'string' ),
				),
			),
		);
		$picked      = array();
		$pick        = $ai->text_structured(
			'',
			'',
			'You select documentation sections for a help assistant of the WordPress plugin "WunderPaint" (a layer-based image and design editor). ' .
			'Given the user question (any language) and the section index, return the ids of up to 6 sections most likely to contain the answer. Prefer specific sections over general ones. Return ONLY ids from the index.',
			"QUESTION:\n" . $question . "\n\nSECTION INDEX (id | group > title):\n" . $index,
			$pick_schema,
			array(
				'action'     => 'help',
				'tier'       => 'caption',
				'thinking'   => 'none',
				'max_tokens' => 1200,
				'strict'     => false,
			)
		);
		if ( ! is_wp_error( $pick ) && ! empty( $pick['data']['sections'] ) ) {
			$valid = wp_list_pluck( self::kb(), 'id' );
			foreach ( (array) $pick['data']['sections'] as $id ) {
				if ( in_array( $id, $valid, true ) ) {
					$picked[] = (string) $id;
				}
			}
		}
		if ( ! $picked ) {
			$picked = self::lexical_sections( $question );
		}

		// ------------------------- stage 2: answer -------------------------
		$context = '';
		foreach ( self::kb() as $sec ) {
			if ( in_array( $sec['id'], $picked, true ) ) {
				$context .= '## ' . $sec['group'] . ' > ' . $sec['title'] . self::tier_note( $sec ) . "\n" . $sec['text'] . "\n\n";
			}
		}
		$tour_lines = '';
		foreach ( self::tours() as $id => $desc ) {
			$tour_lines .= $id . ': ' . $desc . "\n";
		}
		$system = 'You are the built-in Help Assistant of "WunderPaint", a layer-based image and design editor inside WordPress. '
			. 'Answer the user\'s question about using the editor. Rules: '
			. 'Answer in the language of the question. Be concise and concrete: name the exact menus, panels, tabs and buttons (the CONTEXT uses their English UI names; keep those names as-is even when answering in another language). '
			. 'Base your answer ONLY on the CONTEXT. If the context does not cover the question, say so briefly and point to Help > Handbook - never invent features, buttons or settings. '
			. 'A heading or a term may carry a tier in square brackets, e.g. [Pro] or [Extension]. When your answer relies on such an item, say in one short clause that it needs Pro or that extension, so nobody goes looking for a menu entry their installation does not have. Items without a bracket are part of the free plugin. Never print the brackets themselves. '
			. 'Plain text only (no markdown headings or links); short paragraphs or simple "-" lists. '
			. 'Set "tour" to a tour id ONLY when that tour covers exactly the workflow the user asked about (e.g. the crop tour for a cropping question). General questions, definition questions and anything without a precisely matching tour get an empty string - never suggest "welcome" unless the user asks for an overview or where to find things in general. '
			. 'Never mention tour ids or the word "tour id" in the answer text itself - when you set one, the UI shows a "Show me" button by itself; the answer should simply explain the steps.';
		$transcript = '';
		foreach ( $clean as $m ) {
			$transcript .= strtoupper( $m['role'] ) . ': ' . $m['content'] . "\n";
		}
		$answer_schema = array(
			'type'       => 'object',
			'required'   => array( 'answer' ),
			'properties' => array(
				'answer' => array( 'type' => 'string' ),
				'tour'   => array( 'type' => 'string' ),
			),
		);
		$res           = $ai->text_structured(
			'',
			'',
			$system,
			"CONVERSATION:\n" . $transcript . "\nINTERACTIVE TOURS (id: description):\n" . $tour_lines . "\nCONTEXT:\n" . $context,
			$answer_schema,
			array(
				'action'     => 'help',
				'tier'       => 'caption',
				'thinking'   => 'none',
				'max_tokens' => 2000,
				'strict'     => false,
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$answer = trim( (string) ( $res['data']['answer'] ?? '' ) );
		if ( '' === $answer ) {
			return new \WP_Error( 'wpie_no_answer', __( 'The assistant returned no answer, please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		$tour = (string) ( $res['data']['tour'] ?? '' );
		if ( ! array_key_exists( $tour, self::tours() ) ) {
			$tour = '';
		}
		return rest_ensure_response(
			array(
				'answer' => $answer,
				'tour'   => $tour,
			)
		);
	}
}
