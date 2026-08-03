<?php
/**
 * Best-effort JSON repair for AI-generated payloads (v1.81).
 *
 * Real-world quirks handled:
 *   1. Raw control characters (newlines, tabs) inside string values that
 *      should have been escaped — re-escaped as \n / \t / \uXXXX.
 *   2. Unescaped ASCII " inside string values (e.g. „Wenn jemand „KI" hört").
 *      A " only closes a string when followed (after whitespace) by one of
 *      `,`, `}`, `]`, `:` or end-of-input.
 *   3. Double-encoded JSON (a string whose value is itself JSON text) —
 *      decoded recursively with repair at each layer.
 *   4. Code fences / prose around the JSON — the outermost {...} or [...]
 *      is extracted first.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Static JSON repair helpers.
 */
class Json_Repair {

	const MAX_DECODE_DEPTH = 5;

	/**
	 * Robustly coerce any value into an array. Arrays pass through;
	 * strings decode recursively with repair; everything else fails.
	 *
	 * @param mixed $value Raw model output.
	 * @return array|null Array representation, or null when unrecoverable.
	 */
	public static function to_array( $value ) {
		if ( is_array( $value ) ) {
			return $value;
		}
		if ( ! is_string( $value ) || '' === $value ) {
			return null;
		}
		$current = $value;
		for ( $i = 0; $i < self::MAX_DECODE_DEPTH; $i++ ) {
			$decoded = self::decode_with_repair( $current );
			if ( null === $decoded ) {
				break;
			}
			if ( is_array( $decoded ) ) {
				return $decoded;
			}
			if ( ! is_string( $decoded ) ) {
				break;
			}
			$current = $decoded;
		}
		return null;
	}

	/**
	 * Try plain json_decode first; on failure extract the outermost JSON
	 * chunk, repair and retry.
	 *
	 * @param string $input Raw string.
	 * @return mixed Decoded value, or null on irrecoverable failure.
	 */
	public static function decode_with_repair( $input ) {
		$decoded = json_decode( $input, true );
		if ( JSON_ERROR_NONE === json_last_error() ) {
			return $decoded;
		}
		$stripped = self::extract_json( $input );
		$decoded  = json_decode( self::repair( $stripped ), true );
		if ( JSON_ERROR_NONE === json_last_error() ) {
			return $decoded;
		}
		return null;
	}

	/**
	 * Cut prose / markdown fences around the outermost {...} or [...].
	 *
	 * @param string $input Raw string.
	 * @return string The JSON-looking core (input when none found).
	 */
	private static function extract_json( $input ) {
		$first_obj = strpos( $input, '{' );
		$first_arr = strpos( $input, '[' );
		$start     = false === $first_obj ? $first_arr : ( false === $first_arr ? $first_obj : min( $first_obj, $first_arr ) );
		if ( false === $start ) {
			return $input;
		}
		$open  = $input[ $start ];
		$close = '{' === $open ? '}' : ']';
		$end   = strrpos( $input, $close );
		if ( false === $end || $end <= $start ) {
			return $input;
		}
		return substr( $input, $start, $end - $start + 1 );
	}

	/**
	 * Single-pass repair with an in-string state machine: escapes inner
	 * quotes and raw control characters, passes everything else through.
	 *
	 * @param string $broken Possibly broken JSON text.
	 * @return string Repaired text.
	 */
	public static function repair( $broken ) {
		$out       = '';
		$len       = strlen( $broken );
		$in_string = false;
		$i         = 0;
		while ( $i < $len ) {
			$c = $broken[ $i ];

			// Escape sequences pass through verbatim.
			if ( '\\' === $c && $i + 1 < $len ) {
				$out .= $c . $broken[ $i + 1 ];
				$i   += 2;
				continue;
			}

			if ( '"' === $c ) {
				if ( ! $in_string ) {
					$out      .= $c;
					$in_string = true;
					$i++;
					continue;
				}
				if ( self::looks_like_string_close( $broken, $i, $len ) ) {
					$out      .= $c;
					$in_string = false;
				} else {
					$out .= '\\"'; // Inner quote: escape it.
				}
				$i++;
				continue;
			}

			if ( $in_string && ord( $c ) < 0x20 ) {
				switch ( ord( $c ) ) {
					case 0x09:
						$out .= '\\t';
						break;
					case 0x0a:
						$out .= '\\n';
						break;
					case 0x0d:
						$out .= '\\r';
						break;
					default:
						$out .= sprintf( '\\u%04x', ord( $c ) );
				}
				$i++;
				continue;
			}

			$out .= $c;
			$i++;
		}
		return $out;
	}

	/**
	 * Whether the quote at $quote_pos plausibly ends a string value.
	 *
	 * @param string $input     Full text.
	 * @param int    $quote_pos Position of the quote.
	 * @param int    $len       Text length.
	 * @return bool
	 */
	private static function looks_like_string_close( $input, $quote_pos, $len ) {
		for ( $j = $quote_pos + 1; $j < $len; $j++ ) {
			$c = $input[ $j ];
			if ( ' ' === $c || "\t" === $c || "\r" === $c || "\n" === $c ) {
				continue;
			}
			return in_array( $c, array( ',', '}', ']', ':' ), true );
		}
		return true; // End of input.
	}
}
