/**
 * Lets Node load shared modules that import packages (three, opentype.js).
 * A bare specifier written in extensions/shared/ resolves from the
 * node_modules of the extension that runs the code (the working directory),
 * the same thing the builds do with NODE_PATH. One copy of three.js per
 * extension, as in its bundle.
 *
 *   node --import ../shared/node-resolve.mjs --test tests/*.test.js
 */
import { register } from 'node:module';

register( './node-resolve-hooks.mjs', import.meta.url );
