/**
 * PSD import/export registration point. lib/psd.js (plan tasks 33/34)
 * registers its implementations here; consumers (export dialog, save flow,
 * File menu) feature-detect via the getters, so the PSD format option
 * appears exactly when the exporter exists.
 */

let psdExporter = null; // async (doc, layers) => ArrayBuffer
let psdImporter = null; // async (arrayBuffer) => { doc, layers }

export const registerPsd = ( { exporter, importer } ) => {
	if ( exporter ) {
		psdExporter = exporter;
	}
	if ( importer ) {
		psdImporter = importer;
	}
};

export const getPsdExporter = () => psdExporter;
export const getPsdImporter = () => psdImporter;
