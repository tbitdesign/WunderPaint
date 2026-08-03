/**
 * Registers the PSD importer/exporter (side-effect module, imported by the
 * app bootstrap), the Export dialog and File menu feature-detect through
 * psd-registry, so the PSD option appears exactly when this ran.
 */

import { registerPsd } from './psd-registry';
import { psdToDocument, documentToPsd } from './psd';

registerPsd( {
	importer: ( buffer, name ) => psdToDocument( buffer, name ),
	exporter: async ( doc, layers ) =>
		( await documentToPsd( doc, layers ) ).buffer,
} );
