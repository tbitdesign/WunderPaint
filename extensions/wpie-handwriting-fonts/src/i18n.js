/**
 * Translations for this extension.
 *
 * Moved out of main.js in the 27.07.2026 refactoring round: 679 of its
 * 1770 lines were dictionary literals, which made the file look far more
 * complicated than it is. Pure data - esbuild inlines it exactly as before.
 */

export const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	document.documentElement.lang ||
	'en'
).toLowerCase();

const DE = {
	'Add a text layer': 'Textebene anlegen',
	'Insert a specimen': 'Musterblatt einfügen',
	'Trace over':
		'Vorlage',
	'Nothing':
		'Keine',
	'Worth a look':
		'Prüfen',
	'%d character(s) sit oddly next to the others.':
		'%d Zeichen fallen neben den anderen aus dem Rahmen.',
	'Stand them on the baseline':
		'Auf die Grundlinie stellen',
	'%d character(s) moved onto the baseline':
		'%d Zeichen auf die Grundlinie gestellt',
	'floats above the line':
		'schwebt über der Linie',
	'sinks below the line':
		'sackt unter die Linie',
	'taller than the rest':
		'größer als die übrigen',
	'shorter than the rest':
		'kleiner als die übrigen',
	'much wider than the rest':
		'deutlich breiter als die übrigen',
	'Spacing':
		'Abstände',
	'Reset this':
		'Dieses zurücksetzen',
	'Reset all spacing':
		'Alle Abstände zurücksetzen',
	'Drag a gap or a letter edge':
		'Eine Lücke oder eine Buchstabenkante ziehen',
	'automatic':
		'automatisch',
	'left':
		'links',
	'right':
		'rechts',
	'%1$d pair(s), %2$d letter(s) adjusted':
		'%1$d Paare, %2$d Buchstaben angepasst',
	'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.':
		'Ein Wort tippen, dann die Lücke zwischen zwei Buchstaben ziehen, um dieses Paar zu korrigieren, oder die Kante eines Buchstabens ziehen, um die Luft auf dieser Seite zu ändern. Pfeiltasten rücken feiner, mit Umschalt in größeren Schritten.',
	'Nib': 'Feder',
	'Round': 'Rund',
	'Chisel': 'Bandzug',
	'Nib angle': 'Federwinkel',
	'Nib width': 'Federbreite',
	'Join here': 'Hier anschließen',
	'Reading an older sheet': 'Lese einen älteren Bogen',
	'The selection has to match the sheet you are about to read.': 'Die Auswahl muss zu dem Bogen passen, den du einliest.',
	'Handwriting Fonts': 'Handwriting Fonts',
	'Draw an alphabet, get a font this site can use everywhere.':
		'Ein Alphabet zeichnen und daraus eine Schrift machen, die überall im Editor verfügbar ist.',
	Draw: 'Zeichnen',
	Sheet: 'Blatt',
	Capitals: 'Großbuchstaben',
	Lowercase: 'Kleinbuchstaben',
	Numbers: 'Ziffern',
	Punctuation: 'Satzzeichen',
	Accents: 'Akzente',
	'Extra letters': 'Weitere Buchstaben',
	'More punctuation': 'Weitere Satzzeichen',
	optional: 'optional',
	Progress: 'Fortschritt',
	Acute: 'Akut',
	Grave: 'Gravis',
	Circumflex: 'Zirkumflex',
	Tilde: 'Tilde',
	Diaeresis: 'Trema',
	Cedilla: 'Cedille',
	'%1$d of %2$d drawn': '%1$d von %2$d gezeichnet',
	Undo: 'Rückgängig',
	Erase: 'Radieren',
	'Clear character': 'Zeichen leeren',
	Previous: 'Zurück',
	Next: 'Weiter',
	Preview: 'Vorschau',
	Font: 'Schrift',
	'Family name': 'Schriftname',
	Weights: 'Schnitte',
	Light: 'Light',
	Regular: 'Regular',
	Bold: 'Bold',
	'Add an italic': 'Kursiv ergänzen',
	Pen: 'Stift',
	'Pen width': 'Strichstärke',
	Smoothing: 'Glättung',
	'Pressure': 'Druckstärke',
	Spacing: 'Abstände',
	Tracking: 'Laufweite',
	'Join the letters up': 'Buchstaben verbinden',
	Overlap: 'Überlappung',
	'Kern automatically': 'Automatisch unterschneiden',
	Heights: 'Höhen',
	'Cap height': 'Versalhöhe',
	'x-height': 'x-Höhe',
	Ascender: 'Oberlänge',
	Descender: 'Unterlänge',
	Baseline: 'Grundlinie',
	Cap: 'Versal',
	Project: 'Projekt',
	'Start over': 'Neu anfangen',
	'Saved drafts': 'Gespeicherte Entwürfe',
	'Open an installed font': 'Installierte Schrift öffnen',
	'Open a font file': 'Schriftdatei öffnen',
	'Delete draft': 'Entwurf löschen',
	'Build and install': 'Bauen und installieren',
	'Build and download': 'Bauen und herunterladen',
	Download: 'Herunterladen',
	Close: 'Schließen',
	'Draw the letters marked as required before building.':
		'Zeichne die benötigten Zeichen, bevor du baust.',
	'Building %s': 'Baue %s',
	'Installing %s': 'Installiere %s',
	'Installed %s. It is in the font picker now.':
		'%s installiert. Steht jetzt im Schrift-Menü.',
	'Downloaded %d file(s).': '%d Datei(en) heruntergeladen.',
	'Nothing was installed.': 'Es wurde nichts installiert.',
	'Only an administrator can add fonts to this site. The files were downloaded instead.':
		'Nur Administratoren können Schriften auf dieser Site hinzufügen. Die Dateien wurden stattdessen heruntergeladen.',
	'Draft saved in this browser': 'Entwurf in diesem Browser gesichert',
	'Print the sheet': 'Blatt drucken',
	'Read the photo back': 'Foto einlesen',
	'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.':
		'Ohne Skalierung drucken, also einhundert Prozent. In jedes Feld ein Zeichen schreiben, aufsitzend auf der kräftigeren Grundlinie. Die gedruckten Hilfslinien werden beim Einlesen wieder entfernt.',
	'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.':
		'Das ausgefüllte Blatt von oben fotografieren, alle vier Eckquadrate müssen im Bild sein. Schräg ist in Ordnung, die Ecken ziehen es gerade.',
	Include: 'Umfang',
	'Only characters still missing': 'Nur noch fehlende Zeichen',
	'Every character': 'Alle Zeichen',
	Print: 'Drucken',
	'Download as image': 'Als Bild herunterladen',
	'Choose a photo': 'Foto auswählen',
	'Read sheet': 'Blatt einlesen',
	'Nothing left to write.': 'Es fehlt nichts mehr.',
	'%1$d characters on %2$d sheet(s).': '%1$d Zeichen auf %2$d Blatt.',
	'write one character per box': 'ein Zeichen je Feld',
	'Reading the photo': 'Foto wird gelesen',
	'Corners found, check them and read the sheet':
		'Ecken gefunden, prüfen und Blatt einlesen',
	'Corners not found, drag the four dots onto the corner squares':
		'Ecken nicht gefunden, die vier Punkte auf die Eckquadrate ziehen',
	'That image could not be read': 'Dieses Bild konnte nicht gelesen werden',
	'Those four corners do not form a sheet': 'Diese vier Ecken ergeben kein Blatt',
	'Reading the boxes': 'Felder werden gelesen',
	'Found %d characters': '%d Zeichen gefunden',
	'No writing found in the boxes': 'In den Feldern wurde keine Schrift gefunden',
	'What was found': 'Gefundene Zeichen',
	'Click a character to leave it out. The rest are taken over when you confirm.':
		'Ein Zeichen anklicken, um es auszulassen. Der Rest wird übernommen.',
	'Take these over': 'Diese übernehmen',
	'Took over %d characters': '%d Zeichen übernommen',
	'top left': 'oben links',
	'top right': 'oben rechts',
	'bottom right': 'unten rechts',
	'bottom left': 'unten links',
	'This font has no project inside it.': 'Diese Schrift enthält kein Projekt.',
	'Opened %s': '%s geöffnet',
	'Draw an accent once, and every letter that needs it is built for you.':
		'Einen Akzent einmal zeichnen, und jeder Buchstabe, der ihn braucht, wird daraus gebaut.',
	'Ready to build': 'Bereit zum Bauen',
	'%d character(s) still needed': 'Es fehlen noch %d Zeichen',
	'Copy CSS': 'CSS kopieren',
	'CSS copied': 'CSS kopiert',
	// The generated route (1.5.0).
	'Generate':
		'Generieren',
	'Handwriting':
		'Handschrift',
	'Describe it':
		'Beschreiben',
	'From a note':
		'Aus einer Notiz',
	'Describe the handwriting in a few words, and both sheets are written in it.':
		'Die Handschrift in ein paar Worten beschreiben, und beide Blätter werden darin geschrieben.',
	'For example: neat, slightly slanted school handwriting with a blue ballpoint pen':
		'Zum Beispiel: saubere, leicht geneigte Schulschrift mit blauem Kugelschreiber',
	'School hand':
		'Schulschrift',
	'neat, rounded school handwriting with a blue ballpoint pen':
		'saubere, runde Schulschrift mit blauem Kugelschreiber',
	'Quick scribble':
		'Schnelle Notiz',
	'a quick, slightly untidy everyday scribble with a black ballpoint pen':
		'eine schnelle, etwas unordentliche Alltagsschrift mit schwarzem Kugelschreiber',
	'Elegant cursive':
		'Elegante Schreibschrift',
	'elegant, flowing cursive with long loops, written with a fountain pen':
		'elegante, fließende Schreibschrift mit langen Schleifen, mit dem Füller geschrieben',
	'Felt-tip marker':
		'Filzstift',
	'bold, upright felt-tip marker handwriting with simple, rounded shapes':
		'kräftige, aufrechte Filzstiftschrift mit einfachen, runden Formen',
	'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.':
		'Ein Foto von ein paar handgeschriebenen Zeilen genügt. Zeichen, die in der Notiz nicht vorkommen, werden passend dazu geschrieben.',
	'From the media library':
		'Aus der Mediathek',
	'Use image':
		'Bild verwenden',
	'Handwritten note':
		'Handgeschriebene Notiz',
	'Anything to add (optional)':
		'Noch etwas dazu (optional)',
	'For example: a little bolder':
		'Zum Beispiel: etwas kräftiger',
	'Sheets':
		'Blätter',
	'AI provider':
		'KI-Anbieter',
	'No AI provider configured.':
		'Kein KI-Anbieter konfiguriert.',
	'Open settings':
		'Einstellungen öffnen',
	'Write the sheets':
		'Blätter schreiben lassen',
	'Writing sheet %1$d of %2$d':
		'Blatt %1$d von %2$d wird geschrieben',
	'Reading sheet %1$d of %2$d':
		'Blatt %1$d von %2$d wird gelesen',
	'The provider returned no image.':
		'Der Anbieter hat kein Bild geliefert.',
	'The written sheet came back without its corner squares.':
		'Das geschriebene Blatt kam ohne seine Eckquadrate zurück.',
	'Choose a photo of a handwritten note first.':
		'Zuerst ein Foto einer handgeschriebenen Notiz auswählen.',
	'Written sheets':
		'Geschriebene Blätter',
	'Sheet %d':
		'Blatt %d',
	'Download the sheets':
		'Blätter herunterladen',
	'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.':
		'%d Zeichen konnten nicht gelesen werden. Diese zeichnen oder die Blätter noch einmal nur mit den fehlenden Zeichen schreiben lassen.',
};

const ES = {
	'Add a text layer': 'Añadir una capa de texto',
	'Insert a specimen': 'Insertar un muestrario',
	'Trace over':
		'Plantilla',
	'Nothing':
		'Ninguna',
	'Worth a look':
		'Revisar',
	'%d character(s) sit oddly next to the others.':
		'%d caracteres desentonan con los demás.',
	'Stand them on the baseline':
		'Apoyarlos en la línea base',
	'%d character(s) moved onto the baseline':
		'%d caracteres apoyados en la línea base',
	'Spacing':
		'Espaciado',
	'Reset this':
		'Restablecer esto',
	'Reset all spacing':
		'Restablecer todo el espaciado',
	'Drag a gap or a letter edge':
		'Arrastra un hueco o el borde de una letra',
	'automatic':
		'automático',
	'left':
		'izquierda',
	'right':
		'derecha',
	'%1$d pair(s), %2$d letter(s) adjusted':
		'%1$d pares, %2$d letras ajustadas',
	'Nib': 'Plumilla',
	'Round': 'Redonda',
	'Chisel': 'Biselada',
	'Nib angle': 'Ángulo de la plumilla',
	'Nib width': 'Ancho de la plumilla',
	'Join here': 'Unir aquí',
	'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.':
		'Imprime al cien por cien, sin dejar que la impresora escale la página. Escribe un carácter por casilla, apoyado en la línea base más marcada. Las guías impresas se eliminan al leer la hoja.',
	'Reading an older sheet': 'Leyendo una hoja anterior',
	'The selection has to match the sheet you are about to read.': 'La selección debe coincidir con la hoja que vas a leer.',
	'Handwriting Fonts': 'Handwriting Fonts',
	'Draw an alphabet, get a font this site can use everywhere.':
		'Dibuja un alfabeto y obtén una fuente que este sitio puede usar en todas partes.',
	Draw: 'Dibujar',
	Sheet: 'Hoja',
	Capitals: 'Mayúsculas',
	Lowercase: 'Minúsculas',
	Numbers: 'Números',
	Punctuation: 'Puntuación',
	Accents: 'Acentos',
	'Extra letters': 'Letras adicionales',
	'More punctuation': 'Más puntuación',
	optional: 'opcional',
	Progress: 'Progreso',
	Acute: 'Agudo',
	Grave: 'Grave',
	Circumflex: 'Circunflejo',
	Tilde: 'Tilde',
	Diaeresis: 'Diéresis',
	Cedilla: 'Cedilla',
	'%1$d of %2$d drawn': '%1$d de %2$d dibujados',
	Undo: 'Deshacer',
	Erase: 'Borrar',
	'Clear character': 'Vaciar carácter',
	Previous: 'Anterior',
	Next: 'Siguiente',
	Preview: 'Vista previa',
	Font: 'Fuente',
	'Family name': 'Nombre de la familia',
	Weights: 'Grosores',
	'Add an italic': 'Añadir cursiva',
	Pen: 'Pluma',
	'Pen width': 'Grosor del trazo',
	Smoothing: 'Suavizado',
	Pressure: 'Presión',
	Spacing: 'Espaciado',
	Tracking: 'Interletraje',
	'Join the letters up': 'Unir las letras',
	Overlap: 'Solapamiento',
	'Kern automatically': 'Kerning automático',
	Heights: 'Alturas',
	'Cap height': 'Altura de mayúsculas',
	'x-height': 'Altura de x',
	Ascender: 'Ascendente',
	Descender: 'Descendente',
	Baseline: 'Línea base',
	Cap: 'Mayúscula',
	Project: 'Proyecto',
	'Start over': 'Empezar de nuevo',
	'Saved drafts': 'Borradores guardados',
	'Open an installed font': 'Abrir una fuente instalada',
	'Open a font file': 'Abrir un archivo de fuente',
	'Delete draft': 'Eliminar borrador',
	'Build and install': 'Crear e instalar',
	'Build and download': 'Crear y descargar',
	Download: 'Descargar',
	Close: 'Cerrar',
	'Draw the letters marked as required before building.':
		'Dibuja los caracteres necesarios antes de crear la fuente.',
	'Building %s': 'Creando %s',
	'Installing %s': 'Instalando %s',
	'Installed %s. It is in the font picker now.':
		'%s instalada. Ya está en el selector de fuentes.',
	'Downloaded %d file(s).': '%d archivo(s) descargado(s).',
	'Nothing was installed.': 'No se instaló nada.',
	'Only an administrator can add fonts to this site. The files were downloaded instead.':
		'Solo un administrador puede añadir fuentes a este sitio. Los archivos se han descargado.',
	'Draft saved in this browser': 'Borrador guardado en este navegador',
	'Print the sheet': 'Imprimir la hoja',
	'Read the photo back': 'Leer la foto',
	Include: 'Incluir',
	'Only characters still missing': 'Solo los caracteres que faltan',
	'Every character': 'Todos los caracteres',
	Print: 'Imprimir',
	'Download as image': 'Descargar como imagen',
	'Choose a photo': 'Elegir una foto',
	'Read sheet': 'Leer hoja',
	'Nothing left to write.': 'No queda nada por escribir.',
	'%1$d characters on %2$d sheet(s).': '%1$d caracteres en %2$d hoja(s).',
	'Take these over': 'Aceptar estos',
	'Ready to build': 'Listo para crear',
	'%d character(s) still needed': 'Faltan %d caracteres',
	'Copy CSS': 'Copiar CSS',
	'CSS copied': 'CSS copiado',
	'floats above the line': 'flota sobre la línea',
	'sinks below the line': 'baja por debajo de la línea',
	'taller than the rest': 'más alta que las demás',
	'shorter than the rest': 'más baja que las demás',
	'much wider than the rest': 'mucho más ancha que las demás',
	'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.': 'Escribe una palabra y arrastra el hueco entre dos letras para corregir ese par, o arrastra el borde de una letra para cambiar el aire de ese lado. Las flechas ajustan poco a poco; con Mayús, a pasos mayores.',
	'Light': 'Light',
	'Regular': 'Regular',
	'Bold': 'Bold',
	'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.': 'Fotografía la hoja terminada desde arriba con los cuatro cuadros de esquina visibles. Vale una foto en ángulo: las esquinas la enderezan.',
	'write one character per box': 'escribe un carácter por casilla',
	'Reading the photo': 'Leyendo la foto',
	'Corners found, check them and read the sheet': 'Esquinas encontradas: compruébalas y lee la hoja',
	'Corners not found, drag the four dots onto the corner squares': 'No se encontraron las esquinas: arrastra los cuatro puntos a los cuadros',
	'That image could not be read': 'No se pudo leer esa imagen',
	'Those four corners do not form a sheet': 'Esas cuatro esquinas no forman una hoja',
	'Reading the boxes': 'Leyendo las casillas',
	'Found %d characters': '%d caracteres encontrados',
	'No writing found in the boxes': 'No se encontró escritura en las casillas',
	'What was found': 'Lo que se encontró',
	'Click a character to leave it out. The rest are taken over when you confirm.': 'Haz clic en un carácter para dejarlo fuera. El resto se toma al confirmar.',
	'Took over %d characters': '%d caracteres incorporados',
	'top left': 'arriba izquierda',
	'top right': 'arriba derecha',
	'bottom right': 'abajo derecha',
	'bottom left': 'abajo izquierda',
	'This font has no project inside it.': 'Esta fuente no lleva ningún proyecto dentro.',
	'Opened %s': '%s abierto',
	'Draw an accent once, and every letter that needs it is built for you.': 'Dibuja un acento una vez y cada letra que lo necesite se construye sola.',
	// The generated route (1.5.0).
	'Generate':
		'Generar',
	'Handwriting':
		'Escritura a mano',
	'Describe it':
		'Describirla',
	'From a note':
		'Desde una nota',
	'Describe the handwriting in a few words, and both sheets are written in it.':
		'Describir la letra en pocas palabras: ambas hojas se escriben con ella.',
	'For example: neat, slightly slanted school handwriting with a blue ballpoint pen':
		'Por ejemplo: letra escolar clara, algo inclinada, con bolígrafo azul',
	'School hand':
		'Letra escolar',
	'neat, rounded school handwriting with a blue ballpoint pen':
		'letra escolar clara y redondeada con bolígrafo azul',
	'Quick scribble':
		'Garabato rápido',
	'a quick, slightly untidy everyday scribble with a black ballpoint pen':
		'una letra cotidiana rápida y algo desordenada con bolígrafo negro',
	'Elegant cursive':
		'Cursiva elegante',
	'elegant, flowing cursive with long loops, written with a fountain pen':
		'cursiva elegante y fluida con bucles largos, escrita con pluma estilográfica',
	'Felt-tip marker':
		'Rotulador',
	'bold, upright felt-tip marker handwriting with simple, rounded shapes':
		'letra de rotulador gruesa y recta, con formas simples y redondeadas',
	'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.':
		'Basta con una foto de unas pocas líneas escritas a mano. Los caracteres que no aparecen en la nota se escriben a juego.',
	'From the media library':
		'Desde la biblioteca de medios',
	'Use image':
		'Usar imagen',
	'Handwritten note':
		'Nota escrita a mano',
	'Anything to add (optional)':
		'Algo que añadir (opcional)',
	'For example: a little bolder':
		'Por ejemplo: un poco más gruesa',
	'Sheets':
		'Hojas',
	'AI provider':
		'Proveedor de IA',
	'No AI provider configured.':
		'Ningún proveedor de IA configurado.',
	'Open settings':
		'Abrir ajustes',
	'Write the sheets':
		'Escribir las hojas',
	'Writing sheet %1$d of %2$d':
		'Escribiendo la hoja %1$d de %2$d',
	'Reading sheet %1$d of %2$d':
		'Leyendo la hoja %1$d de %2$d',
	'The provider returned no image.':
		'El proveedor no devolvió ninguna imagen.',
	'The written sheet came back without its corner squares.':
		'La hoja escrita volvió sin sus cuadrados de las esquinas.',
	'Choose a photo of a handwritten note first.':
		'Elige primero una foto de una nota escrita a mano.',
	'Written sheets':
		'Hojas escritas',
	'Sheet %d':
		'Hoja %d',
	'Download the sheets':
		'Descargar las hojas',
	'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.':
		'No se pudieron leer %d caracteres. Dibújalos o vuelve a escribir las hojas solo con los caracteres que faltan.',
};

const FR = {
	'Add a text layer': 'Ajouter un calque de texte',
	'Insert a specimen': 'Insérer un spécimen',
	'Trace over':
		'Modèle',
	'Nothing':
		'Aucun',
	'Worth a look':
		'À vérifier',
	'%d character(s) sit oddly next to the others.':
		'%d caractères détonnent par rapport aux autres.',
	'Stand them on the baseline':
		'Les poser sur la ligne de base',
	'%d character(s) moved onto the baseline':
		'%d caractères posés sur la ligne de base',
	'Spacing':
		'Espacement',
	'Reset this':
		'Réinitialiser ceci',
	'Reset all spacing':
		'Réinitialiser tout l’espacement',
	'Drag a gap or a letter edge':
		'Faites glisser un blanc ou le bord d’une lettre',
	'automatic':
		'automatique',
	'left':
		'gauche',
	'right':
		'droite',
	'%1$d pair(s), %2$d letter(s) adjusted':
		'%1$d paires, %2$d lettres ajustées',
	'Nib': 'Bec',
	'Round': 'Rond',
	'Chisel': 'Biseauté',
	'Nib angle': 'Angle du bec',
	'Nib width': 'Largeur du bec',
	'Join here': 'Attacher ici',
	'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.':
		'Imprimez à cent pour cent, sans laisser l’imprimante redimensionner la page. Écrivez un caractère par case, posé sur la ligne de base la plus marquée. Les repères imprimés sont retirés à la lecture.',
	'Reading an older sheet': 'Lecture d’une feuille plus ancienne',
	'The selection has to match the sheet you are about to read.': 'La sélection doit correspondre à la feuille que vous allez lire.',
	'Handwriting Fonts': 'Handwriting Fonts',
	'Draw an alphabet, get a font this site can use everywhere.':
		'Dessinez un alphabet et obtenez une police utilisable partout sur ce site.',
	Draw: 'Dessiner',
	Sheet: 'Feuille',
	Capitals: 'Capitales',
	Lowercase: 'Minuscules',
	Numbers: 'Chiffres',
	Punctuation: 'Ponctuation',
	Accents: 'Accents',
	'Extra letters': 'Lettres supplémentaires',
	'More punctuation': 'Autres signes',
	optional: 'facultatif',
	Progress: 'Progression',
	Acute: 'Aigu',
	Grave: 'Grave',
	Circumflex: 'Circonflexe',
	Tilde: 'Tilde',
	Diaeresis: 'Tréma',
	Cedilla: 'Cédille',
	'%1$d of %2$d drawn': '%1$d sur %2$d dessinés',
	Undo: 'Annuler',
	Erase: 'Effacer',
	'Clear character': 'Vider le caractère',
	Previous: 'Précédent',
	Next: 'Suivant',
	Preview: 'Aperçu',
	Font: 'Police',
	'Family name': 'Nom de la famille',
	Weights: 'Graisses',
	'Add an italic': 'Ajouter une italique',
	Pen: 'Plume',
	'Pen width': 'Épaisseur du trait',
	Smoothing: 'Lissage',
	Pressure: 'Pression',
	Spacing: 'Espacement',
	Tracking: 'Approche',
	'Join the letters up': 'Lier les lettres',
	Overlap: 'Chevauchement',
	'Kern automatically': 'Crénage automatique',
	Heights: 'Hauteurs',
	'Cap height': 'Hauteur de capitale',
	'x-height': 'Hauteur d’x',
	Ascender: 'Ascendante',
	Descender: 'Descendante',
	Baseline: 'Ligne de base',
	Cap: 'Capitale',
	Project: 'Projet',
	'Start over': 'Recommencer',
	'Saved drafts': 'Brouillons enregistrés',
	'Open an installed font': 'Ouvrir une police installée',
	'Open a font file': 'Ouvrir un fichier de police',
	'Delete draft': 'Supprimer le brouillon',
	'Build and install': 'Créer et installer',
	'Build and download': 'Créer et télécharger',
	Download: 'Télécharger',
	Close: 'Fermer',
	'Draw the letters marked as required before building.':
		'Dessinez les caractères requis avant de créer la police.',
	'Building %s': 'Création de %s',
	'Installing %s': 'Installation de %s',
	'Installed %s. It is in the font picker now.':
		'%s installée. Elle est dans le sélecteur de polices.',
	'Downloaded %d file(s).': '%d fichier(s) téléchargé(s).',
	'Nothing was installed.': 'Rien n’a été installé.',
	'Only an administrator can add fonts to this site. The files were downloaded instead.':
		'Seul un administrateur peut ajouter des polices à ce site. Les fichiers ont été téléchargés.',
	'Draft saved in this browser': 'Brouillon enregistré dans ce navigateur',
	'Print the sheet': 'Imprimer la feuille',
	'Read the photo back': 'Lire la photo',
	Include: 'Contenu',
	'Only characters still missing': 'Seulement les caractères manquants',
	'Every character': 'Tous les caractères',
	Print: 'Imprimer',
	'Download as image': 'Télécharger en image',
	'Choose a photo': 'Choisir une photo',
	'Read sheet': 'Lire la feuille',
	'Nothing left to write.': 'Il ne reste rien à écrire.',
	'%1$d characters on %2$d sheet(s).': '%1$d caractères sur %2$d feuille(s).',
	'Take these over': 'Reprendre ceux-ci',
	'Ready to build': 'Prêt à créer',
	'%d character(s) still needed': 'Il manque encore %d caractères',
	'Copy CSS': 'Copier le CSS',
	'CSS copied': 'CSS copié',
	'floats above the line': 'flotte au-dessus de la ligne',
	'sinks below the line': 'descend sous la ligne',
	'taller than the rest': 'plus haute que les autres',
	'shorter than the rest': 'plus basse que les autres',
	'much wider than the rest': 'bien plus large que les autres',
	'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.': 'Tape un mot, puis fais glisser l’espace entre deux lettres pour corriger cette paire, ou le bord d’une lettre pour changer l’air de ce côté. Les flèches ajustent finement, Maj pour des pas plus grands.',
	'Light': 'Light',
	'Regular': 'Regular',
	'Bold': 'Bold',
	'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.': 'Photographie la feuille remplie d’en haut, les quatre carrés d’angle visibles. Une prise de biais convient : les angles la redressent.',
	'write one character per box': 'un caractère par case',
	'Reading the photo': 'Lecture de la photo',
	'Corners found, check them and read the sheet': 'Angles trouvés : vérifie-les et lis la feuille',
	'Corners not found, drag the four dots onto the corner squares': 'Angles introuvables : fais glisser les quatre points sur les carrés',
	'That image could not be read': 'Cette image n’a pas pu être lue',
	'Those four corners do not form a sheet': 'Ces quatre angles ne forment pas une feuille',
	'Reading the boxes': 'Lecture des cases',
	'Found %d characters': '%d caractères trouvés',
	'No writing found in the boxes': 'Aucune écriture trouvée dans les cases',
	'What was found': 'Ce qui a été trouvé',
	'Click a character to leave it out. The rest are taken over when you confirm.': 'Clique sur un caractère pour l’écarter. Le reste est repris à la validation.',
	'Took over %d characters': '%d caractères repris',
	'top left': 'en haut à gauche',
	'top right': 'en haut à droite',
	'bottom right': 'en bas à droite',
	'bottom left': 'en bas à gauche',
	'This font has no project inside it.': 'Cette police ne contient aucun projet.',
	'Opened %s': '%s ouvert',
	'Draw an accent once, and every letter that needs it is built for you.': 'Dessine un accent une fois, et chaque lettre qui en a besoin est construite pour toi.',
	// The generated route (1.5.0).
	'Generate':
		'Générer',
	'Handwriting':
		'Écriture manuscrite',
	'Describe it':
		'La décrire',
	'From a note':
		'D’après une note',
	'Describe the handwriting in a few words, and both sheets are written in it.':
		'Décrire l’écriture en quelques mots : les deux feuilles sont écrites avec.',
	'For example: neat, slightly slanted school handwriting with a blue ballpoint pen':
		'Par exemple : écriture scolaire soignée, légèrement penchée, au stylo bille bleu',
	'School hand':
		'Écriture scolaire',
	'neat, rounded school handwriting with a blue ballpoint pen':
		'écriture scolaire soignée et arrondie au stylo bille bleu',
	'Quick scribble':
		'Griffonnage rapide',
	'a quick, slightly untidy everyday scribble with a black ballpoint pen':
		'une écriture rapide du quotidien, un peu brouillonne, au stylo bille noir',
	'Elegant cursive':
		'Cursive élégante',
	'elegant, flowing cursive with long loops, written with a fountain pen':
		'cursive élégante et fluide aux longues boucles, écrite au stylo plume',
	'Felt-tip marker':
		'Feutre',
	'bold, upright felt-tip marker handwriting with simple, rounded shapes':
		'écriture au feutre épaisse et droite, aux formes simples et arrondies',
	'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.':
		'Une photo de quelques lignes manuscrites suffit. Les caractères absents de la note sont écrits dans le même style.',
	'From the media library':
		'Depuis la médiathèque',
	'Use image':
		'Utiliser l’image',
	'Handwritten note':
		'Note manuscrite',
	'Anything to add (optional)':
		'Autre chose à ajouter (facultatif)',
	'For example: a little bolder':
		'Par exemple : un peu plus épais',
	'Sheets':
		'Feuilles',
	'AI provider':
		'Fournisseur d’IA',
	'No AI provider configured.':
		'Aucun fournisseur d’IA configuré.',
	'Open settings':
		'Ouvrir les réglages',
	'Write the sheets':
		'Écrire les feuilles',
	'Writing sheet %1$d of %2$d':
		'Écriture de la feuille %1$d sur %2$d',
	'Reading sheet %1$d of %2$d':
		'Lecture de la feuille %1$d sur %2$d',
	'The provider returned no image.':
		'Le fournisseur n’a renvoyé aucune image.',
	'The written sheet came back without its corner squares.':
		'La feuille écrite est revenue sans ses carrés d’angle.',
	'Choose a photo of a handwritten note first.':
		'Choisissez d’abord la photo d’une note manuscrite.',
	'Written sheets':
		'Feuilles écrites',
	'Sheet %d':
		'Feuille %d',
	'Download the sheets':
		'Télécharger les feuilles',
	'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.':
		'%d caractère(s) n’ont pas pu être lus. Dessinez-les ou faites réécrire les feuilles avec les seuls caractères manquants.',
};

const PT = {
	'Add a text layer': 'Adicionar uma camada de texto',
	'Insert a specimen': 'Inserir um espécime',
	'Trace over':
		'Modelo',
	'Nothing':
		'Nenhum',
	'Worth a look':
		'Verificar',
	'%d character(s) sit oddly next to the others.':
		'%d caracteres destoam dos demais.',
	'Stand them on the baseline':
		'Apoiá-los na linha de base',
	'%d character(s) moved onto the baseline':
		'%d caracteres apoiados na linha de base',
	'Spacing':
		'Espaçamento',
	'Reset this':
		'Redefinir isto',
	'Reset all spacing':
		'Redefinir todo o espaçamento',
	'Drag a gap or a letter edge':
		'Arraste um espaço ou a borda de uma letra',
	'automatic':
		'automático',
	'left':
		'esquerda',
	'right':
		'direita',
	'%1$d pair(s), %2$d letter(s) adjusted':
		'%1$d pares, %2$d letras ajustadas',
	'Nib': 'Pena',
	'Round': 'Redonda',
	'Chisel': 'Chanfrada',
	'Nib angle': 'Ângulo da pena',
	'Nib width': 'Largura da pena',
	'Join here': 'Ligar aqui',
	'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.':
		'Imprima a cem por cento, sem deixar a impressora redimensionar a página. Escreva um caractere por caixa, apoiado na linha de base mais forte. As guias impressas são removidas ao ler a folha.',
	'Reading an older sheet': 'Lendo uma folha anterior',
	'The selection has to match the sheet you are about to read.': 'A seleção precisa corresponder à folha que você vai ler.',
	'Handwriting Fonts': 'Handwriting Fonts',
	'Draw an alphabet, get a font this site can use everywhere.':
		'Desenhe um alfabeto e obtenha uma fonte que este site pode usar em todo lugar.',
	Draw: 'Desenhar',
	Sheet: 'Folha',
	Capitals: 'Maiúsculas',
	Lowercase: 'Minúsculas',
	Numbers: 'Números',
	Punctuation: 'Pontuação',
	Accents: 'Acentos',
	'Extra letters': 'Letras adicionais',
	'More punctuation': 'Mais pontuação',
	optional: 'opcional',
	Progress: 'Progresso',
	Acute: 'Agudo',
	Grave: 'Grave',
	Circumflex: 'Circunflexo',
	Tilde: 'Til',
	Diaeresis: 'Trema',
	Cedilla: 'Cedilha',
	'%1$d of %2$d drawn': '%1$d de %2$d desenhados',
	Undo: 'Desfazer',
	Erase: 'Apagar',
	'Clear character': 'Limpar caractere',
	Previous: 'Anterior',
	Next: 'Próximo',
	Preview: 'Prévia',
	Font: 'Fonte',
	'Family name': 'Nome da família',
	Weights: 'Pesos',
	'Add an italic': 'Adicionar itálico',
	Pen: 'Caneta',
	'Pen width': 'Espessura do traço',
	Smoothing: 'Suavização',
	Pressure: 'Pressão',
	Spacing: 'Espaçamento',
	Tracking: 'Entreletras',
	'Join the letters up': 'Ligar as letras',
	Overlap: 'Sobreposição',
	'Kern automatically': 'Kerning automático',
	Heights: 'Alturas',
	'Cap height': 'Altura de maiúsculas',
	'x-height': 'Altura de x',
	Ascender: 'Ascendente',
	Descender: 'Descendente',
	Baseline: 'Linha de base',
	Cap: 'Maiúscula',
	Project: 'Projeto',
	'Start over': 'Começar de novo',
	'Saved drafts': 'Rascunhos salvos',
	'Open an installed font': 'Abrir uma fonte instalada',
	'Open a font file': 'Abrir um arquivo de fonte',
	'Delete draft': 'Excluir rascunho',
	'Build and install': 'Criar e instalar',
	'Build and download': 'Criar e baixar',
	Download: 'Baixar',
	Close: 'Fechar',
	'Draw the letters marked as required before building.':
		'Desenhe os caracteres necessários antes de criar a fonte.',
	'Building %s': 'Criando %s',
	'Installing %s': 'Instalando %s',
	'Installed %s. It is in the font picker now.':
		'%s instalada. Já está no seletor de fontes.',
	'Downloaded %d file(s).': '%d arquivo(s) baixado(s).',
	'Nothing was installed.': 'Nada foi instalado.',
	'Only an administrator can add fonts to this site. The files were downloaded instead.':
		'Somente um administrador pode adicionar fontes a este site. Os arquivos foram baixados.',
	'Draft saved in this browser': 'Rascunho salvo neste navegador',
	'Print the sheet': 'Imprimir a folha',
	'Read the photo back': 'Ler a foto',
	Include: 'Incluir',
	'Only characters still missing': 'Apenas os caracteres que faltam',
	'Every character': 'Todos os caracteres',
	Print: 'Imprimir',
	'Download as image': 'Baixar como imagem',
	'Choose a photo': 'Escolher uma foto',
	'Read sheet': 'Ler folha',
	'Nothing left to write.': 'Não falta nada para escrever.',
	'%1$d characters on %2$d sheet(s).': '%1$d caracteres em %2$d folha(s).',
	'Take these over': 'Aceitar estes',
	'Ready to build': 'Pronto para criar',
	'%d character(s) still needed': 'Ainda faltam %d caracteres',
	'Copy CSS': 'Copiar CSS',
	'CSS copied': 'CSS copiado',
	'floats above the line': 'flutua acima da linha',
	'sinks below the line': 'desce abaixo da linha',
	'taller than the rest': 'mais alta que as outras',
	'shorter than the rest': 'mais baixa que as outras',
	'much wider than the rest': 'bem mais larga que as outras',
	'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.': 'Digite uma palavra e arraste o espaço entre duas letras para corrigir esse par, ou a borda de uma letra para mudar o ar daquele lado. As setas ajustam aos poucos; com Shift, em passos maiores.',
	'Light': 'Light',
	'Regular': 'Regular',
	'Bold': 'Bold',
	'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.': 'Fotografe a folha preenchida de cima, com os quatro quadrados de canto visíveis. Uma foto inclinada serve: os cantos a endireitam.',
	'write one character per box': 'escreva um caractere por quadro',
	'Reading the photo': 'Lendo a foto',
	'Corners found, check them and read the sheet': 'Cantos encontrados: confira e leia a folha',
	'Corners not found, drag the four dots onto the corner squares': 'Cantos não encontrados: arraste os quatro pontos para os quadrados',
	'That image could not be read': 'Não foi possível ler essa imagem',
	'Those four corners do not form a sheet': 'Esses quatro cantos não formam uma folha',
	'Reading the boxes': 'Lendo os quadros',
	'Found %d characters': '%d caracteres encontrados',
	'No writing found in the boxes': 'Nenhuma escrita encontrada nos quadros',
	'What was found': 'O que foi encontrado',
	'Click a character to leave it out. The rest are taken over when you confirm.': 'Clique num caractere para deixá-lo de fora. O resto é aproveitado ao confirmar.',
	'Took over %d characters': '%d caracteres aproveitados',
	'top left': 'canto superior esquerdo',
	'top right': 'canto superior direito',
	'bottom right': 'canto inferior direito',
	'bottom left': 'canto inferior esquerdo',
	'This font has no project inside it.': 'Esta fonte não traz nenhum projeto dentro.',
	'Opened %s': '%s aberto',
	'Draw an accent once, and every letter that needs it is built for you.': 'Desenhe um acento uma vez e cada letra que precisar dele é construída para você.',
	// The generated route (1.5.0).
	'Generate':
		'Gerar',
	'Handwriting':
		'Letra manuscrita',
	'Describe it':
		'Descrever',
	'From a note':
		'A partir de uma nota',
	'Describe the handwriting in a few words, and both sheets are written in it.':
		'Descrever a letra em poucas palavras: as duas folhas são escritas com ela.',
	'For example: neat, slightly slanted school handwriting with a blue ballpoint pen':
		'Por exemplo: letra escolar caprichada, um pouco inclinada, com caneta esferográfica azul',
	'School hand':
		'Letra escolar',
	'neat, rounded school handwriting with a blue ballpoint pen':
		'letra escolar caprichada e arredondada com caneta esferográfica azul',
	'Quick scribble':
		'Rabisco rápido',
	'a quick, slightly untidy everyday scribble with a black ballpoint pen':
		'uma letra rápida do dia a dia, um pouco desarrumada, com caneta esferográfica preta',
	'Elegant cursive':
		'Cursiva elegante',
	'elegant, flowing cursive with long loops, written with a fountain pen':
		'cursiva elegante e fluida com laçadas longas, escrita com caneta-tinteiro',
	'Felt-tip marker':
		'Caneta hidrográfica',
	'bold, upright felt-tip marker handwriting with simple, rounded shapes':
		'letra de caneta hidrográfica grossa e reta, com formas simples e arredondadas',
	'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.':
		'Uma foto de algumas linhas escritas à mão basta. Os caracteres que não aparecem na nota são escritos no mesmo estilo.',
	'From the media library':
		'Da biblioteca de mídia',
	'Use image':
		'Usar imagem',
	'Handwritten note':
		'Nota manuscrita',
	'Anything to add (optional)':
		'Algo a acrescentar (opcional)',
	'For example: a little bolder':
		'Por exemplo: um pouco mais grossa',
	'Sheets':
		'Folhas',
	'AI provider':
		'Provedor de IA',
	'No AI provider configured.':
		'Nenhum provedor de IA configurado.',
	'Open settings':
		'Abrir configurações',
	'Write the sheets':
		'Escrever as folhas',
	'Writing sheet %1$d of %2$d':
		'Escrevendo a folha %1$d de %2$d',
	'Reading sheet %1$d of %2$d':
		'Lendo a folha %1$d de %2$d',
	'The provider returned no image.':
		'O provedor não retornou nenhuma imagem.',
	'The written sheet came back without its corner squares.':
		'A folha escrita voltou sem os quadrados dos cantos.',
	'Choose a photo of a handwritten note first.':
		'Escolha primeiro a foto de uma nota manuscrita.',
	'Written sheets':
		'Folhas escritas',
	'Sheet %d':
		'Folha %d',
	'Download the sheets':
		'Baixar as folhas',
	'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.':
		'Não foi possível ler %d caractere(s). Desenhe-os ou escreva as folhas de novo apenas com os caracteres que faltam.',
};

const IT = {
	'Add a text layer': 'Aggiungi un livello di testo',
	'Insert a specimen': 'Inserisci un campionario',
	'Trace over':
		'Modello',
	'Nothing':
		'Nessuno',
	'Worth a look':
		'Da controllare',
	'%d character(s) sit oddly next to the others.':
		'%d caratteri stonano rispetto agli altri.',
	'Stand them on the baseline':
		'Appoggiarli sulla linea di base',
	'%d character(s) moved onto the baseline':
		'%d caratteri appoggiati sulla linea di base',
	'Spacing':
		'Spaziatura',
	'Reset this':
		'Reimposta questo',
	'Reset all spacing':
		'Reimposta tutta la spaziatura',
	'Drag a gap or a letter edge':
		'Trascina uno spazio o il bordo di una lettera',
	'automatic':
		'automatico',
	'left':
		'sinistra',
	'right':
		'destra',
	'%1$d pair(s), %2$d letter(s) adjusted':
		'%1$d coppie, %2$d lettere regolate',
	'Nib': 'Pennino',
	'Round': 'Tondo',
	'Chisel': 'A becco',
	'Nib angle': 'Angolo del pennino',
	'Nib width': 'Larghezza del pennino',
	'Join here': 'Unire qui',
	'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.':
		'Stampa al cento per cento, senza lasciare che la stampante ridimensioni la pagina. Scrivi un carattere per casella, appoggiato sulla linea di base più marcata. Le guide stampate vengono rimosse alla lettura.',
	'Reading an older sheet': 'Lettura di un foglio precedente',
	'The selection has to match the sheet you are about to read.': 'La selezione deve corrispondere al foglio che stai per leggere.',
	'Handwriting Fonts': 'Handwriting Fonts',
	'Draw an alphabet, get a font this site can use everywhere.':
		'Disegna un alfabeto e ottieni un carattere utilizzabile ovunque su questo sito.',
	Draw: 'Disegna',
	Sheet: 'Foglio',
	Capitals: 'Maiuscole',
	Lowercase: 'Minuscole',
	Numbers: 'Numeri',
	Punctuation: 'Punteggiatura',
	Accents: 'Accenti',
	'Extra letters': 'Altre lettere',
	'More punctuation': 'Altra punteggiatura',
	optional: 'facoltativo',
	Progress: 'Avanzamento',
	Acute: 'Acuto',
	Grave: 'Grave',
	Circumflex: 'Circonflesso',
	Tilde: 'Tilde',
	Diaeresis: 'Dieresi',
	Cedilla: 'Cediglia',
	'%1$d of %2$d drawn': '%1$d di %2$d disegnati',
	Undo: 'Annulla',
	Erase: 'Cancella',
	'Clear character': 'Svuota carattere',
	Previous: 'Precedente',
	Next: 'Successivo',
	Preview: 'Anteprima',
	Font: 'Carattere',
	'Family name': 'Nome della famiglia',
	Weights: 'Pesi',
	'Add an italic': 'Aggiungi un corsivo',
	Pen: 'Penna',
	'Pen width': 'Spessore del tratto',
	Smoothing: 'Levigatura',
	Pressure: 'Pressione',
	Spacing: 'Spaziatura',
	Tracking: 'Crenatura',
	'Join the letters up': 'Unire le lettere',
	Overlap: 'Sovrapposizione',
	'Kern automatically': 'Crenatura automatica',
	Heights: 'Altezze',
	'Cap height': 'Altezza maiuscole',
	'x-height': 'Altezza della x',
	Ascender: 'Ascendente',
	Descender: 'Discendente',
	Baseline: 'Linea di base',
	Cap: 'Maiuscola',
	Project: 'Progetto',
	'Start over': 'Ricomincia',
	'Saved drafts': 'Bozze salvate',
	'Open an installed font': 'Apri un carattere installato',
	'Open a font file': 'Apri un file di carattere',
	'Delete draft': 'Elimina bozza',
	'Build and install': 'Crea e installa',
	'Build and download': 'Crea e scarica',
	Download: 'Scarica',
	Close: 'Chiudi',
	'Draw the letters marked as required before building.':
		'Disegna i caratteri necessari prima di creare il font.',
	'Building %s': 'Creazione di %s',
	'Installing %s': 'Installazione di %s',
	'Installed %s. It is in the font picker now.':
		'%s installato. Ora è nel selettore dei caratteri.',
	'Downloaded %d file(s).': '%d file scaricati.',
	'Nothing was installed.': 'Non è stato installato nulla.',
	'Only an administrator can add fonts to this site. The files were downloaded instead.':
		'Solo un amministratore può aggiungere caratteri a questo sito. I file sono stati scaricati.',
	'Draft saved in this browser': 'Bozza salvata in questo browser',
	'Print the sheet': 'Stampa il foglio',
	'Read the photo back': 'Leggi la foto',
	Include: 'Contenuto',
	'Only characters still missing': 'Solo i caratteri mancanti',
	'Every character': 'Tutti i caratteri',
	Print: 'Stampa',
	'Download as image': 'Scarica come immagine',
	'Choose a photo': 'Scegli una foto',
	'Read sheet': 'Leggi foglio',
	'Nothing left to write.': 'Non manca più nulla.',
	'%1$d characters on %2$d sheet(s).': '%1$d caratteri su %2$d fogli.',
	'Take these over': 'Accetta questi',
	'Ready to build': 'Pronto per la creazione',
	'%d character(s) still needed': 'Mancano ancora %d caratteri',
	'Copy CSS': 'Copia CSS',
	'CSS copied': 'CSS copiato',
	'floats above the line': 'galleggia sopra la linea',
	'sinks below the line': 'scende sotto la linea',
	'taller than the rest': 'più alta delle altre',
	'shorter than the rest': 'più bassa delle altre',
	'much wider than the rest': 'molto più larga delle altre',
	'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.': 'Scrivi una parola, poi trascina lo spazio fra due lettere per correggere quella coppia, o il bordo di una lettera per cambiare l’aria da quel lato. Le frecce regolano poco per volta, con Maiusc a passi più ampi.',
	'Light': 'Light',
	'Regular': 'Regular',
	'Bold': 'Bold',
	'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.': 'Fotografa il foglio compilato dall’alto, con i quattro quadrati d’angolo visibili. Va bene anche di sbieco: gli angoli lo raddrizzano.',
	'write one character per box': 'un carattere per casella',
	'Reading the photo': 'Lettura della foto',
	'Corners found, check them and read the sheet': 'Angoli trovati: controllali e leggi il foglio',
	'Corners not found, drag the four dots onto the corner squares': 'Angoli non trovati: trascina i quattro punti sui quadrati',
	'That image could not be read': 'Non è stato possibile leggere questa immagine',
	'Those four corners do not form a sheet': 'Questi quattro angoli non formano un foglio',
	'Reading the boxes': 'Lettura delle caselle',
	'Found %d characters': '%d caratteri trovati',
	'No writing found in the boxes': 'Nessuna scrittura trovata nelle caselle',
	'What was found': 'Che cosa è stato trovato',
	'Click a character to leave it out. The rest are taken over when you confirm.': 'Fai clic su un carattere per escluderlo. Il resto viene ripreso alla conferma.',
	'Took over %d characters': '%d caratteri ripresi',
	'top left': 'in alto a sinistra',
	'top right': 'in alto a destra',
	'bottom right': 'in basso a destra',
	'bottom left': 'in basso a sinistra',
	'This font has no project inside it.': 'Questo font non contiene alcun progetto.',
	'Opened %s': '%s aperto',
	'Draw an accent once, and every letter that needs it is built for you.': 'Disegna un accento una volta e ogni lettera che ne ha bisogno viene costruita da sola.',
	// The generated route (1.5.0).
	'Generate':
		'Genera',
	'Handwriting':
		'Scrittura a mano',
	'Describe it':
		'Descriverla',
	'From a note':
		'Da un appunto',
	'Describe the handwriting in a few words, and both sheets are written in it.':
		'Descrivere la scrittura in poche parole: entrambi i fogli vengono scritti così.',
	'For example: neat, slightly slanted school handwriting with a blue ballpoint pen':
		'Per esempio: scrittura scolastica ordinata, leggermente inclinata, con penna a sfera blu',
	'School hand':
		'Scrittura scolastica',
	'neat, rounded school handwriting with a blue ballpoint pen':
		'scrittura scolastica ordinata e rotonda con penna a sfera blu',
	'Quick scribble':
		'Scarabocchio veloce',
	'a quick, slightly untidy everyday scribble with a black ballpoint pen':
		'una scrittura veloce di tutti i giorni, un po’ disordinata, con penna a sfera nera',
	'Elegant cursive':
		'Corsivo elegante',
	'elegant, flowing cursive with long loops, written with a fountain pen':
		'corsivo elegante e scorrevole con lunghi occhielli, scritto con la stilografica',
	'Felt-tip marker':
		'Pennarello',
	'bold, upright felt-tip marker handwriting with simple, rounded shapes':
		'scrittura a pennarello marcata e diritta, con forme semplici e arrotondate',
	'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.':
		'Basta la foto di qualche riga scritta a mano. I caratteri che l’appunto non mostra vengono scritti nello stesso stile.',
	'From the media library':
		'Dalla libreria media',
	'Use image':
		'Usa immagine',
	'Handwritten note':
		'Appunto scritto a mano',
	'Anything to add (optional)':
		'Altro da aggiungere (facoltativo)',
	'For example: a little bolder':
		'Per esempio: un po’ più marcata',
	'Sheets':
		'Fogli',
	'AI provider':
		'Provider IA',
	'No AI provider configured.':
		'Nessun provider IA configurato.',
	'Open settings':
		'Apri impostazioni',
	'Write the sheets':
		'Scrivi i fogli',
	'Writing sheet %1$d of %2$d':
		'Scrittura del foglio %1$d di %2$d',
	'Reading sheet %1$d of %2$d':
		'Lettura del foglio %1$d di %2$d',
	'The provider returned no image.':
		'Il provider non ha restituito alcuna immagine.',
	'The written sheet came back without its corner squares.':
		'Il foglio scritto è tornato senza i quadrati agli angoli.',
	'Choose a photo of a handwritten note first.':
		'Scegli prima la foto di un appunto scritto a mano.',
	'Written sheets':
		'Fogli scritti',
	'Sheet %d':
		'Foglio %d',
	'Download the sheets':
		'Scarica i fogli',
	'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.':
		'Non è stato possibile leggere %d caratteri. Disegnali oppure fai riscrivere i fogli solo con i caratteri mancanti.',
};

const NL = {
	'Add a text layer': 'Tekstlaag toevoegen',
	'Insert a specimen': 'Letterproef invoegen',
	'Trace over': 'Sjabloon',
	Nothing: 'Geen',
	'Worth a look': 'Even nakijken',
	'%d character(s) sit oddly next to the others.':
		'%d teken(s) vallen uit de toon naast de rest.',
	'Stand them on the baseline': 'Op de basislijn zetten',
	'%d character(s) moved onto the baseline':
		'%d teken(s) op de basislijn gezet',
	'floats above the line': 'zweeft boven de lijn',
	'sinks below the line': 'zakt onder de lijn',
	'taller than the rest': 'hoger dan de rest',
	'shorter than the rest': 'lager dan de rest',
	'much wider than the rest': 'veel breder dan de rest',
	Spacing: 'Spatiëring',
	'Reset this': 'Deze resetten',
	'Reset all spacing': 'Alle spatiëring resetten',
	'Drag a gap or a letter edge': 'Sleep een tussenruimte of een letterrand',
	automatic: 'automatisch',
	left: 'links',
	right: 'rechts',
	'%1$d pair(s), %2$d letter(s) adjusted':
		'%1$d paar, %2$d letter(s) aangepast',
	'Type a word, then drag the gap between two letters to correct that pair, or drag the edge of a letter to change the air on that side. Arrow keys nudge, and hold Shift for bigger steps.':
		'Typ een woord en sleep dan de ruimte tussen twee letters om dat paar te corrigeren, of sleep de rand van een letter om de lucht aan die kant te wijzigen. Met de pijltoetsen verschuif je fijn, houd Shift ingedrukt voor grotere stappen.',
	Nib: 'Penpunt',
	Round: 'Rond',
	Chisel: 'Breedpen',
	'Nib angle': 'Penhoek',
	'Nib width': 'Penbreedte',
	'Join here': 'Hier verbinden',
	'Reading an older sheet': 'Een ouder vel inlezen',
	'The selection has to match the sheet you are about to read.':
		'De selectie moet passen bij het vel dat je gaat inlezen.',
	'Handwriting Fonts': 'Handwriting Fonts',
	'Draw an alphabet, get a font this site can use everywhere.':
		'Teken een alfabet en krijg een lettertype dat deze site overal kan gebruiken.',
	Draw: 'Tekenen',
	Sheet: 'Vel',
	Capitals: 'Hoofdletters',
	Lowercase: 'Kleine letters',
	Numbers: 'Cijfers',
	Punctuation: 'Leestekens',
	Accents: 'Accenten',
	'Extra letters': 'Extra letters',
	'More punctuation': 'Meer leestekens',
	optional: 'optioneel',
	Progress: 'Voortgang',
	Acute: 'Accent aigu',
	Grave: 'Accent grave',
	Circumflex: 'Accent circonflexe',
	Tilde: 'Tilde',
	Diaeresis: 'Trema',
	Cedilla: 'Cedille',
	'%1$d of %2$d drawn': '%1$d van %2$d getekend',
	Undo: 'Ongedaan maken',
	Erase: 'Uitgummen',
	'Clear character': 'Teken wissen',
	Previous: 'Vorige',
	Next: 'Volgende',
	Preview: 'Voorbeeld',
	Font: 'Lettertype',
	'Family name': 'Lettertypenaam',
	Weights: 'Diktes',
	Light: 'Light',
	Regular: 'Regular',
	Bold: 'Bold',
	'Add an italic': 'Cursief toevoegen',
	Pen: 'Pen',
	'Pen width': 'Pendikte',
	Smoothing: 'Vloeiendheid',
	Pressure: 'Pendruk',
	Tracking: 'Letterafstand',
	'Join the letters up': 'Letters verbinden',
	Overlap: 'Overlap',
	'Kern automatically': 'Automatische kerning',
	Heights: 'Hoogten',
	'Cap height': 'Kapitaalhoogte',
	'x-height': 'x-hoogte',
	Ascender: 'Stoklengte',
	Descender: 'Staartlengte',
	Baseline: 'Basislijn',
	Cap: 'Kapitaal',
	Project: 'Project',
	'Start over': 'Opnieuw beginnen',
	'Saved drafts': 'Opgeslagen concepten',
	'Open an installed font': 'Geïnstalleerd lettertype openen',
	'Open a font file': 'Lettertypebestand openen',
	'Delete draft': 'Concept verwijderen',
	'Build and install': 'Bouwen en installeren',
	'Build and download': 'Bouwen en downloaden',
	Download: 'Downloaden',
	Close: 'Sluiten',
	'Draw the letters marked as required before building.':
		'Teken de letters die als verplicht zijn gemarkeerd voordat je bouwt.',
	'Building %s': '%s wordt gebouwd',
	'Installing %s': '%s wordt geïnstalleerd',
	'Installed %s. It is in the font picker now.':
		'%s geïnstalleerd. Staat nu in de lettertypekiezer.',
	'Downloaded %d file(s).': '%d bestand(en) gedownload.',
	'Nothing was installed.': 'Er is niets geïnstalleerd.',
	'Only an administrator can add fonts to this site. The files were downloaded instead.':
		'Alleen een beheerder kan lettertypen aan deze site toevoegen. De bestanden zijn in plaats daarvan gedownload.',
	'Draft saved in this browser': 'Concept opgeslagen in deze browser',
	'Print the sheet': 'Vel afdrukken',
	'Read the photo back': 'Foto inlezen',
	'Print at one hundred percent, do not let the printer scale the page. Write one character per box, standing on the stronger baseline. The printed rules are removed again when the sheet is read back.':
		'Druk af op honderd procent en laat de printer de pagina niet schalen. Schrijf één teken per vakje, staand op de zwaardere basislijn. De gedrukte hulplijnen worden bij het inlezen weer verwijderd.',
	'Photograph the finished sheet from above with all four corner squares visible. An angled shot is fine, the corners straighten it out.':
		'Fotografeer het ingevulde vel van bovenaf, met alle vier de hoekvierkanten in beeld. Een schuine opname is prima, de hoeken trekken hem recht.',
	Include: 'Inhoud',
	'Only characters still missing': 'Alleen ontbrekende tekens',
	'Every character': 'Alle tekens',
	Print: 'Afdrukken',
	'Download as image': 'Als afbeelding downloaden',
	'Choose a photo': 'Foto kiezen',
	'Read sheet': 'Vel inlezen',
	'Nothing left to write.': 'Er is niets meer te schrijven.',
	'%1$d characters on %2$d sheet(s).': '%1$d tekens op %2$d vel(len).',
	'write one character per box': 'schrijf één teken per vakje',
	'Reading the photo': 'Foto wordt gelezen',
	'Corners found, check them and read the sheet':
		'Hoeken gevonden, controleer ze en lees het vel in',
	'Corners not found, drag the four dots onto the corner squares':
		'Hoeken niet gevonden, sleep de vier punten op de hoekvierkanten',
	'That image could not be read': 'Die afbeelding kon niet worden gelezen',
	'Those four corners do not form a sheet': 'Die vier hoeken vormen geen vel',
	'Reading the boxes': 'Vakjes worden gelezen',
	'Found %d characters': '%d tekens gevonden',
	'No writing found in the boxes': 'Geen schrift gevonden in de vakjes',
	'What was found': 'Gevonden tekens',
	'Click a character to leave it out. The rest are taken over when you confirm.':
		'Klik op een teken om het weg te laten. De rest wordt overgenomen als je bevestigt.',
	'Take these over': 'Deze overnemen',
	'Took over %d characters': '%d tekens overgenomen',
	'top left': 'linksboven',
	'top right': 'rechtsboven',
	'bottom right': 'rechtsonder',
	'bottom left': 'linksonder',
	'This font has no project inside it.': 'Dit lettertype bevat geen project.',
	'Opened %s': '%s geopend',
	'Draw an accent once, and every letter that needs it is built for you.':
		'Teken een accent één keer en elke letter die het nodig heeft wordt voor je gebouwd.',
	'Ready to build': 'Klaar om te bouwen',
	'%d character(s) still needed': 'Er ontbreken nog %d teken(s)',
	'Copy CSS': 'CSS kopiëren',
	'CSS copied': 'CSS gekopieerd',
	// The generated route (1.5.0).
	'Generate':
		'Genereren',
	'Handwriting':
		'Handschrift',
	'Describe it':
		'Beschrijven',
	'From a note':
		'Uit een notitie',
	'Describe the handwriting in a few words, and both sheets are written in it.':
		'Het handschrift in een paar woorden beschrijven: beide vellen worden erin geschreven.',
	'For example: neat, slightly slanted school handwriting with a blue ballpoint pen':
		'Bijvoorbeeld: net, licht hellend schoolschrift met een blauwe balpen',
	'School hand':
		'Schoolschrift',
	'neat, rounded school handwriting with a blue ballpoint pen':
		'net, rond schoolschrift met een blauwe balpen',
	'Quick scribble':
		'Snelle krabbel',
	'a quick, slightly untidy everyday scribble with a black ballpoint pen':
		'een snel, wat slordig alledaags handschrift met een zwarte balpen',
	'Elegant cursive':
		'Elegant schrijfschrift',
	'elegant, flowing cursive with long loops, written with a fountain pen':
		'elegant, vloeiend schrijfschrift met lange lussen, geschreven met een vulpen',
	'Felt-tip marker':
		'Viltstift',
	'bold, upright felt-tip marker handwriting with simple, rounded shapes':
		'krachtig, rechtop viltstifthandschrift met eenvoudige, ronde vormen',
	'A photo of a few handwritten lines is enough. Characters the note does not show are written to match.':
		'Een foto van een paar handgeschreven regels is genoeg. Tekens die niet in de notitie staan, worden er passend bij geschreven.',
	'From the media library':
		'Uit de mediabibliotheek',
	'Use image':
		'Afbeelding gebruiken',
	'Handwritten note':
		'Handgeschreven notitie',
	'Anything to add (optional)':
		'Nog iets toe te voegen (optioneel)',
	'For example: a little bolder':
		'Bijvoorbeeld: iets vetter',
	'Sheets':
		'Vellen',
	'AI provider':
		'AI-aanbieder',
	'No AI provider configured.':
		'Geen AI-aanbieder ingesteld.',
	'Open settings':
		'Instellingen openen',
	'Write the sheets':
		'Vellen laten schrijven',
	'Writing sheet %1$d of %2$d':
		'Vel %1$d van %2$d wordt geschreven',
	'Reading sheet %1$d of %2$d':
		'Vel %1$d van %2$d wordt gelezen',
	'The provider returned no image.':
		'De aanbieder gaf geen afbeelding terug.',
	'The written sheet came back without its corner squares.':
		'Het geschreven vel kwam terug zonder zijn hoekvierkanten.',
	'Choose a photo of a handwritten note first.':
		'Kies eerst een foto van een handgeschreven notitie.',
	'Written sheets':
		'Geschreven vellen',
	'Sheet %d':
		'Vel %d',
	'Download the sheets':
		'Vellen downloaden',
	'%d character(s) could not be read. Draw them, or write the sheets again with only the missing characters.':
		'%d teken(s) konden niet worden gelezen. Teken ze, of laat de vellen opnieuw schrijven met alleen de ontbrekende tekens.',
};

const DICTS = { de: DE, es: ES, fr: FR, pt: PT, it: IT, nl: NL };
const DICT = DICTS[ LOCALE.slice( 0, 2 ) ] || null;
export const t = ( s ) => ( DICT && DICT[ s ] ) || s;
