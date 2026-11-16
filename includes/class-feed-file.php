<?php
/**
 * Size-bounded WordPress transport for external repeater feeds.
 *
 * Loaded from wp_feed_options after WordPress has loaded the parent class.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/** Preserve WordPress' HTTP and header handling with a bounded response. */
class Feed_File extends \WP_SimplePie_File {

	/**
	 * Fetch a feed, including requests made by SimplePie autodiscovery.
	 *
	 * @param string       $url             Remote URL.
	 * @param int          $timeout         Timeout in seconds.
	 * @param int          $redirects       Allowed redirects.
	 * @param string|array $headers         Request headers.
	 * @param string       $useragent       User agent.
	 * @param bool         $force_fsockopen Legacy transport flag.
	 */
	public function __construct( $url, $timeout = 10, $redirects = 5, $headers = null, $useragent = null, $force_fsockopen = false ) {
		$bounded = static function ( $args ) {
			$limit                      = (int) ( $args['limit_response_size'] ?? 0 );
			$args['limit_response_size'] = $limit > 0 ? min( $limit, Post_Data::MAX_FEED_BYTES + 1 ) : Post_Data::MAX_FEED_BYTES + 1;
			return $args;
		};
		// This filter lives only for this transport call, never for unrelated
		// WordPress feeds or subsequent HTTP requests in the same process.
		add_filter( 'http_request_args', $bounded, PHP_INT_MAX );
		try {
			parent::__construct( $url, min( 10, $timeout ), $redirects, $headers, $useragent, $force_fsockopen );
		} finally {
			remove_filter( 'http_request_args', $bounded, PHP_INT_MAX );
		}
		// Check the returned bytes too, including decompressed responses and
		// responses supplied by another plugin through pre_http_request.
		if ( strlen( (string) $this->body ) > Post_Data::MAX_FEED_BYTES ) {
			$this->body    = '';
			$this->error   = 'Feed exceeds the response size limit.';
			$this->success = false;
		}
	}
}
