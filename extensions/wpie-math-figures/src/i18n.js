/**
 * Six languages, one table each, keyed by the English source string; a
 * missing entry falls back to English. tests/i18n.test.js compares the
 * tables against every t('...') in src/ plus the card, option and note
 * strings. Starter names are names and stay.
 */
const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	( document.documentElement && document.documentElement.lang ) ||
	'en'
).replace( '-', '_' );

const DE = {
	'A number line with marks, intervals and jumps.':
		'Ein Zahlenstrahl mit Markierungen, Intervallen und Sprüngen.',
	Accent: 'Akzent',
	Axes: 'Achsen',
	'Axis labels': 'Achsenbeschriftung',
	Bars: 'Balken',
	'Brand kit': 'Brand Kit',
	Cancel: 'Abbrechen',
	Chalkboard: 'Tafel',
	'Choose a starter or paste your own material.':
		'Wähle einen Starter oder füge eigenes Material ein.',
	Circles: 'Kreise',
	'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.':
		'Befehle: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
	'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.':
		'Befehle: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
	Cream: 'Creme',
	Dark: 'Dunkel',
	'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.':
		'Definiere Punkte wie A = (0, 0) und zeichne mit segment, polygon, circle und angle.',
	Document: 'Dokument',
	'Fine grid': 'Feines Gitter',
	Font: 'Schrift',
	Format: 'Format',
	'Formula size': 'Formelgröße',
	Formula: 'Formel',
	'Formulas, function graphs, geometry, number lines and fractions as editable vector pictures.':
		'Formeln, Funktionsgraphen, Geometrie, Zahlenstrahlen und Brüche als editierbare Vektorbilder.',
	'Fractions as circles, bars, grids or sets.':
		'Brüche als Kreise, Balken, Raster oder Mengen.',
	'Fractions separated by commas: 3/4, 1/2, 1 3/4.':
		'Brüche mit Komma getrennt: 3/4, 1/2, 1 3/4.',
	Fractions: 'Brüche',
	'Frame around the formula': 'Rahmen um die Formel',
	'Function Graph': 'Funktionsgraph',
	'Functions on a coordinate system, with grid, ticks and legend.':
		'Funktionen im Koordinatensystem, mit Gitter, Teilstrichen und Legende.',
	Geometry: 'Geometrie',
	Grid: 'Gitter',
	Grids: 'Raster',
	Ink: 'Tinte',
	'Insert figure': 'Figur einfügen',
	Insert: 'Einfügen',
	'LaTeX in, a typeset formula out.':
		'LaTeX hinein, eine gesetzte Formel heraus.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\.':
		'LaTeX, zum Beispiel \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Neue Zeile mit \\\\.',
	Layout: 'Layout',
	Legend: 'Legende',
	'Line (width of the document)': 'Zeile (Breite des Dokuments)',
	Line: 'Zeile',
	'Loading the formula engine': 'Formelsatz wird geladen',
	Margin: 'Rand',
	Material: 'Material',
	'Math Figures needs a newer WunderPaint.':
		'Math Figures braucht ein neueres WunderPaint.',
	'Multiples of pi': 'Vielfache von Pi',
	'No function named': 'Keine Funktion namens',
	'No grid': 'Kein Gitter',
	'Number Line': 'Zahlenstrahl',
	Numbers: 'Zahlen',
	'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.':
		'Eine Funktion je Zeile: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
	Page: 'Seite',
	Paper: 'Papier',
	'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.':
		'Parameter a, b und c für die Funktionen, zum Beispiel a x^2 + b x + c.',
	Picture: 'Bild',
	'Points, segments, polygons, circles and angles from commands.':
		'Punkte, Strecken, Polygone, Kreise und Winkel aus Befehlen.',
	'Same scale on both axes': 'Gleiche Skalierung auf beiden Achsen',
	Sets: 'Mengen',
	'Show document': 'Dokument zeigen',
	Size: 'Größe',
	Square: 'Quadrat',
	Starters: 'Starter',
	Style: 'Stil',
	Text: 'Text',
	'The formula could not be typeset.':
		'Die Formel konnte nicht gesetzt werden.',
	'The formula engine could not be loaded.':
		'Der Formelsatz konnte nicht geladen werden.',
	'The formula engine did not start.': 'Der Formelsatz ist nicht gestartet.',
	'The formula engine is still loading.': 'Der Formelsatz lädt noch.',
	'The formula is wider than the picture. Lower the size or break the line with \\\\.':
		'Die Formel ist breiter als das Bild. Verringere die Größe oder breche die Zeile mit \\\\ um.',
	Ticks: 'Teilstriche',
	Title: 'Titel',
	'Type a formula in LaTeX to begin.':
		'Tippe eine Formel in LaTeX, um zu beginnen.',
	'Type a function per line, for example f(x) = x^2 - 2.':
		'Tippe eine Funktion je Zeile, zum Beispiel f(x) = x^2 - 2.',
	'Type fractions like 3/4, 1/2 or 1 3/4.':
		'Tippe Brüche wie 3/4, 1/2 oder 1 3/4.',
	'Update figure': 'Figur aktualisieren',
	Update: 'Aktualisieren',
	White: 'Weiß',
	Wide: 'Breit',
	auto: 'auto',
	'x from': 'x von',
	'x to': 'x bis',
	'y from': 'y von',
	'y to': 'y bis',
	'The content is taller than the page. Lower the size or the margin.':
		'Der Inhalt ist höher als die Seite. Verringere die Größe oder den Rand.',
	'No mark named': 'Keine Marke namens',
	'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.':
		'Schreibe einen Absatz. Eine Leerzeile beginnt einen neuen, - einen Aufzählungspunkt, $x^2$ Mathematik, **fett** und *kursiv*.',
	'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.':
		'Ein Schritt je Zeile: 2x + 3 = 7 | 3 abziehen. Eine Zeile mit <=> oder => beginnen ergibt einen Pfeil.',
	'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.':
		'Zeilen mit Zellen, getrennt durch |, eine ----Zeile unter dem Kopf; oder values f(x) = x^2; x = -3..3.',
	'The table is wider than the figure and was scaled down.':
		'Die Tabelle ist breiter als die Figur und wurde verkleinert.',
	'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.':
		'Formeln, Graphen, Geometrie, Zahlenstrahlen, Brüche, Text und Tabellen als eine editierbare Vektorfigur.',
	blocks: 'Blöcke',
	Figure: 'Figur',
	'Add block': 'Block hinzufügen',
	'All starters': 'Alle Starter',
	'Move up': 'Nach oben',
	'Move down': 'Nach unten',
	'Remove block': 'Block entfernen',
	'Notes: one line per mark, key "label" above or below, an optional color.':
		'Notizen: eine Zeile je Marke, Schlüssel "Beschriftung" above oder below, optional eine Farbe.',
	'Use the ink color': 'Tintenfarbe verwenden',
	'Title font': 'Titelschrift',
	'Text font': 'Textschrift',
	'Number the formulas': 'Formeln nummerieren',
	Subtitle: 'Untertitel',
	Caption: 'Bildunterschrift',
	Footnote: 'Fußnote',
	Typography: 'Typografie',
	Element: 'Element',
	Color: 'Farbe',
	Bold: 'Fett',
	Italic: 'Kursiv',
	Alignment: 'Ausrichtung',
	'Space after': 'Abstand danach',
	Block: 'Block',
	Width: 'Breite',
	'Number the steps': 'Schritte nummerieren',
	'Arrows between the steps': 'Pfeile zwischen den Schritten',
	'Header row': 'Kopfzeile',
	'Zebra rows': 'Zebrazeilen',
	Borders: 'Rahmenlinien',
	'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.':
		'LaTeX rein, gesetzte Formel raus; \\mark{a}{...} und eine Notiz beschriften einen Teil.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.':
		'LaTeX, zum Beispiel \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Neue Zeile mit \\\\. Einen Teil mit \\mark{a}{...} markieren und unten beschriften: a "Diskriminante" below.',
	'Paragraphs and bullets with inline math, bold and italic.':
		'Absätze und Aufzählungen mit Mathematik in der Zeile, fett und kursiv.',
	'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.':
		'Eine Leerzeile beginnt einen neuen Absatz, - einen Aufzählungspunkt, $x^2$ setzt Mathematik in der Zeile, **fett** und *kursiv*.',
	'Worked solution': 'Rechenweg',
	'Steps aligned at the equals sign, with an explanation next to each.':
		'Schritte am Gleichheitszeichen ausgerichtet, mit einer Erklärung daneben.',
	'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.':
		'Ein Schritt je Zeile: 2x + 3 = 7 | 3 abziehen. Zeilen, die mit <=> oder => beginnen, bekommen einen Pfeil.',
	Table: 'Tabelle',
	'Rows and columns, or a value table computed from a function.':
		'Zeilen und Spalten, oder eine aus einer Funktion berechnete Wertetabelle.',
	'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.':
		'Zellen getrennt durch |, eine ----Zeile unter dem Kopf. values f(x) = x^2; x = -3..3 step 1 berechnet eine Wertetabelle.',
	'Formulas and text': 'Formeln und Text',
	'Graphs and geometry': 'Graphen und Geometrie',
	'Whole figures': 'Ganze Figuren',
	'Grid paper': 'Karopapier',
	'Lined paper': 'Liniertes Papier',
	Transparent: 'Transparent',
	Left: 'Links',
	Center: 'Mitte',
	Right: 'Rechts',
	'Show the hands': 'Zeiger anzeigen',
	'Second hand': 'Sekundenzeiger',
	'Digital readout': 'Digitalanzeige',
	'Show the numbers': 'Zahlen anzeigen',
	'Base-ten blocks': 'Zehnersystem-Material',
	Clock: 'Uhr',
	'Clock faces for reading and setting the time.':
		'Zifferblätter zum Ablesen und Einstellen der Uhrzeit.',
	'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.':
		'Eine Uhrzeit je Zeile: 7:35, 19:05:30, 7:35 "Morgens". Zahlen, Zeiger, Sekunden und Digitalanzeige sind Optionen.',
	'Hundred square': 'Hunderterfeld',
	'The hundred square, the twenty field and dot fields.':
		'Hunderterfeld, Zwanzigerfeld und Punktefelder.',
	'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).':
		'Befehle: field 100 | 20 | 10, mark 7 14 21 #farbe, hide 5 6, dots 13 (Punkte statt Zahlen, in Fünfern).',
	'Place value': 'Stellenwerttafel',
	'A place value chart, with base-ten blocks if you like.':
		'Eine Stellenwerttafel, auf Wunsch mit Zehnersystem-Material.',
	'One number per line: 4736, 205, 3.75. The columns follow the widest number.':
		'Eine Zahl je Zeile: 4736, 205, 3.75. Die Spalten richten sich nach der längsten Zahl.',
	Multiplication: 'Einmaleins',
	'The multiplication table or single rows of facts, with gaps.':
		'Die Einmaleins-Tafel oder einzelne Reihen, mit Lücken.',
	'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.':
		'Befehle: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (Tafelzellen), hide 3 5 (Aufgaben), hide all.',
	'Number wall': 'Zahlenmauer',
	'Number walls and number triangles with gaps to fill in.':
		'Zahlenmauern und Rechendreiecke mit Lücken zum Ausfüllen.',
	'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.':
		'Befehle: wall 3 5 2 4 (Grundreihe, ? für eine Lücke), hide 2.1 (Reihe von unten . Position), triangle 3 5 2, hide inner | outer | a b ab.',
	Ruler: 'Lineal',
	'A ruler with measured spans and points.':
		'Ein Lineal mit gemessenen Strecken und Punkten.',
	'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".':
		'Befehle: ruler 0..12 cm (auch mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
	'Primary school': 'Grundschule',
	'Roman numerals': 'Römische Ziffern',
	'Ticks only': 'Nur Striche',
	'Blank face': 'Leeres Zifferblatt',
	Th: 'T',
	H: 'H',
	T: 'Z',
	O: 'E',
	t: 'z',
	h: 'h',
	TTh: 'ZT',
	HTh: 'HT',
	M: 'M',
	median: 'Median',
	mean: 'Mittelwert',
	Chart: 'Diagramm',
	'Histogram bins (0 = automatic)': 'Klassen im Histogramm (0 = automatisch)',
	'Counts on the bars': 'Anzahlen auf den Balken',
	'Mean marker': 'Mittelwert markieren',
	'Median marker': 'Median markieren',
	Units: 'Einheiten',
	'Sine and cosine': 'Sinus und Kosinus',
	Tangent: 'Tangens',
	'Marks at the special angles': 'Marken an den besonderen Winkeln',
	'List the elements': 'Elemente eintragen',
	Probabilities: 'Wahrscheinlichkeiten',
	Direction: 'Richtung',
	'Path probabilities': 'Pfadwahrscheinlichkeiten',
	'Hidden edges dashed': 'Verdeckte Kanten gestrichelt',
	'Dimension labels': 'Maße beschriften',
	'Net beside a cube or cuboid': 'Netz neben Würfel oder Quader',
	Statistics: 'Statistik',
	'Dot plot, bar chart, histogram or box plot of a data set.':
		'Punktdiagramm, Balkendiagramm, Histogramm oder Boxplot eines Datensatzes.',
	'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.':
		'data 3, 5, 5, 7, 8, 12 (oder Wörter für Kategorien), label "Punkte". Diagrammart, Klassen, Mittelwert und Median sind Optionen.',
	'Unit circle': 'Einheitskreis',
	'Angles on the unit circle with sine, cosine and tangent.':
		'Winkel am Einheitskreis mit Sinus, Kosinus und Tangens.',
	'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.':
		'Ein Winkel je Zeile: angle 30, angle 30°, angle pi/6, angle 210 "Beschriftung". Exakte Werte an den besonderen Winkeln.',
	'Venn diagrams of two or three sets with shaded regions.':
		'Venn-Diagramme mit zwei oder drei Mengen und schraffierten Bereichen.',
	"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).":
		"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (auch A & B, A ∪ B, A \\ B, A', not A).",
	'Probability tree': 'Baumdiagramm',
	'A tree diagram with probabilities on the branches and along the paths.':
		'Ein Baumdiagramm mit Wahrscheinlichkeiten an den Ästen und entlang der Pfade.',
	'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.':
		'Ein Ast je Zeile, zwei Leerzeichen tiefer für die nächste Stufe: R 0.3, dann R 0.5 und B 0.5. Dezimalzahlen, Prozent oder Brüche.',
	Solids: 'Körper',
	'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.':
		'Würfel, Quader, Zylinder, Kegel, Kugel, Pyramide und Prisma in Kavalierperspektive.',
	'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".':
		'Ein Körper je Zeile: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optional "Beschriftung".',
	'Secondary school': 'Sekundarstufe',
	'Dot plot': 'Punktdiagramm',
	'Bar chart': 'Balkendiagramm',
	Histogram: 'Histogramm',
	'Box plot': 'Boxplot',
	Degrees: 'Grad',
	Radians: 'Bogenmaß',
	'As typed': 'Wie eingegeben',
	Decimal: 'Dezimal',
	Fraction: 'Bruch',
	Percent: 'Prozent',
	'To the right': 'Nach rechts',
	Downwards: 'Nach unten',
};

const ES = {
	'A number line with marks, intervals and jumps.':
		'Una recta numérica con marcas, intervalos y saltos.',
	Accent: 'Acento',
	Axes: 'Ejes',
	'Axis labels': 'Rótulos de los ejes',
	Bars: 'Barras',
	'Brand kit': 'Kit de marca',
	Cancel: 'Cancelar',
	Chalkboard: 'Pizarra',
	'Choose a starter or paste your own material.':
		'Elige un punto de partida o pega tu propio material.',
	Circles: 'Círculos',
	'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.':
		'Comandos: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
	'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.':
		'Comandos: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
	Cream: 'Crema',
	Dark: 'Oscuro',
	'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.':
		'Define puntos como A = (0, 0) y dibuja con segment, polygon, circle y angle.',
	Document: 'Documento',
	'Fine grid': 'Cuadrícula fina',
	Font: 'Fuente',
	Format: 'Formato',
	'Formula size': 'Tamaño de la fórmula',
	Formula: 'Fórmula',
	'Formulas, function graphs, geometry, number lines and fractions as editable vector pictures.':
		'Fórmulas, gráficas de funciones, geometría, rectas numéricas y fracciones como imágenes vectoriales editables.',
	'Fractions as circles, bars, grids or sets.':
		'Fracciones como círculos, barras, cuadrículas o conjuntos.',
	'Fractions separated by commas: 3/4, 1/2, 1 3/4.':
		'Fracciones separadas por comas: 3/4, 1/2, 1 3/4.',
	Fractions: 'Fracciones',
	'Frame around the formula': 'Marco alrededor de la fórmula',
	'Function Graph': 'Gráfica de funciones',
	'Functions on a coordinate system, with grid, ticks and legend.':
		'Funciones en un sistema de coordenadas, con cuadrícula, marcas y leyenda.',
	Geometry: 'Geometría',
	Grid: 'Cuadrícula',
	Grids: 'Cuadrículas',
	Ink: 'Tinta',
	'Insert figure': 'Insertar figura',
	Insert: 'Insertar',
	'LaTeX in, a typeset formula out.':
		'LaTeX entra, sale una fórmula compuesta.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\.':
		'LaTeX, por ejemplo \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nueva línea con \\\\.',
	Layout: 'Diseño',
	Legend: 'Leyenda',
	'Line (width of the document)': 'Línea (ancho del documento)',
	Line: 'Línea',
	'Loading the formula engine': 'Cargando el motor de fórmulas',
	Margin: 'Margen',
	Material: 'Material',
	'Math Figures needs a newer WunderPaint.':
		'Math Figures necesita un WunderPaint más reciente.',
	'Multiples of pi': 'Múltiplos de pi',
	'No function named': 'No hay ninguna función llamada',
	'No grid': 'Sin cuadrícula',
	'Number Line': 'Recta numérica',
	Numbers: 'Números',
	'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.':
		'Una función por línea: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
	Page: 'Página',
	Paper: 'Papel',
	'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.':
		'Parámetros a, b y c para usar en las funciones, por ejemplo a x^2 + b x + c.',
	Picture: 'Imagen',
	'Points, segments, polygons, circles and angles from commands.':
		'Puntos, segmentos, polígonos, círculos y ángulos a partir de comandos.',
	'Same scale on both axes': 'Misma escala en ambos ejes',
	Sets: 'Conjuntos',
	'Show document': 'Mostrar documento',
	Size: 'Tamaño',
	Square: 'Cuadrado',
	Starters: 'Puntos de partida',
	Style: 'Estilo',
	Text: 'Texto',
	'The formula could not be typeset.': 'No se pudo componer la fórmula.',
	'The formula engine could not be loaded.':
		'No se pudo cargar el motor de fórmulas.',
	'The formula engine did not start.': 'El motor de fórmulas no arrancó.',
	'The formula engine is still loading.':
		'El motor de fórmulas todavía se está cargando.',
	'The formula is wider than the picture. Lower the size or break the line with \\\\.':
		'La fórmula es más ancha que la imagen. Reduce el tamaño o corta la línea con \\\\.',
	Ticks: 'Marcas',
	Title: 'Título',
	'Type a formula in LaTeX to begin.':
		'Escribe una fórmula en LaTeX para empezar.',
	'Type a function per line, for example f(x) = x^2 - 2.':
		'Escribe una función por línea, por ejemplo f(x) = x^2 - 2.',
	'Type fractions like 3/4, 1/2 or 1 3/4.':
		'Escribe fracciones como 3/4, 1/2 o 1 3/4.',
	'Update figure': 'Actualizar figura',
	Update: 'Actualizar',
	White: 'Blanco',
	Wide: 'Ancho',
	auto: 'auto',
	'x from': 'x desde',
	'x to': 'x hasta',
	'y from': 'y desde',
	'y to': 'y hasta',
	'The content is taller than the page. Lower the size or the margin.':
		'El contenido es más alto que la página. Reduce el tamaño o el margen.',
	'No mark named': 'No hay marca llamada',
	'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.':
		'Escribe un párrafo. Una línea vacía empieza otro, - una viñeta, $x^2$ matemáticas, **negrita** y *cursiva*.',
	'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.':
		'Un paso por línea: 2x + 3 = 7 | restar 3. Empieza una línea con <=> o => para una flecha.',
	'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.':
		'Filas con celdas separadas por |, una línea --- bajo el encabezado; o values f(x) = x^2; x = -3..3.',
	'The table is wider than the figure and was scaled down.':
		'La tabla es más ancha que la figura y se ha reducido.',
	'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.':
		'Fórmulas, gráficas, geometría, rectas numéricas, fracciones, texto y tablas como una figura vectorial editable.',
	blocks: 'bloques',
	Figure: 'Figura',
	'Add block': 'Añadir bloque',
	'All starters': 'Todos los iniciadores',
	'Move up': 'Subir',
	'Move down': 'Bajar',
	'Remove block': 'Quitar bloque',
	'Notes: one line per mark, key "label" above or below, an optional color.':
		'Notas: una línea por marca, clave "etiqueta" above o below, un color opcional.',
	'Use the ink color': 'Usar el color de tinta',
	'Title font': 'Fuente del título',
	'Text font': 'Fuente del texto',
	'Number the formulas': 'Numerar las fórmulas',
	Subtitle: 'Subtítulo',
	Caption: 'Pie de figura',
	Footnote: 'Nota al pie',
	Typography: 'Tipografía',
	Element: 'Elemento',
	Color: 'Color',
	Bold: 'Negrita',
	Italic: 'Cursiva',
	Alignment: 'Alineación',
	'Space after': 'Espacio después',
	Block: 'Bloque',
	Width: 'Ancho',
	'Number the steps': 'Numerar los pasos',
	'Arrows between the steps': 'Flechas entre los pasos',
	'Header row': 'Fila de encabezado',
	'Zebra rows': 'Filas cebra',
	Borders: 'Bordes',
	'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.':
		'LaTeX dentro, fórmula compuesta fuera; \\mark{a}{...} y una nota etiquetan una parte.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.':
		'LaTeX, por ejemplo \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nueva línea con \\\\. Marca una parte con \\mark{a}{...} y etiquétala abajo: a "Discriminante" below.',
	'Paragraphs and bullets with inline math, bold and italic.':
		'Párrafos y viñetas con matemáticas en línea, negrita y cursiva.',
	'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.':
		'Una línea vacía empieza un párrafo, - una viñeta, $x^2$ compone matemáticas en la línea, **negrita** y *cursiva*.',
	'Worked solution': 'Solución paso a paso',
	'Steps aligned at the equals sign, with an explanation next to each.':
		'Pasos alineados en el signo igual, con una explicación al lado.',
	'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.':
		'Un paso por línea: 2x + 3 = 7 | restar 3. Las líneas que empiezan con <=> o => llevan flecha.',
	Table: 'Tabla',
	'Rows and columns, or a value table computed from a function.':
		'Filas y columnas, o una tabla de valores calculada a partir de una función.',
	'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.':
		'Celdas separadas por |, una línea --- bajo el encabezado. values f(x) = x^2; x = -3..3 step 1 calcula una tabla de valores.',
	'Formulas and text': 'Fórmulas y texto',
	'Graphs and geometry': 'Gráficas y geometría',
	'Whole figures': 'Figuras completas',
	'Grid paper': 'Papel cuadriculado',
	'Lined paper': 'Papel rayado',
	Transparent: 'Transparente',
	Left: 'Izquierda',
	Center: 'Centro',
	Right: 'Derecha',
	'Show the hands': 'Mostrar las manecillas',
	'Second hand': 'Segundero',
	'Digital readout': 'Lectura digital',
	'Show the numbers': 'Mostrar los números',
	'Base-ten blocks': 'Bloques de base diez',
	Clock: 'Reloj',
	'Clock faces for reading and setting the time.':
		'Esferas de reloj para leer y poner la hora.',
	'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.':
		'Una hora por línea: 7:35, 19:05:30, 7:35 "Mañana". Números, manecillas, segundos y lectura digital son opciones.',
	'Hundred square': 'Tabla del cien',
	'The hundred square, the twenty field and dot fields.':
		'La tabla del cien, el campo del veinte y campos de puntos.',
	'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).':
		'Comandos: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (puntos en vez de números, de cinco en cinco).',
	'Place value': 'Valor posicional',
	'A place value chart, with base-ten blocks if you like.':
		'Una tabla de valor posicional, con bloques de base diez si quieres.',
	'One number per line: 4736, 205, 3.75. The columns follow the widest number.':
		'Un número por línea: 4736, 205, 3.75. Las columnas siguen al número más largo.',
	Multiplication: 'Multiplicación',
	'The multiplication table or single rows of facts, with gaps.':
		'La tabla de multiplicar o filas sueltas, con huecos.',
	'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.':
		'Comandos: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (celdas), hide 3 5 (operaciones), hide all.',
	'Number wall': 'Muro de números',
	'Number walls and number triangles with gaps to fill in.':
		'Muros y triángulos de números con huecos para rellenar.',
	'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.':
		'Comandos: wall 3 5 2 4 (fila base, ? para un hueco), hide 2.1 (fila desde abajo . posición), triangle 3 5 2, hide inner | outer | a b ab.',
	Ruler: 'Regla',
	'A ruler with measured spans and points.':
		'Una regla con tramos medidos y puntos.',
	'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".':
		'Comandos: ruler 0..12 cm (también mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
	'Primary school': 'Primaria',
	'Roman numerals': 'Números romanos',
	'Ticks only': 'Solo marcas',
	'Blank face': 'Esfera vacía',
	Th: 'UM',
	H: 'C',
	T: 'D',
	O: 'U',
	t: 'd',
	h: 'c',
	TTh: 'DM',
	HTh: 'CM',
	M: 'U.M.',
	median: 'mediana',
	mean: 'media',
	Chart: 'Gráfico',
	'Histogram bins (0 = automatic)':
		'Intervalos del histograma (0 = automático)',
	'Counts on the bars': 'Recuentos en las barras',
	'Mean marker': 'Marcar la media',
	'Median marker': 'Marcar la mediana',
	Units: 'Unidades',
	'Sine and cosine': 'Seno y coseno',
	Tangent: 'Tangente',
	'Marks at the special angles': 'Marcas en los ángulos notables',
	'List the elements': 'Anotar los elementos',
	Probabilities: 'Probabilidades',
	Direction: 'Dirección',
	'Path probabilities': 'Probabilidades de los caminos',
	'Hidden edges dashed': 'Aristas ocultas discontinuas',
	'Dimension labels': 'Etiquetas de medidas',
	'Net beside a cube or cuboid': 'Desarrollo junto al cubo o el ortoedro',
	Statistics: 'Estadística',
	'Dot plot, bar chart, histogram or box plot of a data set.':
		'Diagrama de puntos, de barras, histograma o diagrama de caja de un conjunto de datos.',
	'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.':
		'data 3, 5, 5, 7, 8, 12 (o palabras para categorías), label "Puntos". El tipo de gráfico, los intervalos, la media y la mediana son opciones.',
	'Unit circle': 'Circunferencia unidad',
	'Angles on the unit circle with sine, cosine and tangent.':
		'Ángulos en la circunferencia unidad con seno, coseno y tangente.',
	'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.':
		'Un ángulo por línea: angle 30, angle 30°, angle pi/6, angle 210 "etiqueta". Valores exactos en los ángulos notables.',
	'Venn diagrams of two or three sets with shaded regions.':
		'Diagramas de Venn de dos o tres conjuntos con regiones sombreadas.',
	"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).":
		"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (también A & B, A ∪ B, A \\ B, A', not A).",
	'Probability tree': 'Diagrama de árbol',
	'A tree diagram with probabilities on the branches and along the paths.':
		'Un diagrama de árbol con probabilidades en las ramas y a lo largo de los caminos.',
	'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.':
		'Una rama por línea, dos espacios más adentro para la siguiente etapa: R 0.3, luego R 0.5 y B 0.5. Decimales, porcentajes o fracciones.',
	Solids: 'Cuerpos',
	'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.':
		'Cubo, ortoedro, cilindro, cono, esfera, pirámide y prisma en perspectiva caballera.',
	'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".':
		'Un cuerpo por línea: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, opcionalmente "etiqueta".',
	'Secondary school': 'Secundaria',
	'Dot plot': 'Diagrama de puntos',
	'Bar chart': 'Diagrama de barras',
	Histogram: 'Histograma',
	'Box plot': 'Diagrama de caja',
	Degrees: 'Grados',
	Radians: 'Radianes',
	'As typed': 'Como se escribió',
	Decimal: 'Decimal',
	Fraction: 'Fracción',
	Percent: 'Porcentaje',
	'To the right': 'Hacia la derecha',
	Downwards: 'Hacia abajo',
};

const FR = {
	'A number line with marks, intervals and jumps.':
		'Une droite numérique avec repères, intervalles et sauts.',
	Accent: 'Accent',
	Axes: 'Axes',
	'Axis labels': 'Étiquettes des axes',
	Bars: 'Barres',
	'Brand kit': 'Kit de marque',
	Cancel: 'Annuler',
	Chalkboard: 'Tableau noir',
	'Choose a starter or paste your own material.':
		'Choisissez un modèle de départ ou collez votre propre matériel.',
	Circles: 'Cercles',
	'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.':
		'Commandes : A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
	'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.':
		'Commandes : range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
	Cream: 'Crème',
	Dark: 'Sombre',
	'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.':
		'Définissez des points comme A = (0, 0) et dessinez avec segment, polygon, circle et angle.',
	Document: 'Document',
	'Fine grid': 'Grille fine',
	Font: 'Police',
	Format: 'Format',
	'Formula size': 'Taille de la formule',
	Formula: 'Formule',
	'Formulas, function graphs, geometry, number lines and fractions as editable vector pictures.':
		'Formules, courbes de fonctions, géométrie, droites numériques et fractions en images vectorielles modifiables.',
	'Fractions as circles, bars, grids or sets.':
		'Fractions en cercles, barres, grilles ou ensembles.',
	'Fractions separated by commas: 3/4, 1/2, 1 3/4.':
		'Fractions séparées par des virgules : 3/4, 1/2, 1 3/4.',
	Fractions: 'Fractions',
	'Frame around the formula': 'Cadre autour de la formule',
	'Function Graph': 'Courbe de fonction',
	'Functions on a coordinate system, with grid, ticks and legend.':
		'Fonctions dans un repère, avec grille, graduations et légende.',
	Geometry: 'Géométrie',
	Grid: 'Grille',
	Grids: 'Grilles',
	Ink: 'Encre',
	'Insert figure': 'Insérer la figure',
	Insert: 'Insérer',
	'LaTeX in, a typeset formula out.':
		'Du LaTeX en entrée, une formule composée en sortie.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\.':
		'LaTeX, par exemple \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nouvelle ligne avec \\\\.',
	Layout: 'Mise en page',
	Legend: 'Légende',
	'Line (width of the document)': 'Ligne (largeur du document)',
	Line: 'Ligne',
	'Loading the formula engine': 'Chargement du moteur de formules',
	Margin: 'Marge',
	Material: 'Matériel',
	'Math Figures needs a newer WunderPaint.':
		"Math Figures a besoin d'un WunderPaint plus récent.",
	'Multiples of pi': 'Multiples de pi',
	'No function named': 'Aucune fonction nommée',
	'No grid': 'Sans grille',
	'Number Line': 'Droite numérique',
	Numbers: 'Nombres',
	'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.':
		'Une fonction par ligne : f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
	Page: 'Page',
	Paper: 'Papier',
	'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.':
		'Paramètres a, b et c utilisables dans les fonctions, par exemple a x^2 + b x + c.',
	Picture: 'Image',
	'Points, segments, polygons, circles and angles from commands.':
		'Points, segments, polygones, cercles et angles à partir de commandes.',
	'Same scale on both axes': 'Même échelle sur les deux axes',
	Sets: 'Ensembles',
	'Show document': 'Afficher le document',
	Size: 'Taille',
	Square: 'Carré',
	Starters: 'Modèles de départ',
	Style: 'Style',
	Text: 'Texte',
	'The formula could not be typeset.': "La formule n'a pas pu être composée.",
	'The formula engine could not be loaded.':
		"Le moteur de formules n'a pas pu être chargé.",
	'The formula engine did not start.':
		"Le moteur de formules n'a pas démarré.",
	'The formula engine is still loading.':
		'Le moteur de formules se charge encore.',
	'The formula is wider than the picture. Lower the size or break the line with \\\\.':
		"La formule est plus large que l'image. Réduisez la taille ou coupez la ligne avec \\\\.",
	Ticks: 'Graduations',
	Title: 'Titre',
	'Type a formula in LaTeX to begin.':
		'Saisissez une formule en LaTeX pour commencer.',
	'Type a function per line, for example f(x) = x^2 - 2.':
		'Saisissez une fonction par ligne, par exemple f(x) = x^2 - 2.',
	'Type fractions like 3/4, 1/2 or 1 3/4.':
		'Saisissez des fractions comme 3/4, 1/2 ou 1 3/4.',
	'Update figure': 'Mettre à jour la figure',
	Update: 'Mettre à jour',
	White: 'Blanc',
	Wide: 'Large',
	auto: 'auto',
	'x from': 'x de',
	'x to': 'x à',
	'y from': 'y de',
	'y to': 'y à',
	'The content is taller than the page. Lower the size or the margin.':
		'Le contenu dépasse la page. Réduisez la taille ou la marge.',
	'No mark named': 'Aucune marque nommée',
	'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.':
		'Tape un paragraphe. Une ligne vide en commence un autre, - une puce, $x^2$ des maths, **gras** et *italique*.',
	'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.':
		'Une étape par ligne : 2x + 3 = 7 | soustraire 3. Commence une ligne par <=> ou => pour une flèche.',
	'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.':
		"Des lignes avec des cellules séparées par |, une ligne --- sous l'en-tête ; ou values f(x) = x^2; x = -3..3.",
	'The table is wider than the figure and was scaled down.':
		'Le tableau est plus large que la figure et a été réduit.',
	'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.':
		'Formules, graphiques, géométrie, droites numériques, fractions, texte et tableaux en une figure vectorielle modifiable.',
	blocks: 'blocs',
	Figure: 'Figure',
	'Add block': 'Ajouter un bloc',
	'All starters': 'Tous les modèles',
	'Move up': 'Monter',
	'Move down': 'Descendre',
	'Remove block': 'Supprimer le bloc',
	'Notes: one line per mark, key "label" above or below, an optional color.':
		'Notes : une ligne par marque, clé "libellé" above ou below, une couleur facultative.',
	'Use the ink color': "Utiliser la couleur d'encre",
	'Title font': 'Police du titre',
	'Text font': 'Police du texte',
	'Number the formulas': 'Numéroter les formules',
	Subtitle: 'Sous-titre',
	Caption: 'Légende',
	Footnote: 'Note de bas de page',
	Typography: 'Typographie',
	Element: 'Élément',
	Color: 'Couleur',
	Bold: 'Gras',
	Italic: 'Italique',
	Alignment: 'Alignement',
	'Space after': 'Espace après',
	Block: 'Bloc',
	Width: 'Largeur',
	'Number the steps': 'Numéroter les étapes',
	'Arrows between the steps': 'Flèches entre les étapes',
	'Header row': "Ligne d'en-tête",
	'Zebra rows': 'Lignes zébrées',
	Borders: 'Bordures',
	'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.':
		'LaTeX en entrée, formule composée en sortie ; \\mark{a}{...} et une note légendent une partie.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.':
		'LaTeX, par exemple \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nouvelle ligne avec \\\\. Marque une partie avec \\mark{a}{...} et légende-la dessous : a "Discriminant" below.',
	'Paragraphs and bullets with inline math, bold and italic.':
		'Paragraphes et puces avec des maths en ligne, gras et italique.',
	'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.':
		'Une ligne vide commence un paragraphe, - une puce, $x^2$ compose des maths dans la ligne, **gras** et *italique*.',
	'Worked solution': 'Résolution détaillée',
	'Steps aligned at the equals sign, with an explanation next to each.':
		'Étapes alignées sur le signe égal, avec une explication à côté.',
	'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.':
		'Une étape par ligne : 2x + 3 = 7 | soustraire 3. Les lignes commençant par <=> ou => reçoivent une flèche.',
	Table: 'Tableau',
	'Rows and columns, or a value table computed from a function.':
		"Lignes et colonnes, ou un tableau de valeurs calculé à partir d'une fonction.",
	'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.':
		"Cellules séparées par |, une ligne --- sous l'en-tête. values f(x) = x^2; x = -3..3 step 1 calcule un tableau de valeurs.",
	'Formulas and text': 'Formules et texte',
	'Graphs and geometry': 'Graphiques et géométrie',
	'Whole figures': 'Figures complètes',
	'Grid paper': 'Papier quadrillé',
	'Lined paper': 'Papier ligné',
	Transparent: 'Transparent',
	Left: 'Gauche',
	Center: 'Centre',
	Right: 'Droite',
	'Show the hands': 'Afficher les aiguilles',
	'Second hand': 'Trotteuse',
	'Digital readout': 'Affichage numérique',
	'Show the numbers': 'Afficher les nombres',
	'Base-ten blocks': 'Matériel base dix',
	Clock: 'Horloge',
	'Clock faces for reading and setting the time.':
		"Des cadrans pour lire et régler l'heure.",
	'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.':
		'Une heure par ligne : 7:35, 19:05:30, 7:35 "Matin". Nombres, aiguilles, secondes et affichage numérique sont des options.',
	'Hundred square': 'Tableau des cent',
	'The hundred square, the twenty field and dot fields.':
		'Le tableau des cent, le champ des vingt et les champs de points.',
	'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).':
		'Commandes : field 100 | 20 | 10, mark 7 14 21 #couleur, hide 5 6, dots 13 (des points au lieu de nombres, par cinq).',
	'Place value': 'Valeur de position',
	'A place value chart, with base-ten blocks if you like.':
		'Un tableau de valeur de position, avec du matériel base dix si tu veux.',
	'One number per line: 4736, 205, 3.75. The columns follow the widest number.':
		'Un nombre par ligne : 4736, 205, 3.75. Les colonnes suivent le nombre le plus long.',
	Multiplication: 'Multiplication',
	'The multiplication table or single rows of facts, with gaps.':
		'La table de multiplication ou des lignes isolées, avec des trous.',
	'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.':
		'Commandes : table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (cellules), hide 3 5 (opérations), hide all.',
	'Number wall': 'Mur de nombres',
	'Number walls and number triangles with gaps to fill in.':
		'Murs et triangles de nombres avec des trous à remplir.',
	'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.':
		'Commandes : wall 3 5 2 4 (rangée de base, ? pour un trou), hide 2.1 (rangée depuis le bas . position), triangle 3 5 2, hide inner | outer | a b ab.',
	Ruler: 'Règle',
	'A ruler with measured spans and points.':
		'Une règle avec des longueurs mesurées et des points.',
	'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".':
		'Commandes : ruler 0..12 cm (aussi mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
	'Primary school': 'Primaire',
	'Roman numerals': 'Chiffres romains',
	'Ticks only': 'Traits seulement',
	'Blank face': 'Cadran vide',
	Th: 'M',
	H: 'C',
	T: 'D',
	O: 'U',
	t: 'd',
	h: 'c',
	TTh: 'DM',
	HTh: 'CM',
	M: 'M',
	median: 'médiane',
	mean: 'moyenne',
	Chart: 'Graphique',
	'Histogram bins (0 = automatic)':
		"Classes de l'histogramme (0 = automatique)",
	'Counts on the bars': 'Effectifs sur les barres',
	'Mean marker': 'Repère de la moyenne',
	'Median marker': 'Repère de la médiane',
	Units: 'Unités',
	'Sine and cosine': 'Sinus et cosinus',
	Tangent: 'Tangente',
	'Marks at the special angles': 'Repères aux angles remarquables',
	'List the elements': 'Inscrire les éléments',
	Probabilities: 'Probabilités',
	Direction: 'Direction',
	'Path probabilities': 'Probabilités des chemins',
	'Hidden edges dashed': 'Arêtes cachées en pointillés',
	'Dimension labels': 'Étiquettes des dimensions',
	'Net beside a cube or cuboid': 'Patron à côté du cube ou du pavé',
	Statistics: 'Statistiques',
	'Dot plot, bar chart, histogram or box plot of a data set.':
		"Diagramme en points, en barres, histogramme ou boîte à moustaches d'une série de données.",
	'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.':
		'data 3, 5, 5, 7, 8, 12 (ou des mots pour des catégories), label "Points". Le type de graphique, les classes, la moyenne et la médiane sont des options.',
	'Unit circle': 'Cercle trigonométrique',
	'Angles on the unit circle with sine, cosine and tangent.':
		'Des angles sur le cercle trigonométrique avec sinus, cosinus et tangente.',
	'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.':
		'Un angle par ligne : angle 30, angle 30°, angle pi/6, angle 210 "libellé". Valeurs exactes aux angles remarquables.',
	'Venn diagrams of two or three sets with shaded regions.':
		'Diagrammes de Venn de deux ou trois ensembles avec des régions hachurées.',
	"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).":
		"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (aussi A & B, A ∪ B, A \\ B, A', not A).",
	'Probability tree': 'Arbre de probabilités',
	'A tree diagram with probabilities on the branches and along the paths.':
		'Un arbre avec les probabilités sur les branches et le long des chemins.',
	'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.':
		"Une branche par ligne, deux espaces plus loin pour l'étape suivante : R 0.3, puis R 0.5 et B 0.5. Décimaux, pourcentages ou fractions.",
	Solids: 'Solides',
	'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.':
		'Cube, pavé, cylindre, cône, sphère, pyramide et prisme en perspective cavalière.',
	'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".':
		'Un solide par ligne : cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, éventuellement "libellé".',
	'Secondary school': 'Secondaire',
	'Dot plot': 'Diagramme en points',
	'Bar chart': 'Diagramme en barres',
	Histogram: 'Histogramme',
	'Box plot': 'Boîte à moustaches',
	Degrees: 'Degrés',
	Radians: 'Radians',
	'As typed': 'Tel que saisi',
	Decimal: 'Décimal',
	Fraction: 'Fraction',
	Percent: 'Pourcentage',
	'To the right': 'Vers la droite',
	Downwards: 'Vers le bas',
};

const IT = {
	'A number line with marks, intervals and jumps.':
		'Una retta numerica con segni, intervalli e salti.',
	Accent: 'Accento',
	Axes: 'Assi',
	'Axis labels': 'Etichette degli assi',
	Bars: 'Barre',
	'Brand kit': 'Kit del marchio',
	Cancel: 'Annulla',
	Chalkboard: 'Lavagna',
	'Choose a starter or paste your own material.':
		'Scegli un modello di partenza o incolla il tuo materiale.',
	Circles: 'Cerchi',
	'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.':
		'Comandi: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
	'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.':
		'Comandi: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
	Cream: 'Crema',
	Dark: 'Scuro',
	'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.':
		'Definisci punti come A = (0, 0) e disegna con segment, polygon, circle e angle.',
	Document: 'Documento',
	'Fine grid': 'Griglia fine',
	Font: 'Carattere',
	Format: 'Formato',
	'Formula size': 'Dimensione della formula',
	Formula: 'Formula',
	'Formulas, function graphs, geometry, number lines and fractions as editable vector pictures.':
		'Formule, grafici di funzioni, geometria, rette numeriche e frazioni come immagini vettoriali modificabili.',
	'Fractions as circles, bars, grids or sets.':
		'Frazioni come cerchi, barre, griglie o insiemi.',
	'Fractions separated by commas: 3/4, 1/2, 1 3/4.':
		'Frazioni separate da virgole: 3/4, 1/2, 1 3/4.',
	Fractions: 'Frazioni',
	'Frame around the formula': 'Cornice intorno alla formula',
	'Function Graph': 'Grafico di funzione',
	'Functions on a coordinate system, with grid, ticks and legend.':
		'Funzioni in un sistema di coordinate, con griglia, tacche e legenda.',
	Geometry: 'Geometria',
	Grid: 'Griglia',
	Grids: 'Griglie',
	Ink: 'Inchiostro',
	'Insert figure': 'Inserisci la figura',
	Insert: 'Inserisci',
	'LaTeX in, a typeset formula out.':
		'LaTeX dentro, una formula composta fuori.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\.':
		'LaTeX, per esempio \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nuova riga con \\\\.',
	Layout: 'Impaginazione',
	Legend: 'Legenda',
	'Line (width of the document)': 'Riga (larghezza del documento)',
	Line: 'Riga',
	'Loading the formula engine': 'Caricamento del motore delle formule',
	Margin: 'Margine',
	Material: 'Materiale',
	'Math Figures needs a newer WunderPaint.':
		'Math Figures richiede un WunderPaint più recente.',
	'Multiples of pi': 'Multipli di pi greco',
	'No function named': 'Nessuna funzione chiamata',
	'No grid': 'Senza griglia',
	'Number Line': 'Retta numerica',
	Numbers: 'Numeri',
	'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.':
		'Una funzione per riga: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
	Page: 'Pagina',
	Paper: 'Carta',
	'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.':
		'Parametri a, b e c da usare nelle funzioni, per esempio a x^2 + b x + c.',
	Picture: 'Immagine',
	'Points, segments, polygons, circles and angles from commands.':
		'Punti, segmenti, poligoni, cerchi e angoli da comandi.',
	'Same scale on both axes': 'Stessa scala su entrambi gli assi',
	Sets: 'Insiemi',
	'Show document': 'Mostra documento',
	Size: 'Dimensione',
	Square: 'Quadrato',
	Starters: 'Modelli di partenza',
	Style: 'Stile',
	Text: 'Testo',
	'The formula could not be typeset.': 'La formula non può essere composta.',
	'The formula engine could not be loaded.':
		'Il motore delle formule non può essere caricato.',
	'The formula engine did not start.':
		'Il motore delle formule non è partito.',
	'The formula engine is still loading.':
		'Il motore delle formule sta ancora caricando.',
	'The formula is wider than the picture. Lower the size or break the line with \\\\.':
		"La formula è più larga dell'immagine. Riduci la dimensione o spezza la riga con \\\\.",
	Ticks: 'Tacche',
	Title: 'Titolo',
	'Type a formula in LaTeX to begin.':
		'Scrivi una formula in LaTeX per iniziare.',
	'Type a function per line, for example f(x) = x^2 - 2.':
		'Scrivi una funzione per riga, per esempio f(x) = x^2 - 2.',
	'Type fractions like 3/4, 1/2 or 1 3/4.':
		'Scrivi frazioni come 3/4, 1/2 o 1 3/4.',
	'Update figure': 'Aggiorna la figura',
	Update: 'Aggiorna',
	White: 'Bianco',
	Wide: 'Largo',
	auto: 'auto',
	'x from': 'x da',
	'x to': 'x a',
	'y from': 'y da',
	'y to': 'y a',
	'The content is taller than the page. Lower the size or the margin.':
		'Il contenuto è più alto della pagina. Riduci la dimensione o il margine.',
	'No mark named': 'Nessun segno chiamato',
	'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.':
		'Scrivi un paragrafo. Una riga vuota ne inizia uno nuovo, - un punto elenco, $x^2$ matematica, **grassetto** e *corsivo*.',
	'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.':
		'Un passaggio per riga: 2x + 3 = 7 | sottrai 3. Inizia una riga con <=> o => per una freccia.',
	'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.':
		"Righe con celle separate da |, una riga --- sotto l'intestazione; oppure values f(x) = x^2; x = -3..3.",
	'The table is wider than the figure and was scaled down.':
		'La tabella è più larga della figura ed è stata ridotta.',
	'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.':
		"Formule, grafici, geometria, linee dei numeri, frazioni, testo e tabelle come un'unica figura vettoriale modificabile.",
	blocks: 'blocchi',
	Figure: 'Figura',
	'Add block': 'Aggiungi blocco',
	'All starters': 'Tutti gli avvii',
	'Move up': 'Sposta su',
	'Move down': 'Sposta giù',
	'Remove block': 'Rimuovi blocco',
	'Notes: one line per mark, key "label" above or below, an optional color.':
		'Note: una riga per segno, chiave "etichetta" above o below, un colore facoltativo.',
	'Use the ink color': "Usa il colore dell'inchiostro",
	'Title font': 'Font del titolo',
	'Text font': 'Font del testo',
	'Number the formulas': 'Numera le formule',
	Subtitle: 'Sottotitolo',
	Caption: 'Didascalia',
	Footnote: 'Nota a piè di pagina',
	Typography: 'Tipografia',
	Element: 'Elemento',
	Color: 'Colore',
	Bold: 'Grassetto',
	Italic: 'Corsivo',
	Alignment: 'Allineamento',
	'Space after': 'Spazio dopo',
	Block: 'Blocco',
	Width: 'Larghezza',
	'Number the steps': 'Numera i passaggi',
	'Arrows between the steps': 'Frecce tra i passaggi',
	'Header row': 'Riga di intestazione',
	'Zebra rows': 'Righe a zebra',
	Borders: 'Bordi',
	'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.':
		'LaTeX dentro, formula composta fuori; \\mark{a}{...} e una nota etichettano una parte.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.':
		'LaTeX, per esempio \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nuova riga con \\\\. Segna una parte con \\mark{a}{...} ed etichettala sotto: a "Discriminante" below.',
	'Paragraphs and bullets with inline math, bold and italic.':
		'Paragrafi e punti elenco con matematica in linea, grassetto e corsivo.',
	'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.':
		'Una riga vuota inizia un paragrafo, - un punto elenco, $x^2$ compone matematica nella riga, **grassetto** e *corsivo*.',
	'Worked solution': 'Svolgimento',
	'Steps aligned at the equals sign, with an explanation next to each.':
		'Passaggi allineati al segno di uguale, con una spiegazione accanto.',
	'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.':
		'Un passaggio per riga: 2x + 3 = 7 | sottrai 3. Le righe che iniziano con <=> o => ricevono una freccia.',
	Table: 'Tabella',
	'Rows and columns, or a value table computed from a function.':
		'Righe e colonne, oppure una tabella di valori calcolata da una funzione.',
	'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.':
		"Celle separate da |, una riga --- sotto l'intestazione. values f(x) = x^2; x = -3..3 step 1 calcola una tabella di valori.",
	'Formulas and text': 'Formule e testo',
	'Graphs and geometry': 'Grafici e geometria',
	'Whole figures': 'Figure complete',
	'Grid paper': 'Carta a quadretti',
	'Lined paper': 'Carta a righe',
	Transparent: 'Trasparente',
	Left: 'Sinistra',
	Center: 'Centro',
	Right: 'Destra',
	'Show the hands': 'Mostra le lancette',
	'Second hand': 'Lancetta dei secondi',
	'Digital readout': 'Lettura digitale',
	'Show the numbers': 'Mostra i numeri',
	'Base-ten blocks': 'Blocchi in base dieci',
	Clock: 'Orologio',
	'Clock faces for reading and setting the time.':
		"Quadranti per leggere e impostare l'ora.",
	'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.':
		'Un orario per riga: 7:35, 19:05:30, 7:35 "Mattina". Numeri, lancette, secondi e lettura digitale sono opzioni.',
	'Hundred square': 'Tavola del cento',
	'The hundred square, the twenty field and dot fields.':
		'La tavola del cento, il campo del venti e i campi di punti.',
	'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).':
		'Comandi: field 100 | 20 | 10, mark 7 14 21 #colore, hide 5 6, dots 13 (punti al posto dei numeri, a gruppi di cinque).',
	'Place value': 'Valore posizionale',
	'A place value chart, with base-ten blocks if you like.':
		'Una tabella del valore posizionale, con blocchi in base dieci se vuoi.',
	'One number per line: 4736, 205, 3.75. The columns follow the widest number.':
		'Un numero per riga: 4736, 205, 3.75. Le colonne seguono il numero più lungo.',
	Multiplication: 'Moltiplicazione',
	'The multiplication table or single rows of facts, with gaps.':
		'La tavola pitagorica o singole righe, con lacune.',
	'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.':
		'Comandi: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (celle), hide 3 5 (operazioni), hide all.',
	'Number wall': 'Muro di numeri',
	'Number walls and number triangles with gaps to fill in.':
		'Muri e triangoli di numeri con lacune da riempire.',
	'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.':
		'Comandi: wall 3 5 2 4 (riga di base, ? per una lacuna), hide 2.1 (riga dal basso . posizione), triangle 3 5 2, hide inner | outer | a b ab.',
	Ruler: 'Righello',
	'A ruler with measured spans and points.':
		'Un righello con tratti misurati e punti.',
	'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".':
		'Comandi: ruler 0..12 cm (anche mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
	'Primary school': 'Scuola primaria',
	'Roman numerals': 'Numeri romani',
	'Ticks only': 'Solo tacche',
	'Blank face': 'Quadrante vuoto',
	Th: 'Mg',
	H: 'h',
	T: 'da',
	O: 'u',
	t: 'd',
	h: 'c',
	TTh: 'dak',
	HTh: 'hk',
	M: 'M',
	median: 'mediana',
	mean: 'media',
	Chart: 'Grafico',
	'Histogram bins (0 = automatic)': "Classi dell'istogramma (0 = automatico)",
	'Counts on the bars': 'Conteggi sulle barre',
	'Mean marker': 'Segno della media',
	'Median marker': 'Segno della mediana',
	Units: 'Unità',
	'Sine and cosine': 'Seno e coseno',
	Tangent: 'Tangente',
	'Marks at the special angles': 'Segni agli angoli notevoli',
	'List the elements': 'Elenca gli elementi',
	Probabilities: 'Probabilità',
	Direction: 'Direzione',
	'Path probabilities': 'Probabilità dei percorsi',
	'Hidden edges dashed': 'Spigoli nascosti tratteggiati',
	'Dimension labels': 'Etichette delle misure',
	'Net beside a cube or cuboid': 'Sviluppo accanto a cubo o parallelepipedo',
	Statistics: 'Statistica',
	'Dot plot, bar chart, histogram or box plot of a data set.':
		'Diagramma a punti, a barre, istogramma o box plot di un insieme di dati.',
	'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.':
		'data 3, 5, 5, 7, 8, 12 (o parole per categorie), label "Punti". Tipo di grafico, classi, media e mediana sono opzioni.',
	'Unit circle': 'Circonferenza unitaria',
	'Angles on the unit circle with sine, cosine and tangent.':
		'Angoli sulla circonferenza unitaria con seno, coseno e tangente.',
	'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.':
		'Un angolo per riga: angle 30, angle 30°, angle pi/6, angle 210 "etichetta". Valori esatti agli angoli notevoli.',
	'Venn diagrams of two or three sets with shaded regions.':
		'Diagrammi di Venn di due o tre insiemi con regioni tratteggiate.',
	"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).":
		"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (anche A & B, A ∪ B, A \\ B, A', not A).",
	'Probability tree': 'Diagramma ad albero',
	'A tree diagram with probabilities on the branches and along the paths.':
		'Un diagramma ad albero con probabilità sui rami e lungo i percorsi.',
	'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.':
		'Un ramo per riga, due spazi più in dentro per il livello successivo: R 0.3, poi R 0.5 e B 0.5. Decimali, percentuali o frazioni.',
	Solids: 'Solidi',
	'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.':
		'Cubo, parallelepipedo, cilindro, cono, sfera, piramide e prisma in proiezione cavaliera.',
	'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".':
		'Un solido per riga: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, facoltativamente "etichetta".',
	'Secondary school': 'Scuola secondaria',
	'Dot plot': 'Diagramma a punti',
	'Bar chart': 'Diagramma a barre',
	Histogram: 'Istogramma',
	'Box plot': 'Box plot',
	Degrees: 'Gradi',
	Radians: 'Radianti',
	'As typed': 'Come digitato',
	Decimal: 'Decimale',
	Fraction: 'Frazione',
	Percent: 'Percentuale',
	'To the right': 'Verso destra',
	Downwards: 'Verso il basso',
};

const NL = {
	'A number line with marks, intervals and jumps.':
		'Een getallenlijn met markeringen, intervallen en sprongen.',
	Accent: 'Accent',
	Axes: 'Assen',
	'Axis labels': 'Aslabels',
	Bars: 'Balken',
	'Brand kit': 'Merkkit',
	Cancel: 'Annuleren',
	Chalkboard: 'Schoolbord',
	'Choose a starter or paste your own material.':
		'Kies een startpunt of plak je eigen materiaal.',
	Circles: 'Cirkels',
	'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.':
		'Opdrachten: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
	'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.':
		'Opdrachten: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
	Cream: 'Crème',
	Dark: 'Donker',
	'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.':
		'Definieer punten als A = (0, 0) en teken met segment, polygon, circle en angle.',
	Document: 'Document',
	'Fine grid': 'Fijn raster',
	Font: 'Lettertype',
	Format: 'Formaat',
	'Formula size': 'Formulegrootte',
	Formula: 'Formule',
	'Formulas, function graphs, geometry, number lines and fractions as editable vector pictures.':
		'Formules, functiegrafieken, meetkunde, getallenlijnen en breuken als bewerkbare vectorafbeeldingen.',
	'Fractions as circles, bars, grids or sets.':
		'Breuken als cirkels, balken, rasters of verzamelingen.',
	'Fractions separated by commas: 3/4, 1/2, 1 3/4.':
		"Breuken gescheiden door komma's: 3/4, 1/2, 1 3/4.",
	Fractions: 'Breuken',
	'Frame around the formula': 'Kader om de formule',
	'Function Graph': 'Functiegrafiek',
	'Functions on a coordinate system, with grid, ticks and legend.':
		'Functies in een assenstelsel, met raster, schaalstreepjes en legenda.',
	Geometry: 'Meetkunde',
	Grid: 'Raster',
	Grids: 'Rasters',
	Ink: 'Inkt',
	'Insert figure': 'Figuur invoegen',
	Insert: 'Invoegen',
	'LaTeX in, a typeset formula out.':
		'LaTeX erin, een gezette formule eruit.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\.':
		'LaTeX, bijvoorbeeld \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nieuwe regel met \\\\.',
	Layout: 'Indeling',
	Legend: 'Legenda',
	'Line (width of the document)': 'Regel (breedte van het document)',
	Line: 'Regel',
	'Loading the formula engine': 'Formule-engine wordt geladen',
	Margin: 'Marge',
	Material: 'Materiaal',
	'Math Figures needs a newer WunderPaint.':
		'Math Figures heeft een nieuwere WunderPaint nodig.',
	'Multiples of pi': 'Veelvouden van pi',
	'No function named': 'Geen functie met de naam',
	'No grid': 'Geen raster',
	'Number Line': 'Getallenlijn',
	Numbers: 'Getallen',
	'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.':
		'Eén functie per regel: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
	Page: 'Pagina',
	Paper: 'Papier',
	'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.':
		'Parameters a, b en c voor gebruik in de functies, bijvoorbeeld a x^2 + b x + c.',
	Picture: 'Afbeelding',
	'Points, segments, polygons, circles and angles from commands.':
		'Punten, lijnstukken, veelhoeken, cirkels en hoeken uit opdrachten.',
	'Same scale on both axes': 'Dezelfde schaal op beide assen',
	Sets: 'Verzamelingen',
	'Show document': 'Document tonen',
	Size: 'Grootte',
	Square: 'Vierkant',
	Starters: 'Startpunten',
	Style: 'Stijl',
	Text: 'Tekst',
	'The formula could not be typeset.': 'De formule kon niet worden gezet.',
	'The formula engine could not be loaded.':
		'De formule-engine kon niet worden geladen.',
	'The formula engine did not start.': 'De formule-engine is niet gestart.',
	'The formula engine is still loading.': 'De formule-engine laadt nog.',
	'The formula is wider than the picture. Lower the size or break the line with \\\\.':
		'De formule is breder dan de afbeelding. Verklein de grootte of breek de regel af met \\\\.',
	Ticks: 'Schaalstreepjes',
	Title: 'Titel',
	'Type a formula in LaTeX to begin.':
		'Typ een formule in LaTeX om te beginnen.',
	'Type a function per line, for example f(x) = x^2 - 2.':
		'Typ één functie per regel, bijvoorbeeld f(x) = x^2 - 2.',
	'Type fractions like 3/4, 1/2 or 1 3/4.':
		'Typ breuken zoals 3/4, 1/2 of 1 3/4.',
	'Update figure': 'Figuur bijwerken',
	Update: 'Bijwerken',
	White: 'Wit',
	Wide: 'Breed',
	auto: 'auto',
	'x from': 'x van',
	'x to': 'x tot',
	'y from': 'y van',
	'y to': 'y tot',
	'The content is taller than the page. Lower the size or the margin.':
		'De inhoud is hoger dan de pagina. Verklein de grootte of de marge.',
	'No mark named': 'Geen markering met de naam',
	'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.':
		'Typ een alinea. Een lege regel begint een nieuwe, - een opsommingsteken, $x^2$ wiskunde, **vet** en *cursief*.',
	'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.':
		'Eén stap per regel: 2x + 3 = 7 | trek 3 af. Begin een regel met <=> of => voor een pijl.',
	'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.':
		'Rijen met cellen gescheiden door |, een ----regel onder de kop; of values f(x) = x^2; x = -3..3.',
	'The table is wider than the figure and was scaled down.':
		'De tabel is breder dan de figuur en is verkleind.',
	'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.':
		'Formules, grafieken, meetkunde, getallenlijnen, breuken, tekst en tabellen als één bewerkbare vectorfiguur.',
	blocks: 'blokken',
	Figure: 'Figuur',
	'Add block': 'Blok toevoegen',
	'All starters': 'Alle starters',
	'Move up': 'Omhoog',
	'Move down': 'Omlaag',
	'Remove block': 'Blok verwijderen',
	'Notes: one line per mark, key "label" above or below, an optional color.':
		'Notities: één regel per markering, sleutel "label" above of below, optioneel een kleur.',
	'Use the ink color': 'Inktkleur gebruiken',
	'Title font': 'Titellettertype',
	'Text font': 'Tekstlettertype',
	'Number the formulas': 'Formules nummeren',
	Subtitle: 'Ondertitel',
	Caption: 'Bijschrift',
	Footnote: 'Voetnoot',
	Typography: 'Typografie',
	Element: 'Element',
	Color: 'Kleur',
	Bold: 'Vet',
	Italic: 'Cursief',
	Alignment: 'Uitlijning',
	'Space after': 'Ruimte erna',
	Block: 'Blok',
	Width: 'Breedte',
	'Number the steps': 'Stappen nummeren',
	'Arrows between the steps': 'Pijlen tussen de stappen',
	'Header row': 'Koprij',
	'Zebra rows': 'Zebrarijen',
	Borders: 'Randen',
	'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.':
		'LaTeX erin, gezette formule eruit; \\mark{a}{...} en een notitie labelen een deel.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.':
		'LaTeX, bijvoorbeeld \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nieuwe regel met \\\\. Markeer een deel met \\mark{a}{...} en label het eronder: a "Discriminant" below.',
	'Paragraphs and bullets with inline math, bold and italic.':
		"Alinea's en opsommingen met wiskunde in de regel, vet en cursief.",
	'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.':
		'Een lege regel begint een alinea, - een opsommingsteken, $x^2$ zet wiskunde in de regel, **vet** en *cursief*.',
	'Worked solution': 'Uitwerking',
	'Steps aligned at the equals sign, with an explanation next to each.':
		'Stappen uitgelijnd op het isgelijkteken, met een uitleg ernaast.',
	'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.':
		'Eén stap per regel: 2x + 3 = 7 | trek 3 af. Regels die met <=> of => beginnen krijgen een pijl.',
	Table: 'Tabel',
	'Rows and columns, or a value table computed from a function.':
		'Rijen en kolommen, of een waardentabel berekend uit een functie.',
	'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.':
		'Cellen gescheiden door |, een ----regel onder de kop. values f(x) = x^2; x = -3..3 step 1 berekent een waardentabel.',
	'Formulas and text': 'Formules en tekst',
	'Graphs and geometry': 'Grafieken en meetkunde',
	'Whole figures': 'Hele figuren',
	'Grid paper': 'Ruitjespapier',
	'Lined paper': 'Gelinieerd papier',
	Transparent: 'Transparant',
	Left: 'Links',
	Center: 'Midden',
	Right: 'Rechts',
	'Show the hands': 'Wijzers tonen',
	'Second hand': 'Secondewijzer',
	'Digital readout': 'Digitale weergave',
	'Show the numbers': 'Getallen tonen',
	'Base-ten blocks': 'Tientallig materiaal',
	Clock: 'Klok',
	'Clock faces for reading and setting the time.':
		'Wijzerplaten om de tijd te lezen en in te stellen.',
	'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.':
		'Eén tijd per regel: 7:35, 19:05:30, 7:35 "Ochtend". Getallen, wijzers, seconden en digitale weergave zijn opties.',
	'Hundred square': 'Honderdveld',
	'The hundred square, the twenty field and dot fields.':
		'Het honderdveld, het twintigveld en stippenvelden.',
	'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).':
		"Commando's: field 100 | 20 | 10, mark 7 14 21 #kleur, hide 5 6, dots 13 (stippen in plaats van getallen, per vijf).",
	'Place value': 'Plaatswaarde',
	'A place value chart, with base-ten blocks if you like.':
		'Een plaatswaardetabel, desgewenst met tientallig materiaal.',
	'One number per line: 4736, 205, 3.75. The columns follow the widest number.':
		'Eén getal per regel: 4736, 205, 3.75. De kolommen volgen het langste getal.',
	Multiplication: 'Vermenigvuldigen',
	'The multiplication table or single rows of facts, with gaps.':
		'De tafel van vermenigvuldiging of losse rijen, met gaten.',
	'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.':
		"Commando's: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (cellen), hide 3 5 (sommen), hide all.",
	'Number wall': 'Getallenmuur',
	'Number walls and number triangles with gaps to fill in.':
		'Getallenmuren en rekendriehoeken met gaten om in te vullen.',
	'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.':
		"Commando's: wall 3 5 2 4 (basisrij, ? voor een gat), hide 2.1 (rij van onderen . positie), triangle 3 5 2, hide inner | outer | a b ab.",
	Ruler: 'Liniaal',
	'A ruler with measured spans and points.':
		'Een liniaal met gemeten stukken en punten.',
	'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".':
		'Commando\'s: ruler 0..12 cm (ook mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
	'Primary school': 'Basisschool',
	'Roman numerals': 'Romeinse cijfers',
	'Ticks only': 'Alleen streepjes',
	'Blank face': 'Lege wijzerplaat',
	Th: 'D',
	H: 'H',
	T: 'T',
	O: 'E',
	t: 't',
	h: 'h',
	TTh: 'TD',
	HTh: 'HD',
	M: 'M',
	median: 'mediaan',
	mean: 'gemiddelde',
	Chart: 'Diagram',
	'Histogram bins (0 = automatic)':
		'Klassen van het histogram (0 = automatisch)',
	'Counts on the bars': 'Aantallen op de staven',
	'Mean marker': 'Gemiddelde markeren',
	'Median marker': 'Mediaan markeren',
	Units: 'Eenheden',
	'Sine and cosine': 'Sinus en cosinus',
	Tangent: 'Tangens',
	'Marks at the special angles': 'Markeringen bij de bijzondere hoeken',
	'List the elements': 'Elementen invullen',
	Probabilities: 'Kansen',
	Direction: 'Richting',
	'Path probabilities': 'Padkansen',
	'Hidden edges dashed': 'Verborgen ribben gestippeld',
	'Dimension labels': 'Maten benoemen',
	'Net beside a cube or cuboid': 'Uitslag naast kubus of balk',
	Statistics: 'Statistiek',
	'Dot plot, bar chart, histogram or box plot of a data set.':
		'Puntendiagram, staafdiagram, histogram of boxplot van een gegevensverzameling.',
	'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.':
		'data 3, 5, 5, 7, 8, 12 (of woorden voor categorieën), label "Punten". Diagramtype, klassen, gemiddelde en mediaan zijn opties.',
	'Unit circle': 'Eenheidscirkel',
	'Angles on the unit circle with sine, cosine and tangent.':
		'Hoeken op de eenheidscirkel met sinus, cosinus en tangens.',
	'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.':
		'Eén hoek per regel: angle 30, angle 30°, angle pi/6, angle 210 "label". Exacte waarden bij de bijzondere hoeken.',
	'Venn diagrams of two or three sets with shaded regions.':
		'Venndiagrammen van twee of drie verzamelingen met gearceerde gebieden.',
	"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).":
		"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (ook A & B, A ∪ B, A \\ B, A', not A).",
	'Probability tree': 'Kansboom',
	'A tree diagram with probabilities on the branches and along the paths.':
		'Een kansboom met kansen op de takken en langs de paden.',
	'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.':
		'Eén tak per regel, twee spaties dieper voor de volgende trap: R 0.3, dan R 0.5 en B 0.5. Decimalen, procenten of breuken.',
	Solids: 'Ruimtefiguren',
	'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.':
		'Kubus, balk, cilinder, kegel, bol, piramide en prisma in cavalièreprojectie.',
	'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".':
		'Eén figuur per regel: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optioneel "label".',
	'Secondary school': 'Voortgezet onderwijs',
	'Dot plot': 'Puntendiagram',
	'Bar chart': 'Staafdiagram',
	Histogram: 'Histogram',
	'Box plot': 'Boxplot',
	Degrees: 'Graden',
	Radians: 'Radialen',
	'As typed': 'Zoals getypt',
	Decimal: 'Decimaal',
	Fraction: 'Breuk',
	Percent: 'Procent',
	'To the right': 'Naar rechts',
	Downwards: 'Naar beneden',
};

const PT = {
	'A number line with marks, intervals and jumps.':
		'Uma reta numérica com marcas, intervalos e saltos.',
	Accent: 'Destaque',
	Axes: 'Eixos',
	'Axis labels': 'Rótulos dos eixos',
	Bars: 'Barras',
	'Brand kit': 'Kit da marca',
	Cancel: 'Cancelar',
	Chalkboard: 'Lousa',
	'Choose a starter or paste your own material.':
		'Escolha um ponto de partida ou cole o seu próprio material.',
	Circles: 'Círculos',
	'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.':
		'Comandos: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
	'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.':
		'Comandos: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
	Cream: 'Creme',
	Dark: 'Escuro',
	'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.':
		'Defina pontos como A = (0, 0) e desenhe com segment, polygon, circle e angle.',
	Document: 'Documento',
	'Fine grid': 'Grade fina',
	Font: 'Fonte',
	Format: 'Formato',
	'Formula size': 'Tamanho da fórmula',
	Formula: 'Fórmula',
	'Formulas, function graphs, geometry, number lines and fractions as editable vector pictures.':
		'Fórmulas, gráficos de funções, geometria, retas numéricas e frações como imagens vetoriais editáveis.',
	'Fractions as circles, bars, grids or sets.':
		'Frações como círculos, barras, grades ou conjuntos.',
	'Fractions separated by commas: 3/4, 1/2, 1 3/4.':
		'Frações separadas por vírgulas: 3/4, 1/2, 1 3/4.',
	Fractions: 'Frações',
	'Frame around the formula': 'Moldura ao redor da fórmula',
	'Function Graph': 'Gráfico de função',
	'Functions on a coordinate system, with grid, ticks and legend.':
		'Funções em um sistema de coordenadas, com grade, marcas e legenda.',
	Geometry: 'Geometria',
	Grid: 'Grade',
	Grids: 'Grades',
	Ink: 'Tinta',
	'Insert figure': 'Inserir figura',
	Insert: 'Inserir',
	'LaTeX in, a typeset formula out.':
		'LaTeX entra, uma fórmula composta sai.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\.':
		'LaTeX, por exemplo \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nova linha com \\\\.',
	Layout: 'Layout',
	Legend: 'Legenda',
	'Line (width of the document)': 'Linha (largura do documento)',
	Line: 'Linha',
	'Loading the formula engine': 'Carregando o motor de fórmulas',
	Margin: 'Margem',
	Material: 'Material',
	'Math Figures needs a newer WunderPaint.':
		'Math Figures precisa de um WunderPaint mais recente.',
	'Multiples of pi': 'Múltiplos de pi',
	'No function named': 'Nenhuma função chamada',
	'No grid': 'Sem grade',
	'Number Line': 'Reta numérica',
	Numbers: 'Números',
	'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.':
		'Uma função por linha: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
	Page: 'Página',
	Paper: 'Papel',
	'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.':
		'Parâmetros a, b e c para usar nas funções, por exemplo a x^2 + b x + c.',
	Picture: 'Imagem',
	'Points, segments, polygons, circles and angles from commands.':
		'Pontos, segmentos, polígonos, círculos e ângulos a partir de comandos.',
	'Same scale on both axes': 'Mesma escala nos dois eixos',
	Sets: 'Conjuntos',
	'Show document': 'Mostrar documento',
	Size: 'Tamanho',
	Square: 'Quadrado',
	Starters: 'Pontos de partida',
	Style: 'Estilo',
	Text: 'Texto',
	'The formula could not be typeset.': 'A fórmula não pôde ser composta.',
	'The formula engine could not be loaded.':
		'O motor de fórmulas não pôde ser carregado.',
	'The formula engine did not start.': 'O motor de fórmulas não iniciou.',
	'The formula engine is still loading.':
		'O motor de fórmulas ainda está carregando.',
	'The formula is wider than the picture. Lower the size or break the line with \\\\.':
		'A fórmula é mais larga que a imagem. Reduza o tamanho ou quebre a linha com \\\\.',
	Ticks: 'Marcas',
	Title: 'Título',
	'Type a formula in LaTeX to begin.':
		'Digite uma fórmula em LaTeX para começar.',
	'Type a function per line, for example f(x) = x^2 - 2.':
		'Digite uma função por linha, por exemplo f(x) = x^2 - 2.',
	'Type fractions like 3/4, 1/2 or 1 3/4.':
		'Digite frações como 3/4, 1/2 ou 1 3/4.',
	'Update figure': 'Atualizar figura',
	Update: 'Atualizar',
	White: 'Branco',
	Wide: 'Largo',
	auto: 'auto',
	'x from': 'x de',
	'x to': 'x até',
	'y from': 'y de',
	'y to': 'y até',
	'The content is taller than the page. Lower the size or the margin.':
		'O conteúdo é mais alto que a página. Reduza o tamanho ou a margem.',
	'No mark named': 'Nenhuma marca chamada',
	'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.':
		'Escreve um parágrafo. Uma linha vazia começa outro, - um marcador, $x^2$ matemática, **negrito** e *itálico*.',
	'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.':
		'Um passo por linha: 2x + 3 = 7 | subtrair 3. Começa uma linha com <=> ou => para uma seta.',
	'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.':
		'Linhas com células separadas por |, uma linha --- sob o cabeçalho; ou values f(x) = x^2; x = -3..3.',
	'The table is wider than the figure and was scaled down.':
		'A tabela é mais larga do que a figura e foi reduzida.',
	'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.':
		'Fórmulas, gráficos, geometria, retas numéricas, frações, texto e tabelas como uma figura vetorial editável.',
	blocks: 'blocos',
	Figure: 'Figura',
	'Add block': 'Adicionar bloco',
	'All starters': 'Todos os modelos',
	'Move up': 'Mover para cima',
	'Move down': 'Mover para baixo',
	'Remove block': 'Remover bloco',
	'Notes: one line per mark, key "label" above or below, an optional color.':
		'Notas: uma linha por marca, chave "etiqueta" above ou below, uma cor opcional.',
	'Use the ink color': 'Usar a cor da tinta',
	'Title font': 'Fonte do título',
	'Text font': 'Fonte do texto',
	'Number the formulas': 'Numerar as fórmulas',
	Subtitle: 'Subtítulo',
	Caption: 'Legenda',
	Footnote: 'Nota de rodapé',
	Typography: 'Tipografia',
	Element: 'Elemento',
	Color: 'Cor',
	Bold: 'Negrito',
	Italic: 'Itálico',
	Alignment: 'Alinhamento',
	'Space after': 'Espaço depois',
	Block: 'Bloco',
	Width: 'Largura',
	'Number the steps': 'Numerar os passos',
	'Arrows between the steps': 'Setas entre os passos',
	'Header row': 'Linha de cabeçalho',
	'Zebra rows': 'Linhas zebradas',
	Borders: 'Bordas',
	'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.':
		'LaTeX dentro, fórmula composta fora; \\mark{a}{...} e uma nota rotulam uma parte.',
	'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.':
		'LaTeX, por exemplo \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. Nova linha com \\\\. Marca uma parte com \\mark{a}{...} e rotula-a abaixo: a "Discriminante" below.',
	'Paragraphs and bullets with inline math, bold and italic.':
		'Parágrafos e marcadores com matemática em linha, negrito e itálico.',
	'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.':
		'Uma linha vazia começa um parágrafo, - um marcador, $x^2$ compõe matemática na linha, **negrito** e *itálico*.',
	'Worked solution': 'Resolução passo a passo',
	'Steps aligned at the equals sign, with an explanation next to each.':
		'Passos alinhados no sinal de igual, com uma explicação ao lado.',
	'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.':
		'Um passo por linha: 2x + 3 = 7 | subtrair 3. Linhas que começam com <=> ou => recebem uma seta.',
	Table: 'Tabela',
	'Rows and columns, or a value table computed from a function.':
		'Linhas e colunas, ou uma tabela de valores calculada a partir de uma função.',
	'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.':
		'Células separadas por |, uma linha --- sob o cabeçalho. values f(x) = x^2; x = -3..3 step 1 calcula uma tabela de valores.',
	'Formulas and text': 'Fórmulas e texto',
	'Graphs and geometry': 'Gráficos e geometria',
	'Whole figures': 'Figuras completas',
	'Grid paper': 'Papel quadriculado',
	'Lined paper': 'Papel pautado',
	Transparent: 'Transparente',
	Left: 'Esquerda',
	Center: 'Centro',
	Right: 'Direita',
	'Show the hands': 'Mostrar os ponteiros',
	'Second hand': 'Ponteiro dos segundos',
	'Digital readout': 'Mostrador digital',
	'Show the numbers': 'Mostrar os números',
	'Base-ten blocks': 'Material de base dez',
	Clock: 'Relógio',
	'Clock faces for reading and setting the time.':
		'Mostradores para ler e acertar as horas.',
	'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.':
		'Uma hora por linha: 7:35, 19:05:30, 7:35 "Manhã". Números, ponteiros, segundos e mostrador digital são opções.',
	'Hundred square': 'Quadro dos cem',
	'The hundred square, the twenty field and dot fields.':
		'O quadro dos cem, o campo dos vinte e campos de pontos.',
	'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).':
		'Comandos: field 100 | 20 | 10, mark 7 14 21 #cor, hide 5 6, dots 13 (pontos em vez de números, de cinco em cinco).',
	'Place value': 'Valor posicional',
	'A place value chart, with base-ten blocks if you like.':
		'Uma tabela de valor posicional, com material de base dez se quiseres.',
	'One number per line: 4736, 205, 3.75. The columns follow the widest number.':
		'Um número por linha: 4736, 205, 3.75. As colunas seguem o número mais longo.',
	Multiplication: 'Multiplicação',
	'The multiplication table or single rows of facts, with gaps.':
		'A tabuada completa ou linhas isoladas, com lacunas.',
	'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.':
		'Comandos: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (células), hide 3 5 (contas), hide all.',
	'Number wall': 'Muro de números',
	'Number walls and number triangles with gaps to fill in.':
		'Muros e triângulos de números com lacunas para preencher.',
	'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.':
		'Comandos: wall 3 5 2 4 (fila base, ? para uma lacuna), hide 2.1 (fila a partir de baixo . posição), triangle 3 5 2, hide inner | outer | a b ab.',
	Ruler: 'Régua',
	'A ruler with measured spans and points.':
		'Uma régua com comprimentos medidos e pontos.',
	'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".':
		'Comandos: ruler 0..12 cm (também mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
	'Primary school': 'Ensino básico',
	'Roman numerals': 'Numeração romana',
	'Ticks only': 'Só traços',
	'Blank face': 'Mostrador vazio',
	Th: 'UM',
	H: 'C',
	T: 'D',
	O: 'U',
	t: 'd',
	h: 'c',
	TTh: 'DM',
	HTh: 'CM',
	M: 'M',
	median: 'mediana',
	mean: 'média',
	Chart: 'Gráfico',
	'Histogram bins (0 = automatic)': 'Classes do histograma (0 = automático)',
	'Counts on the bars': 'Contagens nas barras',
	'Mean marker': 'Marcar a média',
	'Median marker': 'Marcar a mediana',
	Units: 'Unidades',
	'Sine and cosine': 'Seno e cosseno',
	Tangent: 'Tangente',
	'Marks at the special angles': 'Marcas nos ângulos notáveis',
	'List the elements': 'Listar os elementos',
	Probabilities: 'Probabilidades',
	Direction: 'Direção',
	'Path probabilities': 'Probabilidades dos caminhos',
	'Hidden edges dashed': 'Arestas ocultas a tracejado',
	'Dimension labels': 'Etiquetas das medidas',
	'Net beside a cube or cuboid':
		'Planificação ao lado do cubo ou paralelepípedo',
	Statistics: 'Estatística',
	'Dot plot, bar chart, histogram or box plot of a data set.':
		'Diagrama de pontos, de barras, histograma ou diagrama de caixa de um conjunto de dados.',
	'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.':
		'data 3, 5, 5, 7, 8, 12 (ou palavras para categorias), label "Pontos". Tipo de gráfico, classes, média e mediana são opções.',
	'Unit circle': 'Círculo trigonométrico',
	'Angles on the unit circle with sine, cosine and tangent.':
		'Ângulos no círculo trigonométrico com seno, cosseno e tangente.',
	'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.':
		'Um ângulo por linha: angle 30, angle 30°, angle pi/6, angle 210 "etiqueta". Valores exatos nos ângulos notáveis.',
	'Venn diagrams of two or three sets with shaded regions.':
		'Diagramas de Venn de dois ou três conjuntos com regiões sombreadas.',
	"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).":
		"A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (também A & B, A ∪ B, A \\ B, A', not A).",
	'Probability tree': 'Diagrama em árvore',
	'A tree diagram with probabilities on the branches and along the paths.':
		'Um diagrama em árvore com probabilidades nos ramos e ao longo dos caminhos.',
	'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.':
		'Um ramo por linha, dois espaços mais dentro para a etapa seguinte: R 0.3, depois R 0.5 e B 0.5. Decimais, percentagens ou frações.',
	Solids: 'Sólidos',
	'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.':
		'Cubo, paralelepípedo, cilindro, cone, esfera, pirâmide e prisma em perspetiva cavaleira.',
	'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".':
		'Um sólido por linha: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, opcionalmente "etiqueta".',
	'Secondary school': 'Ensino secundário',
	'Dot plot': 'Diagrama de pontos',
	'Bar chart': 'Diagrama de barras',
	Histogram: 'Histograma',
	'Box plot': 'Diagrama de caixa',
	Degrees: 'Graus',
	Radians: 'Radianos',
	'As typed': 'Como escrito',
	Decimal: 'Decimal',
	Fraction: 'Fração',
	Percent: 'Percentagem',
	'To the right': 'Para a direita',
	Downwards: 'Para baixo',
};

export const TABLES = { de: DE, es: ES, fr: FR, it: IT, nl: NL, pt: PT };
const TABLE = TABLES[ LOCALE.slice( 0, 2 ).toLowerCase() ] || null;

export function t( s ) {
	return ( TABLE && TABLE[ s ] ) || s;
}
