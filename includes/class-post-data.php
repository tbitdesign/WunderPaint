<?php
/**
 * Post data for dynamic templates: post search (any public post type), the
 * binding catalog (core + author + site + WooCommerce + ACF fields) and the
 * per-post context bundle. Since v1.60 the context resolves EVERYTHING
 * server-side into a flat `fields` map keyed by binding id; the client only
 * looks values up, so new data sources never need client releases.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * REST routes /posts, /posts/types, /posts/categories, /posts/{id}/context.
 */
class Post_Data {

	/** ACF field types resolved as plain text. */
	const ACF_TEXT_TYPES = array( 'text', 'textarea', 'number', 'range', 'email', 'url', 'select', 'radio', 'button_group', 'date_picker', 'date_time_picker', 'time_picker', 'true_false' );

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
		register_rest_route(
			WPIE_REST_NS,
			'/posts',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'search' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/posts/types',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'types' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/posts/categories',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'categories' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/posts/table',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'table' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		// External feeds as a repeater source (v1.278): RSS/Atom, podcast
		// feeds (iTunes tags) and YouTube channel feeds.
		register_rest_route(
			WPIE_REST_NS,
			'/feed',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'feed' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		// Review + team sources for repeater graphics (v1.275.2).
		register_rest_route(
			WPIE_REST_NS,
			'/reviews',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'reviews' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/users',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'users' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/posts/(?P<id>\d+)/context',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'context' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		// Installed plugin version (v1.130.2): the About dialog compares it
		// with the version the page was loaded with and offers a reload -
		// long-running editor sessions otherwise show a stale number.
		register_rest_route(
			WPIE_REST_NS,
			'/version',
			array(
				'methods'             => 'GET',
				'callback'            => static function () {
					return array( 'version' => WPIE_VERSION );
				},
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * Public post types (minus attachments), posts first.
	 *
	 * @return array [slug => label]
	 */
	private static function public_types() {
		$out = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $type ) {
			if ( 'attachment' === $type->name ) {
				continue;
			}
			$out[ $type->name ] = $type->labels->singular_name ? $type->labels->singular_name : $type->label;
		}
		if ( isset( $out['post'] ) ) {
			$out = array( 'post' => $out['post'] ) + $out;
		}
		return $out;
	}

	/** The "category-like" taxonomy for a post type. */
	private static function category_taxonomy( $post_type ) {
		if ( 'post' === $post_type ) {
			return 'category';
		}
		if ( 'product' === $post_type && taxonomy_exists( 'product_cat' ) ) {
			return 'product_cat';
		}
		foreach ( get_object_taxonomies( $post_type, 'objects' ) as $tax ) {
			if ( $tax->public && $tax->hierarchical ) {
				return $tax->name;
			}
		}
		return '';
	}

	/** Term names + ids of the category-like taxonomy for a post. */
	private static function post_terms( $post ) {
		$tax = self::category_taxonomy( $post->post_type );
		if ( ! $tax ) {
			return array( array(), array() );
		}
		$terms = get_the_terms( $post->ID, $tax );
		if ( ! is_array( $terms ) ) {
			return array( array(), array() );
		}
		return array(
			array_map( 'html_entity_decode', wp_list_pluck( $terms, 'name' ) ),
			array_map( 'intval', wp_list_pluck( $terms, 'term_id' ) ),
		);
	}

	/**
	 * The binding catalog for the editor dropdown (v1.60). Groups carry
	 * items {id, label, kind:text|image}; plugin groups appear only when
	 * the plugin is active. Shipped in the WPIE bootstrap payload.
	 *
	 * @return array
	 */
	public static function binding_catalog() {
		$t = function ( $id, $label ) {
			return array(
				'id'    => $id,
				'label' => $label,
				'kind'  => 'text',
			);
		};
		$i = function ( $id, $label ) {
			return array(
				'id'    => $id,
				'label' => $label,
				'kind'  => 'image',
			);
		};
		$groups = array(
			array(
				'label' => __( 'Post', 'wunderpaint' ),
				'items' => array(
					$t( 'post.title', __( 'Post title', 'wunderpaint' ) ),
					$t( 'post.excerpt', __( 'Post excerpt', 'wunderpaint' ) ),
					$t( 'post.content', __( 'Post content', 'wunderpaint' ) ),
					$t( 'post.url', __( 'Post link (URL)', 'wunderpaint' ) ),
					$t( 'post.category', __( 'Category', 'wunderpaint' ) ),
					$t( 'post.tags', __( 'Tags', 'wunderpaint' ) ),
					$t( 'post.date', __( 'Publish date', 'wunderpaint' ) ),
					$t( 'post.modified', __( 'Last updated', 'wunderpaint' ) ),
					$t( 'post.readingTime', __( 'Reading time', 'wunderpaint' ) ),
				),
			),
			array(
				'label' => __( 'Author', 'wunderpaint' ),
				'items' => array(
					$t( 'author.name', __( 'Author name', 'wunderpaint' ) ),
					$t( 'author.bio', __( 'Author bio', 'wunderpaint' ) ),
					$i( 'author.avatar', __( 'Author avatar', 'wunderpaint' ) ),
				),
			),
			array(
				'label' => __( 'Site', 'wunderpaint' ),
				'items' => array(
					$t( 'site.name', __( 'Site name', 'wunderpaint' ) ),
					$t( 'site.tagline', __( 'Site tagline', 'wunderpaint' ) ),
					$t( 'site.url', __( 'Site domain', 'wunderpaint' ) ),
					$i( 'site.logo', __( 'Site logo', 'wunderpaint' ) ),
				),
			),
			array(
				'label' => __( 'Media', 'wunderpaint' ),
				'items' => array(
					$i( 'ai.background', __( 'AI background', 'wunderpaint' ) ),
					$i( 'post.featured', __( 'Featured image', 'wunderpaint' ) ),
					$i( 'brand.logo', __( 'Brand logo', 'wunderpaint' ) ),
				),
			),
		);
		if ( function_exists( 'wc_get_product' ) ) {
			$groups[] = array(
				'label' => 'WooCommerce',
				'items' => array(
					$t( 'wc.name', __( 'Product name', 'wunderpaint' ) ),
					$t( 'wc.price', __( 'Price', 'wunderpaint' ) ),
					$t( 'wc.regular_price', __( 'Regular price (only on sale)', 'wunderpaint' ) ),
					$t( 'wc.discount', __( 'Discount % (only on sale)', 'wunderpaint' ) ),
					$t( 'wc.short_desc', __( 'Short description', 'wunderpaint' ) ),
					$t( 'wc.category', __( 'Product category', 'wunderpaint' ) ),
					$t( 'wc.sku', __( 'SKU', 'wunderpaint' ) ),
					$t( 'wc.stock', __( 'Stock status', 'wunderpaint' ) ),
					$t( 'wc.rating', __( 'Rating', 'wunderpaint' ) ),
					$t( 'wc.review_count', __( 'Review count', 'wunderpaint' ) ),
					$t( 'wc.stock_qty', __( 'Units in stock', 'wunderpaint' ) ),
					$t( 'wc.low_stock', __( 'Low-stock badge (only when low)', 'wunderpaint' ) ),
					$t( 'wc.sale_ends', __( 'Sale end date (only on sale)', 'wunderpaint' ) ),
					$i( 'wc.image', __( 'Product image', 'wunderpaint' ) ),
				),
			);
		}
		if ( function_exists( 'acf_get_field_groups' ) && function_exists( 'acf_get_fields' ) ) {
			$items = array();
			foreach ( acf_get_field_groups() as $group ) {
				foreach ( (array) acf_get_fields( $group['key'] ) as $field ) {
					if ( 'image' === $field['type'] ) {
						$items[] = $i( 'acf.' . $field['name'], $field['label'] );
					} elseif ( in_array( $field['type'], self::ACF_TEXT_TYPES, true ) ) {
						$items[] = $t( 'acf.' . $field['name'], $field['label'] );
					}
				}
			}
			if ( $items ) {
				$groups[] = array(
					'label' => 'ACF',
					'items' => array_slice( $items, 0, 80 ),
				);
			}
		}
		return $groups;
	}

	/**
	 * GET /posts?search=&cat=&page=&type= : published entries, newest first.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function search( $request ) {
		$page  = max( 1, (int) $request->get_param( 'page' ) );
		$types = self::public_types();
		$type  = (string) $request->get_param( 'type' );
		if ( ! isset( $types[ $type ] ) ) {
			$type = 'post';
		}
		$args = array(
			'post_type'      => $type,
			'post_status'    => 'publish',
			's'              => sanitize_text_field( (string) $request->get_param( 'search' ) ),
			'paged'          => $page,
			'posts_per_page' => 20,
			// Pickers browse newest-first; link suggestions ask for the best
			// match instead (v1.86.0).
			'orderby'        => 'relevance' === $request->get_param( 'orderby' ) ? 'relevance' : 'date',
			'order'          => 'DESC',
		);
		if ( 'post' === $type && (int) $request->get_param( 'cat' ) ) {
			$args['cat'] = (int) $request->get_param( 'cat' );
		}
		$query = new \WP_Query( $args );
		$items = array();
		foreach ( $query->posts as $post ) {
			$thumb = (string) get_the_post_thumbnail_url( $post, 'thumbnail' );
			list( $cat_names, $cat_ids ) = self::post_terms( $post );
			$items[]                     = array(
				'id'        => $post->ID,
				'title'     => html_entity_decode( get_the_title( $post ), ENT_QUOTES ),
				'date'      => date_i18n( get_option( 'date_format' ), strtotime( $post->post_date ) ),
				'thumb'     => $thumb,
				'url'       => get_permalink( $post ), // Internal-link suggestions (v1.81.1).
				'cats'      => $cat_names,
				'catIds'    => $cat_ids,
				'featured'  => '' !== $thumb,
				// Full-size featured URL (v1.237.0): multi-post galleries
				// tile these, the 150px thumb is preview-only.
				'featuredFull' => '' !== $thumb
					? (string) get_the_post_thumbnail_url( $post, 'full' )
					: '',
				'generated' => (bool) get_post_meta( $post->ID, '_wpie_auto_result', true ),
			);
		}
		return rest_ensure_response(
			array(
				'items' => $items,
				'more'  => (int) $query->max_num_pages > $page,
			)
		);
	}

	/**
	 * GET /posts/types : public post types for the type dropdowns.
	 *
	 * @return \WP_REST_Response
	 */
	public function types() {
		$items = array();
		foreach ( self::public_types() as $slug => $label ) {
			$items[] = array(
				'id'    => $slug,
				'label' => $label,
			);
		}
		return rest_ensure_response( array( 'items' => $items ) );
	}

	/**
	 * GET /posts/categories : filter dropdown for the automation screen and
	 * the studios. `?type=<post type>` (v1.275.1) returns the terms of that
	 * type's category-like taxonomy - product_cat for products - so a
	 * product filter never offers blog categories; without it the blog
	 * categories, as before.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function categories( $request ) {
		$types = self::public_types();
		$type  = (string) $request->get_param( 'type' );
		$tax   = isset( $types[ $type ] ) ? self::category_taxonomy( $type ) : 'category';
		$terms = $tax
			? get_terms(
				array(
					'taxonomy'   => $tax,
					'hide_empty' => true,
				)
			)
			: array();
		if ( is_wp_error( $terms ) ) {
			$terms = array();
		}
		return rest_ensure_response(
			array(
				// array_values: term filters (WooCommerce, SEO plugins) can
				// leave key gaps in get_terms(); array_map preserves them
				// and gappy keys JSON-encode as an OBJECT, which crashed
				// the Featured Images dialog's cats.map (v1.290.2).
				'items' => array_values(
					array_map(
						function ( $term ) {
							return array(
								'id'    => $term->term_id,
								'name'  => html_entity_decode( $term->name, ENT_QUOTES ),
								'count' => (int) $term->count,
							);
						},
						$terms
					)
				),
			)
		);
	}

	/**
	 * GET /feed?url= : an external RSS/Atom feed as normalised repeater
	 * records (v1.278). Runs through core's fetch_feed (SimplePie, WP HTTP
	 * with unsafe-URL rejection) with a 15-minute cache. The structure is
	 * analysed server-side: iTunes podcast tags supply episode covers and
	 * durations, media thumbnails cover YouTube channel feeds, enclosures
	 * and a first-image scan handle plain blog feeds. `kind` reports what
	 * was detected (podcast | youtube | feed) so the UI can say so.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function feed( $request ) {
		$url = esc_url_raw( (string) $request->get_param( 'url' ) );
		if ( ! $url || ! preg_match( '#^https?://#i', $url ) ) {
			return new \WP_Error( 'wpie_bad_feed', __( 'Enter a feed URL (https://…).', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$count = min( 24, max( 1, (int) ( $request->get_param( 'count' ) ?: 12 ) ) );
		// Individual sources (v1.279): a JSON API (web-radio now playing,
		// a headless CMS, any custom endpoint) is analysed structurally
		// and returned as columns + rows for the client-side mapping UI.
		// A short cache keeps now-playing style data fresh.
		$sniff_key = 'wpie_feed_json_' . md5( $url );
		$cached    = get_transient( $sniff_key );
		if ( is_array( $cached ) ) {
			return rest_ensure_response( $cached );
		}
		$raw = wp_safe_remote_get(
			$url,
			array(
				'timeout'             => 10,
				'limit_response_size' => 2 * MB_IN_BYTES,
			)
		);
		if ( ! is_wp_error( $raw ) ) {
			$body  = trim( (string) wp_remote_retrieve_body( $raw ) );
			$first = substr( $body, 0, 1 );
			if ( '{' === $first || '[' === $first ) {
				$json = json_decode( $body, true );
				if ( is_array( $json ) ) {
					$data = self::analyze_json_source( $json, $url, $count );
					set_transient( $sniff_key, $data, 2 * MINUTE_IN_SECONDS );
					return rest_ensure_response( $data );
				}
			}
		}
		if ( ! function_exists( 'fetch_feed' ) ) {
			include_once ABSPATH . WPINC . '/feed.php';
		}
		$fifteen = static function () {
			return 15 * MINUTE_IN_SECONDS;
		};
		add_filter( 'wp_feed_cache_transient_lifetime', $fifteen );
		$feed = fetch_feed( $url );
		remove_filter( 'wp_feed_cache_transient_lifetime', $fifteen );
		if ( is_wp_error( $feed ) ) {
			return new \WP_Error( 'wpie_feed_failed', __( 'The feed could not be loaded.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$itunes = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
		$tag    = static function ( $tags, $attr = '' ) {
			if ( ! is_array( $tags ) || ! isset( $tags[0] ) ) {
				return '';
			}
			if ( '' === $attr ) {
				return (string) ( $tags[0]['data'] ?? '' );
			}
			return (string) ( $tags[0]['attribs'][''][ $attr ] ?? '' );
		};
		$channel_cover = $tag( $feed->get_channel_tags( $itunes, 'image' ), 'href' );
		if ( ! $channel_cover ) {
			$channel_cover = (string) $feed->get_image_url();
		}
		$is_podcast = '' !== $tag( $feed->get_channel_tags( $itunes, 'author' ) ) || '' !== $channel_cover && '' !== $tag( $feed->get_channel_tags( $itunes, 'image' ), 'href' );
		$is_youtube = false !== strpos( $url, 'youtube.com' ) || false !== strpos( (string) $feed->get_permalink(), 'youtube.com' );
		$items      = array();
		foreach ( $feed->get_items( 0, $count ) as $item ) {
			$image = $tag( $item->get_item_tags( $itunes, 'image' ), 'href' );
			if ( ! $image ) {
				$thumb = $item->get_thumbnail();
				$image = is_array( $thumb ) ? (string) ( $thumb['url'] ?? '' ) : '';
			}
			if ( ! $image ) {
				$enc = $item->get_enclosure();
				if ( $enc ) {
					$image = (string) $enc->get_thumbnail();
					if ( ! $image && 0 === strpos( (string) $enc->get_type(), 'image/' ) ) {
						$image = (string) $enc->get_link();
					}
				}
			}
			if ( ! $image && preg_match( '/<img[^>]+src=["\']([^"\']+)["\']/i', (string) $item->get_content(), $m ) ) {
				$image = $m[1];
			}
			if ( ! $image ) {
				$image = $channel_cover;
			}
			$duration = $tag( $item->get_item_tags( $itunes, 'duration' ) );
			if ( '' !== $duration && ctype_digit( $duration ) ) {
				// Plain seconds → m:ss / h:mm:ss.
				$s        = (int) $duration;
				$duration = $s >= 3600
					? sprintf( '%d:%02d:%02d', floor( $s / 3600 ), floor( ( $s % 3600 ) / 60 ), $s % 60 )
					: sprintf( '%d:%02d', floor( $s / 60 ), $s % 60 );
			}
			$cat     = $item->get_category();
			$author  = $item->get_author();
			$stamp   = $item->get_date( 'U' );
			$items[] = array(
				'title'    => html_entity_decode( wp_strip_all_tags( (string) $item->get_title() ), ENT_QUOTES ),
				// esc_url_raw like `image` below, and for the same reason:
				// this comes out of a stranger's feed. Nothing renders it as a
				// link TODAY - a repeater draws onto the canvas, where a URL is
				// just text - but the day somebody adds a "read more" the trap
				// would already be set. It is the trap the stock credits walked
				// into (4e3915e4).
				'url'      => esc_url_raw( (string) $item->get_permalink() ),
				'date'     => $stamp ? date_i18n( get_option( 'date_format' ), (int) $stamp ) : '',
				'text'     => wp_trim_words( html_entity_decode( wp_strip_all_tags( (string) $item->get_description() ), ENT_QUOTES ), 40, '…' ),
				'author'   => $author ? html_entity_decode( wp_strip_all_tags( (string) $author->get_name() ), ENT_QUOTES ) : '',
				'image'    => esc_url_raw( $image ),
				'duration' => $duration,
				'category' => $cat ? html_entity_decode( (string) $cat->get_label(), ENT_QUOTES ) : '',
			);
		}
		return rest_ensure_response(
			array(
				'title' => html_entity_decode( wp_strip_all_tags( (string) $feed->get_title() ), ENT_QUOTES ),
				'image' => esc_url_raw( $channel_cover ),
				'kind'  => $is_podcast ? 'podcast' : ( $is_youtube ? 'youtube' : 'feed' ),
				'items' => $items,
			)
		);
	}

	/**
	 * Structure analysis for a JSON source (v1.279): find the record set,
	 * flatten it to columns + rows, ready for the client-side mapping UI.
	 *
	 * - Root array of objects: that IS the record set.
	 * - Root object: the largest array of objects within (depth <= 3)
	 *   wins - the common `{ items: [...] }` / `{ data: { posts: [...] } }`
	 *   API shapes.
	 * - Nothing array-like: the object itself becomes ONE record (the
	 *   web-radio now-playing case), nested values flattened to dot
	 *   paths (`now_playing.title`).
	 *
	 * @param array  $json  Decoded JSON.
	 * @param string $url   Source URL (host becomes the title).
	 * @param int    $count Row cap.
	 * @return array Normalised payload { kind, title, columns, rows }.
	 */
	private static function analyze_json_source( $json, $url, $count ) {
		$rows_raw = null;
		$is_list  = static function ( $value ) {
			return is_array( $value ) && array_values( $value ) === $value;
		};
		if ( $is_list( $json ) && isset( $json[0] ) && is_array( $json[0] ) ) {
			$rows_raw = $json;
		} else {
			// Breadth-first hunt for the largest array of objects.
			$best  = null;
			$queue = array( array( $json, 0 ) );
			while ( $queue ) {
				list( $node, $depth ) = array_shift( $queue );
				if ( ! is_array( $node ) || $depth > 3 ) {
					continue;
				}
				foreach ( $node as $value ) {
					if ( $is_list( $value ) && isset( $value[0] ) && is_array( $value[0] ) ) {
						if ( null === $best || count( $value ) > count( $best ) ) {
							$best = $value;
						}
					} elseif ( is_array( $value ) ) {
						$queue[] = array( $value, $depth + 1 );
					}
				}
			}
			$rows_raw = $best ? $best : array( $json );
		}
		$flatten = static function ( $node, $prefix, &$out, $depth ) use ( &$flatten ) {
			foreach ( (array) $node as $key => $value ) {
				if ( count( $out ) >= 40 ) {
					return;
				}
				$path = '' === $prefix ? (string) $key : $prefix . '.' . $key;
				if ( is_scalar( $value ) || null === $value ) {
					$out[ $path ] = null === $value ? '' : (string) $value;
				} elseif ( is_array( $value ) && $depth < 3 ) {
					$scalars = array_filter( $value, 'is_scalar' );
					if ( count( $scalars ) === count( $value ) && array_values( $value ) === $value ) {
						$out[ $path ] = implode( ', ', array_map( 'strval', $value ) );
					} else {
						$flatten( $value, $path, $out, $depth + 1 );
					}
				}
			}
		};
		$rows    = array();
		$columns = array();
		foreach ( array_slice( $rows_raw, 0, $count ) as $row_raw ) {
			$flat = array();
			$flatten( is_array( $row_raw ) ? $row_raw : array( 'value' => $row_raw ), '', $flat, 0 );
			// Values become plain text; HTML from CMS APIs is stripped.
			foreach ( $flat as $key => $value ) {
				$flat[ $key ] = html_entity_decode( wp_strip_all_tags( $value ), ENT_QUOTES );
				if ( ! in_array( $key, $columns, true ) ) {
					$columns[] = $key;
				}
			}
			$rows[] = $flat;
		}
		return array(
			'kind'    => 'data',
			'title'   => (string) wp_parse_url( $url, PHP_URL_HOST ),
			'columns' => $columns,
			'rows'    => $rows,
		);
	}

	/**
	 * GET /reviews : approved WooCommerce product reviews and/or plain post
	 * comments as testimonial records (v1.275.2). `kind` review|comment|all,
	 * `min_rating` 0..5 (comments carry no rating and drop out once a
	 * minimum is set), `orderby` date|rating, `count` <= 24. No commenter
	 * e-mail addresses leave the server - only name, avatar URL and text.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function reviews( $request ) {
		$count = min( 24, max( 1, (int) ( $request->get_param( 'count' ) ?: 6 ) ) );
		$kind  = (string) $request->get_param( 'kind' );
		if ( ! in_array( $kind, array( 'review', 'comment', 'all' ), true ) ) {
			$kind = 'review';
		}
		$min     = max( 0, min( 5, (int) $request->get_param( 'min_rating' ) ) );
		$orderby = 'rating' === (string) $request->get_param( 'orderby' ) ? 'rating' : 'date';
		$types   = array();
		if ( 'review' === $kind || 'all' === $kind ) {
			$types[] = 'review';
		}
		if ( 'comment' === $kind || 'all' === $kind ) {
			$types[] = 'comment';
		}
		$comments = get_comments(
			array(
				'status'      => 'approve',
				'type__in'    => $types,
				// Only comments on posts the whole world can already read.
				// Without this a testimonial card happily quoted a comment
				// from a private or scheduled post, title and featured
				// image included. (F-L38, 2026-07-25 audit)
				'post_status' => 'publish',
				// A generous pool; rating/content filtering trims it below.
				'number'      => 80,
				'orderby'     => 'comment_date_gmt',
				'order'       => 'DESC',
			)
		);
		$items = array();
		foreach ( $comments as $comment ) {
			$text = trim( wp_strip_all_tags( $comment->comment_content ) );
			if ( '' === $text ) {
				continue;
			}
			// Published but password protected, or sitting on a non-public
			// post type, is still not public.
			$post = get_post( (int) $comment->comment_post_ID );
			$type = $post ? get_post_type_object( $post->post_type ) : null;
			if ( ! $post || ! $type || empty( $type->public ) || '' !== (string) $post->post_password ) {
				continue;
			}
			$rating = (int) get_comment_meta( $comment->comment_ID, 'rating', true );
			if ( $min && $rating < $min ) {
				continue;
			}
			$items[] = array(
				'author' => html_entity_decode( $comment->comment_author, ENT_QUOTES ),
				// default 404: a missing gravatar FAILS instead of sending
				// the grey placeholder, so card designs can fall back to
				// their own initials disc.
				'avatar' => (string) get_avatar_url(
					$comment,
					array(
						'size'    => 256,
						'default' => '404',
					)
				),
				'rating' => $rating,
				'text'   => wp_trim_words( $text, 42, '…' ),
				'date'   => date_i18n( get_option( 'date_format' ), strtotime( $comment->comment_date ) ),
				'title'  => $post ? html_entity_decode( get_the_title( $post ), ENT_QUOTES ) : '',
				'image'  => $post ? (string) get_the_post_thumbnail_url( $post, 'full' ) : '',
			);
		}
		if ( 'rating' === $orderby ) {
			usort(
				$items,
				static function ( $a, $b ) {
					return $b['rating'] <=> $a['rating'];
				}
			);
		}
		return rest_ensure_response( array( 'items' => array_slice( $items, 0, $count ) ) );
	}

	/**
	 * GET /users : site users as team records (v1.275.2). `roles` is a
	 * comma list (defaults to the content roles), `count` <= 24. Exposes
	 * display name, translated role, bio, avatar URL and published-post
	 * count - never logins or e-mail addresses.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function users( $request ) {
		$count = min( 24, max( 1, (int) ( $request->get_param( 'count' ) ?: 8 ) ) );
		// Team-roster cards only ever surface content roles; intersect the
		// client list with a fixed allowlist so a caller cannot enumerate
		// arbitrary or custom roles by passing them in. (WPIE-024)
		// Which accounts hold administrator is exactly the mapping an
		// attacker wants, and the avatar URL carries the e-mail hash with
		// it. WP core refuses the same query without `list_users`, so this
		// route does too; content roles stay open to every editor user.
		// (F-L37, 2026-07-25 audit)
		$allowed = array( 'editor', 'author', 'contributor', 'shop_manager' );
		$default = array( 'editor', 'author', 'shop_manager' );
		if ( current_user_can( 'list_users' ) ) {
			array_unshift( $allowed, 'administrator' );
			array_unshift( $default, 'administrator' );
		}
		$roles = array_values(
			array_intersect(
				array_filter( array_map( 'sanitize_key', explode( ',', (string) $request->get_param( 'roles' ) ) ) ),
				$allowed
			)
		);
		if ( ! $roles ) {
			$roles = $default;
		}
		$users      = get_users(
			array(
				'role__in' => $roles,
				'orderby'  => 'display_name',
				'order'    => 'ASC',
				'number'   => $count,
			)
		);
		$role_names = wp_roles()->role_names;
		$items      = array();
		foreach ( $users as $user ) {
			$role    = (string) ( $user->roles[0] ?? '' );
			$items[] = array(
				'name'   => html_entity_decode( $user->display_name, ENT_QUOTES ),
				'role'   => isset( $role_names[ $role ] ) ? translate_user_role( $role_names[ $role ] ) : $role,
				'bio'    => wp_trim_words( wp_strip_all_tags( (string) get_user_meta( $user->ID, 'description', true ) ), 32, '…' ),
				// default 404: see reviews() - lets cards show initials.
				'avatar' => (string) get_avatar_url(
					$user->ID,
					array(
						'size'    => 512,
						'default' => '404',
					)
				),
				'posts'  => (int) count_user_posts( $user->ID, 'post', true ),
				'url'    => (string) $user->user_url,
			);
		}
		return rest_ensure_response( array( 'items' => $items ) );
	}

	/**
	 * GET /posts/table : rows for the Chart & Table Studio import - one
	 * query plus the shared binding resolver instead of N context round
	 * trips. `fields` is a comma list of binding ids (plus meta.<key>).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function table( $request ) {
		$types = self::public_types();
		$type  = (string) $request->get_param( 'type' );
		if ( ! isset( $types[ $type ] ) ) {
			$type = 'post';
		}
		$count   = min( 50, max( 1, (int) ( $request->get_param( 'count' ) ?: 10 ) ) );
		$order   = 'asc' === strtolower( (string) $request->get_param( 'order' ) ) ? 'ASC' : 'DESC';
		$orderby = (string) $request->get_param( 'orderby' );
		if ( ! in_array( $orderby, array( 'date', 'title', 'modified', 'meta_value_num' ), true ) ) {
			$orderby = 'date';
		}
		// 14 since v1.285: the Showcase Studio product row carries 13
		// fields once review count + stock quantity ride along.
		$fields = array_slice(
			array_filter( array_map( 'trim', explode( ',', (string) $request->get_param( 'fields' ) ) ) ),
			0,
			14
		);
		if ( ! $fields ) {
			$fields = array( 'post.title', 'post.date' );
		}
		$meta_keys = array();
		foreach ( $fields as $field ) {
			if ( 0 === strpos( $field, 'meta.' ) ) {
				$meta_keys[] = substr( $field, 5 );
			}
		}
		$args = array(
			'post_type'      => $type,
			'post_status'    => 'publish',
			's'              => sanitize_text_field( (string) $request->get_param( 'search' ) ),
			'posts_per_page' => $count,
			'orderby'        => $orderby,
			'order'          => $order,
		);
		// Filters (v1.271): date range, author, any public taxonomy,
		// post-meta comparison (protected meta blocked) and an offset.
		$offset = min( 500, max( 0, (int) $request->get_param( 'offset' ) ) );
		if ( $offset ) {
			$args['offset'] = $offset;
		}
		$author = (int) $request->get_param( 'author' );
		if ( $author ) {
			$args['author'] = $author;
		}
		$date_q = array( 'inclusive' => true );
		foreach ( array( 'date_after' => 'after', 'date_before' => 'before' ) as $param => $key ) {
			$value = (string) $request->get_param( $param );
			if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) ) {
				$date_q[ $key ] = $value;
			}
		}
		if ( count( $date_q ) > 1 ) {
			$args['date_query'] = array( $date_q );
		}
		$meta_key     = preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) $request->get_param( 'meta_key' ) );
		$meta_value   = (string) $request->get_param( 'meta_value' );
		$meta_compare = (string) $request->get_param( 'meta_compare' );
		if ( ! in_array( $meta_compare, array( '=', '!=', '>', '>=', '<', '<=', 'LIKE' ), true ) ) {
			$meta_compare = '=';
		}
		if ( '' !== $meta_key && is_protected_meta( $meta_key, 'post' ) ) {
			// Never let the import filter probe hidden meta.
			return rest_ensure_response(
				array(
					'fields' => array_values( $fields ),
					'rows'   => array(),
					'total'  => 0,
				)
			);
		}
		if ( '' !== $meta_key && '' !== $meta_value ) {
			$args['meta_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
				array(
					'key'     => $meta_key,
					'value'   => $meta_value,
					'compare' => $meta_compare,
					'type'    => is_numeric( $meta_value ) ? 'NUMERIC' : 'CHAR',
				),
			);
		}
		if ( 'meta_value_num' === $orderby ) {
			if ( '' === $meta_key ) {
				$args['orderby'] = 'date';
			} else {
				$args['meta_key'] = $meta_key; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			}
		}
		// Product conveniences (v1.275.2): rating/sales/price sorting and
		// on-sale / in-stock flags resolve to the internal WooCommerce meta
		// SERVER-side, so the protected-meta guard on the client-facing
		// meta filter stays intact.
		$wc_orderby = array(
			'rating' => '_wc_average_rating',
			'sales'  => 'total_sales',
			'price'  => '_price',
		);
		$orderby_raw = (string) $request->get_param( 'orderby' );
		if ( 'product' === $type && isset( $wc_orderby[ $orderby_raw ] ) ) {
			$args['orderby']  = 'meta_value_num';
			$args['meta_key'] = $wc_orderby[ $orderby_raw ]; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		}
		if ( 'product' === $type && 'sales_week' === $orderby_raw ) {
			// Bestsellers of the LAST 7 DAYS (v1.280) from WooCommerce's
			// analytics lookup table; total_sales only knows all-time.
			global $wpdb;
			$lookup = $wpdb->prefix . 'wc_order_product_lookup';
			$week   = array();
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $lookup ) ) === $lookup ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
				$week = array_map(
					'intval',
					// phpcs:ignore PluginCheck.Security.DirectDB.UnescapedDBParameter -- $lookup is a hardcoded table name ( $wpdb->prefix . literal ), not user input.
					$wpdb->get_col(
						$wpdb->prepare(
							// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
							"SELECT product_id FROM {$lookup} WHERE date_created >= %s GROUP BY product_id ORDER BY SUM(product_qty) DESC LIMIT 48",
							gmdate( 'Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS )
						)
					)
				);
			}
			if ( $week ) {
				$args['post__in'] = isset( $args['post__in'] )
					? array_values( array_intersect( $week, $args['post__in'] ) )
					: $week;
				$args['post__in'] = $args['post__in'] ? $args['post__in'] : array( 0 );
				$args['orderby']  = 'post__in';
			}
			// No sales this week: fall back to the date order already set.
		}
		$flags = array_filter( array_map( 'trim', explode( ',', (string) $request->get_param( 'flags' ) ) ) );
		if ( 'product' === $type && $flags ) {
			if ( in_array( 'onsale', $flags, true ) && function_exists( 'wc_get_product_ids_on_sale' ) ) {
				$sale_ids = array_map( 'intval', (array) wc_get_product_ids_on_sale() );
				// Intersect with a ranking's post__in (weekly bestsellers)
				// instead of clobbering it; keep ITS order.
				if ( isset( $args['post__in'] ) ) {
					$sale_ids = array_values( array_intersect( $args['post__in'], $sale_ids ) );
				}
				$args['post__in'] = $sale_ids ? $sale_ids : array( 0 );
			}
			if ( in_array( 'instock', $flags, true ) ) {
				$args['meta_query'][] = array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					'key'   => '_stock_status',
					'value' => 'instock',
				);
			}
		}
		// Hand-picked entries (v1.281): `include` is a comma list of post
		// ids in DISPLAY ORDER; it replaces every ranking and filter - the
		// user chose exactly these, in exactly this order.
		$include = array_filter( array_map( 'absint', explode( ',', (string) $request->get_param( 'include' ) ) ) );
		if ( $include ) {
			$args['post__in']       = array_values( $include );
			$args['orderby']        = 'post__in';
			$args['posts_per_page'] = count( $include );
			unset( $args['s'], $args['meta_key'] );
		}
		$term      = (int) $request->get_param( 'term' );
		$tax_param = sanitize_key( (string) $request->get_param( 'tax' ) );
		$cat       = (int) $request->get_param( 'cat' );
		$tax_query = array();
		if ( $term && $tax_param && taxonomy_exists( $tax_param ) ) {
			$tax_query[] = array(
				'taxonomy' => $tax_param,
				'terms'    => $term,
			);
		}
		$cat_tax = self::category_taxonomy( $type );
		if ( $cat && $cat_tax ) {
			$tax_query[] = array(
				'taxonomy' => $cat_tax,
				'terms'    => $cat,
			);
		}
		if ( $tax_query ) {
			$args['tax_query'] = $tax_query; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		}
		$query = new \WP_Query( $args );
		$rows  = array();
		foreach ( $query->posts as $post ) {
			$map    = self::fields_for( $post, $meta_keys );
			$rows[] = array_map(
				static function ( $field ) use ( $map ) {
					return (string) ( $map[ $field ] ?? '' );
				},
				$fields
			);
		}
		return rest_ensure_response(
			array(
				'fields' => array_values( $fields ),
				'rows'   => $rows,
				'total'  => (int) $query->found_posts,
			)
		);
	}

	/** Plain-text money string (WooCommerce HTML stripped). */
	private static function wc_money( $value ) {
		if ( '' === (string) $value || ! function_exists( 'wc_price' ) ) {
			return '';
		}
		return trim( html_entity_decode( wp_strip_all_tags( wc_price( (float) $value ) ), ENT_QUOTES ) );
	}

	/** Human stock label; WooCommerce's own options list when available. */
	private static function wc_stock_label( $product ) {
		$status  = (string) $product->get_stock_status();
		$options = function_exists( 'wc_get_product_stock_status_options' )
			? wc_get_product_stock_status_options()
			: array();
		return (string) ( $options[ $status ] ?? $status );
	}

	/** WooCommerce field map for a product post ('' values hide layers). */
	private static function wc_fields( $post ) {
		if ( 'product' !== $post->post_type || ! function_exists( 'wc_get_product' ) ) {
			return array();
		}
		$product = wc_get_product( $post->ID );
		if ( ! $product ) {
			return array();
		}
		$on_sale = $product->is_on_sale();
		$regular = (float) $product->get_regular_price();
		$sale    = (float) $product->get_sale_price();
		$rating  = (float) $product->get_average_rating();
		list( $cat_names ) = self::post_terms( $post );
		// Social-proof fields (v1.277): urgency and trust values for
		// badges and showcases. '' hides the bound layer, so a "low
		// stock" badge only exists while stock actually is low.
		$reviews  = (int) $product->get_review_count();
		$qty      = $product->managing_stock() ? $product->get_stock_quantity() : null;
		$low_at   = function_exists( 'wc_get_low_stock_amount' )
			? (int) wc_get_low_stock_amount( $product )
			: 2;
		$sale_to  = $product->get_date_on_sale_to();
		$low_text = '';
		if ( null !== $qty && $qty > 0 && $qty <= max( 1, $low_at ) ) {
			/* translators: %d: units left in stock. */
			$low_text = sprintf( _n( 'Only %d left', 'Only %d left', $qty, 'wunderpaint' ), $qty );
		}
		return array(
			'wc.name'          => $product->get_name(),
			'wc.price'         => self::wc_money( $product->get_price() ),
			'wc.regular_price' => $on_sale && $regular > 0 ? self::wc_money( $regular ) : '',
			'wc.discount'      => $on_sale && $regular > 0 && $sale > 0
				? '-' . round( ( ( $regular - $sale ) / $regular ) * 100 ) . '%'
				: '',
			'wc.short_desc'    => wp_trim_words( wp_strip_all_tags( $product->get_short_description() ), 40, '…' ),
			'wc.category'      => (string) ( $cat_names[0] ?? '' ),
			'wc.sku'           => (string) $product->get_sku(),
			'wc.stock'         => self::wc_stock_label( $product ),
			'wc.rating'        => $rating > 0 ? number_format_i18n( $rating, 1 ) : '',
			'wc.review_count'  => $reviews > 0 ? number_format_i18n( $reviews ) : '',
			'wc.stock_qty'     => null !== $qty && $qty >= 0 ? number_format_i18n( $qty ) : '',
			'wc.low_stock'     => $low_text,
			'wc.sale_ends'     => $on_sale && $sale_to
				? date_i18n( get_option( 'date_format' ), $sale_to->getTimestamp() )
				: '',
			'wc.image'         => (string) get_the_post_thumbnail_url( $post, 'full' ),
		);
	}

	/**
	 * Inline images from the post body, in document order (v1.237.0).
	 * Feeds multi-image generators (3D Gallery Studio): `wp-image-N`
	 * classes and classic `[gallery ids="…"]` shortcodes resolve to the
	 * full-size attachment URL, plain `<img src>` tags pass through. The
	 * featured image is excluded (consumers merge it themselves) and the
	 * scan is bounded so a pathological post body cannot hurt the server.
	 *
	 * @param \WP_Post $post  Post.
	 * @param int      $limit Maximum number of URLs.
	 * @return array Absolute image URLs.
	 */
	private static function content_images( $post, $limit = 24 ) {
		$html = substr( (string) $post->post_content, 0, 200000 );
		if ( '' === trim( $html ) ) {
			return array();
		}
		$featured_id  = (int) get_post_thumbnail_id( $post );
		$featured_url = (string) get_the_post_thumbnail_url( $post, 'full' );
		$out          = array();
		$seen         = array();
		$push         = function ( $url ) use ( &$out, &$seen, $featured_url, $limit ) {
			$url = (string) $url;
			if (
				'' === $url ||
				isset( $seen[ $url ] ) ||
				$url === $featured_url ||
				count( $out ) >= $limit ||
				! preg_match( '#^https?://#i', $url )
			) {
				return;
			}
			$seen[ $url ] = true;
			$out[]        = $url;
		};
		preg_match_all( '#<img\b[^>]*>|\[gallery\b[^\]]*\]#i', $html, $matches );
		foreach ( $matches[0] as $tag ) {
			if ( count( $out ) >= $limit ) {
				break;
			}
			if ( '[' === $tag[0] ) {
				if ( preg_match( '/\bids\s*=\s*["\']?([0-9,\s]+)/i', $tag, $m ) ) {
					foreach ( array_filter( array_map( 'absint', explode( ',', $m[1] ) ) ) as $id ) {
						if ( $id !== $featured_id ) {
							$push( (string) wp_get_attachment_image_url( $id, 'full' ) );
						}
					}
				}
				continue;
			}
			if ( preg_match( '/\bwp-image-(\d+)/', $tag, $m ) ) {
				$id = absint( $m[1] );
				if ( $id === $featured_id ) {
					continue;
				}
				$url = $id ? (string) wp_get_attachment_image_url( $id, 'full' ) : '';
				if ( '' !== $url ) {
					$push( $url );
					continue;
				}
			}
			if ( preg_match( '/\bsrc\s*=\s*["\']([^"\']+)["\']/i', $tag, $m ) ) {
				$push( $m[1] );
			}
		}
		return $out;
	}

	/**
	 * WooCommerce product-gallery URLs (v1.237.0). Raw `_product_image_gallery`
	 * meta like Pro's automation endpoint, so it works even where the WC
	 * runtime is not loaded; non-products return an empty list.
	 *
	 * @param \WP_Post $post  Post.
	 * @param int      $limit Maximum number of URLs.
	 * @return array Full-size attachment URLs.
	 */
	private static function product_gallery_images( $post, $limit = 24 ) {
		if ( 'product' !== $post->post_type ) {
			return array();
		}
		$ids = array_filter(
			array_map(
				'absint',
				explode( ',', (string) get_post_meta( $post->ID, '_product_image_gallery', true ) )
			)
		);
		$out = array();
		foreach ( array_slice( $ids, 0, $limit ) as $id ) {
			$url = (string) wp_get_attachment_image_url( $id, 'full' );
			if ( '' !== $url ) {
				$out[] = $url;
			}
		}
		return $out;
	}

	/** ACF field map for a post (text types + image URLs). */
	private static function acf_fields( $post ) {
		if ( ! function_exists( 'get_field_objects' ) ) {
			return array();
		}
		$out = array();
		foreach ( (array) get_field_objects( $post->ID ) as $field ) {
			if ( empty( $field['name'] ) ) {
				continue;
			}
			$value = $field['value'];
			if ( 'image' === $field['type'] ) {
				if ( is_array( $value ) && ! empty( $value['url'] ) ) {
					$value = $value['url'];
				} elseif ( is_numeric( $value ) ) {
					$value = (string) wp_get_attachment_image_url( (int) $value, 'full' );
				}
				$out[ 'acf.' . $field['name'] ] = is_string( $value ) ? $value : '';
				continue;
			}
			if ( ! in_array( $field['type'], self::ACF_TEXT_TYPES, true ) ) {
				continue;
			}
			if ( 'true_false' === $field['type'] ) {
				// A truthy flag shows the field's own label (badge pattern),
				// falsy hides the bound layer.
				$out[ 'acf.' . $field['name'] ] = $value ? (string) $field['label'] : '';
				continue;
			}
			if ( is_array( $value ) ) {
				$value = implode( ', ', array_filter( array_map( 'strval', $value ) ) );
			}
			$out[ 'acf.' . $field['name'] ] = wp_strip_all_tags( (string) $value );
		}
		return $out;
	}

	/**
	 * The complete binding-field map for a post (v1.157.0, extracted from
	 * context() so server-side consumers - Pro's live SVG badges - can
	 * resolve the same values without the REST round trip).
	 *
	 * @param \WP_Post $post      Post.
	 * @param array    $meta_keys Additional post-meta keys → `meta.<key>`.
	 * @return array Field map (binding id => string value).
	 */
	public static function fields_for( $post, $meta_keys = array() ) {
		list( $cat_names ) = self::post_terms( $post );
		if ( has_excerpt( $post ) ) {
			$excerpt = wp_strip_all_tags( $post->post_excerpt );
		} else {
			$excerpt = wp_trim_words( wp_strip_all_tags( strip_shortcodes( $post->post_content ) ), 40, '…' );
		}
		$logo_id = (int) get_theme_mod( 'custom_logo' );
		$plain   = wp_strip_all_tags( strip_shortcodes( (string) $post->post_content ) );
		$words   = count( preg_split( '/\s+/', trim( $plain ), -1, PREG_SPLIT_NO_EMPTY ) );
		// Body text as a bindable source (v1.232): plain text with paragraph
		// breaks kept, capped at a word boundary - the layer's fit range
		// shrinks/ellipsizes further to whatever the box can hold. Block ends
		// become line breaks first, so builder markup without whitespace
		// between tags does not glue heading and paragraph together.
		$content = strip_shortcodes( (string) $post->post_content );
		$content = preg_replace( '#</(p|h[1-6]|li|blockquote|div|figcaption|pre|tr)>#i', "</$1>\n", $content );
		$content = preg_replace( '#<br\s*/?>#i', "\n", $content );
		$content = wp_strip_all_tags( $content );
		$content = trim( preg_replace( "/[ \t]*\n[ \t]*/", "\n", preg_replace( "/\n{3,}/", "\n\n", $content ) ) );
		if ( mb_strlen( $content ) > 1500 ) {
			$content = preg_replace( '/\s+\S*$/u', '', mb_substr( $content, 0, 1500 ) ) . '…';
		}
		// "Last updated" only when it differs from the publish date; a badge
		// that repeats the publish date says nothing, '' hides the layer.
		$modified  = date_i18n( get_option( 'date_format' ), strtotime( $post->post_modified ) );
		$published = date_i18n( get_option( 'date_format' ), strtotime( $post->post_date ) );
		$tags      = get_the_terms( $post->ID, 'product' === $post->post_type ? 'product_tag' : 'post_tag' );

		$fields = array(
			'post.title'       => html_entity_decode( get_the_title( $post ), ENT_QUOTES ),
			'post.excerpt'     => html_entity_decode( $excerpt, ENT_QUOTES ),
			'post.content'     => html_entity_decode( $content, ENT_QUOTES ),
			'post.url'         => (string) get_permalink( $post ),
			'post.category'    => (string) ( $cat_names[0] ?? '' ),
			'post.tags'        => is_array( $tags )
				? implode( ', ', array_map( 'html_entity_decode', wp_list_pluck( $tags, 'name' ) ) )
				: '',
			'post.date'        => $published,
			'post.modified'    => $modified !== $published ? $modified : '',
			'post.readingTime' => $words
				/* translators: %d: estimated reading time in minutes. */
				? sprintf( __( '%d min', 'wunderpaint' ), max( 1, (int) round( $words / 200 ) ) )
				: '',
			'post.featured'    => (string) get_the_post_thumbnail_url( $post, 'full' ),
			'author.name'      => (string) get_the_author_meta( 'display_name', $post->post_author ),
			'author.bio'       => wp_strip_all_tags( (string) get_the_author_meta( 'description', $post->post_author ) ),
			'author.avatar'    => (string) get_avatar_url( (int) $post->post_author, array( 'size' => 512 ) ),
			'site.name'        => get_bloginfo( 'name' ),
			'site.tagline'     => get_bloginfo( 'description' ),
			'site.url'         => (string) wp_parse_url( home_url(), PHP_URL_HOST ),
			'site.logo'        => $logo_id ? (string) wp_get_attachment_image_url( $logo_id, 'full' ) : '',
		);
		$fields = array_merge( $fields, self::wc_fields( $post ), self::acf_fields( $post ) );

		// Custom-field bindings: the client sends the keys its layers use.
		// Protected meta (`_`-prefixed and anything flagged via the
		// is_protected_meta filter) is skipped so an editor user can never use
		// this binding resolver to read internal meta that WordPress hides from
		// the REST API (e.g. other plugins' private post meta).
		foreach ( array_slice( (array) $meta_keys, 0, 40 ) as $key ) {
			$key = preg_replace( '/[^A-Za-z0-9_\-]/', '', $key );
			if ( '' === $key || is_protected_meta( $key, 'post' ) ) {
				continue;
			}
			$value = get_post_meta( $post->ID, $key, true );
			// Media-array tolerance (v1.314.1): many field frameworks
			// store single images as { id, url } style arrays. Unwrapping
			// the conventional keys is format-agnostic - we never parse a
			// specific framework's shape beyond these two.
			if ( is_array( $value ) ) {
				if ( isset( $value['url'] ) && is_scalar( $value['url'] ) ) {
					$value = $value['url'];
				} elseif ( isset( $value['id'] ) && is_numeric( $value['id'] ) ) {
					$value = $value['id'];
				}
			}
			// Image fields the WordPress-standard way (v1.314): a purely
			// numeric value that is an image attachment (SVG included)
			// resolves to its URL, so meta image bindings and per-post AI
			// references work with any framework that stores an ID or URL.
			if ( is_numeric( $value ) && 0 === strpos( (string) get_post_mime_type( (int) $value ), 'image/' ) ) {
				$url = wp_get_attachment_image_url( (int) $value, 'full' );
				$fields[ 'meta.' . $key ] = (string) ( $url ? $url : wp_get_attachment_url( (int) $value ) );
				continue;
			}
			$fields[ 'meta.' . $key ] = is_scalar( $value ) ? wp_strip_all_tags( (string) $value ) : '';
		}
		return $fields;
	}

	/**
	 * GET /posts/{id}/context : everything the binding resolver consumes.
	 * `?meta=key1,key2` additionally resolves those post-meta keys into
	 * `fields` as `meta.<key>` (the "Custom field" binding).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function context( $request ) {
		$post = get_post( (int) $request['id'] );
		$type = $post ? get_post_type_object( $post->post_type ) : null;
		// `publish` is not a read permission. Password protected posts are
		// published too, and so are non public post types such as WooCommerce
		// coupons, whose post_title IS the coupon code. Ask the capability
		// system instead. (F-M02, 2026-07-25 audit)
		if ( ! $post
			|| ! $type
			|| empty( $type->public )
			|| ! current_user_can( 'read_post', $post->ID )
			|| ( post_password_required( $post ) && ! current_user_can( 'edit_post', $post->ID ) ) ) {
			return new \WP_Error( 'wpie_no_post', __( 'Post not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		list( $cat_names ) = self::post_terms( $post );
		$meta_keys = array_filter( array_map( 'trim', explode( ',', (string) $request->get_param( 'meta' ) ) ) );
		$fields    = self::fields_for( $post, $meta_keys );

		return rest_ensure_response(
			array(
				'id'          => $post->ID,
				// Legacy top-level keys (pre-1.60 bindings + prompts).
				'title'       => $fields['post.title'],
				'excerpt'     => $fields['post.excerpt'],
				// Plain-text body for AI prompts ("From Post", v1.77).
				'content'     => mb_substr( wp_strip_all_tags( strip_shortcodes( (string) $post->post_content ) ), 0, 1500 ),
				'author'      => $fields['author.name'],
				'category'    => $fields['post.category'],
				'categories'  => $cat_names,
				'date'        => $fields['post.date'],
				'featuredUrl' => $fields['post.featured'],
				'siteName'    => $fields['site.name'],
				'fields'      => $fields,
				// Multi-image sources (v1.237.0, extension API 2.7.0):
				// inline body images and the WooCommerce product gallery,
				// consumed by gallery-style generators via ctx.images.
				'images'      => array(
					'featured' => $fields['post.featured'],
					'content'  => self::content_images( $post ),
					'gallery'  => self::product_gallery_images( $post ),
				),
			)
		);
	}
}
