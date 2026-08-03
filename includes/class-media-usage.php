<?php
/**
 * Media usage engine: where is this attachment actually used?
 *
 * Replaces the best-effort guess that fed the "Unused" smart folder since
 * v1.189.0 (featured images plus a wp-image-N regex over 500 posts). On a
 * builder site that guess scans almost nothing: measured on the dev install it
 * looked at 5 posts while ignoring 445 Elementor documents, and reported 27
 * demonstrably live images as unused.
 *
 * Two access shapes:
 *
 *   find_for( id )   live lookup for one image, always fresh, no scan needed
 *   run_chunk()      the full sweep, resumable, one slice per request
 *
 * The sweep writes into `_wpie_usage_run` and only promotes that to
 * `_wpie_usage_count` when a run completes, so the previous verdict stays
 * valid for the whole duration instead of the library briefly looking
 * completely unused.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

require_once WPIE_DIR . 'includes/media-usage/class-usage-resolver.php';
require_once WPIE_DIR . 'includes/media-usage/class-usage-scanner.php';
require_once WPIE_DIR . 'includes/media-usage/class-scanner-content.php';
require_once WPIE_DIR . 'includes/media-usage/class-scanner-postmeta.php';
require_once WPIE_DIR . 'includes/media-usage/class-scanner-options.php';
require_once WPIE_DIR . 'includes/media-usage/class-scanner-terms.php';
require_once WPIE_DIR . 'includes/media-usage/class-scanner-wunderpaint.php';

/**
 * Reference tracking for attachments.
 */
class Media_Usage {

	/**
	 * Verdict of the last completed sweep: `1` referenced, `0` not.
	 *
	 * Kept as a number rather than a boolean so the Unused smart folder can
	 * stay a plain numeric meta_query instead of searching JSON.
	 */
	const COUNT_KEY = '_wpie_usage_count';

	/** Same flag, for the sweep that is currently running. */
	const RUN_KEY = '_wpie_usage_run';

	/** Progress of the running sweep. */
	const STATE_OPTION = 'wpie_usage_scan';

	/** Summary of the last completed sweep. */
	const LAST_OPTION = 'wpie_usage_last';

	/** Timestamp of the last content change, so the UI can flag a stale scan. */
	const DIRTY_OPTION = 'wpie_usage_dirty';

	/**
	 * Freshly uploaded images are never called unused. Someone who uploaded a
	 * picture yesterday has simply not placed it yet.
	 */
	const GRACE_DAYS = 14;

	/** Wall clock budget for one chunk request, in seconds. */
	const CHUNK_BUDGET = 2.5;

	/**
	 * The grace period in days, filterable.
	 *
	 * On a site that was built last month almost everything falls inside it,
	 * which looks alarming until you know why. The panel states the number and
	 * offers to look past it rather than hiding the fact.
	 *
	 * @return int
	 */
	public static function grace_days() {
		return max( 0, (int) apply_filters( 'wpie_media_usage_grace_days', self::GRACE_DAYS ) );
	}

	/**
	 * Shared resolver.
	 *
	 * @var Usage_Resolver|null
	 */
	private static $resolver = null;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'save_post', array( __CLASS__, 'mark_dirty' ) );
		add_action( 'deleted_post', array( __CLASS__, 'mark_dirty' ) );
	}

	/**
	 * Remember that content changed after the last sweep.
	 *
	 * @return void
	 */
	public static function mark_dirty() {
		update_option( self::DIRTY_OPTION, time(), false );
	}

	/**
	 * The shared URL resolver.
	 *
	 * @return Usage_Resolver
	 */
	public static function resolver() {
		if ( null === self::$resolver ) {
			self::$resolver = new Usage_Resolver();
		}
		return self::$resolver;
	}

	/**
	 * All registered scanners, in run order.
	 *
	 * @return Usage_Scanner[]
	 */
	public static function scanners() {
		$resolver = self::resolver();
		$list     = array(
			new Scanner_Content( $resolver ),
			new Scanner_Postmeta( $resolver ),
			new Scanner_Options( $resolver ),
			new Scanner_Terms( $resolver ),
			new Scanner_Wunderpaint( $resolver ),
		);

		/**
		 * Register additional usage sources.
		 *
		 * Anything that stores attachment ids somewhere this engine cannot know
		 * about should hook in here, otherwise its images look unused.
		 *
		 * @param Usage_Scanner[] $list     Scanners.
		 * @param Usage_Resolver  $resolver Shared resolver.
		 */
		$list = (array) apply_filters( 'wpie_media_usage_sources', $list, $resolver );

		return array_values(
			array_filter(
				$list,
				static function ( $s ) {
					return $s instanceof Usage_Scanner;
				}
			)
		);
	}

	/* ------------------------------ matching ------------------------------ */

	/**
	 * Do these extracted references point at this attachment?
	 *
	 * Compares by string rather than resolving every path through the database,
	 * because this runs once per candidate row in the single-image lookup and a
	 * query per row would make that lookup unusable.
	 *
	 * @param array          $refs          Result of an extractor.
	 * @param int            $attachment_id Attachment.
	 * @param Usage_Resolver $resolver      Resolver.
	 * @return bool
	 */
	public static function refs_match( $refs, $attachment_id, $resolver ) {
		$attachment_id = (int) $attachment_id;

		foreach ( (array) ( $refs['ids'] ?? array() ) as $id ) {
			if ( (int) $id === $attachment_id ) {
				return true;
			}
		}

		$paths = (array) ( $refs['paths'] ?? array() );
		if ( ! $paths ) {
			return false;
		}

		$own = (string) get_post_meta( $attachment_id, '_wp_attached_file', true );
		if ( '' === $own ) {
			return false;
		}
		$own  = $resolver->strip_size( $own );
		$base = wp_basename( $own );

		foreach ( $paths as $path ) {
			$rel = $resolver->strip_size( $resolver->to_relative( $path ) );
			if ( '' === $rel ) {
				continue;
			}
			if ( $rel === $own || wp_basename( $rel ) === $base ) {
				return true;
			}
		}
		return false;
	}

	/* --------------------------- single lookup ---------------------------- */

	/**
	 * Every place one attachment is referenced.
	 *
	 * Always live. This is what the image detail panel shows, and it is also
	 * the final safety check before anything is moved to quarantine, so it must
	 * never rely on a stored verdict.
	 *
	 * @param int $attachment_id Attachment.
	 * @return array[] Hit records with label, edit link and context.
	 */
	public static function find_for( $attachment_id ) {
		$attachment_id = (int) $attachment_id;
		if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
			return array();
		}

		$needles = self::resolver()->needles_for( $attachment_id );
		$out     = array();
		foreach ( self::scanners() as $scanner ) {
			$hits = $scanner->find_for( $attachment_id, $needles );
			foreach ( (array) $hits as $hit ) {
				$out[] = $hit;
			}
		}

		// One line per place, not per matching row.
		$seen   = array();
		$unique = array();
		foreach ( $out as $hit ) {
			$key = $hit['src'] . '|' . $hit['obj'] . '|' . $hit['ctx'];
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$unique[]     = $hit;
		}
		return $unique;
	}

	/* ------------------------------ verdicts ------------------------------ */

	/**
	 * Summary of the last completed sweep.
	 *
	 * @return array
	 */
	public static function last_run() {
		$last = get_option( self::LAST_OPTION, array() );
		return is_array( $last ) ? $last : array();
	}

	/**
	 * One of: used, unused, fresh, unknown.
	 *
	 * "unknown" is a first class answer, not a failure. A scanner that admits
	 * what it has not checked is the only kind anyone should trust with a
	 * delete button. "fresh" is separated out from it because "I have not
	 * finished looking" and "this was uploaded on Tuesday" are different
	 * situations and deserve different wording in the panel.
	 *
	 * Only "unused" is ever offered for cleanup.
	 *
	 * @param int $attachment_id Attachment.
	 * @return string
	 */
	public static function verdict( $attachment_id ) {
		$attachment_id = (int) $attachment_id;
		$count         = get_post_meta( $attachment_id, self::COUNT_KEY, true );

		if ( '' === $count || null === $count ) {
			return 'unknown';
		}
		if ( (int) $count > 0 ) {
			return 'used';
		}

		$last = self::last_run();
		if ( empty( $last['ok'] ) ) {
			return 'unknown';
		}

		// Uploaded after the sweep looked at the library, or still inside the
		// grace period.
		$post = get_post( $attachment_id );
		if ( ! $post ) {
			return 'unknown';
		}
		$added = (int) get_post_time( 'U', true, $post );
		if ( $added > (int) $last['t'] ) {
			return 'unknown';
		}
		if ( $added > time() - ( self::grace_days() * DAY_IN_SECONDS ) ) {
			return 'fresh';
		}
		return 'unused';
	}

	/**
	 * How many images fall into each verdict.
	 *
	 * Counted in SQL rather than by calling verdict() per image, so the panel
	 * stays instant on a library with tens of thousands of files.
	 *
	 * @return array{used:int,unused:int,fresh:int,unknown:int,total:int}
	 */
	public static function counts() {
		global $wpdb;

		$mimes = "'" . implode( "','", array_map( 'esc_sql', Media_Library::MIMES ) ) . "'";
		$last  = self::last_run();
		$out   = array(
			'used'    => 0,
			'unused'  => 0,
			'fresh'   => 0,
			'unknown' => 0,
			'total'   => 0,
		);

		$wpdb->last_error = '';
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- $mimes is a list of esc_sql'd values from the Media_Library::MIMES class constant; every user-facing value is bound through prepare().
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT
					COUNT(*) AS total,
					SUM(CASE WHEN m.meta_value = '1' THEN 1 ELSE 0 END) AS used,
					SUM(CASE WHEN m.meta_id IS NULL THEN 1 ELSE 0 END) AS unseen,
					SUM(CASE WHEN m.meta_value = '0' AND p.post_date_gmt > %s THEN 1 ELSE 0 END) AS fresh,
					SUM(CASE WHEN m.meta_value = '0' AND p.post_date_gmt <= %s THEN 1 ELSE 0 END) AS unused
				 FROM {$wpdb->posts} p
				 LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
				 WHERE p.post_type = 'attachment' AND p.post_status <> 'trash' AND p.post_mime_type IN ($mimes)",
				gmdate( 'Y-m-d H:i:s', time() - ( self::grace_days() * DAY_IN_SECONDS ) ),
				gmdate( 'Y-m-d H:i:s', time() - ( self::grace_days() * DAY_IN_SECONDS ) ),
				self::COUNT_KEY
			)
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
		// An empty answer here would otherwise read as "a library with nothing
		// in it", which is the same shape a broken query produces.
		if ( '' !== (string) $wpdb->last_error ) {
			$out['error'] = true;
			return $out;
		}
		if ( ! $rows ) {
			return $out;
		}
		$row            = $rows[0];
		$out['total']   = (int) $row->total;
		$out['used']    = (int) $row->used;
		$out['fresh']   = (int) $row->fresh;
		$out['unused']  = (int) $row->unused;
		$out['unknown'] = (int) $row->unseen;

		// A run that hit an error proves nothing about the images it never
		// reached, so none of its zeroes may be offered for cleanup.
		if ( empty( $last['ok'] ) ) {
			$out['unknown'] += $out['unused'] + $out['fresh'];
			$out['unused']   = 0;
			$out['fresh']    = 0;
		}
		return $out;
	}

	/**
	 * Scan state for the UI.
	 *
	 * @return array
	 */
	public static function status() {
		$state = get_option( self::STATE_OPTION, array() );
		$state = is_array( $state ) ? $state : array();
		$last  = self::last_run();
		$dirty = (int) get_option( self::DIRTY_OPTION, 0 );

		return array(
			'running' => ! empty( $state['running'] ),
			'done'    => (int) ( $state['rows'] ?? 0 ),
			'total'   => (int) ( $state['total'] ?? 0 ),
			'stage'   => (string) ( $state['stage'] ?? '' ),
			'errors'  => array_values( (array) ( $state['errors'] ?? array() ) ),
			'last'    => $last ? (int) $last['t'] : 0,
			'ok'      => ! empty( $last['ok'] ),
			'stale'   => $last && $dirty > (int) $last['t'],
			'grace'   => self::grace_days(),
			'counts'  => self::counts(),
		);
	}

	/**
	 * WP_Query arguments that select one verdict.
	 *
	 * This is what replaces `Media_Library::used_attachment_ids()`. The old
	 * version diffed two full id lists in PHP; this is a plain meta query the
	 * database can index.
	 *
	 * @param string $verdict used, unused, fresh or unknown.
	 * @return array Query fragment to merge into WP_Query args.
	 */
	public static function query_args( $verdict ) {
		$grace = gmdate( 'Y-m-d H:i:s', time() - ( self::grace_days() * DAY_IN_SECONDS ) );

		switch ( $verdict ) {
			case 'used':
				return array(
					'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- indexed numeric key, this is the whole point of storing it.
						array(
							'key'   => self::COUNT_KEY,
							'value' => '1',
						),
					),
				);

			case 'fresh':
				return array(
					'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- indexed numeric key.
						array(
							'key'   => self::COUNT_KEY,
							'value' => '0',
						),
					),
					'date_query' => array( array( 'after' => $grace, 'column' => 'post_date_gmt' ) ),
				);

			case 'unknown':
				return array(
					'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- indexed numeric key.
						array(
							'key'     => self::COUNT_KEY,
							'compare' => 'NOT EXISTS',
						),
					),
				);

			case 'unused':
			default:
				// Never offer anything for cleanup off the back of a run that
				// did not complete cleanly.
				$last = self::last_run();
				if ( empty( $last['ok'] ) ) {
					return array( 'post__in' => array( 0 ) );
				}
				return array(
					'meta_query' => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- indexed numeric key.
						array(
							'key'   => self::COUNT_KEY,
							'value' => '0',
						),
					),
					'date_query' => array( array( 'before' => $grace, 'column' => 'post_date_gmt' ) ),
				);
		}
	}

	/* -------------------------------- sweep ------------------------------- */

	/**
	 * Begin a fresh sweep.
	 *
	 * @return array State.
	 */
	public static function start() {
		global $wpdb;

		// Clear the tally of any run that died halfway.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.DirectDelete, WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- bulk maintenance of our own meta key, no per-row API equivalent.
		$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => self::RUN_KEY ) );
		self::flush_meta_cache();

		$total = 0;
		foreach ( self::scanners() as $scanner ) {
			$total += max( 0, (int) $scanner->count() );
		}

		$state = array(
			'running' => true,
			'idx'     => 0,
			'cursor'  => 0,
			'rows'    => 0,
			'total'   => $total,
			'stage'   => '',
			'started' => time(),
			'errors'  => array(),
		);
		update_option( self::STATE_OPTION, $state, false );
		return $state;
	}

	/**
	 * Work on the sweep for one request.
	 *
	 * Runs until the time budget is spent rather than doing a fixed number of
	 * rows, so a fast host finishes in fewer round trips and a slow one still
	 * answers before any proxy loses patience.
	 *
	 * @return array Status for the client.
	 */
	public static function run_chunk() {
		$state = get_option( self::STATE_OPTION, array() );
		if ( ! is_array( $state ) || empty( $state['running'] ) ) {
			$state = self::start();
		}

		$scanners = self::scanners();
		$started  = microtime( true );

		while ( microtime( true ) - $started < self::CHUNK_BUDGET ) {
			$idx = (int) $state['idx'];
			if ( $idx >= count( $scanners ) ) {
				return self::finish( $state );
			}

			$scanner        = $scanners[ $idx ];
			$state['stage'] = $scanner->label();
			$limit          = max( 10, (int) $scanner->max_chunk() );

			global $wpdb;
			$wpdb->last_error = '';

			try {
				$slice = $scanner->scan( $state['cursor'], $limit );
			} catch ( \Throwable $e ) {
				// A broken source must not silently shrink the search space,
				// so record it and let the verdict stay "unknown" for the run.
				$state['errors'][] = $scanner->key();
				$state['idx']      = $idx + 1;
				$state['cursor']   = 0;
				update_option( self::STATE_OPTION, $state, false );
				continue;
			}

			// A failed query does not throw, it just returns nothing. Without
			// this check a scanner whose SQL broke would look like a source
			// with no references at all, and the run would still report itself
			// as complete: exactly the way a delete button starts eating live
			// images.
			if ( '' !== (string) $wpdb->last_error ) {
				$state['errors'][] = $scanner->key();
				$state['idx']      = $idx + 1;
				$state['cursor']   = 0;
				update_option( self::STATE_OPTION, $state, false );
				continue;
			}

			// record() sits outside the check above, and the next round clears
			// last_error before anyone could read it. So it reports for itself.
			if ( ! self::record( (array) $slice['hits'] ) ) {
				$state['errors'][] = $scanner->key();
				$state['idx']      = $idx + 1;
				$state['cursor']   = 0;
				update_option( self::STATE_OPTION, $state, false );
				continue;
			}

			$state['rows']   = (int) $state['rows'] + (int) $slice['rows'];
			$state['cursor'] = $slice['cursor'];
			if ( ! empty( $slice['done'] ) ) {
				$state['idx']    = $idx + 1;
				$state['cursor'] = 0;
			}
			update_option( self::STATE_OPTION, $state, false );
		}

		update_option( self::STATE_OPTION, $state, false );
		return self::status();
	}

	/**
	 * Mark every attachment this slice referenced.
	 *
	 * A flag, not a counter. Counting would mean a read before every write, and
	 * `get_post_meta` on an attachment drags the whole `_wp_attachment_metadata`
	 * blob into the object cache. "Referenced at least once" is the only thing
	 * the verdict needs, and it fits in a single INSERT per slice.
	 *
	 * The LEFT JOIN is what keeps the row unique: postmeta has no unique index
	 * on (post_id, meta_key), so ON DUPLICATE KEY is not available here.
	 *
	 * @param array[] $hits Hit records.
	 * @return bool True when every hit was written. False means the caller
	 *              must treat this scanner's result as incomplete.
	 */
	private static function record( $hits ) {
		global $wpdb;

		if ( ! $hits ) {
			return true;
		}

		$ids   = array();
		$paths = array();
		foreach ( $hits as $hit ) {
			if ( ! empty( $hit['id'] ) ) {
				$ids[ (int) $hit['id'] ] = true;
			} elseif ( ! empty( $hit['path'] ) ) {
				$paths[] = $hit['path'];
			}
		}

		if ( $paths ) {
			// A path that fails to resolve loses its image the same way a
			// failed insert does, so this read is checked too.
			$wpdb->last_error = '';
			$resolved         = self::resolver()->resolve_paths( array_unique( $paths ) );
			if ( '' !== (string) $wpdb->last_error ) {
				return false;
			}
			foreach ( $resolved as $id ) {
				$ids[ (int) $id ] = true;
			}
		}

		$ids = array_filter( array_keys( $ids ) );
		if ( ! $ids ) {
			return true;
		}

		foreach ( array_chunk( $ids, 200 ) as $chunk ) {
			$list = implode( ',', array_map( 'intval', $chunk ) );
			$wpdb->last_error = '';
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- $list is a comma-joined list of intval() ids built above; the meta key is bound through prepare().
			$wpdb->query(
				$wpdb->prepare(
					"INSERT INTO {$wpdb->postmeta} (post_id, meta_key, meta_value)
					 SELECT p.ID, %s, '1' FROM {$wpdb->posts} p
					 LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
					 WHERE p.ID IN ($list) AND p.post_type = 'attachment' AND m.meta_id IS NULL",
					self::RUN_KEY,
					self::RUN_KEY
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
			// This is the write that says "this image is in use". If it fails
			// and nobody notices, the image keeps no marker, the run still
			// reports itself complete, and the cleanup dialog offers a live
			// image for deletion.
			if ( '' !== (string) $wpdb->last_error ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Drop the meta object cache after a bulk write that bypassed the API.
	 *
	 * @return void
	 */
	private static function flush_meta_cache() {
		if ( function_exists( 'wp_cache_flush_group' ) && wp_cache_supports( 'flush_group' ) ) {
			wp_cache_flush_group( 'post_meta' );
			return;
		}
		wp_cache_flush();
	}

	/**
	 * Promote the run tally and close the sweep.
	 *
	 * @param array $state Run state.
	 * @return array Status.
	 */
	private static function finish( $state ) {
		global $wpdb;

		// Swap the tally in place: drop the old verdict, rename the new one.
		// This pair is the most dangerous write in the engine. The delete
		// removes every old verdict; if the rename then fails, seed_zeros()
		// below fills the gap with zeros and the entire library reads as
		// unused. So both are checked, and a failure ends the run as not ok.
		$wpdb->last_error = '';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.DirectDelete, WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- bulk maintenance of our own meta key.
		$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => self::COUNT_KEY ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- bulk maintenance of our own meta key.
		$wpdb->update( $wpdb->postmeta, array( 'meta_key' => self::COUNT_KEY ), array( 'meta_key' => self::RUN_KEY ) );
		$tausch_ok = '' === (string) $wpdb->last_error;

		// Everything the sweep never touched is a zero, and a zero has to exist
		// as a row for the meta query behind the Unused folder to find it.
		$nullen_ok = self::seed_zeros();

		self::flush_meta_cache();

		$errors = array_values( array_unique( (array) $state['errors'] ) );
		if ( ! $tausch_ok || ! $nullen_ok ) {
			$errors[] = 'tally';
		}
		update_option(
			self::LAST_OPTION,
			array(
				't'      => time(),
				'ok'     => empty( $errors ),
				'errors' => $errors,
				'rows'   => (int) $state['rows'],
			),
			false
		);
		// Keep the final numbers so the panel can show what the run covered
		// instead of snapping back to 0 of 0 the moment it finishes.
		update_option(
			self::STATE_OPTION,
			array(
				'running' => false,
				'rows'    => (int) $state['rows'],
				'total'   => (int) $state['total'],
				'stage'   => '',
				'errors'  => $errors,
			),
			false
		);

		return self::status();
	}

	/**
	 * Write a zero tally for every image the sweep found no reference to.
	 *
	 * @return bool True when the write went through.
	 */
	private static function seed_zeros() {
		global $wpdb;

		$mimes            = "'" . implode( "','", array_map( 'esc_sql', Media_Library::MIMES ) ) . "'";
		$wpdb->last_error = '';
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- $mimes is a list of esc_sql'd values from the Media_Library::MIMES class constant; the meta key is bound through prepare().
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$wpdb->postmeta} (post_id, meta_key, meta_value)
				 SELECT p.ID, %s, '0' FROM {$wpdb->posts} p
				 LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
				 WHERE p.post_type = 'attachment' AND p.post_mime_type IN ($mimes) AND m.meta_id IS NULL",
				self::COUNT_KEY,
				self::COUNT_KEY
			)
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

		return '' === (string) $wpdb->last_error;
	}

	/**
	 * Abandon a running sweep.
	 *
	 * @return array Status.
	 */
	public static function reset() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.DirectDelete, WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- bulk maintenance of our own meta key.
		$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => self::RUN_KEY ) );
		update_option( self::STATE_OPTION, array( 'running' => false ), false );
		self::flush_meta_cache();
		return self::status();
	}

	/* --------------------------------- REST -------------------------------- */

	/**
	 * REST routes under wpie/v1/media-usage/*.
	 */
	public function register_routes() {
		$perm = array( REST_Controller::class, 'can_use_editor' );

		register_rest_route(
			WPIE_REST_NS,
			'/media-usage/for/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_for' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-usage/scan',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_status' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_scan' ),
					'permission_callback' => $perm,
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-usage/scan/reset',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_reset' ),
				'permission_callback' => $perm,
			)
		);
	}

	/**
	 * GET /media-usage/for/<id>
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_for( \WP_REST_Request $req ) {
		$id = (int) $req->get_param( 'id' );
		return array(
			'id'      => $id,
			'places'  => self::find_for( $id ),
			'verdict' => self::verdict( $id ),
		);
	}

	/**
	 * GET /media-usage/scan
	 *
	 * @return array
	 */
	public function rest_status() {
		return self::status();
	}

	/**
	 * POST /media-usage/scan
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_scan( \WP_REST_Request $req ) {
		if ( $req->get_param( 'restart' ) ) {
			self::start();
		}
		wp_raise_memory_limit( 'admin' );
		return self::run_chunk();
	}

	/**
	 * POST /media-usage/scan/reset
	 *
	 * @return array
	 */
	public function rest_reset() {
		return self::reset();
	}
}
