<?php
/**
 * Server-side OpenStreetMap proxy for map extensions (Extension API 2.4).
 *
 * Two capability-gated REST routes: place search (Nominatim) and map
 * vector data (Overpass). Everything is fetched server-to-server with an
 * identifying User-Agent and cached in transients, so the browser never
 * talks to OSM directly and repeated edits of the same area cost nothing.
 * Overpass responses are compacted here (classified kinds + flat, rounded
 * coordinate arrays) to keep the payload small.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Geo proxy routes.
 */
class Geo {

	const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

	/**
	 * Public Overpass instances, tried in order: the main instance
	 * rate-limits per IP, the mirror catches the 429/504 moments.
	 *
	 * @var string[]
	 */
	const OVERPASS = array(
		'https://overpass-api.de/api/interpreter',
		'https://overpass.kumi.systems/api/interpreter',
		'https://overpass.private.coffee/api/interpreter',
		'https://overpass.osm.jp/api/interpreter',
	);

	const SEARCH_TTL = 7 * DAY_IN_SECONDS;
	const MAP_TTL    = 3 * DAY_IN_SECONDS;

	/**
	 * Max bbox span (degrees) per detail level - protects the public
	 * Overpass instances and the PHP JSON decoder.
	 *
	 * @var array
	 */
	const SPAN_CAPS = array(
		1 => 4.0,
		2 => 0.55,
		3 => 0.06,
	);

	/** Max bbox span when building footprints are requested. */
	const BUILDINGS_CAP = 0.05;

	/** Compact-element cap per response (slice + truncated flag beyond). */
	const MAX_ELEMENTS = 40000;

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
			'/geo/search',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'search' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				'args'                => array(
					'q' => array(
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/geo/map',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'map_data' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * Identifying User-Agent (required by the OSM usage policies).
	 *
	 * @return string
	 */
	private static function user_agent() {
		return 'WPImageEditor/' . WPIE_VERSION . ' (WordPress; +' . home_url( '/' ) . ')';
	}

	/**
	 * Place search via Nominatim.
	 *
	 * @param \WP_REST_Request $request Request (q, limit).
	 * @return array|\WP_Error
	 */
	public function search( \WP_REST_Request $request ) {
		$q = trim( (string) $request->get_param( 'q' ) );
		if ( strlen( $q ) < 2 || strlen( $q ) > 128 ) {
			return new \WP_Error( 'wpie_geo_query', __( 'Please enter a place name between 2 and 128 characters.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$limit = min( 10, max( 1, absint( $request->get_param( 'limit' ) ? $request->get_param( 'limit' ) : 6 ) ) );
		$lang  = substr( get_locale(), 0, 2 );

		$cache_key = 'wpie_geo_s_' . md5( strtolower( $q ) . '|' . $limit . '|' . $lang );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		// Cache hits are free; only novel lookups reach Nominatim, so rate-limit
		// those (its own generous bucket, so it neither shares nor starves the
		// paid AI window). Guards the endpoint against cache-busting. (WPIE-016)
		$limited = AI_Provider::rate_limit( 'geo', 60 );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}

		$url      = add_query_arg(
			array(
				'format'          => 'jsonv2',
				'q'               => rawurlencode( $q ),
				'limit'           => $limit,
				'addressdetails'  => 1,
				'accept-language' => $lang,
			),
			self::NOMINATIM
		);
		$response = wp_remote_get(
			$url,
			array(
				'timeout'    => 15,
				'user-agent' => self::user_agent(),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'wpie_geo_fetch', __( 'The place search is not reachable right now, please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 200 !== $code || ! is_array( $body ) ) {
			return new \WP_Error( 'wpie_geo_fetch', __( 'The place search is busy right now, please try again in a moment.', 'wunderpaint' ), array( 'status' => 502 ) );
		}

		$results = array();
		foreach ( $body as $hit ) {
			if ( ! isset( $hit['lat'], $hit['lon'] ) ) {
				continue;
			}
			$display = (string) ( isset( $hit['display_name'] ) ? $hit['display_name'] : '' );
			$parts   = array_map( 'trim', explode( ',', $display ) );
			$address = isset( $hit['address'] ) && is_array( $hit['address'] ) ? $hit['address'] : array();

			$results[] = array(
				'name'    => (string) ( isset( $hit['name'] ) && '' !== $hit['name'] ? $hit['name'] : ( isset( $parts[0] ) ? $parts[0] : $display ) ),
				'display' => $display,
				'region'  => self::region_line( $address, $parts ),
				'lat'     => (float) $hit['lat'],
				'lon'     => (float) $hit['lon'],
				'type'    => sanitize_key( (string) ( isset( $hit['type'] ) ? $hit['type'] : '' ) ),
				'bbox'    => isset( $hit['boundingbox'] ) && is_array( $hit['boundingbox'] ) ? array_map( 'floatval', $hit['boundingbox'] ) : null,
			);
		}

		$payload = array( 'results' => $results );
		set_transient( $cache_key, $payload, self::SEARCH_TTL );
		return $payload;
	}

	/**
	 * A short "Region, Country" line for the subtitle prefill.
	 *
	 * @param array $address Nominatim address details.
	 * @param array $parts   display_name comma parts (fallback).
	 * @return string
	 */
	private static function region_line( $address, $parts ) {
		$region  = '';
		foreach ( array( 'state', 'county', 'city', 'town' ) as $key ) {
			if ( ! empty( $address[ $key ] ) ) {
				$region = (string) $address[ $key ];
				break;
			}
		}
		$country = ! empty( $address['country'] ) ? (string) $address['country'] : '';
		if ( $region && $country ) {
			return $region . ', ' . $country;
		}
		if ( $country ) {
			return $country;
		}
		return count( $parts ) > 1 ? (string) end( $parts ) : '';
	}

	/**
	 * REST callback: streams the compact map JSON and exits (same pattern
	 * as the version/project file streaming). The payload is kept as a
	 * STRING end to end - going through the REST serializer would decode
	 * it into hundreds of thousands of PHP float zvals and exhaust the
	 * FPM memory limit (the bug behind v1.144.1).
	 *
	 * @param \WP_REST_Request $request Request (south, west, north, east, detail, buildings).
	 * @return \WP_Error|void
	 */
	public function map_data( \WP_REST_Request $request ) {
		// Third-party lookups on behalf of the user: throttle per user so a
		// runaway client cannot get the site blocked by the provider. The cap
		// is configurable under Settings > Costs & Budget. (F-L26)
		$limited = AI_Provider::rate_limit( 'geomap', 0, 'lookup_rate_limit' );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}
		$json = self::map_payload(
			(float) $request->get_param( 'south' ),
			(float) $request->get_param( 'west' ),
			(float) $request->get_param( 'north' ),
			(float) $request->get_param( 'east' ),
			absint( $request->get_param( 'detail' ) ? $request->get_param( 'detail' ) : 2 ),
			! empty( $request->get_param( 'buildings' ) )
		);
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'X-Content-Type-Options: nosniff' );
		echo $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- self-built JSON of numeric data.
		exit;
	}

	/**
	 * Compact map JSON for a bbox, from cache or Overpass.
	 *
	 * Memory discipline: the transient stores the gz-compressed JSON
	 * STRING (a cache hit never materializes the element arrays), and on
	 * a miss the decoded Overpass response is drained with array_pop while
	 * the output string is built, so the two structures never coexist at
	 * full size. The memory limit is raised for the miss path.
	 *
	 * @param float $south     South latitude.
	 * @param float $west      West longitude.
	 * @param float $north     North latitude.
	 * @param float $east      East longitude.
	 * @param int   $detail    1 (region) - 3 (district).
	 * @param bool  $buildings Include building footprints.
	 * @return string|\WP_Error JSON string { els, n, truncated }.
	 */
	public static function map_payload( $south, $west, $north, $east, $detail = 2, $buildings = false ) {
		$detail = min( 3, max( 1, (int) $detail ) );

		if ( $south < -90 || $north > 90 || $west < -180 || $east > 180 || $north <= $south || $east <= $west ) {
			return new \WP_Error( 'wpie_geo_bbox', __( 'Invalid map area.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		// Longitude degrees shrink toward the poles: compare in
		// latitude-equivalent degrees or Hamburg-sized viewports would be
		// rejected while Nairobi-sized ones pass.
		$mid_cos = max( 0.05, cos( deg2rad( ( $south + $north ) / 2 ) ) );
		$span    = max( $north - $south, ( $east - $west ) * $mid_cos );
		if ( $span > self::SPAN_CAPS[ $detail ] ) {
			return new \WP_Error( 'wpie_geo_span', __( 'The map area is too large for this detail level, zoom in or lower the detail.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( $buildings && $span > self::BUILDINGS_CAP ) {
			$buildings = false;
		}

		// Round for stable cache keys (4 decimals = 11 m).
		$bbox      = array( round( $south, 4 ), round( $west, 4 ), round( $north, 4 ), round( $east, 4 ) );
		$cache_key = 'wpie_geo_m_' . md5( implode( ',', $bbox ) . '|' . $detail . '|' . ( $buildings ? 1 : 0 ) );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && '' !== $cached ) {
			if ( 0 === strpos( $cached, 'gz:' ) && function_exists( 'gzuncompress' ) ) {
				$json = gzuncompress( base64_decode( substr( $cached, 3 ) ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
				if ( false !== $json ) {
					return $json;
				}
			} elseif ( 0 === strpos( $cached, 'raw:' ) ) {
				return substr( $cached, 4 );
			}
		}

		// The decoded Overpass response is large; give the miss path the
		// admin memory headroom (WP_MAX_MEMORY_LIMIT).
		wp_raise_memory_limit( 'admin' );

		$query = self::overpass_query( $bbox, $detail, $buildings );
		$code  = 0;
		$raw   = '';
		$error = null;
		foreach ( self::OVERPASS as $endpoint ) {
			$response = wp_remote_post(
				$endpoint,
				array(
					'timeout'    => 40,
					'user-agent' => self::user_agent(),
					'body'       => array( 'data' => $query ),
				)
			);
			if ( is_wp_error( $response ) ) {
				$error = new \WP_Error( 'wpie_geo_fetch', __( 'The map data service is not reachable right now, please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
				continue;
			}
			$code = (int) wp_remote_retrieve_response_code( $response );
			if ( 429 === $code || 504 === $code ) {
				$error = new \WP_Error( 'wpie_geo_busy', __( 'The map data service is busy right now, please try again in a moment.', 'wunderpaint' ), array( 'status' => 503 ) );
				continue;
			}
			if ( 200 !== $code ) {
				$error = new \WP_Error( 'wpie_geo_fetch', __( 'Could not load map data.', 'wunderpaint' ), array( 'status' => 502 ) );
				continue;
			}
			$raw   = wp_remote_retrieve_body( $response );
			$error = null;
			break;
		}
		if ( $error ) {
			return $error;
		}
		if ( strlen( $raw ) > 20 * MB_IN_BYTES ) {
			return new \WP_Error( 'wpie_geo_span', __( 'This area contains too much map data, zoom in or lower the detail.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$body = json_decode( $raw, true );
		unset( $raw );
		if ( ! is_array( $body ) || ! isset( $body['elements'] ) ) {
			return new \WP_Error( 'wpie_geo_fetch', __( 'Could not load map data.', 'wunderpaint' ), array( 'status' => 502 ) );
		}

		$elements = $body['elements'];
		unset( $body );
		$parts     = array();
		$truncated = false;
		while ( null !== ( $element = array_pop( $elements ) ) ) {
			$compact = self::compact_element( $element );
			if ( ! $compact ) {
				continue;
			}
			if ( count( $parts ) >= self::MAX_ELEMENTS ) {
				$truncated = true;
				break;
			}
			$parts[] = wp_json_encode( $compact );
		}
		unset( $elements );

		$json = '{"els":[' . implode( ',', $parts ) . '],"n":' . count( $parts ) . ',"truncated":' . ( $truncated ? 'true' : 'false' ) . '}';
		unset( $parts );

		$stored = function_exists( 'gzcompress' )
			? 'gz:' . base64_encode( gzcompress( $json, 6 ) ) // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
			: 'raw:' . $json;
		set_transient( $cache_key, $stored, self::MAP_TTL );
		return $json;
	}

	/**
	 * Overpass QL for a bbox and detail level.
	 *
	 * @param array $bbox      [south, west, north, east].
	 * @param int   $detail    1 (region) - 3 (district).
	 * @param bool  $buildings Include building footprints.
	 * @return string
	 */
	public static function overpass_query( $bbox, $detail, $buildings ) {
		$bb = implode( ',', array_map( 'floatval', $bbox ) );

		$roads = array( 'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link' );
		if ( $detail >= 2 ) {
			$roads = array_merge( $roads, array( 'secondary', 'secondary_link', 'tertiary', 'tertiary_link' ) );
		}
		if ( $detail >= 3 ) {
			$roads = array_merge( $roads, array( 'residential', 'unclassified', 'living_street', 'pedestrian', 'road', 'footway', 'path', 'cycleway', 'track', 'steps' ) );
		}
		$waterways = $detail >= 3 ? 'river|canal|stream' : 'river|canal';

		// Tunnels and rail yard tracks are invisible in a poster-style map;
		// dropping them here keeps bridges/els but hides subways underground.
		// The green/sand classes only enter from detail 2: at region scale
		// they ballooned responses past the raw cap (every pond and copse of
		// half a country) and caused most "too much map data" failures.
		$parts   = array();
		$parts[] = 'way["highway"~"^(' . implode( '|', $roads ) . ')$"]["tunnel"!="yes"](' . $bb . ');';
		$parts[] = 'way["railway"~"^(rail|light_rail|subway|tram)$"]["tunnel"!="yes"]["service"!~"^(yard|siding|spur|crossover)$"](' . $bb . ');';
		$parts[] = 'way["waterway"~"^(' . $waterways . ')$"](' . $bb . ');';
		$parts[] = 'way["natural"~"^(water|bay)$"](' . $bb . ');';
		$parts[] = 'way["waterway"="riverbank"](' . $bb . ');';
		$parts[] = 'relation["natural"="water"](' . $bb . ');';
		$parts[] = 'way["natural"="coastline"](' . $bb . ');';
		if ( $detail >= 2 ) {
			$parts[] = 'way["leisure"~"^(park|garden|nature_reserve)$"](' . $bb . ');';
			$parts[] = 'relation["leisure"~"^(park|garden)$"](' . $bb . ');';
			$parts[] = 'way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|cemetery)$"](' . $bb . ');';
			$parts[] = 'way["natural"~"^(wood|beach|sand|scrub)$"](' . $bb . ');';
		}
		if ( $buildings ) {
			$parts[] = 'way["building"](' . $bb . ');';
		}

		return '[out:json][timeout:25];(' . implode( '', $parts ) . ');out geom qt;';
	}

	/**
	 * One Overpass element to the compact wire shape, or null to drop it.
	 *
	 * Ways: { k, c?, g } with g a flat [lat,lon,lat,lon,…] array (5-decimal
	 * rounding). Relations (water/green multipolygons): { k, rings: [ { r:
	 * 'o'|'i', g } ] }.
	 *
	 * @param array $element Overpass element.
	 * @return array|null
	 */
	public static function compact_element( $element ) {
		$tags = isset( $element['tags'] ) && is_array( $element['tags'] ) ? $element['tags'] : array();

		if ( isset( $element['type'] ) && 'relation' === $element['type'] ) {
			$kind = self::area_kind( $tags );
			if ( ! $kind || empty( $element['members'] ) ) {
				return null;
			}
			$rings = array();
			foreach ( (array) $element['members'] as $member ) {
				if ( empty( $member['geometry'] ) || 'way' !== ( isset( $member['type'] ) ? $member['type'] : '' ) ) {
					continue;
				}
				$rings[] = array(
					'r' => 'inner' === ( isset( $member['role'] ) ? $member['role'] : '' ) ? 'i' : 'o',
					'g' => self::flat_coords( $member['geometry'] ),
				);
			}
			return $rings ? array(
				'k'     => $kind,
				'rings' => $rings,
			) : null;
		}

		if ( empty( $element['geometry'] ) ) {
			return null;
		}
		$g = self::flat_coords( $element['geometry'] );
		if ( count( $g ) < 4 ) {
			return null;
		}

		if ( isset( $tags['highway'] ) ) {
			return array(
				'k' => 'road',
				'c' => self::road_class( $tags['highway'] ),
				'g' => $g,
			);
		}
		if ( isset( $tags['railway'] ) ) {
			return array(
				'k' => 'rail',
				'g' => $g,
			);
		}
		if ( isset( $tags['natural'] ) && 'coastline' === $tags['natural'] ) {
			return array(
				'k' => 'coast',
				'g' => $g,
			);
		}
		if ( isset( $tags['waterway'] ) && 'riverbank' !== $tags['waterway'] ) {
			return array(
				'k' => 'waterline',
				'c' => 'stream' === $tags['waterway'] ? 'stream' : 'river',
				'g' => $g,
			);
		}
		$kind = self::area_kind( $tags );
		if ( $kind ) {
			return array(
				'k' => $kind,
				'g' => $g,
			);
		}
		return null;
	}

	/**
	 * Polygon kind from tags (water, green, sand, building), or ''.
	 *
	 * @param array $tags OSM tags.
	 * @return string
	 */
	private static function area_kind( $tags ) {
		if ( isset( $tags['building'] ) ) {
			return 'building';
		}
		if ( ( isset( $tags['natural'] ) && in_array( $tags['natural'], array( 'water', 'bay' ), true ) ) || ( isset( $tags['waterway'] ) && 'riverbank' === $tags['waterway'] ) ) {
			return 'water';
		}
		if ( isset( $tags['natural'] ) && in_array( $tags['natural'], array( 'beach', 'sand' ), true ) ) {
			return 'sand';
		}
		if ( isset( $tags['leisure'] ) || isset( $tags['landuse'] ) || ( isset( $tags['natural'] ) && in_array( $tags['natural'], array( 'wood', 'scrub' ), true ) ) ) {
			return 'green';
		}
		return '';
	}

	/**
	 * Normalized road class for theming.
	 *
	 * @param string $highway OSM highway value.
	 * @return string motorway|primary|secondary|minor|path
	 */
	private static function road_class( $highway ) {
		$highway = preg_replace( '/_link$/', '', (string) $highway );
		if ( in_array( $highway, array( 'motorway', 'trunk' ), true ) ) {
			return 'motorway';
		}
		if ( 'primary' === $highway ) {
			return 'primary';
		}
		if ( in_array( $highway, array( 'secondary', 'tertiary' ), true ) ) {
			return 'secondary';
		}
		if ( in_array( $highway, array( 'footway', 'path', 'cycleway', 'track', 'steps' ), true ) ) {
			return 'path';
		}
		return 'minor';
	}

	/**
	 * Geometry list to a flat, rounded [lat,lon,…] array.
	 *
	 * @param array $geometry [ { lat, lon }, … ].
	 * @return float[]
	 */
	private static function flat_coords( $geometry ) {
		$flat = array();
		foreach ( (array) $geometry as $point ) {
			if ( ! isset( $point['lat'], $point['lon'] ) ) {
				continue;
			}
			$flat[] = round( (float) $point['lat'], 5 );
			$flat[] = round( (float) $point['lon'], 5 );
		}
		return $flat;
	}
}
