<?php
/**
 * The editor language: one source for everyone who needs it.
 *
 * Why a dedicated class instead of calling get_user_locale() twice: the
 * core reads the language via determine_locale(), the studios via
 * window.WPIE.locale. If the two drift apart, the editor speaks a
 * different language than its dialogs, and that only surfaces once the
 * user notices.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * The editor's language choice.
 */
class Editor_Locale {

	/** User meta holding the choice. Empty means: follow WordPress. */
	const META = 'wpie_editor_locale';

	/**
	 * Cookie holding the choice in demo mode.
	 *
	 * The demo has no own user per visitor: everyone shares one login, so
	 * user meta would hand one visitor's language on to the next. The
	 * client stores the choice in this cookie instead (see
	 * src/lib/editor-locale.js, same name) - a cookie rather than local
	 * storage because the language is decided HERE, in determine_locale,
	 * and local storage is invisible to the server.
	 *
	 * Same string as META above, and that is deliberate rather than a
	 * copy/paste slip: it is the same setting, only stored per user in one
	 * case and per visitor in the other. They stay separate constants
	 * because a meta key and a cookie name are free to diverge later.
	 */
	const COOKIE = 'wpie_editor_locale';

	/**
	 * Cache for available(), once per request.
	 *
	 * @var array<string,string>|null
	 */
	private static $available_cache = null;

	/**
	 * The languages actually shipped.
	 *
	 * Read from the directory instead of maintained by hand: a new .mo
	 * shows up in the choice on its own, and a deleted one disappears,
	 * instead of offering a language that does not exist.
	 *
	 * The result is cached per request: once the determine_locale filter
	 * is hooked up, this method can be called via stored() on every
	 * request, and a glob() on every call would be needless disk access
	 * for a result that does not change during a request.
	 *
	 * @return array<string,string> Locale => display name in that language.
	 */
	public static function available() {
		if ( null !== self::$available_cache ) {
			return self::$available_cache;
		}
		$names = array(
			'en_US' => 'English',
			'de_DE' => 'Deutsch',
			'es_ES' => 'Español',
			'fr_FR' => 'Français',
			'it_IT' => 'Italiano',
			'pt_BR' => 'Português',
		);
		$out = array( 'en_US' => $names['en_US'] );
		foreach ( (array) glob( WPIE_DIR . 'languages/wunderpaint-*.mo' ) as $file ) {
			$locale = substr( basename( $file, '.mo' ), strlen( 'wunderpaint-' ) );
			if ( isset( $names[ $locale ] ) ) {
				$out[ $locale ] = $names[ $locale ];
			}
		}
		self::$available_cache = $out;
		return $out;
	}

	/**
	 * The stored choice, or '' for "follow WordPress".
	 *
	 * @param int $user_id User, 0 for the current one.
	 * @return string
	 */
	public static function stored( $user_id = 0 ) {
		$user_id = $user_id ? (int) $user_id : get_current_user_id();
		if ( ! $user_id ) {
			return '';
		}
		$value = (string) get_user_meta( $user_id, self::META, true );
		return isset( self::available()[ $value ] ) ? $value : '';
	}

	/**
	 * Store the choice.
	 *
	 * @param string $locale Locale or '' for "follow WordPress".
	 * @param int    $user_id User, 0 for the current one.
	 * @return bool True if the value was valid and got stored.
	 */
	public static function save( $locale, $user_id = 0 ) {
		$user_id = $user_id ? (int) $user_id : get_current_user_id();
		if ( ! $user_id ) {
			return false;
		}
		$locale = (string) $locale;
		if ( '' !== $locale && ! isset( self::available()[ $locale ] ) ) {
			// An unknown value would silently leave the editor in
			// English, with nobody told why.
			return false;
		}
		update_user_meta( $user_id, self::META, $locale );
		return true;
	}

	/**
	 * The choice in demo mode: address first, then cookie.
	 *
	 * The address wins because that is how the marketing site hands a
	 * language over: someone clicking through from the Spanish pricing
	 * page must land in a Spanish editor even if their cookie still says
	 * English from an earlier visit.
	 *
	 * Both values come from outside and are checked against available().
	 * An unknown one is ignored rather than mapped onto something else.
	 *
	 * @return string Locale, or '' for "no choice made".
	 */
	private static function demo_choice() {
		$from_address = self::from_address();
		if ( '' !== $from_address ) {
			return $from_address;
		}
		return self::from_cookie();
	}

	/**
	 * The locale asked for in the address, if it is one we ship.
	 *
	 * Its own method because remember_demo_choice() needs the same value
	 * and the same validation. Two copies of "read, unslash, sanitize,
	 * check against available()" would be two places to forget the check.
	 *
	 * @return string Locale, or '' if absent or unknown.
	 */
	private static function from_address() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only locale hint, sanitized, no state change.
		$wanted = isset( $_GET['locale'] ) ? sanitize_text_field( wp_unslash( $_GET['locale'] ) ) : '';
		return isset( self::available()[ $wanted ] ) ? $wanted : '';
	}

	/**
	 * The locale remembered in the cookie, if it is one we ship.
	 *
	 * @return string Locale, or '' if absent or unknown.
	 */
	private static function from_cookie() {
		$wanted = isset( $_COOKIE[ self::COOKIE ] )
			? sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE ] ) )
			: '';
		return isset( self::available()[ $wanted ] ) ? $wanted : '';
	}

	/**
	 * The one reading rule, for everyone who needs the choice.
	 *
	 * resolve() and filter() must never read it differently: the whole
	 * point of this class (see the file comment) is that the core and the
	 * studios cannot end up in different languages. Two copies of the
	 * order below would be exactly that bug.
	 *
	 * Outside the demo the address is deliberately NOT consulted. A
	 * `?locale=` that worked on a normal install would let any shared
	 * link change another user's editor language, and it would override
	 * the choice they made themselves.
	 *
	 * @return string Locale, or '' for "follow WordPress".
	 */
	private static function choice() {
		if ( REST_Controller::is_demo() ) {
			// In the demo the visitor's cookie beats the shared user's
			// meta on purpose: if anything ever wrote meta on that
			// account, it would otherwise stick for every later visitor.
			return self::demo_choice();
		}
		return self::stored();
	}

	/**
	 * The language the editor should run in.
	 *
	 * @return string
	 */
	public static function resolve() {
		$choice = self::choice();
		return '' !== $choice ? $choice : get_user_locale();
	}

	/**
	 * Register hooks.
	 *
	 * @return void
	 */
	public static function hooks() {
		add_filter( 'determine_locale', array( __CLASS__, 'filter' ) );
		add_filter( 'wpie_settings_tabs', array( __CLASS__, 'settings_tab' ) );
		add_action( 'wpie_settings_extra_tabs', array( __CLASS__, 'panel' ) );
		add_action( 'admin_post_wpie_editor_locale', array( __CLASS__, 'handle_post' ) );
		add_action( 'init', array( __CLASS__, 'remember_demo_choice' ) );
	}

	/**
	 * Turn a `?locale=` in the demo into a cookie.
	 *
	 * Without this the language would last exactly one page: the
	 * marketing site hands it over in the address, and the next click
	 * inside the editor goes to an address that no longer carries it.
	 *
	 * Not done inside choice(): that runs from determine_locale, which
	 * fires on requests whose headers are already out. Here it is init,
	 * and headers_sent() is still checked - a warning in the middle of a
	 * REST response would corrupt the JSON.
	 *
	 * @return void
	 */
	public static function remember_demo_choice() {
		if ( ! REST_Controller::is_demo() || headers_sent() ) {
			return;
		}
		$wanted = self::from_address();
		if ( '' === $wanted || self::from_cookie() === $wanted ) {
			return;
		}
		setcookie(
			self::COOKIE,
			$wanted,
			array(
				'expires'  => time() + YEAR_IN_SECONDS,
				'path'     => '/',
				'secure'   => is_ssl(),
				// Readable by JavaScript on purpose: currentLocale() puts
				// the checkmark in the Help menu next to this value, and
				// an httponly cookie would leave the menu showing the
				// wrong language while the editor speaks the right one.
				'httponly' => false,
				'samesite' => 'Lax',
			)
		);
		$_COOKIE[ self::COOKIE ] = $wanted;
	}

	/**
	 * Does this request belong to the editor?
	 *
	 * Three cases: the editor page itself, its asset requests (which run
	 * in the same request) and the editor's REST calls. The latter are
	 * recognized by the header the client sends along; the address alone
	 * is not enough, because the same routes are also used from elsewhere.
	 *
	 * @return bool
	 */
	public static function is_editor_request() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read only, no action taken.
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
		// is_admin() as well as the slug: a FRONTEND request to
		// /?page=wpie-editor would otherwise switch the language of the
		// whole public page. Measured. Nobody else's choice leaks that way
		// (it resolves the visitor's own), but it is outside the three
		// cases this method claims to cover, and admin-ajax and the
		// header route both stay inside is_admin().
		if ( WPIE_SLUG === $page && is_admin() ) {
			return true;
		}
		if ( isset( $_SERVER['HTTP_X_WPIE_LOCALE_SCOPE'] )
			&& 'editor' === sanitize_key( wp_unslash( $_SERVER['HTTP_X_WPIE_LOCALE_SCOPE'] ) ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Filter on determine_locale.
	 *
	 * @param string $locale What WordPress determined.
	 * @return string
	 */
	public static function filter( $locale ) {
		if ( ! self::is_editor_request() ) {
			return $locale;
		}
		$choice = self::choice();
		return '' !== $choice ? $choice : $locale;
	}

	/**
	 * Add the "Language" tab to the settings screen.
	 *
	 * @param array $tabs Slug => label.
	 * @return array
	 */
	public static function settings_tab( $tabs ) {
		$tabs['language'] = __( 'Language', 'wunderpaint' );
		return $tabs;
	}

	/**
	 * The settings panel for the editor language choice.
	 *
	 * Rendered via `wpie_settings_extra_tabs`, which fires after the core
	 * options.php form's closing tag (see class-settings.php). A form
	 * nested inside that form would close it early; that exact mistake
	 * broke saving the core settings in v1.318.0. So this panel brings
	 * its own form and posts to admin-post.php, the same pattern the
	 * Backup panel's own forms use (`wpie_backup_export`,
	 * `wpie_settings_restore_prev` in class-settings.php).
	 *
	 * The choice itself is user meta, not a site-wide option, which is
	 * a second reason it does not belong inside the options.php form:
	 * that form only ever saves the WPIE_OPTION array.
	 *
	 * The panel id must be `wpie-tab-language` to match the `language`
	 * slug added via settings_tab(); the tab switcher in
	 * assets/js/admin-settings.js builds that id from the tab slug.
	 *
	 * @return void
	 */
	public static function panel() {
		$current = self::stored();
		?>
		<div id="wpie-tab-language" class="wpie-tab-panel" hidden>
			<h2><?php esc_html_e( 'Editor language', 'wunderpaint' ); ?></h2>
			<?php if ( isset( $_GET['wpie-locale'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read only, no action taken. ?>
				<div class="notice notice-<?php echo 'error' === $_GET['wpie-locale'] ? 'error' : 'success'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended, WordPress.Security.EscapeOutput.OutputNotEscaped ?> inline">
					<p><?php echo esc_html( rawurldecode( sanitize_text_field( wp_unslash( (string) ( $_GET['wpie-msg'] ?? '' ) ) ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?></p>
				</div>
			<?php endif; ?>
			<div class="wpie-settings-card">
				<p class="description">
					<?php esc_html_e( 'Applies to the editor and its studios only. The WordPress admin around it keeps its own language. This is your personal setting, not the site\'s.', 'wunderpaint' ); ?>
				</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<input type="hidden" name="action" value="wpie_editor_locale">
					<?php wp_nonce_field( 'wpie_editor_locale' ); ?>
					<p>
						<select name="wpie_editor_locale">
							<option value=""<?php selected( '', $current ); ?>><?php esc_html_e( 'Follow WordPress', 'wunderpaint' ); ?></option>
							<?php foreach ( self::available() as $locale => $name ) : ?>
								<option value="<?php echo esc_attr( $locale ); ?>"<?php selected( $locale, $current ); ?>><?php echo esc_html( $name ); ?></option>
							<?php endforeach; ?>
						</select>
					</p>
					<?php submit_button( __( 'Save', 'wunderpaint' ) ); ?>
				</form>
			</div>
		</div>
		<?php
	}

	/**
	 * Handle the panel's own form submission.
	 *
	 * Same shape as `Settings::restore_shadow()`: capability check, nonce,
	 * then a redirect back to the tab with a notice, so a page reload
	 * never re-submits the form.
	 *
	 * @return void
	 */
	public static function handle_post() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'wunderpaint' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'wpie_editor_locale' );

		$locale = isset( $_POST['wpie_editor_locale'] ) ? sanitize_text_field( wp_unslash( $_POST['wpie_editor_locale'] ) ) : '';
		// save() rejects anything not found in the languages directory.
		$ok = self::save( $locale );

		$back = admin_url( 'options-general.php?page=' . WPIE_SETTINGS_SLUG );
		wp_safe_redirect(
			add_query_arg(
				array(
					'wpie-tab'    => 'language',
					'wpie-locale' => $ok ? 'ok' : 'error',
					'wpie-msg'    => rawurlencode(
						$ok
							? __( 'Editor language saved.', 'wunderpaint' )
							: __( 'That language is not available.', 'wunderpaint' )
					),
				),
				$back
			)
		);
		exit;
	}
}
