/**
 * The studio in five languages.
 *
 * Same shape as its siblings: one table per language, a lookup that falls
 * back to the English source string, so a missing entry shows English
 * rather than a key. tests/i18n.test.js compares the tables key by key.
 */

const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	( document.documentElement && document.documentElement.lang ) ||
	'en'
).replace( '-', '_' );

const DE = {
	'Chaos Art': 'Chaos Art',
	'Independent painters make one-of-a-kind art. You choose the moment it is finished.':
		'Unabhängige Maler schaffen ein Unikat. Du wählst den Moment, in dem es fertig ist.',
	Style: 'Stil',
	'Ink Storm': 'Ink Storm',
	'Coral Garden': 'Coral Garden',
	'Neon Weave': 'Neon Weave',
	'Oil Nebula': 'Oil Nebula',
	'Ribbons of ink riding a storm.': 'Tuschebänder im Sturm.',
	'A reef that grows while you watch.':
		'Ein Riff, das vor deinen Augen wächst.',
	'Glowing threads weaving a nervous net.':
		'Glühende Fäden weben ein nervöses Netz.',
	'Soft clouds of color, breathing.': 'Weiche Farbwolken, atmend.',
	'One of a kind': 'Ein Unikat',
	'Same settings, different picture - every run is unique, there is no seed. Snapshots keep the last two minutes, so no moment is ever lost.':
		'Gleiche Einstellungen, anderes Bild - jeder Lauf ist einzigartig, es gibt keinen Seed. Schnappschüsse bewahren die letzten zwei Minuten, kein Moment geht verloren.',
	'Drag to orbit · wheel to zoom · your pointer stirs the paint':
		'Ziehen dreht · Rad zoomt · dein Zeiger rührt die Farbe um',
	'Charge the piece': 'Lade das Werk auf',
	'Move your pointer here. Your movement becomes this artwork - it can never be painted again.':
		'Bewege deinen Zeiger hier. Deine Bewegung wird zu diesem Kunstwerk - es kann nie wieder gemalt werden.',
	'Start painting': 'Malen starten',
	Pause: 'Pause',
	Resume: 'Weitermalen',
	Impulse: 'Impuls',
	'Start over': 'Von vorn',
	'Pick the moment': 'Wähle den Moment',
	'Now (live)': 'Jetzt (live)',
	Temperament: 'Temperament',
	'Order to chaos': 'Ordnung bis Chaos',
	Energy: 'Energie',
	Density: 'Dichte',
	Tempo: 'Tempo',
	Colors: 'Farben',
	Palette: 'Palette',
	Ember: 'Glut',
	'Deep Ocean': 'Tiefsee',
	Ultraviolet: 'Ultraviolett',
	'Ink and Bone': 'Tusche und Bein',
	Meadow: 'Wiese',
	Aurora: 'Aurora',
	Candy: 'Bonbon',
	Gilded: 'Vergoldet',
	Crimson: 'Karmesin',
	Monochrome: 'Monochrom',
	'Custom colors': 'Eigene Farben',
	Look: 'Look',
	Ground: 'Grund',
	'Style default': 'Stil-Vorgabe',
	'Black void': 'Schwarze Leere',
	Paper: 'Papier',
	'Deep mist': 'Tiefer Nebel',
	Bloom: 'Bloom',
	'Depth blur': 'Tiefenunschärfe',
	Grain: 'Korn',
	Vignette: 'Vignette',
	Pointer: 'Zeiger',
	'The pointer': 'Der Zeiger',
	'Stir (wind)': 'Umrühren (Wind)',
	Attract: 'Anziehen',
	Repel: 'Abstoßen',
	Off: 'Aus',
	Export: 'Export',
	'Process film': 'Prozessfilm',
	'To Media Library': 'In die Media Library',
	'The film records the painting as it happens, from start to stop.':
		'Der Film zeichnet das Malen auf, von Start bis Stopp.',
	'Nothing recorded yet - the film runs while it paints.':
		'Noch nichts aufgenommen - der Film läuft, während gemalt wird.',
	'Preparing…': 'Bereite vor…',
	'Recording is not available in this browser.':
		'Aufnahme ist in diesem Browser nicht verfügbar.',
	'Could not save to the Media Library.':
		'Konnte nicht in der Media Library speichern.',
	'Saved to Media Library.': 'In der Media Library gespeichert.',
	'The settings returned; the painting itself will be new - chaos cannot repeat.':
		'Die Einstellungen sind zurück; das Bild selbst wird neu - Chaos kann sich nicht wiederholen.',
	'Charge the field, then start painting.':
		'Lade das Feld auf, dann starte das Malen.',
	Cancel: 'Abbrechen',
	Update: 'Aktualisieren',
	'Insert as picture': 'Als Bild einfügen',
	'Could not insert.': 'Konnte nicht einfügen.',
	'Painting…': 'Malt…',
	marks: 'Spuren',
	time: 'Zeit',
	'Paused - pick a moment, or resume painting.':
		'Pausiert - wähle einen Moment oder male weiter.',
	Shatter: 'Shatter',
	'Crystal shards and hard breaks.': 'Kristallsplitter und harte Brüche.',
	'Echo Chamber': 'Echo Chamber',
	'The picture feeds back into itself.':
		'Das Bild speist sich in sich selbst zurück.',
	'Copy snippet': 'Snippet kopieren',
	'Embed (HTML): the piece paints itself live on your website - a new original for every visitor.':
		'Embed (HTML): das Werk malt sich live auf deiner Website - ein neues Original für jeden Besucher.',
	'Snippet copied - paste it into an HTML block on your site.':
		'Snippet kopiert - füge es in einen HTML-Block deiner Seite ein.',
	'Copy failed.': 'Kopieren fehlgeschlagen.',
	Ensemble: 'Ensemble',
	'The whole company on one stage - a new cast every time.':
		'Die ganze Truppe auf einer Bühne - jedes Mal eine neue Besetzung.',
	'Art movement': 'Kunstrichtung',
	'Free study': 'Freie Studie',
	'No school. The society as it came.':
		'Keine Schule. Die Truppe, wie sie ist.',
	Impressionism: 'Impressionismus',
	'Broken color in soft light, laid on in short dabs.':
		'Gebrochene Farbe in weichem Licht, in kurzen Tupfern gesetzt.',
	Pointillism: 'Pointillismus',
	'The whole picture from tiny dots of pure color.':
		'Das ganze Bild aus winzigen Punkten reiner Farbe.',
	Cubism: 'Kubismus',
	'The subject taken apart into facets and planes.':
		'Das Motiv zerlegt in Facetten und Flächen.',
	Bauhaus: 'Bauhaus',
	'Circle, square, triangle; primary colors, clear order.':
		'Kreis, Quadrat, Dreieck; Primärfarben, klare Ordnung.',
	Surrealism: 'Surrealismus',
	'Dream logic: soft matter, strange neighbors, slow time.':
		'Traumlogik: weiche Materie, seltsame Nachbarn, langsame Zeit.',
	'Op Art': 'Op-Art',
	'Rhythm and repetition until the eye starts to swim.':
		'Rhythmus und Wiederholung, bis das Auge zu schwimmen beginnt.',
	'Action Painting': 'Action Painting',
	'The gesture itself, flung fast and wet.':
		'Die Geste selbst, schnell und nass geschleudert.',
	Futurism: 'Futurismus',
	'Speed made visible; everything in motion at once.':
		'Geschwindigkeit sichtbar gemacht; alles zugleich in Bewegung.',
	Minimalism: 'Minimalismus',
	'A few large, calm forms and a great deal of room.':
		'Wenige große, ruhige Formen und sehr viel Raum.',
	'Ring Parade': 'Ring Parade',
	'Caravans of rings threaded through space.':
		'Karawanen von Ringen, durch den Raum gefädelt.',
	'Tile Works': 'Tile Works',
	'Walls, stairs and floating towns on a hidden grid.':
		'Mauern, Treppen und schwebende Städte auf einem verborgenen Raster.',
	Hive: 'Hive',
	'Honeycomb growing cell by cell in tilted planes.':
		'Waben, Zelle um Zelle wachsend, in gekippten Ebenen.',
	Clockwork: 'Clockwork',
	'Circles rolling on circles, drawn with a steady hand.':
		'Kreise, die auf Kreisen rollen, mit ruhiger Hand gezeichnet.',
	Constellation: 'Constellation',
	'Stars set one by one and joined with ruled lines.':
		'Sterne, einzeln gesetzt und mit Lineal-Linien verbunden.',
	'Morning Light': 'Morgenlicht',
	Earthen: 'Erdig',
	Primary: 'Primärfarben',
	Medium: 'Medium',
	'Auto (their choice)': 'Auto (deren Wahl)',
	Sculpted: 'Skulptural',
	'Brush strokes': 'Pinselstriche',
	Watercolor: 'Aquarell',
	Pastel: 'Pastell',
	'Ink sketch': 'Tuschskizze',
	Splash: 'Klecks',
	Surprise: 'Überraschung',
	'They pick the style themselves.': 'Sie wählen den Stil selbst.',
	'Their choice': 'Deren Wahl',
	'A school drawn fresh at every start - or none at all.':
		'Eine Schule, bei jedem Start neu gezogen - oder gar keine.',
	'They set the dials themselves': 'Sie stellen die Regler selbst',
	'They chose:': 'Ihre Wahl:',
	upheavals: 'Umbrüche',
	moves: 'Umzüge',
	Expressionism: 'Expressionismus',
	Fauvism: 'Fauvismus',
	Classicism: 'Klassizismus',
	Suprematism: 'Suprematismus',
	'De Stijl': 'De Stijl',
	'Action painting': 'Action Painting',
	'Color Field': 'Farbfeldmalerei',
	'Ink wash': 'Tuschmalerei',
	'Art Informel': 'Informel',
	Biomorphic: 'Biomorph',
	Collage: 'Collage',
	'Broken color in soft light, laid on in short dabs of oil.':
		'Gebrochene Farbe in weichem Licht, in kurzen Öltupfern gesetzt.',
	'Loud color, thick paint, black contours that will not sit still.':
		'Laute Farbe, dicke Paste, schwarze Konturen, die nicht stillhalten.',
	'Pure color in flat patches, and the white between them left alone.':
		'Reine Farbe in flachen Flecken, das Weiß dazwischen bleibt stehen.',
	'One thing seen from many sides at once, in planes of umber and gray.':
		'Ein Ding von vielen Seiten zugleich gesehen, in Flächen aus Umbra und Grau.',
	'Golden proportion, warm shadow, light that arrives from one side.':
		'Goldener Schnitt, warmer Schatten, Licht, das von einer Seite kommt.',
	'Circle, bar and triangle in primary colors, balanced on a diagonal.':
		'Kreis, Balken und Dreieck in Grundfarben, auf einer Diagonale ausbalanciert.',
	'Black and red forms floating on white, weightless and tilted.':
		'Schwarze und rote Formen, die auf Weiß schweben, schwerelos und gekippt.',
	'Black rules dividing white, a few cells in red, yellow and blue.':
		'Schwarze Linien teilen Weiß, ein paar Felder in Rot, Gelb und Blau.',
	'The whole arm in every stroke, drips and splatter where it ended.':
		'Der ganze Arm in jedem Strich, Tropfen und Spritzer, wo er endete.',
	'Bands of luminous color, breathing at their edges.':
		'Bänder leuchtender Farbe, die an ihren Rändern atmen.',
	'One shape, one line, and the room around them.':
		'Eine Form, eine Linie und der Raum um sie herum.',
	'Black lines that bend the eye, drawn one after another.':
		'Schwarze Linien, die das Auge verbiegen, eine nach der anderen gezogen.',
	'A few decisive strokes of black ink, and the paper left to breathe.':
		'Ein paar entschiedene Striche schwarzer Tusche, und das Papier darf atmen.',
	'Stains, crusts and scratches; the matter is the subject.':
		'Flecken, Krusten und Kratzer; die Materie ist das Motiv.',
	'Playful organisms, black threads and stars on a tinted ground.':
		'Verspielte Organismen, schwarze Fäden und Sterne auf getöntem Grund.',
	'Torn paper, printed matter and a red circle, pasted where they landed.':
		'Gerissenes Papier, Gedrucktes und ein roter Kreis, geklebt, wo sie landeten.',
	'Lines of force, forms repeated as they move, speed made visible.':
		'Kraftlinien, Formen, die sich in der Bewegung wiederholen, sichtbar gemachte Geschwindigkeit.',
	Schools: 'Schulen',
	'In space (3D)': 'Im Raum (3D)',
	'Move your pointer as randomly as possible inside this field until the bar is full. Your movement becomes this artwork - it can never be painted again.':
		'Bewege den Zeiger so zufällig wie möglich in diesem Feld, bis der Balken voll ist. Deine Bewegung wird zu diesem Kunstwerk - es kann nie wieder gemalt werden.',
	'Charged - start painting whenever you like.':
		'Aufgeladen - starte das Malen, wann du willst.',
	'Your pointer stirs the paint · click for an impulse':
		'Dein Zeiger rührt die Farbe auf · Klick für einen Impuls',
	'Charge the field until the bar is full, then start painting.':
		'Lade das Feld auf, bis der Balken voll ist, dann starte das Malen.',
	'with a guest from': 'mit einem Gast aus',
	Motif: 'Motiv',
	'Paint after': 'Malen nach',
	None: 'Keins',
	'The picture on the canvas': 'Das Bild auf der Leinwand',
	'A picture of your own': 'Ein eigenes Bild',
	'A text': 'Ein Text',
	'Choose a picture': 'Bild wählen',
	'No picture yet': 'Noch kein Bild',
	'That picture could not be read.': 'Dieses Bild ließ sich nicht lesen.',
	'Your text': 'Dein Text',
	Font: 'Schrift',
	Reading: 'Lesart',
	Abstract: 'Abstrakt',
	Underpainting: 'Untermalung',
	Contours: 'Konturen',
	'Fill the letters': 'Buchstaben füllen',
	'Keep the letters clear': 'Buchstaben freilassen',
	'Outline the letters': 'Buchstaben umreißen',
	'Reading the motif…': 'Motiv wird gelesen…',
	'The canvas is empty - the motif needs a picture.':
		'Die Leinwand ist leer - das Motiv braucht ein Bild.',
	'Choose a picture first.': 'Wähle zuerst ein Bild.',
	'Type a text first.': 'Gib zuerst einen Text ein.',
	'after a picture': 'nach einem Bild',
	'after a text': 'nach einem Text',
	'Post-Impressionism': 'Postimpressionismus',
	'Thick directional strokes that swirl around every form, color as feeling.':
		'Dicke, gerichtete Striche, die jede Form umwirbeln, Farbe als Gefühl.',
	Orphism: 'Orphismus',
	'Discs of pure color in concentric rings, light turning into rhythm.':
		'Scheiben reiner Farbe in konzentrischen Ringen, Licht wird Rhythmus.',
	'Pop Art': 'Pop Art',
	'Flat color, a black keyline, a screen of dots - printed, not painted.':
		'Flache Farbe, schwarze Kontur, ein Punktraster - gedruckt, nicht gemalt.',
	'Street Art': 'Street Art',
	'Spray and drip on a dark wall, a stencil, a quick tag in ink.':
		'Sprühnebel und Tropfen auf dunkler Wand, eine Schablone, ein schneller Tag in Tinte.',
	'Art Nouveau': 'Jugendstil',
	'Whiplash curves, tendrils and flat pale shapes in a dark contour.':
		'Peitschenhieb-Kurven, Ranken und flache blasse Formen in dunkler Kontur.',
	Mosaic: 'Mosaik',
	'Little stones in rows that follow the form, gold among them.':
		'Kleine Steine in Reihen, die der Form folgen, Gold dazwischen.',
	'Stained Glass': 'Glasmalerei',
	'Cells of glowing color in a net of black lead.':
		'Zellen leuchtender Farbe in einem Netz aus schwarzem Blei.',
	Woodcut: 'Holzschnitt',
	'Black carved marks on white paper, one color allowed.':
		'Schwarze geschnittene Marken auf weißem Papier, eine Farbe erlaubt.',
	Constructivism: 'Konstruktivismus',
	'Red and black bars on a diagonal, a circle, the picture as a machine.':
		'Rote und schwarze Balken auf der Diagonale, ein Kreis, das Bild als Maschine.',
	'Ukiyo-e': 'Ukiyo-e',
	'Flat planes of color in a fine black keyline, a wave that curls.':
		'Flache Farbflächen in feiner schwarzer Kontur, eine Welle, die sich kräuselt.',
	'Line art and paint': 'Lineart und Farbe',
	'Flat planes and paint': 'Flächen und Farbe',
	Likeness: 'Ähnlichkeit',
	'Your pointer stirs the paint · click for an impulse · draw a stroke and they answer it':
		'Dein Zeiger rührt die Farbe auf · Klick für einen Impuls · zieh einen Strich, und sie antworten darauf',
	'Cut into pieces': 'In Stücke geschnitten',
	'Letters as cut-outs': 'Buchstaben als Ausschnitte',
	'Burst of color': 'Farbstoß',
	'A burst of color somewhere on the sheet. Click the sheet for one where you point.':
		'Ein Farbstoß irgendwo auf dem Blatt. Klick aufs Blatt für einen Stoß genau dort.',
	'Your hand over the sheet draws the painters · click for a burst of color · drag a stroke and they answer it':
		'Deine Hand über dem Blatt zieht die Maler an · Klick für einen Farbstoß · zieh einen Strich, und sie antworten darauf',
	'All schools at once, each painter in another.':
		'Alle Schulen zugleich, jeder Maler in einer anderen.',
	'Now painting as': 'Malt jetzt als',
};

const ES = {
	'Chaos Art': 'Chaos Art',
	'Independent painters make one-of-a-kind art. You choose the moment it is finished.':
		'Pintores independientes crean una obra única. Tú eliges el momento en que está terminada.',
	Style: 'Estilo',
	'Ink Storm': 'Ink Storm',
	'Coral Garden': 'Coral Garden',
	'Neon Weave': 'Neon Weave',
	'Oil Nebula': 'Oil Nebula',
	'Ribbons of ink riding a storm.':
		'Cintas de tinta cabalgando una tormenta.',
	'A reef that grows while you watch.':
		'Un arrecife que crece mientras miras.',
	'Glowing threads weaving a nervous net.':
		'Hilos brillantes tejiendo una red nerviosa.',
	'Soft clouds of color, breathing.': 'Nubes suaves de color, respirando.',
	'One of a kind': 'Pieza única',
	'Same settings, different picture - every run is unique, there is no seed. Snapshots keep the last two minutes, so no moment is ever lost.':
		'Mismos ajustes, otra imagen: cada ejecución es única, no hay semilla. Las instantáneas guardan los últimos dos minutos; ningún momento se pierde.',
	'Drag to orbit · wheel to zoom · your pointer stirs the paint':
		'Arrastra para orbitar · rueda para zoom · tu puntero agita la pintura',
	'Charge the piece': 'Carga la obra',
	'Move your pointer here. Your movement becomes this artwork - it can never be painted again.':
		'Mueve tu puntero aquí. Tu movimiento se convierte en esta obra: no podrá pintarse otra vez.',
	'Start painting': 'Empezar a pintar',
	Pause: 'Pausa',
	Resume: 'Continuar',
	Impulse: 'Impulso',
	'Start over': 'Empezar de nuevo',
	'Pick the moment': 'Elige el momento',
	'Now (live)': 'Ahora (en vivo)',
	Temperament: 'Temperamento',
	'Order to chaos': 'Del orden al caos',
	Energy: 'Energía',
	Density: 'Densidad',
	Tempo: 'Tempo',
	Colors: 'Colores',
	Palette: 'Paleta',
	Ember: 'Brasa',
	'Deep Ocean': 'Océano profundo',
	Ultraviolet: 'Ultravioleta',
	'Ink and Bone': 'Tinta y hueso',
	Meadow: 'Pradera',
	Aurora: 'Aurora',
	Candy: 'Caramelo',
	Gilded: 'Dorado',
	Crimson: 'Carmesí',
	Monochrome: 'Monocromo',
	'Custom colors': 'Colores propios',
	Look: 'Aspecto',
	Ground: 'Fondo',
	'Style default': 'Por defecto del estilo',
	'Black void': 'Vacío negro',
	Paper: 'Papel',
	'Deep mist': 'Niebla profunda',
	Bloom: 'Bloom',
	'Depth blur': 'Desenfoque de profundidad',
	Grain: 'Grano',
	Vignette: 'Viñeta',
	Pointer: 'Puntero',
	'The pointer': 'El puntero',
	'Stir (wind)': 'Agitar (viento)',
	Attract: 'Atraer',
	Repel: 'Repeler',
	Off: 'Apagado',
	Export: 'Exportar',
	'Process film': 'Película del proceso',
	'To Media Library': 'A la Media Library',
	'The film records the painting as it happens, from start to stop.':
		'La película graba la pintura mientras sucede, de inicio a fin.',
	'Nothing recorded yet - the film runs while it paints.':
		'Aún no hay grabación: la película corre mientras pinta.',
	'Preparing…': 'Preparando…',
	'Recording is not available in this browser.':
		'La grabación no está disponible en este navegador.',
	'Could not save to the Media Library.':
		'No se pudo guardar en la Media Library.',
	'Saved to Media Library.': 'Guardado en la Media Library.',
	'The settings returned; the painting itself will be new - chaos cannot repeat.':
		'Los ajustes volvieron; la pintura será nueva: el caos no puede repetirse.',
	'Charge the field, then start painting.':
		'Carga el campo y empieza a pintar.',
	Cancel: 'Cancelar',
	Update: 'Actualizar',
	'Insert as picture': 'Insertar como imagen',
	'Could not insert.': 'No se pudo insertar.',
	'Painting…': 'Pintando…',
	marks: 'trazos',
	time: 'tiempo',
	'Paused - pick a moment, or resume painting.':
		'En pausa: elige un momento o sigue pintando.',
	Shatter: 'Shatter',
	'Crystal shards and hard breaks.': 'Esquirlas de cristal y rupturas duras.',
	'Echo Chamber': 'Echo Chamber',
	'The picture feeds back into itself.':
		'La imagen se realimenta a sí misma.',
	'Copy snippet': 'Copiar snippet',
	'Embed (HTML): the piece paints itself live on your website - a new original for every visitor.':
		'Embed (HTML): la obra se pinta en vivo en tu web: un original nuevo para cada visitante.',
	'Snippet copied - paste it into an HTML block on your site.':
		'Snippet copiado: pégalo en un bloque HTML de tu sitio.',
	'Copy failed.': 'No se pudo copiar.',
	Ensemble: 'Ensemble',
	'The whole company on one stage - a new cast every time.':
		'Toda la compañía en un escenario: un reparto nuevo cada vez.',
	'Art movement': 'Movimiento artístico',
	'Free study': 'Estudio libre',
	'No school. The society as it came.':
		'Sin escuela. La compañía tal como es.',
	Impressionism: 'Impresionismo',
	'Broken color in soft light, laid on in short dabs.':
		'Color quebrado en luz suave, puesto en toques cortos.',
	Pointillism: 'Puntillismo',
	'The whole picture from tiny dots of pure color.':
		'Todo el cuadro a partir de puntos diminutos de color puro.',
	Cubism: 'Cubismo',
	'The subject taken apart into facets and planes.':
		'El motivo desmontado en facetas y planos.',
	Bauhaus: 'Bauhaus',
	'Circle, square, triangle; primary colors, clear order.':
		'Círculo, cuadrado, triángulo; colores primarios, orden claro.',
	Surrealism: 'Surrealismo',
	'Dream logic: soft matter, strange neighbors, slow time.':
		'Lógica de sueño: materia blanda, vecinos extraños, tiempo lento.',
	'Op Art': 'Op Art',
	'Rhythm and repetition until the eye starts to swim.':
		'Ritmo y repetición hasta que el ojo empieza a nadar.',
	'Action Painting': 'Action painting',
	'The gesture itself, flung fast and wet.':
		'El gesto mismo, lanzado rápido y húmedo.',
	Futurism: 'Futurismo',
	'Speed made visible; everything in motion at once.':
		'La velocidad hecha visible; todo en movimiento a la vez.',
	Minimalism: 'Minimalismo',
	'A few large, calm forms and a great deal of room.':
		'Unas pocas formas grandes y serenas y mucho espacio.',
	'Ring Parade': 'Ring Parade',
	'Caravans of rings threaded through space.':
		'Caravanas de anillos enhebradas por el espacio.',
	'Tile Works': 'Tile Works',
	'Walls, stairs and floating towns on a hidden grid.':
		'Muros, escaleras y ciudades flotantes sobre una cuadrícula oculta.',
	Hive: 'Hive',
	'Honeycomb growing cell by cell in tilted planes.':
		'Panales que crecen celda a celda en planos inclinados.',
	Clockwork: 'Clockwork',
	'Circles rolling on circles, drawn with a steady hand.':
		'Círculos que ruedan sobre círculos, trazados con mano firme.',
	Constellation: 'Constellation',
	'Stars set one by one and joined with ruled lines.':
		'Estrellas puestas una a una y unidas con líneas de regla.',
	'Morning Light': 'Luz de mañana',
	Earthen: 'Terroso',
	Primary: 'Primarios',
	Medium: 'Medio',
	'Auto (their choice)': 'Auto (su elección)',
	Sculpted: 'Escultórico',
	'Brush strokes': 'Pinceladas',
	Watercolor: 'Acuarela',
	Pastel: 'Pastel',
	'Ink sketch': 'Boceto a tinta',
	Splash: 'Salpicadura',
	Surprise: 'Sorpresa',
	'They pick the style themselves.': 'Ellos eligen el estilo.',
	'Their choice': 'Su elección',
	'A school drawn fresh at every start - or none at all.':
		'Una escuela sorteada en cada inicio, o ninguna.',
	'They set the dials themselves': 'Ellos ajustan los mandos',
	'They chose:': 'Eligieron:',
	upheavals: 'convulsiones',
	moves: 'mudanzas',
	Expressionism: 'Expresionismo',
	Fauvism: 'Fauvismo',
	Classicism: 'Clasicismo',
	Suprematism: 'Suprematismo',
	'De Stijl': 'De Stijl',
	'Action painting': 'Action painting',
	'Color Field': 'Campos de color',
	'Ink wash': 'Tinta aguada',
	'Art Informel': 'Informalismo',
	Biomorphic: 'Biomórfico',
	Collage: 'Collage',
	'Broken color in soft light, laid on in short dabs of oil.':
		'Color quebrado en luz suave, puesto en toques cortos de óleo.',
	'Loud color, thick paint, black contours that will not sit still.':
		'Color estridente, pintura espesa, contornos negros que no se quedan quietos.',
	'Pure color in flat patches, and the white between them left alone.':
		'Color puro en manchas planas, y el blanco entre ellas sin tocar.',
	'One thing seen from many sides at once, in planes of umber and gray.':
		'Una cosa vista desde muchos lados a la vez, en planos de sombra y gris.',
	'Golden proportion, warm shadow, light that arrives from one side.':
		'Proporción áurea, sombra cálida, luz que llega desde un lado.',
	'Circle, bar and triangle in primary colors, balanced on a diagonal.':
		'Círculo, barra y triángulo en colores primarios, equilibrados sobre una diagonal.',
	'Black and red forms floating on white, weightless and tilted.':
		'Formas negras y rojas flotando sobre blanco, ingrávidas e inclinadas.',
	'Black rules dividing white, a few cells in red, yellow and blue.':
		'Líneas negras que dividen el blanco, unas pocas celdas en rojo, amarillo y azul.',
	'The whole arm in every stroke, drips and splatter where it ended.':
		'Todo el brazo en cada trazo, goteos y salpicaduras donde terminó.',
	'Bands of luminous color, breathing at their edges.':
		'Bandas de color luminoso que respiran en sus bordes.',
	'One shape, one line, and the room around them.':
		'Una forma, una línea y el espacio a su alrededor.',
	'Black lines that bend the eye, drawn one after another.':
		'Líneas negras que doblan la vista, trazadas una tras otra.',
	'A few decisive strokes of black ink, and the paper left to breathe.':
		'Unos pocos trazos decididos de tinta negra, y el papel que respira.',
	'Stains, crusts and scratches; the matter is the subject.':
		'Manchas, costras y arañazos; la materia es el tema.',
	'Playful organisms, black threads and stars on a tinted ground.':
		'Organismos juguetones, hilos negros y estrellas sobre un fondo teñido.',
	'Torn paper, printed matter and a red circle, pasted where they landed.':
		'Papel rasgado, impresos y un círculo rojo, pegados donde cayeron.',
	'Lines of force, forms repeated as they move, speed made visible.':
		'Líneas de fuerza, formas repetidas en movimiento, la velocidad hecha visible.',
	Schools: 'Escuelas',
	'In space (3D)': 'En el espacio (3D)',
	'Move your pointer as randomly as possible inside this field until the bar is full. Your movement becomes this artwork - it can never be painted again.':
		'Mueve el puntero lo más aleatoriamente posible dentro de este campo hasta que la barra esté llena. Tu movimiento se convierte en esta obra - nunca podrá pintarse otra vez.',
	'Charged - start painting whenever you like.':
		'Cargado - empieza a pintar cuando quieras.',
	'Your pointer stirs the paint · click for an impulse':
		'Tu puntero remueve la pintura · clic para un impulso',
	'Charge the field until the bar is full, then start painting.':
		'Carga el campo hasta que la barra esté llena y luego empieza a pintar.',
	'with a guest from': 'con un invitado de',
	Motif: 'Motivo',
	'Paint after': 'Pintar según',
	None: 'Ninguno',
	'The picture on the canvas': 'La imagen del lienzo',
	'A picture of your own': 'Una imagen propia',
	'A text': 'Un texto',
	'Choose a picture': 'Elegir imagen',
	'No picture yet': 'Aún sin imagen',
	'That picture could not be read.': 'No se pudo leer esa imagen.',
	'Your text': 'Tu texto',
	Font: 'Fuente',
	Reading: 'Lectura',
	Abstract: 'Abstracto',
	Underpainting: 'Base pintada',
	Contours: 'Contornos',
	'Fill the letters': 'Rellenar las letras',
	'Keep the letters clear': 'Dejar las letras libres',
	'Outline the letters': 'Contornear las letras',
	'Reading the motif…': 'Leyendo el motivo…',
	'The canvas is empty - the motif needs a picture.':
		'El lienzo está vacío - el motivo necesita una imagen.',
	'Choose a picture first.': 'Elige primero una imagen.',
	'Type a text first.': 'Escribe primero un texto.',
	'after a picture': 'según una imagen',
	'after a text': 'según un texto',
	'Post-Impressionism': 'Posimpresionismo',
	'Thick directional strokes that swirl around every form, color as feeling.':
		'Trazos gruesos y direccionales que giran alrededor de cada forma, el color como sentimiento.',
	Orphism: 'Orfismo',
	'Discs of pure color in concentric rings, light turning into rhythm.':
		'Discos de color puro en anillos concéntricos, la luz hecha ritmo.',
	'Pop Art': 'Pop art',
	'Flat color, a black keyline, a screen of dots - printed, not painted.':
		'Color plano, contorno negro, una trama de puntos - impreso, no pintado.',
	'Street Art': 'Arte urbano',
	'Spray and drip on a dark wall, a stencil, a quick tag in ink.':
		'Aerosol y goteos sobre un muro oscuro, una plantilla, un tag rápido en tinta.',
	'Art Nouveau': 'Art nouveau',
	'Whiplash curves, tendrils and flat pale shapes in a dark contour.':
		'Curvas de látigo, zarcillos y formas planas y pálidas en un contorno oscuro.',
	Mosaic: 'Mosaico',
	'Little stones in rows that follow the form, gold among them.':
		'Piedrecitas en hileras que siguen la forma, oro entre ellas.',
	'Stained Glass': 'Vidriera',
	'Cells of glowing color in a net of black lead.':
		'Celdas de color luminoso en una red de plomo negro.',
	Woodcut: 'Xilografía',
	'Black carved marks on white paper, one color allowed.':
		'Marcas negras talladas sobre papel blanco, un solo color permitido.',
	Constructivism: 'Constructivismo',
	'Red and black bars on a diagonal, a circle, the picture as a machine.':
		'Barras rojas y negras en diagonal, un círculo, el cuadro como máquina.',
	'Ukiyo-e': 'Ukiyo-e',
	'Flat planes of color in a fine black keyline, a wave that curls.':
		'Planos de color en un fino contorno negro, una ola que se riza.',
	'Line art and paint': 'Líneas y pintura',
	'Flat planes and paint': 'Planos y pintura',
	Likeness: 'Parecido',
	'Your pointer stirs the paint · click for an impulse · draw a stroke and they answer it':
		'Tu puntero remueve la pintura · clic para un impulso · dibuja un trazo y ellos responden',
	'Cut into pieces': 'Cortado en piezas',
	'Letters as cut-outs': 'Letras recortadas',
	'Burst of color': 'Estallido de color',
	'A burst of color somewhere on the sheet. Click the sheet for one where you point.':
		'Un estallido de color en algún lugar de la hoja. Haz clic en la hoja para uno justo ahí.',
	'Your hand over the sheet draws the painters · click for a burst of color · drag a stroke and they answer it':
		'Tu mano sobre la hoja atrae a los pintores · clic para un estallido de color · dibuja un trazo y ellos responden',
	'All schools at once, each painter in another.':
		'Todas las escuelas a la vez, cada pintor en otra.',
	'Now painting as': 'Ahora pinta como',
};

const FR = {
	'Chaos Art': 'Chaos Art',
	'Independent painters make one-of-a-kind art. You choose the moment it is finished.':
		'Des peintres indépendants créent une œuvre unique. Vous choisissez le moment où elle est achevée.',
	Style: 'Style',
	'Ink Storm': 'Ink Storm',
	'Coral Garden': 'Coral Garden',
	'Neon Weave': 'Neon Weave',
	'Oil Nebula': 'Oil Nebula',
	'Ribbons of ink riding a storm.':
		'Des rubans d’encre chevauchant la tempête.',
	'A reef that grows while you watch.': 'Un récif qui pousse sous vos yeux.',
	'Glowing threads weaving a nervous net.':
		'Des fils lumineux tissant un réseau nerveux.',
	'Soft clouds of color, breathing.':
		'De doux nuages de couleur qui respirent.',
	'One of a kind': 'Pièce unique',
	'Same settings, different picture - every run is unique, there is no seed. Snapshots keep the last two minutes, so no moment is ever lost.':
		'Mêmes réglages, autre image : chaque exécution est unique, il n’y a pas de graine. Les instantanés gardent les deux dernières minutes ; aucun moment n’est perdu.',
	'Drag to orbit · wheel to zoom · your pointer stirs the paint':
		'Glisser pour orbiter · molette pour zoomer · votre pointeur remue la peinture',
	'Charge the piece': 'Chargez l’œuvre',
	'Move your pointer here. Your movement becomes this artwork - it can never be painted again.':
		'Déplacez votre pointeur ici. Votre mouvement devient cette œuvre : elle ne pourra jamais être repeinte.',
	'Start painting': 'Commencer à peindre',
	Pause: 'Pause',
	Resume: 'Reprendre',
	Impulse: 'Impulsion',
	'Start over': 'Recommencer',
	'Pick the moment': 'Choisissez le moment',
	'Now (live)': 'Maintenant (en direct)',
	Temperament: 'Tempérament',
	'Order to chaos': 'De l’ordre au chaos',
	Energy: 'Énergie',
	Density: 'Densité',
	Tempo: 'Tempo',
	Colors: 'Couleurs',
	Palette: 'Palette',
	Ember: 'Braise',
	'Deep Ocean': 'Océan profond',
	Ultraviolet: 'Ultraviolet',
	'Ink and Bone': 'Encre et os',
	Meadow: 'Prairie',
	Aurora: 'Aurore',
	Candy: 'Bonbon',
	Gilded: 'Doré',
	Crimson: 'Cramoisi',
	Monochrome: 'Monochrome',
	'Custom colors': 'Couleurs personnalisées',
	Look: 'Rendu',
	Ground: 'Fond',
	'Style default': 'Défaut du style',
	'Black void': 'Vide noir',
	Paper: 'Papier',
	'Deep mist': 'Brume profonde',
	Bloom: 'Bloom',
	'Depth blur': 'Flou de profondeur',
	Grain: 'Grain',
	Vignette: 'Vignette',
	Pointer: 'Pointeur',
	'The pointer': 'Le pointeur',
	'Stir (wind)': 'Remuer (vent)',
	Attract: 'Attirer',
	Repel: 'Repousser',
	Off: 'Désactivé',
	Export: 'Exporter',
	'Process film': 'Film du processus',
	'To Media Library': 'Vers la Media Library',
	'The film records the painting as it happens, from start to stop.':
		'Le film enregistre la peinture en train de se faire, du début à l’arrêt.',
	'Nothing recorded yet - the film runs while it paints.':
		'Rien d’enregistré encore : le film tourne pendant que ça peint.',
	'Preparing…': 'Préparation…',
	'Recording is not available in this browser.':
		'L’enregistrement n’est pas disponible dans ce navigateur.',
	'Could not save to the Media Library.':
		'Impossible d’enregistrer dans la Media Library.',
	'Saved to Media Library.': 'Enregistré dans la Media Library.',
	'The settings returned; the painting itself will be new - chaos cannot repeat.':
		'Les réglages sont revenus ; la peinture sera nouvelle : le chaos ne se répète pas.',
	'Charge the field, then start painting.':
		'Chargez le champ, puis commencez à peindre.',
	Cancel: 'Annuler',
	Update: 'Mettre à jour',
	'Insert as picture': 'Insérer comme image',
	'Could not insert.': 'Insertion impossible.',
	'Painting…': 'Peint…',
	marks: 'traces',
	time: 'temps',
	'Paused - pick a moment, or resume painting.':
		'En pause : choisissez un moment ou reprenez.',
	Shatter: 'Shatter',
	'Crystal shards and hard breaks.': 'Éclats de cristal et cassures nettes.',
	'Echo Chamber': 'Echo Chamber',
	'The picture feeds back into itself.': 'L’image se réinjecte en elle-même.',
	'Copy snippet': 'Copier le snippet',
	'Embed (HTML): the piece paints itself live on your website - a new original for every visitor.':
		'Embed (HTML) : l’œuvre se peint en direct sur votre site - un nouvel original pour chaque visiteur.',
	'Snippet copied - paste it into an HTML block on your site.':
		'Snippet copié - collez-le dans un bloc HTML de votre site.',
	'Copy failed.': 'Copie impossible.',
	Ensemble: 'Ensemble',
	'The whole company on one stage - a new cast every time.':
		'Toute la troupe sur une scène - une distribution nouvelle à chaque fois.',
	'Art movement': 'Mouvement artistique',
	'Free study': 'Étude libre',
	'No school. The society as it came.':
		'Pas d’école. La troupe telle qu’elle est.',
	Impressionism: 'Impressionnisme',
	'Broken color in soft light, laid on in short dabs.':
		'Couleur rompue dans une lumière douce, posée par petites touches.',
	Pointillism: 'Pointillisme',
	'The whole picture from tiny dots of pure color.':
		'Tout le tableau à partir de minuscules points de couleur pure.',
	Cubism: 'Cubisme',
	'The subject taken apart into facets and planes.':
		'Le sujet décomposé en facettes et en plans.',
	Bauhaus: 'Bauhaus',
	'Circle, square, triangle; primary colors, clear order.':
		'Cercle, carré, triangle ; couleurs primaires, ordre clair.',
	Surrealism: 'Surréalisme',
	'Dream logic: soft matter, strange neighbors, slow time.':
		'Logique de rêve : matière molle, voisins étranges, temps lent.',
	'Op Art': 'Op Art',
	'Rhythm and repetition until the eye starts to swim.':
		'Rythme et répétition jusqu’à ce que l’œil se mette à nager.',
	'Action Painting': 'Action painting',
	'The gesture itself, flung fast and wet.':
		'Le geste lui-même, jeté vite et mouillé.',
	Futurism: 'Futurisme',
	'Speed made visible; everything in motion at once.':
		'La vitesse rendue visible ; tout en mouvement à la fois.',
	Minimalism: 'Minimalisme',
	'A few large, calm forms and a great deal of room.':
		'Quelques grandes formes calmes et beaucoup d’espace.',
	'Ring Parade': 'Ring Parade',
	'Caravans of rings threaded through space.':
		'Des caravanes d’anneaux enfilées à travers l’espace.',
	'Tile Works': 'Tile Works',
	'Walls, stairs and floating towns on a hidden grid.':
		'Des murs, des escaliers et des villes flottantes sur une grille cachée.',
	Hive: 'Hive',
	'Honeycomb growing cell by cell in tilted planes.':
		'Des rayons qui poussent cellule par cellule dans des plans inclinés.',
	Clockwork: 'Clockwork',
	'Circles rolling on circles, drawn with a steady hand.':
		'Des cercles roulant sur des cercles, tracés d’une main sûre.',
	Constellation: 'Constellation',
	'Stars set one by one and joined with ruled lines.':
		'Des étoiles posées une à une et reliées à la règle.',
	'Morning Light': 'Lumière du matin',
	Earthen: 'Terreux',
	Primary: 'Primaires',
	Medium: 'Médium',
	'Auto (their choice)': 'Auto (leur choix)',
	Sculpted: 'Sculpté',
	'Brush strokes': 'Coups de pinceau',
	Watercolor: 'Aquarelle',
	Pastel: 'Pastel',
	'Ink sketch': 'Croquis à l’encre',
	Splash: 'Éclaboussure',
	Surprise: 'Surprise',
	'They pick the style themselves.': 'Ils choisissent le style eux-mêmes.',
	'Their choice': 'Leur choix',
	'A school drawn fresh at every start - or none at all.':
		'Une école tirée à chaque départ - ou aucune.',
	'They set the dials themselves': 'Ils règlent eux-mêmes les curseurs',
	'They chose:': 'Leur choix :',
	upheavals: 'bouleversements',
	moves: 'déménagements',
	Expressionism: 'Expressionnisme',
	Fauvism: 'Fauvisme',
	Classicism: 'Classicisme',
	Suprematism: 'Suprématisme',
	'De Stijl': 'De Stijl',
	'Action painting': 'Action painting',
	'Color Field': 'Color Field',
	'Ink wash': "Lavis d'encre",
	'Art Informel': 'Art informel',
	Biomorphic: 'Biomorphique',
	Collage: 'Collage',
	'Broken color in soft light, laid on in short dabs of oil.':
		"Couleur rompue dans une lumière douce, posée en courtes touches d'huile.",
	'Loud color, thick paint, black contours that will not sit still.':
		'Couleur criarde, pâte épaisse, contours noirs qui ne tiennent pas en place.',
	'Pure color in flat patches, and the white between them left alone.':
		'Couleur pure en aplats, et le blanc entre eux laissé tel quel.',
	'One thing seen from many sides at once, in planes of umber and gray.':
		"Une chose vue de plusieurs côtés à la fois, en plans de terre d'ombre et de gris.",
	'Golden proportion, warm shadow, light that arrives from one side.':
		"Nombre d'or, ombre chaude, lumière qui vient d'un seul côté.",
	'Circle, bar and triangle in primary colors, balanced on a diagonal.':
		'Cercle, barre et triangle en couleurs primaires, en équilibre sur une diagonale.',
	'Black and red forms floating on white, weightless and tilted.':
		'Formes noires et rouges flottant sur le blanc, sans poids et inclinées.',
	'Black rules dividing white, a few cells in red, yellow and blue.':
		'Des lignes noires divisent le blanc, quelques cases en rouge, jaune et bleu.',
	'The whole arm in every stroke, drips and splatter where it ended.':
		"Tout le bras dans chaque geste, coulures et éclaboussures là où il s'est arrêté.",
	'Bands of luminous color, breathing at their edges.':
		'Des bandes de couleur lumineuse qui respirent sur leurs bords.',
	'One shape, one line, and the room around them.':
		"Une forme, une ligne, et l'espace autour d'elles.",
	'Black lines that bend the eye, drawn one after another.':
		"Des lignes noires qui trompent l'œil, tracées l'une après l'autre.",
	'A few decisive strokes of black ink, and the paper left to breathe.':
		"Quelques traits décidés d'encre noire, et le papier laissé respirer.",
	'Stains, crusts and scratches; the matter is the subject.':
		'Taches, croûtes et griffures ; la matière est le sujet.',
	'Playful organisms, black threads and stars on a tinted ground.':
		'Organismes joueurs, fils noirs et étoiles sur un fond teinté.',
	'Torn paper, printed matter and a red circle, pasted where they landed.':
		'Papier déchiré, imprimés et un cercle rouge, collés là où ils sont tombés.',
	'Lines of force, forms repeated as they move, speed made visible.':
		'Lignes de force, formes répétées dans le mouvement, la vitesse rendue visible.',
	Schools: 'Écoles',
	'In space (3D)': "Dans l'espace (3D)",
	'Move your pointer as randomly as possible inside this field until the bar is full. Your movement becomes this artwork - it can never be painted again.':
		"Déplacez le pointeur aussi aléatoirement que possible dans ce champ jusqu'à ce que la barre soit pleine. Votre mouvement devient cette œuvre - elle ne pourra jamais être repeinte.",
	'Charged - start painting whenever you like.':
		'Chargé - commencez à peindre quand vous voulez.',
	'Your pointer stirs the paint · click for an impulse':
		'Votre pointeur remue la peinture · cliquez pour une impulsion',
	'Charge the field until the bar is full, then start painting.':
		"Chargez le champ jusqu'à ce que la barre soit pleine, puis commencez à peindre.",
	'with a guest from': 'avec un invité de',
	Motif: 'Motif',
	'Paint after': "Peindre d'après",
	None: 'Aucun',
	'The picture on the canvas': "L'image sur la toile",
	'A picture of your own': 'Une image à vous',
	'A text': 'Un texte',
	'Choose a picture': 'Choisir une image',
	'No picture yet': "Pas encore d'image",
	'That picture could not be read.': "Cette image n'a pas pu être lue.",
	'Your text': 'Votre texte',
	Font: 'Police',
	Reading: 'Lecture',
	Abstract: 'Abstrait',
	Underpainting: 'Sous-couche',
	Contours: 'Contours',
	'Fill the letters': 'Remplir les lettres',
	'Keep the letters clear': 'Laisser les lettres vides',
	'Outline the letters': 'Cerner les lettres',
	'Reading the motif…': 'Lecture du motif…',
	'The canvas is empty - the motif needs a picture.':
		"La toile est vide - le motif a besoin d'une image.",
	'Choose a picture first.': "Choisissez d'abord une image.",
	'Type a text first.': "Saisissez d'abord un texte.",
	'after a picture': "d'après une image",
	'after a text': "d'après un texte",
	'Post-Impressionism': 'Post-impressionnisme',
	'Thick directional strokes that swirl around every form, color as feeling.':
		'Des touches épaisses et orientées qui tourbillonnent autour de chaque forme, la couleur comme sentiment.',
	Orphism: 'Orphisme',
	'Discs of pure color in concentric rings, light turning into rhythm.':
		'Des disques de couleur pure en anneaux concentriques, la lumière devenue rythme.',
	'Pop Art': 'Pop art',
	'Flat color, a black keyline, a screen of dots - printed, not painted.':
		'Couleur plate, contour noir, une trame de points - imprimé, pas peint.',
	'Street Art': 'Street art',
	'Spray and drip on a dark wall, a stencil, a quick tag in ink.':
		"Bombe et coulures sur un mur sombre, un pochoir, un tag rapide à l'encre.",
	'Art Nouveau': 'Art nouveau',
	'Whiplash curves, tendrils and flat pale shapes in a dark contour.':
		'Courbes en coup de fouet, vrilles et formes plates et pâles dans un contour sombre.',
	Mosaic: 'Mosaïque',
	'Little stones in rows that follow the form, gold among them.':
		"De petites pierres en rangs qui suivent la forme, de l'or parmi elles.",
	'Stained Glass': 'Vitrail',
	'Cells of glowing color in a net of black lead.':
		'Des cellules de couleur lumineuse dans un réseau de plomb noir.',
	Woodcut: 'Gravure sur bois',
	'Black carved marks on white paper, one color allowed.':
		'Des marques noires taillées sur papier blanc, une seule couleur permise.',
	Constructivism: 'Constructivisme',
	'Red and black bars on a diagonal, a circle, the picture as a machine.':
		'Des barres rouges et noires en diagonale, un cercle, le tableau comme machine.',
	'Ukiyo-e': 'Ukiyo-e',
	'Flat planes of color in a fine black keyline, a wave that curls.':
		"Des aplats de couleur dans un fin contour noir, une vague qui s'enroule.",
	'Line art and paint': 'Trait et peinture',
	'Flat planes and paint': 'Aplats et peinture',
	Likeness: 'Ressemblance',
	'Your pointer stirs the paint · click for an impulse · draw a stroke and they answer it':
		'Votre pointeur remue la peinture · cliquez pour une impulsion · tracez un trait et ils y répondent',
	'Cut into pieces': 'Découpé en morceaux',
	'Letters as cut-outs': 'Lettres découpées',
	'Burst of color': 'Éclat de couleur',
	'A burst of color somewhere on the sheet. Click the sheet for one where you point.':
		'Un éclat de couleur quelque part sur la feuille. Cliquez sur la feuille pour un éclat là où vous pointez.',
	'Your hand over the sheet draws the painters · click for a burst of color · drag a stroke and they answer it':
		'Votre main sur la feuille attire les peintres · cliquez pour un éclat de couleur · tracez un trait et ils y répondent',
	'All schools at once, each painter in another.':
		'Toutes les écoles à la fois, chaque peintre dans une autre.',
	'Now painting as': 'Peint maintenant en',
};

const PT = {
	'Chaos Art': 'Chaos Art',
	'Independent painters make one-of-a-kind art. You choose the moment it is finished.':
		'Pintores independentes criam uma obra única. Você escolhe o momento em que ela está pronta.',
	Style: 'Estilo',
	'Ink Storm': 'Ink Storm',
	'Coral Garden': 'Coral Garden',
	'Neon Weave': 'Neon Weave',
	'Oil Nebula': 'Oil Nebula',
	'Ribbons of ink riding a storm.':
		'Fitas de tinta cavalgando uma tempestade.',
	'A reef that grows while you watch.':
		'Um recife que cresce enquanto você observa.',
	'Glowing threads weaving a nervous net.':
		'Fios brilhantes tecendo uma rede nervosa.',
	'Soft clouds of color, breathing.': 'Nuvens macias de cor, respirando.',
	'One of a kind': 'Peça única',
	'Same settings, different picture - every run is unique, there is no seed. Snapshots keep the last two minutes, so no moment is ever lost.':
		'Mesmos ajustes, outra imagem: cada execução é única, não há semente. Os instantâneos guardam os últimos dois minutos; nenhum momento se perde.',
	'Drag to orbit · wheel to zoom · your pointer stirs the paint':
		'Arraste para orbitar · roda para zoom · seu ponteiro mexe a tinta',
	'Charge the piece': 'Carregue a obra',
	'Move your pointer here. Your movement becomes this artwork - it can never be painted again.':
		'Mova seu ponteiro aqui. Seu movimento se torna esta obra: ela nunca poderá ser pintada de novo.',
	'Start painting': 'Começar a pintar',
	Pause: 'Pausa',
	Resume: 'Continuar',
	Impulse: 'Impulso',
	'Start over': 'Recomeçar',
	'Pick the moment': 'Escolha o momento',
	'Now (live)': 'Agora (ao vivo)',
	Temperament: 'Temperamento',
	'Order to chaos': 'Da ordem ao caos',
	Energy: 'Energia',
	Density: 'Densidade',
	Tempo: 'Ritmo',
	Colors: 'Cores',
	Palette: 'Paleta',
	Ember: 'Brasa',
	'Deep Ocean': 'Oceano profundo',
	Ultraviolet: 'Ultravioleta',
	'Ink and Bone': 'Tinta e osso',
	Meadow: 'Campina',
	Aurora: 'Aurora',
	Candy: 'Doce',
	Gilded: 'Dourado',
	Crimson: 'Carmesim',
	Monochrome: 'Monocromático',
	'Custom colors': 'Cores próprias',
	Look: 'Visual',
	Ground: 'Fundo',
	'Style default': 'Padrão do estilo',
	'Black void': 'Vazio negro',
	Paper: 'Papel',
	'Deep mist': 'Névoa profunda',
	Bloom: 'Bloom',
	'Depth blur': 'Desfoque de profundidade',
	Grain: 'Granulação',
	Vignette: 'Vinheta',
	Pointer: 'Ponteiro',
	'The pointer': 'O ponteiro',
	'Stir (wind)': 'Mexer (vento)',
	Attract: 'Atrair',
	Repel: 'Repelir',
	Off: 'Desligado',
	Export: 'Exportar',
	'Process film': 'Filme do processo',
	'To Media Library': 'Para a Media Library',
	'The film records the painting as it happens, from start to stop.':
		'O filme grava a pintura acontecendo, do início ao fim.',
	'Nothing recorded yet - the film runs while it paints.':
		'Nada gravado ainda: o filme corre enquanto pinta.',
	'Preparing…': 'Preparando…',
	'Recording is not available in this browser.':
		'A gravação não está disponível neste navegador.',
	'Could not save to the Media Library.':
		'Não foi possível salvar na Media Library.',
	'Saved to Media Library.': 'Salvo na Media Library.',
	'The settings returned; the painting itself will be new - chaos cannot repeat.':
		'Os ajustes voltaram; a pintura será nova: o caos não se repete.',
	'Charge the field, then start painting.':
		'Carregue o campo e comece a pintar.',
	Cancel: 'Cancelar',
	Update: 'Atualizar',
	'Insert as picture': 'Inserir como imagem',
	'Could not insert.': 'Não foi possível inserir.',
	'Painting…': 'Pintando…',
	marks: 'traços',
	time: 'tempo',
	'Paused - pick a moment, or resume painting.':
		'Em pausa: escolha um momento ou continue pintando.',
	Shatter: 'Shatter',
	'Crystal shards and hard breaks.': 'Estilhaços de cristal e quebras duras.',
	'Echo Chamber': 'Echo Chamber',
	'The picture feeds back into itself.': 'A imagem realimenta a si mesma.',
	'Copy snippet': 'Copiar snippet',
	'Embed (HTML): the piece paints itself live on your website - a new original for every visitor.':
		'Embed (HTML): a obra se pinta ao vivo no seu site: um original novo para cada visitante.',
	'Snippet copied - paste it into an HTML block on your site.':
		'Snippet copiado: cole em um bloco HTML do seu site.',
	'Copy failed.': 'Não foi possível copiar.',
	Ensemble: 'Ensemble',
	'The whole company on one stage - a new cast every time.':
		'A companhia inteira num palco: um elenco novo a cada vez.',
	'Art movement': 'Movimento artístico',
	'Free study': 'Estudo livre',
	'No school. The society as it came.': 'Sem escola. A companhia como ela é.',
	Impressionism: 'Impressionismo',
	'Broken color in soft light, laid on in short dabs.':
		'Cor quebrada em luz suave, aplicada em toques curtos.',
	Pointillism: 'Pontilhismo',
	'The whole picture from tiny dots of pure color.':
		'O quadro inteiro a partir de pontinhos de cor pura.',
	Cubism: 'Cubismo',
	'The subject taken apart into facets and planes.':
		'O motivo desmontado em facetas e planos.',
	Bauhaus: 'Bauhaus',
	'Circle, square, triangle; primary colors, clear order.':
		'Círculo, quadrado, triângulo; cores primárias, ordem clara.',
	Surrealism: 'Surrealismo',
	'Dream logic: soft matter, strange neighbors, slow time.':
		'Lógica de sonho: matéria macia, vizinhos estranhos, tempo lento.',
	'Op Art': 'Op Art',
	'Rhythm and repetition until the eye starts to swim.':
		'Ritmo e repetição até o olho começar a nadar.',
	'Action Painting': 'Action painting',
	'The gesture itself, flung fast and wet.':
		'O próprio gesto, lançado rápido e úmido.',
	Futurism: 'Futurismo',
	'Speed made visible; everything in motion at once.':
		'A velocidade tornada visível; tudo em movimento ao mesmo tempo.',
	Minimalism: 'Minimalismo',
	'A few large, calm forms and a great deal of room.':
		'Poucas formas grandes e calmas e muito espaço.',
	'Ring Parade': 'Ring Parade',
	'Caravans of rings threaded through space.':
		'Caravanas de anéis enfiadas pelo espaço.',
	'Tile Works': 'Tile Works',
	'Walls, stairs and floating towns on a hidden grid.':
		'Muros, escadas e cidades flutuantes numa grade oculta.',
	Hive: 'Hive',
	'Honeycomb growing cell by cell in tilted planes.':
		'Favos crescendo célula a célula em planos inclinados.',
	Clockwork: 'Clockwork',
	'Circles rolling on circles, drawn with a steady hand.':
		'Círculos rolando sobre círculos, traçados com mão firme.',
	Constellation: 'Constellation',
	'Stars set one by one and joined with ruled lines.':
		'Estrelas postas uma a uma e ligadas com linhas de régua.',
	'Morning Light': 'Luz da manhã',
	Earthen: 'Terroso',
	Primary: 'Primárias',
	Medium: 'Meio',
	'Auto (their choice)': 'Auto (escolha deles)',
	Sculpted: 'Escultórico',
	'Brush strokes': 'Pinceladas',
	Watercolor: 'Aquarela',
	Pastel: 'Pastel',
	'Ink sketch': 'Esboço a tinta',
	Splash: 'Respingo',
	Surprise: 'Surpresa',
	'They pick the style themselves.': 'Eles escolhem o estilo.',
	'Their choice': 'Escolha deles',
	'A school drawn fresh at every start - or none at all.':
		'Uma escola sorteada a cada início, ou nenhuma.',
	'They set the dials themselves': 'Eles ajustam os controles',
	'They chose:': 'Escolheram:',
	upheavals: 'convulsões',
	moves: 'mudanças',
	Expressionism: 'Expressionismo',
	Fauvism: 'Fauvismo',
	Classicism: 'Classicismo',
	Suprematism: 'Suprematismo',
	'De Stijl': 'De Stijl',
	'Action painting': 'Action painting',
	'Color Field': 'Campos de cor',
	'Ink wash': 'Aguada de tinta',
	'Art Informel': 'Informalismo',
	Biomorphic: 'Biomórfico',
	Collage: 'Colagem',
	'Broken color in soft light, laid on in short dabs of oil.':
		'Cor quebrada em luz suave, aplicada em toques curtos de óleo.',
	'Loud color, thick paint, black contours that will not sit still.':
		'Cor estridente, tinta espessa, contornos pretos que não param quietos.',
	'Pure color in flat patches, and the white between them left alone.':
		'Cor pura em manchas planas, e o branco entre elas deixado em paz.',
	'One thing seen from many sides at once, in planes of umber and gray.':
		'Uma coisa vista de muitos lados ao mesmo tempo, em planos de sombra e cinza.',
	'Golden proportion, warm shadow, light that arrives from one side.':
		'Proporção áurea, sombra quente, luz que chega de um só lado.',
	'Circle, bar and triangle in primary colors, balanced on a diagonal.':
		'Círculo, barra e triângulo em cores primárias, equilibrados numa diagonal.',
	'Black and red forms floating on white, weightless and tilted.':
		'Formas pretas e vermelhas a flutuar sobre branco, sem peso e inclinadas.',
	'Black rules dividing white, a few cells in red, yellow and blue.':
		'Linhas pretas a dividir o branco, algumas células em vermelho, amarelo e azul.',
	'The whole arm in every stroke, drips and splatter where it ended.':
		'O braço inteiro em cada traço, pingos e salpicos onde terminou.',
	'Bands of luminous color, breathing at their edges.':
		'Faixas de cor luminosa que respiram nas suas margens.',
	'One shape, one line, and the room around them.':
		'Uma forma, uma linha e o espaço à sua volta.',
	'Black lines that bend the eye, drawn one after another.':
		'Linhas pretas que dobram o olhar, traçadas uma após outra.',
	'A few decisive strokes of black ink, and the paper left to breathe.':
		'Alguns traços decididos de tinta preta, e o papel deixado a respirar.',
	'Stains, crusts and scratches; the matter is the subject.':
		'Manchas, crostas e riscos; a matéria é o tema.',
	'Playful organisms, black threads and stars on a tinted ground.':
		'Organismos brincalhões, fios pretos e estrelas sobre um fundo tingido.',
	'Torn paper, printed matter and a red circle, pasted where they landed.':
		'Papel rasgado, impressos e um círculo vermelho, colados onde caíram.',
	'Lines of force, forms repeated as they move, speed made visible.':
		'Linhas de força, formas repetidas em movimento, a velocidade tornada visível.',
	Schools: 'Escolas',
	'In space (3D)': 'No espaço (3D)',
	'Move your pointer as randomly as possible inside this field until the bar is full. Your movement becomes this artwork - it can never be painted again.':
		'Move o ponteiro o mais aleatoriamente possível dentro deste campo até a barra estar cheia. O teu movimento torna-se esta obra - nunca mais poderá ser pintada.',
	'Charged - start painting whenever you like.':
		'Carregado - começa a pintar quando quiseres.',
	'Your pointer stirs the paint · click for an impulse':
		'O teu ponteiro mexe na tinta · clica para um impulso',
	'Charge the field until the bar is full, then start painting.':
		'Carrega o campo até a barra estar cheia e depois começa a pintar.',
	'with a guest from': 'com um convidado de',
	Motif: 'Motivo',
	'Paint after': 'Pintar a partir de',
	None: 'Nenhum',
	'The picture on the canvas': 'A imagem na tela',
	'A picture of your own': 'Uma imagem tua',
	'A text': 'Um texto',
	'Choose a picture': 'Escolher imagem',
	'No picture yet': 'Ainda sem imagem',
	'That picture could not be read.': 'Não foi possível ler essa imagem.',
	'Your text': 'O teu texto',
	Font: 'Fonte',
	Reading: 'Leitura',
	Abstract: 'Abstrato',
	Underpainting: 'Base pintada',
	Contours: 'Contornos',
	'Fill the letters': 'Preencher as letras',
	'Keep the letters clear': 'Deixar as letras livres',
	'Outline the letters': 'Contornar as letras',
	'Reading the motif…': 'A ler o motivo…',
	'The canvas is empty - the motif needs a picture.':
		'A tela está vazia - o motivo precisa de uma imagem.',
	'Choose a picture first.': 'Escolhe primeiro uma imagem.',
	'Type a text first.': 'Escreve primeiro um texto.',
	'after a picture': 'a partir de uma imagem',
	'after a text': 'a partir de um texto',
	'Post-Impressionism': 'Pós-impressionismo',
	'Thick directional strokes that swirl around every form, color as feeling.':
		'Pinceladas grossas e direcionadas que rodopiam em volta de cada forma, a cor como sentimento.',
	Orphism: 'Orfismo',
	'Discs of pure color in concentric rings, light turning into rhythm.':
		'Discos de cor pura em anéis concêntricos, a luz tornada ritmo.',
	'Pop Art': 'Pop art',
	'Flat color, a black keyline, a screen of dots - printed, not painted.':
		'Cor plana, contorno preto, uma trama de pontos - impresso, não pintado.',
	'Street Art': 'Arte urbana',
	'Spray and drip on a dark wall, a stencil, a quick tag in ink.':
		'Spray e escorridos numa parede escura, um stencil, um tag rápido a tinta.',
	'Art Nouveau': 'Arte nova',
	'Whiplash curves, tendrils and flat pale shapes in a dark contour.':
		'Curvas de chicote, gavinhas e formas planas e pálidas num contorno escuro.',
	Mosaic: 'Mosaico',
	'Little stones in rows that follow the form, gold among them.':
		'Pedrinhas em fileiras que seguem a forma, ouro entre elas.',
	'Stained Glass': 'Vitral',
	'Cells of glowing color in a net of black lead.':
		'Células de cor luminosa numa rede de chumbo preto.',
	Woodcut: 'Xilogravura',
	'Black carved marks on white paper, one color allowed.':
		'Marcas pretas entalhadas em papel branco, uma só cor permitida.',
	Constructivism: 'Construtivismo',
	'Red and black bars on a diagonal, a circle, the picture as a machine.':
		'Barras vermelhas e pretas na diagonal, um círculo, o quadro como máquina.',
	'Ukiyo-e': 'Ukiyo-e',
	'Flat planes of color in a fine black keyline, a wave that curls.':
		'Planos de cor num fino contorno preto, uma onda que se encaracola.',
	'Line art and paint': 'Traço e tinta',
	'Flat planes and paint': 'Planos e tinta',
	Likeness: 'Semelhança',
	'Your pointer stirs the paint · click for an impulse · draw a stroke and they answer it':
		'O teu ponteiro mexe na tinta · clica para um impulso · traça um risco e eles respondem',
	'Cut into pieces': 'Cortado em pedaços',
	'Letters as cut-outs': 'Letras recortadas',
	'Burst of color': 'Explosão de cor',
	'A burst of color somewhere on the sheet. Click the sheet for one where you point.':
		'Uma explosão de cor algures na folha. Clica na folha para uma exatamente aí.',
	'Your hand over the sheet draws the painters · click for a burst of color · drag a stroke and they answer it':
		'A tua mão sobre a folha atrai os pintores · clica para uma explosão de cor · traça um risco e eles respondem',
	'All schools at once, each painter in another.':
		'Todas as escolas ao mesmo tempo, cada pintor numa outra.',
	'Now painting as': 'Pinta agora como',
};

const IT = {
	'Chaos Art': 'Chaos Art',
	'Independent painters make one-of-a-kind art. You choose the moment it is finished.':
		'Pittori indipendenti creano un’opera unica. Tu scegli il momento in cui è finita.',
	Style: 'Stile',
	'Ink Storm': 'Ink Storm',
	'Coral Garden': 'Coral Garden',
	'Neon Weave': 'Neon Weave',
	'Oil Nebula': 'Oil Nebula',
	'Ribbons of ink riding a storm.':
		'Nastri d’inchiostro che cavalcano la tempesta.',
	'A reef that grows while you watch.':
		'Una barriera che cresce sotto i tuoi occhi.',
	'Glowing threads weaving a nervous net.':
		'Fili luminosi che tessono una rete nervosa.',
	'Soft clouds of color, breathing.':
		'Morbide nuvole di colore che respirano.',
	'One of a kind': 'Pezzo unico',
	'Same settings, different picture - every run is unique, there is no seed. Snapshots keep the last two minutes, so no moment is ever lost.':
		'Stesse impostazioni, immagine diversa: ogni esecuzione è unica, non c’è seme. Gli scatti conservano gli ultimi due minuti; nessun momento va perso.',
	'Drag to orbit · wheel to zoom · your pointer stirs the paint':
		'Trascina per orbitare · rotella per lo zoom · il puntatore mescola il colore',
	'Charge the piece': 'Carica l’opera',
	'Move your pointer here. Your movement becomes this artwork - it can never be painted again.':
		'Muovi qui il puntatore. Il tuo movimento diventa quest’opera: non potrà mai essere ridipinta.',
	'Start painting': 'Inizia a dipingere',
	Pause: 'Pausa',
	Resume: 'Riprendi',
	Impulse: 'Impulso',
	'Start over': 'Ricomincia',
	'Pick the moment': 'Scegli il momento',
	'Now (live)': 'Adesso (dal vivo)',
	Temperament: 'Temperamento',
	'Order to chaos': 'Dall’ordine al caos',
	Energy: 'Energia',
	Density: 'Densità',
	Tempo: 'Tempo',
	Colors: 'Colori',
	Palette: 'Palette',
	Ember: 'Brace',
	'Deep Ocean': 'Oceano profondo',
	Ultraviolet: 'Ultravioletto',
	'Ink and Bone': 'Inchiostro e osso',
	Meadow: 'Prato',
	Aurora: 'Aurora',
	Candy: 'Caramella',
	Gilded: 'Dorato',
	Crimson: 'Cremisi',
	Monochrome: 'Monocromo',
	'Custom colors': 'Colori personalizzati',
	Look: 'Aspetto',
	Ground: 'Sfondo',
	'Style default': 'Predefinito dello stile',
	'Black void': 'Vuoto nero',
	Paper: 'Carta',
	'Deep mist': 'Nebbia profonda',
	Bloom: 'Bloom',
	'Depth blur': 'Sfocatura di profondità',
	Grain: 'Grana',
	Vignette: 'Vignettatura',
	Pointer: 'Puntatore',
	'The pointer': 'Il puntatore',
	'Stir (wind)': 'Mescola (vento)',
	Attract: 'Attira',
	Repel: 'Respingi',
	Off: 'Spento',
	Export: 'Esporta',
	'Process film': 'Film del processo',
	'To Media Library': 'Nella Media Library',
	'The film records the painting as it happens, from start to stop.':
		'Il film registra la pittura mentre accade, dall’inizio allo stop.',
	'Nothing recorded yet - the film runs while it paints.':
		'Niente di registrato ancora: il film gira mentre dipinge.',
	'Preparing…': 'Preparazione…',
	'Recording is not available in this browser.':
		'La registrazione non è disponibile in questo browser.',
	'Could not save to the Media Library.':
		'Impossibile salvare nella Media Library.',
	'Saved to Media Library.': 'Salvato nella Media Library.',
	'The settings returned; the painting itself will be new - chaos cannot repeat.':
		'Le impostazioni sono tornate; il dipinto sarà nuovo: il caos non si ripete.',
	'Charge the field, then start painting.':
		'Carica il campo, poi inizia a dipingere.',
	Cancel: 'Annulla',
	Update: 'Aggiorna',
	'Insert as picture': 'Inserisci come immagine',
	'Could not insert.': 'Inserimento non riuscito.',
	'Painting…': 'Dipinge…',
	marks: 'tracce',
	time: 'tempo',
	'Paused - pick a moment, or resume painting.':
		'In pausa: scegli un momento o riprendi a dipingere.',
	Shatter: 'Shatter',
	'Crystal shards and hard breaks.': 'Schegge di cristallo e rotture nette.',
	'Echo Chamber': 'Echo Chamber',
	'The picture feeds back into itself.': 'L’immagine si rialimenta da sola.',
	'Copy snippet': 'Copia snippet',
	'Embed (HTML): the piece paints itself live on your website - a new original for every visitor.':
		'Embed (HTML): l’opera si dipinge dal vivo sul tuo sito: un originale nuovo per ogni visitatore.',
	'Snippet copied - paste it into an HTML block on your site.':
		'Snippet copiato: incollalo in un blocco HTML del tuo sito.',
	'Copy failed.': 'Copia non riuscita.',
	Ensemble: 'Ensemble',
	'The whole company on one stage - a new cast every time.':
		'L’intera compagnia su un palco: un cast nuovo ogni volta.',
	'Art movement': 'Movimento artistico',
	'Free study': 'Studio libero',
	'No school. The society as it came.':
		'Nessuna scuola. La compagnia così com’è.',
	Impressionism: 'Impressionismo',
	'Broken color in soft light, laid on in short dabs.':
		'Colore spezzato in luce morbida, steso a piccoli tocchi.',
	Pointillism: 'Puntinismo',
	'The whole picture from tiny dots of pure color.':
		'L’intero quadro da minuscoli punti di colore puro.',
	Cubism: 'Cubismo',
	'The subject taken apart into facets and planes.':
		'Il soggetto scomposto in sfaccettature e piani.',
	Bauhaus: 'Bauhaus',
	'Circle, square, triangle; primary colors, clear order.':
		'Cerchio, quadrato, triangolo; colori primari, ordine chiaro.',
	Surrealism: 'Surrealismo',
	'Dream logic: soft matter, strange neighbors, slow time.':
		'Logica del sogno: materia morbida, vicini strani, tempo lento.',
	'Op Art': 'Op Art',
	'Rhythm and repetition until the eye starts to swim.':
		'Ritmo e ripetizione finché l’occhio inizia a nuotare.',
	'Action Painting': 'Action painting',
	'The gesture itself, flung fast and wet.':
		'Il gesto stesso, lanciato veloce e bagnato.',
	Futurism: 'Futurismo',
	'Speed made visible; everything in motion at once.':
		'La velocità resa visibile; tutto in moto insieme.',
	Minimalism: 'Minimalismo',
	'A few large, calm forms and a great deal of room.':
		'Poche forme grandi e calme e moltissimo spazio.',
	'Ring Parade': 'Ring Parade',
	'Caravans of rings threaded through space.':
		'Carovane di anelli infilate nello spazio.',
	'Tile Works': 'Tile Works',
	'Walls, stairs and floating towns on a hidden grid.':
		'Muri, scale e città sospese su una griglia nascosta.',
	Hive: 'Hive',
	'Honeycomb growing cell by cell in tilted planes.':
		'Favi che crescono cella per cella su piani inclinati.',
	Clockwork: 'Clockwork',
	'Circles rolling on circles, drawn with a steady hand.':
		'Cerchi che rotolano su cerchi, tracciati con mano ferma.',
	Constellation: 'Constellation',
	'Stars set one by one and joined with ruled lines.':
		'Stelle poste una a una e unite con linee a riga.',
	'Morning Light': 'Luce del mattino',
	Earthen: 'Terroso',
	Primary: 'Primari',
	Medium: 'Medium',
	'Auto (their choice)': 'Auto (scelta loro)',
	Sculpted: 'Scultoreo',
	'Brush strokes': 'Pennellate',
	Watercolor: 'Acquerello',
	Pastel: 'Pastello',
	'Ink sketch': 'Schizzo a inchiostro',
	Splash: 'Schizzo di colore',
	Surprise: 'Sorpresa',
	'They pick the style themselves.': 'Scelgono loro lo stile.',
	'Their choice': 'Scelta loro',
	'A school drawn fresh at every start - or none at all.':
		'Una scuola estratta a ogni avvio, o nessuna.',
	'They set the dials themselves': 'Regolano loro le manopole',
	'They chose:': 'Hanno scelto:',
	upheavals: 'sconvolgimenti',
	moves: 'traslochi',
	Expressionism: 'Espressionismo',
	Fauvism: 'Fauvismo',
	Classicism: 'Classicismo',
	Suprematism: 'Suprematismo',
	'De Stijl': 'De Stijl',
	'Action painting': 'Action painting',
	'Color Field': 'Color Field',
	'Ink wash': 'Pittura a inchiostro',
	'Art Informel': 'Informale',
	Biomorphic: 'Biomorfico',
	Collage: 'Collage',
	'Broken color in soft light, laid on in short dabs of oil.':
		"Colore spezzato in luce morbida, steso a brevi tocchi d'olio.",
	'Loud color, thick paint, black contours that will not sit still.':
		'Colore urlato, pasta densa, contorni neri che non stanno fermi.',
	'Pure color in flat patches, and the white between them left alone.':
		'Colore puro in campiture piatte, e il bianco fra loro lasciato stare.',
	'One thing seen from many sides at once, in planes of umber and gray.':
		"Una cosa vista da molti lati insieme, in piani di terra d'ombra e grigio.",
	'Golden proportion, warm shadow, light that arrives from one side.':
		'Sezione aurea, ombra calda, luce che arriva da un solo lato.',
	'Circle, bar and triangle in primary colors, balanced on a diagonal.':
		'Cerchio, barra e triangolo in colori primari, in equilibrio su una diagonale.',
	'Black and red forms floating on white, weightless and tilted.':
		'Forme nere e rosse che galleggiano sul bianco, senza peso e inclinate.',
	'Black rules dividing white, a few cells in red, yellow and blue.':
		'Linee nere che dividono il bianco, poche celle in rosso, giallo e blu.',
	'The whole arm in every stroke, drips and splatter where it ended.':
		'Tutto il braccio in ogni tratto, colature e schizzi dove è finito.',
	'Bands of luminous color, breathing at their edges.':
		'Bande di colore luminoso che respirano ai bordi.',
	'One shape, one line, and the room around them.':
		'Una forma, una linea e lo spazio intorno a loro.',
	'Black lines that bend the eye, drawn one after another.':
		"Linee nere che piegano lo sguardo, tracciate una dopo l'altra.",
	'A few decisive strokes of black ink, and the paper left to breathe.':
		"Pochi tratti decisi d'inchiostro nero, e la carta lasciata respirare.",
	'Stains, crusts and scratches; the matter is the subject.':
		'Macchie, croste e graffi; la materia è il soggetto.',
	'Playful organisms, black threads and stars on a tinted ground.':
		'Organismi giocosi, fili neri e stelle su un fondo tinto.',
	'Torn paper, printed matter and a red circle, pasted where they landed.':
		'Carta strappata, stampati e un cerchio rosso, incollati dove sono caduti.',
	'Lines of force, forms repeated as they move, speed made visible.':
		'Linee di forza, forme ripetute nel movimento, la velocità resa visibile.',
	Schools: 'Scuole',
	'In space (3D)': 'Nello spazio (3D)',
	'Move your pointer as randomly as possible inside this field until the bar is full. Your movement becomes this artwork - it can never be painted again.':
		"Muovi il puntatore nel modo più casuale possibile dentro questo campo finché la barra è piena. Il tuo movimento diventa quest'opera - non potrà mai essere dipinta di nuovo.",
	'Charged - start painting whenever you like.':
		'Carico - inizia a dipingere quando vuoi.',
	'Your pointer stirs the paint · click for an impulse':
		'Il tuo puntatore smuove il colore · clic per un impulso',
	'Charge the field until the bar is full, then start painting.':
		'Carica il campo finché la barra è piena, poi inizia a dipingere.',
	'with a guest from': 'con un ospite da',
	Motif: 'Motivo',
	'Paint after': 'Dipingere da',
	None: 'Nessuno',
	'The picture on the canvas': "L'immagine sulla tela",
	'A picture of your own': "Un'immagine tua",
	'A text': 'Un testo',
	'Choose a picture': 'Scegli immagine',
	'No picture yet': 'Ancora nessuna immagine',
	'That picture could not be read.': "Impossibile leggere quell'immagine.",
	'Your text': 'Il tuo testo',
	Font: 'Carattere',
	Reading: 'Lettura',
	Abstract: 'Astratto',
	Underpainting: 'Sottopittura',
	Contours: 'Contorni',
	'Fill the letters': 'Riempire le lettere',
	'Keep the letters clear': 'Lasciare libere le lettere',
	'Outline the letters': 'Contornare le lettere',
	'Reading the motif…': 'Lettura del motivo…',
	'The canvas is empty - the motif needs a picture.':
		"La tela è vuota - il motivo ha bisogno di un'immagine.",
	'Choose a picture first.': "Scegli prima un'immagine.",
	'Type a text first.': 'Scrivi prima un testo.',
	'after a picture': "da un'immagine",
	'after a text': 'da un testo',
	'Post-Impressionism': 'Postimpressionismo',
	'Thick directional strokes that swirl around every form, color as feeling.':
		'Pennellate spesse e direzionali che vorticano attorno a ogni forma, il colore come sentimento.',
	Orphism: 'Orfismo',
	'Discs of pure color in concentric rings, light turning into rhythm.':
		'Dischi di colore puro in anelli concentrici, la luce che diventa ritmo.',
	'Pop Art': 'Pop art',
	'Flat color, a black keyline, a screen of dots - printed, not painted.':
		'Colore piatto, contorno nero, un retino di punti - stampato, non dipinto.',
	'Street Art': 'Street art',
	'Spray and drip on a dark wall, a stencil, a quick tag in ink.':
		'Spray e colature su un muro scuro, uno stencil, una tag veloce a inchiostro.',
	'Art Nouveau': 'Art nouveau',
	'Whiplash curves, tendrils and flat pale shapes in a dark contour.':
		'Curve a colpo di frusta, viticci e forme piatte e pallide in un contorno scuro.',
	Mosaic: 'Mosaico',
	'Little stones in rows that follow the form, gold among them.':
		'Piccole pietre in file che seguono la forma, oro fra loro.',
	'Stained Glass': 'Vetrata',
	'Cells of glowing color in a net of black lead.':
		'Celle di colore luminoso in una rete di piombo nero.',
	Woodcut: 'Xilografia',
	'Black carved marks on white paper, one color allowed.':
		'Segni neri intagliati su carta bianca, un solo colore ammesso.',
	Constructivism: 'Costruttivismo',
	'Red and black bars on a diagonal, a circle, the picture as a machine.':
		'Barre rosse e nere in diagonale, un cerchio, il quadro come macchina.',
	'Ukiyo-e': 'Ukiyo-e',
	'Flat planes of color in a fine black keyline, a wave that curls.':
		"Campiture di colore in un fine contorno nero, un'onda che si arriccia.",
	'Line art and paint': 'Linee e colore',
	'Flat planes and paint': 'Campiture e colore',
	Likeness: 'Somiglianza',
	'Your pointer stirs the paint · click for an impulse · draw a stroke and they answer it':
		'Il tuo puntatore smuove il colore · clic per un impulso · traccia un segno e loro rispondono',
	'Cut into pieces': 'Tagliato a pezzi',
	'Letters as cut-outs': 'Lettere ritagliate',
	'Burst of color': 'Scoppio di colore',
	'A burst of color somewhere on the sheet. Click the sheet for one where you point.':
		'Uno scoppio di colore da qualche parte sul foglio. Clicca sul foglio per averne uno proprio lì.',
	'Your hand over the sheet draws the painters · click for a burst of color · drag a stroke and they answer it':
		'La tua mano sul foglio attira i pittori · clic per uno scoppio di colore · traccia un segno e loro rispondono',
	'All schools at once, each painter in another.':
		"Tutte le scuole insieme, ogni pittore in un'altra.",
	'Now painting as': 'Ora dipinge come',
};

export const TABLES = { de: DE, es: ES, fr: FR, pt: PT, it: IT };

const TABLE = TABLES[ LOCALE.slice( 0, 2 ).toLowerCase() ] || null;

/** Translate, falling back to the English source string. */
export function t( s ) {
	return ( TABLE && TABLE[ s ] ) || s;
}
