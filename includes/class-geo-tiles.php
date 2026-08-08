<?php
/**
 * Vector tiles as the map source, replacing the Overpass query.
 *
 * WHY
 * ---
 * Overpass is a database query engine over the whole planet. Every request
 * runs live against it, it rate-limits per IP, and 429 and 504 are normal
 * enough that class-geo.php carries four instances to fall back through.
 * Measured 2026-08-08 with a deliberately tiny query (one small bbox, roads
 * only): 4.8 seconds from the main instance, and 504 after 31 seconds from
 * the first mirror. A real poster asks for roads, rails, waterways, water,
 * coastline, parks, landuse and buildings over a much larger area.
 *
 * Vector tiles are the same OpenStreetMap data, pre-cut, pre-indexed and
 * served as files from a CDN. The same measurement: 81 milliseconds for a
 * z14 tile. That is not a tuning difference, it is the difference between
 * asking a database and fetching a file.
 *
 * WHY THE DECODING HAPPENS HERE AND NOT IN THE BROWSER
 * ---------------------------------------------------
 * class-geo.php already compacts Overpass into a small private wire format
 * that the map extension renders. Keeping that seam means the source can be
 * swapped without touching the extension at all: no new JavaScript weight,
 * no second rendering path, and the poster styling (themes, foil, glow,
 * masks) is untouched. It also keeps the promise the geo proxy was built
 * for in the first place - the browser never talks to a map service
 * directly.
 *
 * The protobuf reader below is deliberately hand-written and minimal. A
 * composer package would be a server dependency, and this plugin does not
 * get to require those: it must work on a shared host where nobody can
 * install anything.
 *
 * CACHING
 * -------
 * Per TILE, not per viewport. That is the real prize of tiles over bbox
 * queries: panning a poster reuses every tile that stayed on screen, so
 * only the newly exposed edge is fetched. A bbox query shares nothing with
 * the bbox next to it.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * OpenMapTiles-schema vector tiles, decoded to the geo proxy's wire format.
 */
class Geo_Tiles {

	/**
	 * Tile source.
	 *
	 * OpenFreeMap serves the OpenMapTiles schema from a CDN with no API key,
	 * no registration and no rate limit, and is self-hostable if it ever
	 * disappears. Architecturally this is the same kind of third party the
	 * proxy already talks to (Nominatim, Overpass), only fast.
	 */
	const TILEJSON = 'https://tiles.openfreemap.org/planet';

	/**
	 * Fallback tile URL, used when the TileJSON cannot be read.
	 *
	 * The path carries a dated build stamp, and it is NOT optional: without
	 * it the server answers 200 with an empty body. Not 404, not an error -
	 * a perfectly successful nothing. Cost an hour on 2026-08-08, because a
	 * decoder that returns no features and a tile that contains no features
	 * look identical from the inside.
	 *
	 * Old stamps keep working, so a stale value here degrades to older map
	 * data rather than to no map at all.
	 */
	const TILES_FALLBACK = 'https://tiles.openfreemap.org/planet/20260802_080001_pt/{z}/{x}/{y}.pbf';

	/** How long the resolved tile URL is trusted. */
	const SOURCE_TTL = DAY_IN_SECONDS;

	/** A tile is a file, not a query: it may be cached for a long time. */
	const TILE_TTL = 30 * DAY_IN_SECONDS;

	/** Per-tile fetch timeout. A CDN answering slower than this is down. */
	const TILE_TIMEOUT = 8;

	/**
	 * Highest zoom the source carries. Asking beyond it returns nothing,
	 * so requests are clamped and the last level is over-sampled instead.
	 */
	const MAX_Z = 14;

	/**
	 * Never fetch more than this many tiles for one viewport.
	 *
	 * Tiles quadruple with every zoom level, so a wrong zoom choice is not
	 * a little slower, it is hundreds of requests. The zoom picker below
	 * aims for a 3x3 to 4x4 block; this is the backstop if it is ever wrong.
	 */
	const MAX_TILES = 25;

	/**
	 * Layers worth decoding, and what they become.
	 *
	 * Everything else in the schema (poi, place, housenumber, boundary,
	 * transportation_name, water_name, aerodrome_label, mountain_peak) is
	 * labels and points. A poster draws none of it, and skipping those
	 * layers before parsing their geometry is most of the decode budget.
	 */
	const LAYERS = array( 'transportation', 'waterway', 'water', 'landcover', 'park', 'landuse', 'building' );

	/**
	 * OpenMapTiles transportation classes to our road classes.
	 *
	 * The right column is the vocabulary class-geo.php already emits, so
	 * the renderer cannot tell which source a poster came from.
	 */
	const ROAD_CLASS = array(
		'motorway'     => 'motorway',
		'trunk'        => 'motorway',
		'primary'      => 'primary',
		'secondary'    => 'secondary',
		'tertiary'     => 'secondary',
		'minor'        => 'minor',
		'service'      => 'minor',
		'track'        => 'path',
		'path'         => 'path',
	);

	/* ------------------------------ protobuf ------------------------------ */

	/**
	 * Read a base-128 varint.
	 *
	 * @param string $buf Buffer.
	 * @param int    $pos Cursor, advanced in place.
	 * @return int
	 */
	private static function varint( $buf, &$pos ) {
		$result = 0;
		$shift  = 0;
		$len    = strlen( $buf );
		while ( $pos < $len ) {
			$byte = ord( $buf[ $pos ] );
			$pos++;
			$result |= ( $byte & 0x7f ) << $shift;
			if ( ! ( $byte & 0x80 ) ) {
				break;
			}
			$shift += 7;
			// A varint longer than this is corrupt; stop rather than loop.
			if ( $shift > 63 ) {
				break;
			}
		}
		return $result;
	}

	/**
	 * Walk one protobuf message, handing each field to a callback.
	 *
	 * The callback gets ( field number, wire type, buffer, cursor ) and must
	 * leave the cursor at the end of its field. Returning false means "not
	 * mine", and the field is skipped here.
	 *
	 * @param string   $buf   Buffer.
	 * @param int      $start Offset.
	 * @param int      $end   End offset.
	 * @param callable $each  Field handler.
	 */
	private static function walk( $buf, $start, $end, $each ) {
		$pos = $start;
		while ( $pos < $end ) {
			$key  = self::varint( $buf, $pos );
			$wire = $key & 0x07;
			$num  = $key >> 3;
			$mine = $each( $num, $wire, $buf, $pos );
			if ( $mine ) {
				continue;
			}
			switch ( $wire ) {
				case 0:
					self::varint( $buf, $pos );
					break;
				case 1:
					$pos += 8;
					break;
				case 2:
					$pos += self::varint( $buf, $pos );
					break;
				case 5:
					$pos += 4;
					break;
				default:
					// Unknown wire type: the rest cannot be trusted.
					return;
			}
		}
	}

	/* -------------------------------- tiles ------------------------------- */

	/**
	 * Longitude to tile column.
	 *
	 * @param float $lon Longitude.
	 * @param int   $z   Zoom.
	 * @return int
	 */
	private static function lon_to_x( $lon, $z ) {
		return (int) floor( ( $lon + 180 ) / 360 * pow( 2, $z ) );
	}

	/**
	 * Latitude to tile row (Web Mercator).
	 *
	 * @param float $lat Latitude.
	 * @param int   $z   Zoom.
	 * @return int
	 */
	private static function lat_to_y( $lat, $z ) {
		$rad = deg2rad( max( -85.0511, min( 85.0511, $lat ) ) );
		return (int) floor( ( 1 - log( tan( $rad ) + 1 / cos( $rad ) ) / M_PI ) / 2 * pow( 2, $z ) );
	}

	/**
	 * Pick the zoom that covers a viewport in a handful of tiles.
	 *
	 * A tile spans 360/2^z degrees of longitude. Aiming for about three
	 * tiles across the requested span keeps the count in the single digits
	 * at every scale, which is why this scales where a bbox query does not:
	 * a country and a street cost the same number of requests.
	 *
	 * @param float $west  West bound.
	 * @param float $east  East bound.
	 * @param int   $detail 1..3, the caller's detail level.
	 * @return int
	 */
	private static function zoom_for( $west, $east, $detail ) {
		$span = max( 0.0005, $east - $west );
		$z    = (int) floor( log( 3 * 360 / $span, 2 ) );
		// Detail 1 is a wide overview and does not need street-level tiles;
		// detail 3 is a close-up and wants the sharpest level available.
		$cap = array(
			1 => 10,
			2 => 13,
			3 => self::MAX_Z,
		);
		return max( 2, min( isset( $cap[ $detail ] ) ? $cap[ $detail ] : 13, $z ) );
	}

	/**
	 * The current tile URL template.
	 *
	 * The build stamp in the path changes when the source re-imports the
	 * planet, so it is read from the TileJSON rather than pinned. Cached for
	 * a day; on any failure the pinned fallback is used, which still serves
	 * a slightly older planet.
	 *
	 * @return string Template with {z}/{x}/{y}.
	 */
	private static function source() {
		$cached = get_transient( 'wpie_geo_tilesrc' );
		if ( is_string( $cached ) && '' !== $cached ) {
			return $cached;
		}
		$url      = self::TILES_FALLBACK;
		$response = wp_remote_get( self::TILEJSON, array( 'timeout' => self::TILE_TIMEOUT ) );
		if ( ! is_wp_error( $response ) && 200 === (int) wp_remote_retrieve_response_code( $response ) ) {
			$json = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( isset( $json['tiles'][0] ) && is_string( $json['tiles'][0] )
				&& false !== strpos( $json['tiles'][0], '{z}' ) ) {
				$url = $json['tiles'][0];
			}
		}
		set_transient( 'wpie_geo_tilesrc', $url, self::SOURCE_TTL );
		return $url;
	}

	/**
	 * Fetch and decode one tile, cached.
	 *
	 * @param int $z Zoom.
	 * @param int $x Column.
	 * @param int $y Row.
	 * @return array|null Compact elements, or null when the tile is missing.
	 */
	private static function tile( $z, $x, $y ) {
		// Geo::WIRE belongs in this key too. What is cached here is not the
		// tile, it is the DECODED elements - for thirty days. So a decoder
		// that learns to read a new attribute changes nothing on any site
		// that has already drawn that area, and the fix looks like it did
		// not work. That is exactly what happened with the building heights
		// on 2026-08-08: the decode was right and every measurement still
		// said zero, twice, because two cache layers sat in front of it.
		$key    = 'wpie_geo_t' . Geo::WIRE . '_' . $z . '_' . $x . '_' . $y;
		$cached = get_transient( $key );
		if ( is_string( $cached ) ) {
			// An empty tile is a real answer (ocean, desert) and is cached
			// as such; without this every blank tile would be re-fetched
			// forever.
			return '' === $cached ? array() : json_decode( $cached, true );
		}

		$url      = str_replace(
			array( '{z}', '{x}', '{y}' ),
			array( $z, $x, $y ),
			self::source()
		);
		$response = wp_remote_get(
			$url,
			array(
				'timeout'    => self::TILE_TIMEOUT,
				'user-agent' => 'WPImageEditor/' . WPIE_VERSION . ' (WordPress; +' . home_url( '/' ) . ')',
			)
		);
		if ( is_wp_error( $response ) ) {
			return null;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( 404 === $code || 204 === $code ) {
			set_transient( $key, '', self::TILE_TTL );
			return array();
		}
		if ( 200 !== $code ) {
			return null;
		}

		$elements = self::decode( wp_remote_retrieve_body( $response ), $z, $x, $y );
		set_transient( $key, $elements ? wp_json_encode( $elements ) : '', self::TILE_TTL );
		return $elements;
	}

	/**
	 * Decode one Mapbox Vector Tile into compact elements.
	 *
	 * @param string $buf Tile bytes.
	 * @param int    $z   Zoom.
	 * @param int    $x   Column.
	 * @param int    $y   Row.
	 * @return array
	 */
	public static function decode( $buf, $z, $x, $y ) {
		$out = array();
		$end = strlen( $buf );

		// Tile.layers = field 3, length-delimited.
		self::walk(
			$buf,
			0,
			$end,
			function ( $num, $wire, $b, &$pos ) use ( &$out, $z, $x, $y ) {
				if ( 3 !== $num || 2 !== $wire ) {
					return false;
				}
				$len   = self::varint( $b, $pos );
				$start = $pos;
				$pos  += $len;
				self::layer( $b, $start, $start + $len, $z, $x, $y, $out );
				return true;
			}
		);
		return $out;
	}

	/**
	 * Decode one layer.
	 *
	 * @param string $b     Buffer.
	 * @param int    $start Offset.
	 * @param int    $end   End offset.
	 * @param int    $z     Zoom.
	 * @param int    $x     Column.
	 * @param int    $y     Row.
	 * @param array  $out   Collected elements, appended in place.
	 */
	private static function layer( $b, $start, $end, $z, $x, $y, &$out ) {
		$name     = '';
		$extent   = 4096;
		$keys     = array();
		$values   = array();
		$features = array();

		self::walk(
			$b,
			$start,
			$end,
			function ( $num, $wire, $buf, &$pos ) use ( &$name, &$extent, &$keys, &$values, &$features ) {
				if ( 2 === $wire && in_array( $num, array( 1, 2, 3, 4 ), true ) ) {
					$len = self::varint( $buf, $pos );
					$raw = substr( $buf, $pos, $len );
					$at  = $pos;
					$pos += $len;
					if ( 1 === $num ) {
						$name = $raw;
					} elseif ( 2 === $num ) {
						$features[] = array( $at, $at + $len );
					} elseif ( 3 === $num ) {
						$keys[] = $raw;
					} else {
						$values[] = self::value( $buf, $at, $at + $len );
					}
					return true;
				}
				if ( 5 === $num && 0 === $wire ) {
					$extent = self::varint( $buf, $pos );
					return true;
				}
				return false;
			}
		);

		if ( ! in_array( $name, self::LAYERS, true ) || ! $features ) {
			return;
		}
		foreach ( $features as $range ) {
			$elements = self::feature( $b, $range[0], $range[1], $name, $keys, $values, $extent, $z, $x, $y );
			if ( $elements ) {
				foreach ( $elements as $element ) {
					$out[] = $element;
				}
			}
		}
	}

	/**
	 * Read a layer value. ALL SEVEN TYPES, not just the string.
	 *
	 * The vector tile Value is a oneof: string(1), float(2), double(3),
	 * int64(4), uint64(5), sint64(6), bool(7). This read field 1 only,
	 * because the first attribute it was written for was `class`, which is
	 * always a string. Everything numeric therefore came back as an empty
	 * string, and (float) '' is 0, so a building's render_height looked like
	 * "not tagged" - measured heights arrived and were dropped, exactly the
	 * fault this decoder had been changed to fix. A road's `layer` went the
	 * same way. (Found 2026-08-08 by counting: 302 buildings over the
	 * Speicherstadt, 0 with a height.)
	 *
	 * @param string $b     Buffer.
	 * @param int    $start Offset.
	 * @param int    $end   End offset.
	 * @return string|float|int|bool
	 */
	private static function value( $b, $start, $end ) {
		$val = '';
		self::walk(
			$b,
			$start,
			$end,
			function ( $num, $wire, $buf, &$pos ) use ( &$val ) {
				if ( 1 === $num && 2 === $wire ) {
					$len  = self::varint( $buf, $pos );
					$val  = substr( $buf, $pos, $len );
					$pos += $len;
					return true;
				}
				// Little-endian on the wire, which is what 'g' and 'e' read;
				// 'f' and 'd' would follow the machine and break on the rare
				// big-endian host.
				if ( 2 === $num && 5 === $wire ) {
					$bits = unpack( 'g', substr( $buf, $pos, 4 ) );
					$val  = $bits ? (float) $bits[1] : 0.0;
					$pos += 4;
					return true;
				}
				if ( 3 === $num && 1 === $wire ) {
					$bits = unpack( 'e', substr( $buf, $pos, 8 ) );
					$val  = $bits ? (float) $bits[1] : 0.0;
					$pos += 8;
					return true;
				}
				if ( ( 4 === $num || 5 === $num ) && 0 === $wire ) {
					$val = (int) self::varint( $buf, $pos );
					return true;
				}
				if ( 6 === $num && 0 === $wire ) {
					// sint64 is zigzag encoded: -1 travels as 1, 1 as 2.
					$raw = self::varint( $buf, $pos );
					$val = ( $raw >> 1 ) ^ -( $raw & 1 );
					return true;
				}
				if ( 7 === $num && 0 === $wire ) {
					$val = (bool) self::varint( $buf, $pos );
					return true;
				}
				return false;
			}
		);
		return $val;
	}

	/**
	 * Decode one feature into compact elements, or null to drop it.
	 *
	 * One tile feature can become several elements: tiles merge geometry
	 * that the wire format keeps separate, so a multipolygon of six houses
	 * is six elements and a multi-line street is one element per stretch.
	 *
	 * @param string $b      Buffer.
	 * @param int    $start  Offset.
	 * @param int    $end    End offset.
	 * @param string $layer  Layer name.
	 * @param array  $keys   Layer key table.
	 * @param array  $values Layer value table.
	 * @param int    $extent Tile extent.
	 * @param int    $z      Zoom.
	 * @param int    $x      Column.
	 * @param int    $y      Row.
	 * @return array|null
	 */
	private static function feature( $b, $start, $end, $layer, $keys, $values, $extent, $z, $x, $y ) {
		$tags = array();
		$geom = array();
		$type = 0;

		self::walk(
			$b,
			$start,
			$end,
			function ( $num, $wire, $buf, &$pos ) use ( &$tags, &$geom, &$type ) {
				if ( 3 === $num && 0 === $wire ) {
					$type = self::varint( $buf, $pos );
					return true;
				}
				if ( 2 === $wire && ( 2 === $num || 4 === $num ) ) {
					$len  = self::varint( $buf, $pos );
					$stop = $pos + $len;
					$list = array();
					while ( $pos < $stop ) {
						$list[] = self::varint( $buf, $pos );
					}
					if ( 2 === $num ) {
						$tags = $list;
					} else {
						$geom = $list;
					}
					return true;
				}
				return false;
			}
		);

		if ( ! $geom || 1 === $type ) {
			// Points carry labels only; a poster draws none of them.
			return null;
		}

		// Every attribute, not just `class`. The building layer carries
		// render_height and render_min_height - OpenStreetMap's measured
		// heights, already resolved to metres by the tile schema - and this
		// decoder used to read past them. A 3D consumer then had to guess a
		// height for every building although half of them are measured.
		// (City Diorama's GEO-REQUIREMENTS.md, 2026-08-08.)
		$attrs = array();
		for ( $i = 0; $i + 1 < count( $tags ); $i += 2 ) {
			if ( isset( $keys[ $tags[ $i ] ], $values[ $tags[ $i + 1 ] ] ) ) {
				$attrs[ $keys[ $tags[ $i ] ] ] = $values[ $tags[ $i + 1 ] ];
			}
		}
		$class = isset( $attrs['class'] ) ? (string) $attrs['class'] : '';

		$kind = self::kind_for( $layer, $class );
		if ( ! $kind ) {
			return null;
		}

		// A road that arrives as a polygon is a pedestrian square or a
		// parking aisle outline, not a street. The renderer strokes roads by
		// class and has no polygon path for them, so such a feature would
		// come through as a class-less blob. Drop it: the streets around it
		// are already there as lines.
		if ( 'road' === $kind && 3 === $type ) {
			return null;
		}

		$rings = self::geometry( $geom, $extent, $z, $x, $y );
		if ( ! $rings ) {
			return null;
		}

		if ( 3 !== $type ) {
			// A line feature can carry several disjoint lines; the wire
			// format has one geometry per element, so they become one
			// element each.
			$out = array();
			foreach ( $rings as $ring ) {
				$piece = array( 'k' => $kind, 'g' => $ring[0] );
				if ( 'road' === $kind ) {
					$piece['c'] = isset( self::ROAD_CLASS[ $class ] ) ? self::ROAD_CLASS[ $class ] : 'minor';
					$piece      = array_merge( $piece, self::span( $attrs ) );
				}
				$out[] = $piece;
			}
			return $out;
		}

		// Polygons. A tile feature is a MULTIpolygon: rings arrive as outer,
		// its holes, the next outer, its holes. Which is which is decided by
		// winding order, NOT by position, and getting that wrong is not
		// subtle: a terrace of houses arrives as one feature with many outer
		// rings, and treating every ring after the first as a hole turns the
		// whole row into one building with holes punched in it. Comparing
		// against Overpass on the same viewport is what showed it: 1035
		// buildings from tiles against 10229.
		$polys = array();
		foreach ( $rings as $ring ) {
			list( $g, $outer ) = $ring;
			$n = count( $g );
			if ( $g[0] !== $g[ $n - 2 ] || $g[1] !== $g[ $n - 1 ] ) {
				// Close it, or the renderer strokes an open shape and the
				// fill leaks.
				$g[] = $g[0];
				$g[] = $g[1];
			}
			if ( $outer || ! $polys ) {
				$polys[] = array( array( 'r' => 'o', 'g' => $g ) );
			} else {
				$polys[ count( $polys ) - 1 ][] = array( 'r' => 'i', 'g' => $g );
			}
		}

		$extra = 'building' === $kind ? self::height( $attrs ) : array();
		$out   = array();
		foreach ( $polys as $poly ) {
			$shape = 1 === count( $poly )
				? array( 'k' => $kind, 'g' => $poly[0]['g'] )
				: array( 'k' => $kind, 'rings' => $poly );
			$out[] = $extra ? array_merge( $shape, $extra ) : $shape;
		}
		return $out;
	}

	/**
	 * Which of the proxy's kinds a layer and class map to.
	 *
	 * @param string $layer Layer name.
	 * @param string $class Class tag.
	 * @return string Empty when the feature is not drawn.
	 */
	/**
	 * Building height from tile attributes, in the shape the Overpass path
	 * produces, so a consumer never has to know which source answered.
	 *
	 * @param array $attrs Feature attributes.
	 * @return array Subset of { h, mh }.
	 */
	private static function height( $attrs ) {
		$out = array();
		$h   = isset( $attrs['render_height'] ) ? (float) $attrs['render_height'] : 0.0;
		// EXACTLY 5 is not a measurement. The tile schema fills render_height
		// with COALESCE(height, levels x 3.66, 5), so every untagged building
		// arrives as 5 metres - 114 of 302 over the Speicherstadt, measured
		// 2026-08-08. Passing that on would hand a consumer a carpet of
		// identical 5-metre houses and call it data, which is worse than the
		// estimate it would have made from the footprint.
		//
		// So `h` keeps ONE meaning on both paths: somebody stated this
		// height. The price is a genuinely 5-metre building losing its tag,
		// which is one storey of accuracy on the smallest buildings there
		// are, and the tile cannot tell us apart from the default anyway.
		$default = ( abs( $h - 5.0 ) < 0.01 );
		// The same ceiling the Overpass side applies: above 900 metres it is
		// a typo and not a building, and the two paths must not disagree
		// about what counts as a height.
		if ( $h > 0 && $h < 900 && ! $default ) {
			$out['h'] = round( $h, 1 );
		}
		$mh = isset( $attrs['render_min_height'] ) ? (float) $attrs['render_min_height'] : 0.0;
		if ( $mh > 0 && $mh < 900 ) {
			$out['mh'] = round( $mh, 1 );
		}
		return $out;
	}

	/**
	 * Bridge and layer of a road, in the shape the Overpass path uses.
	 *
	 * The tile schema folds bridge, tunnel and ford into one `brunnel`
	 * attribute. Tunnels never reach here (kind_for keeps them out the same
	 * way the Overpass query does), so only the bridge case matters.
	 *
	 * @param array $attrs Feature attributes.
	 * @return array Subset of { bridge, layer }.
	 */
	private static function span( $attrs ) {
		$out = array();
		if ( isset( $attrs['brunnel'] ) && 'bridge' === $attrs['brunnel'] ) {
			$out['bridge'] = 1;
		}
		if ( isset( $attrs['layer'] ) && (int) $attrs['layer'] ) {
			$out['layer'] = (int) $attrs['layer'];
		}
		return $out;
	}

	/**
	 * Kind for a layer and class, or '' to drop the feature.
	 *
	 * @param string $layer Tile layer name.
	 * @param string $class Feature class attribute.
	 * @return string
	 */
	private static function kind_for( $layer, $class ) {
		switch ( $layer ) {
			case 'transportation':
				if ( in_array( $class, array( 'rail', 'transit' ), true ) ) {
					return 'rail';
				}
				// Ferries and aerialways are routes, not drawn roads.
				if ( in_array( $class, array( 'ferry', 'aerialway' ), true ) ) {
					return '';
				}
				return 'road';
			case 'waterway':
				return 'waterline';
			case 'water':
				return 'water';
			case 'building':
				return 'building';
			case 'park':
				return 'green';
			case 'landcover':
				return in_array( $class, array( 'wood', 'grass', 'farmland', 'sand', 'wetland' ), true ) ? 'green' : '';
			case 'landuse':
				return in_array( $class, array( 'cemetery', 'recreation_ground', 'park', 'garden' ), true ) ? 'green' : '';
		}
		return '';
	}

	/**
	 * Geometry commands to flat [lat,lon,…] rings.
	 *
	 * @param array $geom   Command list.
	 * @param int   $extent Tile extent.
	 * @param int   $z      Zoom.
	 * @param int   $x      Column.
	 * @param int   $y      Row.
	 * @return array List of flat coordinate arrays.
	 */
	private static function geometry( $geom, $extent, $z, $x, $y ) {
		$scale = pow( 2, $z );
		$rings = array();
		$ring  = array();
		$tile  = array();
		$cx    = 0;
		$cy    = 0;
		$i     = 0;
		$count = count( $geom );

		$close = static function () use ( &$rings, &$ring, &$tile ) {
			if ( count( $ring ) >= 4 ) {
				// Surveyor's formula on the TILE coordinates. The MVT spec
				// defines an outer ring as one of positive area and a hole
				// as negative, and tile y grows downward, so this sign is
				// the spec's sign and not the geographic one.
				$area = 0.0;
				$n    = count( $tile );
				for ( $k = 0; $k < $n; $k += 2 ) {
					$j     = ( $k + 2 ) % $n;
					$area += $tile[ $k ] * $tile[ $j + 1 ] - $tile[ $j ] * $tile[ $k + 1 ];
				}
				$rings[] = array( $ring, $area >= 0 );
			}
			$ring = array();
			$tile = array();
		};

		while ( $i < $count ) {
			$cmd    = $geom[ $i ] & 0x07;
			$repeat = $geom[ $i ] >> 3;
			$i++;
			if ( 7 === $cmd ) { // ClosePath.
				continue;
			}
			for ( $r = 0; $r < $repeat && $i + 1 < $count; $r++ ) {
				// Zigzag decode.
				$dx = ( $geom[ $i ] >> 1 ) ^ ( -( $geom[ $i ] & 1 ) );
				$dy = ( $geom[ $i + 1 ] >> 1 ) ^ ( -( $geom[ $i + 1 ] & 1 ) );
				$i += 2;
				$cx += $dx;
				$cy += $dy;
				if ( 1 === $cmd ) { // MoveTo starts a new ring.
					$close();
				}
				$lon = ( $x + $cx / $extent ) / $scale * 360 - 180;
				$n   = M_PI - 2 * M_PI * ( $y + $cy / $extent ) / $scale;
				$lat = rad2deg( atan( 0.5 * ( exp( $n ) - exp( -$n ) ) ) );
				$ring[] = round( $lat, 5 );
				$ring[] = round( $lon, 5 );
				$tile[] = $cx;
				$tile[] = $cy;
			}
		}
		$close();
		return $rings;
	}

	/* ------------------------------ viewport ------------------------------ */

	/**
	 * Does an element's bounding box reach into the viewport?
	 *
	 * A tile grid never lines up with the requested area, and tiles carry a
	 * buffer besides, so a good part of what comes back is off-poster. On a
	 * detail-3 city view that was 4.4 MB of wire payload for a viewport that
	 * needed roughly half of it.
	 *
	 * Bounding box and not "any point inside": a lake or a forest larger
	 * than the poster has every one of its vertices outside the view while
	 * covering all of it, and dropping those would punch holes in exactly
	 * the biggest features.
	 *
	 * @param array $element Compact element.
	 * @param float $south   South bound.
	 * @param float $west    West bound.
	 * @param float $north   North bound.
	 * @param float $east    East bound.
	 * @return bool
	 */
	private static function touches( $element, $south, $west, $north, $east ) {
		$lists = isset( $element['rings'] )
			? array_column( $element['rings'], 'g' )
			: array( $element['g'] );
		$min_lat = 90.0;
		$max_lat = -90.0;
		$min_lon = 180.0;
		$max_lon = -180.0;
		foreach ( $lists as $g ) {
			for ( $i = 0, $n = count( $g ); $i + 1 < $n; $i += 2 ) {
				$min_lat = min( $min_lat, $g[ $i ] );
				$max_lat = max( $max_lat, $g[ $i ] );
				$min_lon = min( $min_lon, $g[ $i + 1 ] );
				$max_lon = max( $max_lon, $g[ $i + 1 ] );
			}
		}
		return $max_lat >= $south && $min_lat <= $north && $max_lon >= $west && $min_lon <= $east;
	}

	/**
	 * All elements covering a viewport.
	 *
	 * @param float $south  South bound.
	 * @param float $west   West bound.
	 * @param float $north  North bound.
	 * @param float $east   East bound.
	 * @param int   $detail 1..3.
	 * @param bool  $buildings Include building footprints.
	 * @return array|null Elements, or null when the source could not be read.
	 */
	public static function viewport( $south, $west, $north, $east, $detail, $buildings ) {
		$z  = self::zoom_for( $west, $east, $detail );
		$x0 = self::lon_to_x( $west, $z );
		$x1 = self::lon_to_x( $east, $z );
		$y0 = self::lat_to_y( $north, $z );
		$y1 = self::lat_to_y( $south, $z );
		$n  = ( abs( $x1 - $x0 ) + 1 ) * ( abs( $y1 - $y0 ) + 1 );
		while ( $n > self::MAX_TILES && $z > 2 ) {
			$z--;
			$x0 = self::lon_to_x( $west, $z );
			$x1 = self::lon_to_x( $east, $z );
			$y0 = self::lat_to_y( $north, $z );
			$y1 = self::lat_to_y( $south, $z );
			$n  = ( abs( $x1 - $x0 ) + 1 ) * ( abs( $y1 - $y0 ) + 1 );
		}

		$elements = array();
		$got      = false;
		for ( $x = min( $x0, $x1 ); $x <= max( $x0, $x1 ); $x++ ) {
			for ( $y = min( $y0, $y1 ); $y <= max( $y0, $y1 ); $y++ ) {
				$tile = self::tile( $z, $x, $y );
				if ( null === $tile ) {
					continue;
				}
				$got = true;
				foreach ( $tile as $element ) {
					if ( ! $buildings && 'building' === $element['k'] ) {
						continue;
					}
					if ( ! self::touches( $element, $south, $west, $north, $east ) ) {
						continue;
					}
					$elements[] = $element;
				}
			}
		}
		// Not one tile answered: let the caller fall back rather than draw
		// an empty poster and call it a map.
		return $got ? $elements : null;
	}
}
