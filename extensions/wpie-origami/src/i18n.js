/**
 * Translations for this extension.
 *
 * Moved out of main.js in the 27.07.2026 refactoring round: 154 of its
 * 1094 lines were dictionary literals, which made the file look far more
 * complicated than it is. Pure data - esbuild inlines it exactly as before.
 */

const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	document.documentElement.lang ||
	'en'
).toLowerCase();

const DE = {
	'Design the paper, watch it fold itself, print sheet and instructions.':
		'Gestalte das Papier, sieh ihm beim Falten zu, drucke Faltbogen und Anleitung.',
	Figure: 'Figur',
	Fox: 'Fuchs',
	Heart: 'Herz',
	Face: 'Gesicht',
	Ears: 'Ohren',
	Snout: 'Schnauze',
	'Fold the sheet in half along the diagonal, away from you.':
		'Falte das Blatt entlang der Diagonale nach hinten zusammen.',
	'Fold both corners up over the front - the ears.':
		'Falte beide Ecken nach vorn hinauf - die Ohren.',
	'Fold the front point up across the face - the snout.':
		'Falte die vordere Spitze über das Gesicht hinauf - die Schnauze.',
	'Fold the top corner behind, down to the middle of the sheet.':
		'Falte die obere Ecke nach hinten, hinunter zur Blattmitte.',
	'Fold the bottom corner behind, well past the folded edge.':
		'Falte die untere Ecke nach hinten, weit über die Faltkante hinaus.',
	'Fold both sides behind so their edges meet in the middle of the back.':
		'Falte beide Seiten nach hinten, sodass sich ihre Kanten hinten in der Mitte treffen.',
	'Fold the four little corners behind to round the lobes.':
		'Falte die vier kleinen Ecken nach hinten, das rundet die Bögen.',
	'Turn the heart over - the smooth side is the front.':
		'Dreh das Herz um - die glatte Seite ist die Vorderseite.',
	Sailboat: 'Segelboot',
	Sail: 'Segel',
	Hull: 'Rumpf',
	'Fold the sheet in half along the diagonal, away from you - the sail.':
		'Falte das Blatt entlang der Diagonale nach hinten zusammen - das Segel.',
	'Fold the bottom strip of the front layer up - the hull.':
		'Falte den unteren Streifen der vorderen Lage hinauf - der Rumpf.',
	'Fold the tip of the front layer down - the pennant.':
		'Falte die Spitze der vorderen Lage herunter - der Wimpel.',
	'Fortune teller': 'Himmel und Hölle',
	'Inside flaps': 'Innenklappen',
	Pockets: 'Taschen',
	'Fold all four corners to the middle of the sheet.':
		'Falte alle vier Ecken zur Blattmitte.',
	'Turn the whole thing over.': 'Dreh das Ganze um.',
	'Fold all four corners to the middle again.':
		'Falte wieder alle vier Ecken zur Mitte.',
	'Slide your fingers into the four pockets and push them together - it opens.':
		'Schieb die Finger in die vier Taschen und drück sie zusammen - es öffnet sich.',
	Butterfly: 'Schmetterling',
	Wings: 'Flügel',
	'Fold the sheet in half backward, top edge behind the bottom edge.':
		'Falte das Blatt nach hinten zusammen, Oberkante hinter die Unterkante.',
	'Push both sides in between the layers - the sheet collapses into a triangle.':
		'Drück beide Seiten zwischen die Lagen - das Blatt fällt zu einem Dreieck zusammen.',
	'Fold the front corners up to the top point - the upper wings.':
		'Falte die vorderen Ecken zur oberen Spitze hinauf - die Oberflügel.',
	'Bend the wings up along the middle - and it flies.':
		'Bieg die Flügel an der Mitte nach oben - und er fliegt.',
	'Jumping frog': 'Hüpffrosch',
	Back: 'Rücken',
	Head: 'Kopf',
	'Fold the sheet in half backward, left behind right.':
		'Falte das Blatt nach hinten zusammen, links hinter rechts.',
	'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.':
		'Falte die Oberkante nach hinten herunter, dann drück beide Seiten hinein - oben entsteht ein Dreieck.',
	'Fold the front corners up to the top point.':
		'Falte die vorderen Ecken zur oberen Spitze hinauf.',
	'Fold the little triangles down and out - the front legs.':
		'Falte die kleinen Dreiecke schräg nach unten heraus - die Vorderbeine.',
	'Fold the bottom edge up, then its half back down - the spring.':
		'Falte die Unterkante hinauf und ihre Hälfte wieder herunter - die Sprungfeder.',
	'Let the spring open a little - the frog crouches, ready to jump.':
		'Lass die Feder etwas aufgehen - der Frosch kauert sich sprungbereit hin.',
	Crane: 'Kranich',
	Body: 'Körper',
	'Tuck the left half between the layers: front to the front, back to the back - the square base.':
		'Steck die linke Hälfte zwischen die Lagen: vorn nach vorn, hinten nach hinten - das Quadratbasis-Paket.',
	'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.':
		'Falte die Kanten der vorderen Klappen zur Mitte und heb die vordere Spitze weit über das obere Ende - die Blütenfalte.',
	'The same on the back - the bird base, two long points below.':
		'Dasselbe hinten - die Vogelbasis, mit zwei langen Spitzen unten.',
	'Reverse-fold the front point up and out - the neck.':
		'Stülp die vordere Spitze nach oben heraus - der Hals.',
	'Reverse-fold the back point up the other way - the tail.':
		'Stülp die hintere Spitze zur anderen Seite hinauf - der Schwanz.',
	'A small reverse fold at the top of the neck - the head.':
		'Eine kleine Stülpfalte oben am Hals - der Kopf.',
	'Fan the wings up - the crane is done.':
		'Fächere die Flügel nach oben auf - der Kranich ist fertig.',
	'Masu box': 'Masu-Schachtel',
	Floor: 'Boden',
	Walls: 'Wände',
	'Raise all four walls along the edges of the floor.':
		'Stell alle vier Wände an den Bodenkanten auf.',
	'Unfold each corner out over the rim - the lining shows.':
		'Schlag jede Ecke wieder über den Rand nach außen auf - das Futter zeigt sich.',
	Swan: 'Schwan',
	Neck: 'Hals',
	'Fold both edges at the nose corner in to the diagonal - the kite.':
		'Falte beide Kanten an der Nasenecke zur Diagonale hinein - der Drachen.',
	'Fold the kite in half along the diagonal, away from you.':
		'Falte den Drachen entlang der Diagonale nach hinten zusammen.',
	'Reverse-fold the long point up between the layers - the neck.':
		'Stülp die lange Spitze zwischen den Lagen nach oben - der Hals.',
	'A small reverse fold at the top - the head looks forward.':
		'Eine kleine Stülpfalte oben - der Kopf schaut nach vorn.',
	Dove: 'Taube',
	'Fold the front layer up past the ridge - the near wing.':
		'Falte die vordere Lage über den Rücken hinauf - der nahe Flügel.',
	'Fold the back layer behind, the same way - the far wing.':
		'Falte die hintere Lage genauso nach hinten - der ferne Flügel.',
	'Bend the head tip down through both layers - the beak.':
		'Knick die Kopfspitze durch beide Lagen herunter - der Schnabel.',
	'Let the wings open - the dove flies.':
		'Lass die Flügel aufgehen - die Taube fliegt.',
	'Paper plane': 'Papierflieger',
	Nose: 'Nase',
	'Fold both edges at the nose corner in to the centre line.':
		'Falte beide Kanten an der Nasenecke zur Mittellinie hinein.',
	'Fold the slanted edges in to the centre line again - the dart.':
		'Falte die schrägen Kanten noch einmal zur Mittellinie - der Pfeil.',
	'Fold the dart in half along the centre line, away from you.':
		'Falte den Pfeil entlang der Mittellinie nach hinten zusammen.',
	'Fold the near wing down to the keel, the far wing behind.':
		'Falte den nahen Flügel zum Kiel herunter, den fernen nach hinten.',
	'Open the wings out - ready for the maiden flight.':
		'Klapp die Flügel auf - bereit zum Jungfernflug.',
	'Samurai helmet': 'Samurai-Helm',
	Horns: 'Hörner',
	Brim: 'Krempe',
	Helmet: 'Helm',
	'Fold both corners down to the chin point.':
		'Falte beide Ecken zur Kinnspitze herunter.',
	'Fold both hanging tips back up to the crown.':
		'Falte beide herabhängenden Spitzen wieder hinauf zur Krone.',
	'Fold the tips out at an angle - the horns.':
		'Falte die Spitzen schräg nach außen - die Hörner.',
	'Fold the front layer up over the horns - the brim.':
		'Falte die vordere Lage über die Hörner hinauf - die Krempe.',
	'Fold the back layer up behind - the helmet closes.':
		'Falte die hintere Lage nach hinten hinauf - der Helm schließt sich.',
	Fish: 'Fisch',
	Tail: 'Schwanz',
	'Fold the thin end up across the back - the tail.':
		'Falte das schmale Ende über den Rücken hinauf - der Schwanz.',
	'Fold the nose tip behind - the mouth.':
		'Falte die Nasenspitze nach hinten - das Maul.',
	Tulip: 'Tulpe',
	Bloom: 'Blüte',
	Petals: 'Blütenblätter',
	'Fold both corners up across the middle, tips past the edges - the petals.':
		'Falte beide Ecken über die Mitte hinauf, die Spitzen über die Kanten hinaus - die Blütenblätter.',
	'Open the bloom a little - it stands.':
		'Öffne die Blüte ein wenig - sie steht.',
	'Dog face': 'Hundekopf',
	'Fold the front corners down over the face - the floppy ears.':
		'Falte die vorderen Ecken über das Gesicht herunter - die Schlappohren.',
	'Fold the front chin tip up, the back tip behind - the snout.':
		'Falte die vordere Kinnspitze hinauf, die hintere nach hinten - die Schnauze.',
	'Cat face': 'Katzenkopf',
	'Fold both corners up past the top edge - the pointy ears.':
		'Falte beide Ecken über die Oberkante hinauf - die spitzen Ohren.',
	'Fold the chin tip behind - the cat looks at you.':
		'Falte die Kinnspitze nach hinten - die Katze schaut dich an.',
	Penguin: 'Pinguin',
	Chest: 'Brust',
	Beak: 'Schnabel',
	'Fold both edges at the head corner in to the diagonal - the dark back.':
		'Falte beide Kanten an der Kopfecke zur Diagonale hinein - der dunkle Rücken.',
	'Fold it in half along the diagonal, away from you.':
		'Falte es entlang der Diagonale nach hinten zusammen.',
	'Open the body a little - the penguin stands.':
		'Öffne den Körper ein wenig - der Pinguin steht.',
	Cup: 'Becher',
	Rim: 'Rand',
	'Fold the right corner across, its tip onto the left edge.':
		'Falte die rechte Ecke hinüber, die Spitze auf die linke Kante.',
	'Fold the left corner across over it - the band locks.':
		'Falte die linke Ecke darüber hinweg - das Band verriegelt sich.',
	'Fold the front tip down over the band, the back tip behind.':
		'Falte die vordere Spitze über das Band herunter, die hintere nach hinten.',
	'Open the cup a little - it stands.':
		'Öffne den Becher ein wenig - er steht.',
	'The paper': 'Das Papier',
	'Front side': 'Vorderseite',
	'Back side': 'Rückseite',
	Colour: 'Farbe',
	'Pick a picture': 'Bild wählen',
	'Remove picture': 'Bild entfernen',
	Pattern: 'Muster',
	'Pattern colour': 'Musterfarbe',
	Plain: 'Uni',
	Dots: 'Punkte',
	Stripes: 'Streifen',
	Zigzag: 'Zickzack',
	Stars: 'Sterne',
	Checks: 'Karo',
	'Show where things land': 'Zeigen, wo was landet',
	'Print fold lines on the sheet': 'Faltlinien mit aufdrucken',
	Scene: 'Szene',
	Lighting: 'Beleuchtung',
	Ground: 'Untergrund',
	Soft: 'Weich',
	Warm: 'Warm',
	Dramatic: 'Dramatisch',
	Studio: 'Studio',
	'Shadow only': 'Nur Schatten',
	Table: 'Tisch',
	Mirror: 'Spiegelnd',
	None: 'Ohne',
	Background: 'Hintergrund',
	Instructions: 'Anleitung',
	Play: 'Abspielen',
	'The sheet': 'Das Blatt',
	'Step %1$s of %2$s': 'Schritt %1$s von %2$s',
	'Finished!': 'Fertig!',
	Angled: 'Schräg',
	Front: 'Frontal',
	'Three-quarter': 'Dreiviertel',
	'From above': 'Von oben',
	'Insert as picture': 'Als Bild einfügen',
	'Insert sheet + instructions': 'Faltbogen + Anleitung einfügen',
	Cancel: 'Abbrechen',
	'Rendering the pages': 'Erzeuge die Seiten',
	'Inserted.': 'Eingefügt.',
	'Could not insert.': 'Konnte nicht einfügen.',
	'Folding sheet - front': 'Faltbogen - Vorderseite',
	'Folding sheet - back, mirrored for duplex print':
		'Faltbogen - Rückseite, gespiegelt für Duplexdruck',
	'Folding instructions': 'Faltanleitung',
	'Origami picture': 'Origami-Bild',
	'Folding sheet': 'Faltbogen',
	'Insert pages': 'Seiten einfügen',
	'Drag to turn the scene, wheel to zoom.':
		'Ziehen dreht die Szene, Mausrad zoomt.',
	'Use brand colors': 'Markenfarben nutzen',
	'Brand kit': 'Marken-Kit',
};

const ES = {
	'Design the paper, watch it fold itself, print sheet and instructions.':
		'Diseña el papel, míralo plegarse solo, imprime la hoja y las instrucciones.',
	Figure: 'Figura',
	Fox: 'Zorro',
	Heart: 'Corazón',
	Face: 'Cara',
	Ears: 'Orejas',
	Snout: 'Hocico',
	'Fold the sheet in half along the diagonal, away from you.':
		'Dobla la hoja por la mitad a lo largo de la diagonal, hacia atrás.',
	'Fold both corners up over the front - the ears.':
		'Dobla ambas esquinas hacia arriba sobre el frente - las orejas.',
	'Fold the front point up across the face - the snout.':
		'Dobla la punta delantera hacia arriba sobre la cara - el hocico.',
	'Fold the top corner behind, down to the middle of the sheet.':
		'Dobla la esquina superior hacia atrás, hasta el centro de la hoja.',
	'Fold the bottom corner behind, well past the folded edge.':
		'Dobla la esquina inferior hacia atrás, bastante más allá del borde plegado.',
	'Fold both sides behind so their edges meet in the middle of the back.':
		'Dobla ambos lados hacia atrás de modo que sus bordes se encuentren en el centro por detrás.',
	'Fold the four little corners behind to round the lobes.':
		'Dobla las cuatro esquinitas hacia atrás para redondear los lóbulos.',
	'Turn the heart over - the smooth side is the front.':
		'Da la vuelta al corazón - el lado liso es el frente.',
	Sailboat: 'Velero',
	Sail: 'Vela',
	Hull: 'Casco',
	'Fold the sheet in half along the diagonal, away from you - the sail.':
		'Dobla la hoja por la mitad a lo largo de la diagonal, hacia atrás - la vela.',
	'Fold the bottom strip of the front layer up - the hull.':
		'Dobla hacia arriba la tira inferior de la capa delantera - el casco.',
	'Fold the tip of the front layer down - the pennant.':
		'Dobla hacia abajo la punta de la capa delantera - el banderín.',
	'Fortune teller': 'Comecocos',
	'Inside flaps': 'Solapas interiores',
	Pockets: 'Bolsillos',
	'Fold all four corners to the middle of the sheet.':
		'Dobla las cuatro esquinas hacia el centro de la hoja.',
	'Turn the whole thing over.': 'Da la vuelta a todo.',
	'Fold all four corners to the middle again.':
		'Dobla otra vez las cuatro esquinas hacia el centro.',
	'Slide your fingers into the four pockets and push them together - it opens.':
		'Mete los dedos en los cuatro bolsillos y júntalos - se abre.',
	Butterfly: 'Mariposa',
	Wings: 'Alas',
	'Fold the sheet in half backward, top edge behind the bottom edge.':
		'Dobla la hoja por la mitad hacia atrás, el borde superior detrás del inferior.',
	'Push both sides in between the layers - the sheet collapses into a triangle.':
		'Empuja ambos lados hacia dentro entre las capas - la hoja se pliega en un triángulo.',
	'Fold the front corners up to the top point - the upper wings.':
		'Dobla las esquinas delanteras hacia la punta superior - las alas superiores.',
	'Bend the wings up along the middle - and it flies.':
		'Dobla las alas hacia arriba por el centro - y vuela.',
	'Jumping frog': 'Rana saltarina',
	Back: 'Lomo',
	Head: 'Cabeza',
	'Fold the sheet in half backward, left behind right.':
		'Dobla la hoja por la mitad hacia atrás, izquierda detrás de derecha.',
	'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.':
		'Dobla el borde superior hacia atrás y abajo, luego empuja ambos lados hacia dentro - arriba se forma un triángulo.',
	'Fold the front corners up to the top point.':
		'Dobla las esquinas delanteras hacia la punta superior.',
	'Fold the little triangles down and out - the front legs.':
		'Dobla los triangulitos hacia abajo y hacia fuera - las patas delanteras.',
	'Fold the bottom edge up, then its half back down - the spring.':
		'Dobla el borde inferior hacia arriba y su mitad de vuelta hacia abajo - el muelle.',
	'Let the spring open a little - the frog crouches, ready to jump.':
		'Deja que el muelle se abra un poco - la rana se agazapa, lista para saltar.',
	Crane: 'Grulla',
	Body: 'Cuerpo',
	'Tuck the left half between the layers: front to the front, back to the back - the square base.':
		'Mete la mitad izquierda entre las capas: lo de delante hacia delante, lo de detrás hacia atrás - la base cuadrada.',
	'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.':
		'Dobla los bordes de las solapas delanteras hacia el centro y levanta la punta delantera muy por encima del extremo superior - el pétalo.',
	'The same on the back - the bird base, two long points below.':
		'Lo mismo por detrás - la base de pájaro, con dos puntas largas abajo.',
	'Reverse-fold the front point up and out - the neck.':
		'Pliega la punta delantera hacia arriba y afuera con un pliegue invertido - el cuello.',
	'Reverse-fold the back point up the other way - the tail.':
		'Pliega la punta trasera hacia arriba al otro lado con un pliegue invertido - la cola.',
	'A small reverse fold at the top of the neck - the head.':
		'Un pequeño pliegue invertido en lo alto del cuello - la cabeza.',
	'Fan the wings up - the crane is done.':
		'Abre las alas en abanico hacia arriba - la grulla está lista.',
	'Masu box': 'Caja masu',
	Floor: 'Fondo',
	Walls: 'Paredes',
	'Raise all four walls along the edges of the floor.':
		'Levanta las cuatro paredes a lo largo de los bordes del fondo.',
	'Unfold each corner out over the rim - the lining shows.':
		'Despliega cada esquina hacia fuera sobre el borde - se ve el forro.',
	Swan: 'Cisne',
	Neck: 'Cuello',
	'Fold both edges at the nose corner in to the diagonal - the kite.':
		'Dobla ambos bordes de la esquina de la nariz hacia la diagonal - la cometa.',
	'Fold the kite in half along the diagonal, away from you.':
		'Dobla la cometa por la mitad a lo largo de la diagonal, hacia atrás.',
	'Reverse-fold the long point up between the layers - the neck.':
		'Pliega la punta larga hacia arriba entre las capas con un pliegue invertido - el cuello.',
	'A small reverse fold at the top - the head looks forward.':
		'Un pequeño pliegue invertido arriba - la cabeza mira hacia delante.',
	Dove: 'Paloma',
	'Fold the front layer up past the ridge - the near wing.':
		'Dobla la capa delantera hacia arriba más allá del lomo - el ala cercana.',
	'Fold the back layer behind, the same way - the far wing.':
		'Dobla la capa trasera hacia atrás, igual - el ala lejana.',
	'Bend the head tip down through both layers - the beak.':
		'Dobla la punta de la cabeza hacia abajo a través de ambas capas - el pico.',
	'Let the wings open - the dove flies.':
		'Deja que las alas se abran - la paloma vuela.',
	'Paper plane': 'Avión de papel',
	Nose: 'Morro',
	'Fold both edges at the nose corner in to the centre line.':
		'Dobla ambos bordes de la esquina del morro hacia la línea central.',
	'Fold the slanted edges in to the centre line again - the dart.':
		'Dobla los bordes inclinados otra vez hacia la línea central - el dardo.',
	'Fold the dart in half along the centre line, away from you.':
		'Dobla el dardo por la mitad a lo largo de la línea central, hacia atrás.',
	'Fold the near wing down to the keel, the far wing behind.':
		'Dobla el ala cercana hacia abajo hasta la quilla, el ala lejana hacia atrás.',
	'Open the wings out - ready for the maiden flight.':
		'Abre las alas - listo para el primer vuelo.',
	'Samurai helmet': 'Casco samurái',
	Horns: 'Cuernos',
	Brim: 'Visera',
	Helmet: 'Casco',
	'Fold both corners down to the chin point.':
		'Dobla ambas esquinas hacia abajo hasta la punta de la barbilla.',
	'Fold both hanging tips back up to the crown.':
		'Dobla las dos puntas colgantes de nuevo hacia arriba hasta la corona.',
	'Fold the tips out at an angle - the horns.':
		'Dobla las puntas hacia fuera en ángulo - los cuernos.',
	'Fold the front layer up over the horns - the brim.':
		'Dobla la capa delantera hacia arriba sobre los cuernos - la visera.',
	'Fold the back layer up behind - the helmet closes.':
		'Dobla la capa trasera hacia arriba por detrás - el casco se cierra.',
	Fish: 'Pez',
	Tail: 'Cola',
	'Fold the thin end up across the back - the tail.':
		'Dobla el extremo fino hacia arriba sobre el lomo - la cola.',
	'Fold the nose tip behind - the mouth.':
		'Dobla la punta de la nariz hacia atrás - la boca.',
	Tulip: 'Tulipán',
	Bloom: 'Flor',
	Petals: 'Pétalos',
	'Fold both corners up across the middle, tips past the edges - the petals.':
		'Dobla ambas esquinas hacia arriba cruzando el centro, con las puntas más allá de los bordes - los pétalos.',
	'Open the bloom a little - it stands.':
		'Abre un poco la flor - se sostiene.',
	'Dog face': 'Cara de perro',
	'Fold the front corners down over the face - the floppy ears.':
		'Dobla las esquinas delanteras hacia abajo sobre la cara - las orejas caídas.',
	'Fold the front chin tip up, the back tip behind - the snout.':
		'Dobla la punta delantera de la barbilla hacia arriba, la trasera hacia atrás - el hocico.',
	'Cat face': 'Cara de gato',
	'Fold both corners up past the top edge - the pointy ears.':
		'Dobla ambas esquinas hacia arriba más allá del borde superior - las orejas puntiagudas.',
	'Fold the chin tip behind - the cat looks at you.':
		'Dobla la punta de la barbilla hacia atrás - el gato te mira.',
	Penguin: 'Pingüino',
	Chest: 'Pecho',
	Beak: 'Pico',
	'Fold both edges at the head corner in to the diagonal - the dark back.':
		'Dobla ambos bordes de la esquina de la cabeza hacia la diagonal - el lomo oscuro.',
	'Fold it in half along the diagonal, away from you.':
		'Dóblalo por la mitad a lo largo de la diagonal, hacia atrás.',
	'Open the body a little - the penguin stands.':
		'Abre un poco el cuerpo - el pingüino se pone de pie.',
	Cup: 'Vaso',
	Rim: 'Borde',
	'Fold the right corner across, its tip onto the left edge.':
		'Dobla la esquina derecha cruzando, con su punta sobre el borde izquierdo.',
	'Fold the left corner across over it - the band locks.':
		'Dobla la esquina izquierda por encima - la banda queda trabada.',
	'Fold the front tip down over the band, the back tip behind.':
		'Dobla la punta delantera hacia abajo sobre la banda, la trasera hacia atrás.',
	'Open the cup a little - it stands.': 'Abre un poco el vaso - se sostiene.',
	'The paper': 'El papel',
	'Front side': 'Lado delantero',
	'Back side': 'Lado trasero',
	Colour: 'Color',
	'Pick a picture': 'Elegir imagen',
	'Remove picture': 'Quitar imagen',
	Pattern: 'Patrón',
	'Pattern colour': 'Color del patrón',
	Plain: 'Liso',
	Dots: 'Puntos',
	Stripes: 'Rayas',
	Zigzag: 'Zigzag',
	Stars: 'Estrellas',
	Checks: 'Cuadros',
	'Show where things land': 'Mostrar dónde cae cada cosa',
	'Print fold lines on the sheet':
		'Imprimir las líneas de plegado en la hoja',
	Scene: 'Escena',
	Lighting: 'Iluminación',
	Ground: 'Suelo',
	Soft: 'Suave',
	Warm: 'Cálida',
	Dramatic: 'Dramática',
	Studio: 'Estudio',
	'Shadow only': 'Solo sombra',
	Table: 'Mesa',
	Mirror: 'Espejo',
	None: 'Ninguno',
	Background: 'Fondo',
	Instructions: 'Instrucciones',
	Play: 'Reproducir',
	'The sheet': 'La hoja',
	'Step %1$s of %2$s': 'Paso %1$s de %2$s',
	'Finished!': '¡Listo!',
	Angled: 'En ángulo',
	Front: 'Frontal',
	'Three-quarter': 'Tres cuartos',
	'From above': 'Desde arriba',
	'Insert as picture': 'Insertar como imagen',
	'Insert sheet + instructions': 'Insertar hoja + instrucciones',
	Cancel: 'Cancelar',
	'Rendering the pages': 'Generando las páginas',
	'Inserted.': 'Insertado.',
	'Could not insert.': 'No se pudo insertar.',
	'Folding sheet - front': 'Hoja de plegado - anverso',
	'Folding sheet - back, mirrored for duplex print':
		'Hoja de plegado - reverso, espejada para impresión dúplex',
	'Folding instructions': 'Instrucciones de plegado',
	'Origami picture': 'Imagen de origami',
	'Folding sheet': 'Hoja de plegado',
	'Insert pages': 'Insertar páginas',
	'Drag to turn the scene, wheel to zoom.':
		'Arrastra para girar la escena, la rueda hace zoom.',
	'Use brand colors': 'Usar colores de marca',
	'Brand kit': 'Kit de marca',
};

const FR = {
	'Design the paper, watch it fold itself, print sheet and instructions.':
		'Compose le papier, regarde-le se plier tout seul, imprime la feuille et les instructions.',
	Figure: 'Figure',
	Fox: 'Renard',
	Heart: 'Cœur',
	Face: 'Visage',
	Ears: 'Oreilles',
	Snout: 'Museau',
	'Fold the sheet in half along the diagonal, away from you.':
		'Plie la feuille en deux le long de la diagonale, vers l’arrière.',
	'Fold both corners up over the front - the ears.':
		'Plie les deux coins vers le haut sur le devant - les oreilles.',
	'Fold the front point up across the face - the snout.':
		'Plie la pointe avant vers le haut sur le visage - le museau.',
	'Fold the top corner behind, down to the middle of the sheet.':
		'Plie le coin supérieur vers l’arrière, jusqu’au milieu de la feuille.',
	'Fold the bottom corner behind, well past the folded edge.':
		'Plie le coin inférieur vers l’arrière, bien au-delà du bord plié.',
	'Fold both sides behind so their edges meet in the middle of the back.':
		'Plie les deux côtés vers l’arrière pour que leurs bords se rejoignent au milieu du dos.',
	'Fold the four little corners behind to round the lobes.':
		'Plie les quatre petits coins vers l’arrière pour arrondir les lobes.',
	'Turn the heart over - the smooth side is the front.':
		'Retourne le cœur - le côté lisse est le devant.',
	Sailboat: 'Voilier',
	Sail: 'Voile',
	Hull: 'Coque',
	'Fold the sheet in half along the diagonal, away from you - the sail.':
		'Plie la feuille en deux le long de la diagonale, vers l’arrière - la voile.',
	'Fold the bottom strip of the front layer up - the hull.':
		'Plie la bande inférieure de la couche avant vers le haut - la coque.',
	'Fold the tip of the front layer down - the pennant.':
		'Plie la pointe de la couche avant vers le bas - le fanion.',
	'Fortune teller': 'Cocotte en papier',
	'Inside flaps': 'Rabats intérieurs',
	Pockets: 'Poches',
	'Fold all four corners to the middle of the sheet.':
		'Plie les quatre coins vers le milieu de la feuille.',
	'Turn the whole thing over.': 'Retourne le tout.',
	'Fold all four corners to the middle again.':
		'Plie encore les quatre coins vers le milieu.',
	'Slide your fingers into the four pockets and push them together - it opens.':
		'Glisse les doigts dans les quatre poches et rapproche-les - ça s’ouvre.',
	Butterfly: 'Papillon',
	Wings: 'Ailes',
	'Fold the sheet in half backward, top edge behind the bottom edge.':
		'Plie la feuille en deux vers l’arrière, le bord supérieur derrière le bord inférieur.',
	'Push both sides in between the layers - the sheet collapses into a triangle.':
		'Pousse les deux côtés entre les couches - la feuille s’aplatit en triangle.',
	'Fold the front corners up to the top point - the upper wings.':
		'Plie les coins avant vers la pointe du haut - les ailes supérieures.',
	'Bend the wings up along the middle - and it flies.':
		'Relève les ailes le long du milieu - et il vole.',
	'Jumping frog': 'Grenouille sauteuse',
	Back: 'Dos',
	Head: 'Tête',
	'Fold the sheet in half backward, left behind right.':
		'Plie la feuille en deux vers l’arrière, la gauche derrière la droite.',
	'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.':
		'Plie le bord supérieur vers l’arrière et vers le bas, puis pousse les deux côtés vers l’intérieur - un triangle se forme en haut.',
	'Fold the front corners up to the top point.':
		'Plie les coins avant vers la pointe du haut.',
	'Fold the little triangles down and out - the front legs.':
		'Plie les petits triangles vers le bas et vers l’extérieur - les pattes avant.',
	'Fold the bottom edge up, then its half back down - the spring.':
		'Plie le bord inférieur vers le haut, puis sa moitié de nouveau vers le bas - le ressort.',
	'Let the spring open a little - the frog crouches, ready to jump.':
		'Laisse le ressort s’ouvrir un peu - la grenouille s’accroupit, prête à bondir.',
	Crane: 'Grue',
	Body: 'Corps',
	'Tuck the left half between the layers: front to the front, back to the back - the square base.':
		'Rentre la moitié gauche entre les couches : l’avant vers l’avant, l’arrière vers l’arrière - la base carrée.',
	'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.':
		'Plie les bords des rabats avant vers le milieu et soulève la pointe avant bien au-dessus du haut - le pli pétale.',
	'The same on the back - the bird base, two long points below.':
		'Pareil au dos - la base de l’oiseau, deux longues pointes en bas.',
	'Reverse-fold the front point up and out - the neck.':
		'Plie la pointe avant vers le haut et vers l’extérieur en pli inversé - le cou.',
	'Reverse-fold the back point up the other way - the tail.':
		'Plie la pointe arrière vers le haut de l’autre côté en pli inversé - la queue.',
	'A small reverse fold at the top of the neck - the head.':
		'Un petit pli inversé en haut du cou - la tête.',
	'Fan the wings up - the crane is done.':
		'Déploie les ailes vers le haut - la grue est terminée.',
	'Masu box': 'Boîte masu',
	Floor: 'Fond',
	Walls: 'Parois',
	'Raise all four walls along the edges of the floor.':
		'Redresse les quatre parois le long des bords du fond.',
	'Unfold each corner out over the rim - the lining shows.':
		'Déplie chaque coin par-dessus le bord, vers l’extérieur - la doublure se montre.',
	Swan: 'Cygne',
	Neck: 'Cou',
	'Fold both edges at the nose corner in to the diagonal - the kite.':
		'Plie les deux bords du coin du nez vers la diagonale - le cerf-volant.',
	'Fold the kite in half along the diagonal, away from you.':
		'Plie le cerf-volant en deux le long de la diagonale, vers l’arrière.',
	'Reverse-fold the long point up between the layers - the neck.':
		'Plie la longue pointe vers le haut entre les couches en pli inversé - le cou.',
	'A small reverse fold at the top - the head looks forward.':
		'Un petit pli inversé en haut - la tête regarde devant.',
	Dove: 'Colombe',
	'Fold the front layer up past the ridge - the near wing.':
		'Plie la couche avant vers le haut au-delà du dos - l’aile proche.',
	'Fold the back layer behind, the same way - the far wing.':
		'Plie la couche arrière vers l’arrière, de la même façon - l’aile lointaine.',
	'Bend the head tip down through both layers - the beak.':
		'Plie la pointe de la tête vers le bas à travers les deux couches - le bec.',
	'Let the wings open - the dove flies.':
		'Laisse les ailes s’ouvrir - la colombe vole.',
	'Paper plane': 'Avion en papier',
	Nose: 'Nez',
	'Fold both edges at the nose corner in to the centre line.':
		'Plie les deux bords du coin du nez vers la ligne médiane.',
	'Fold the slanted edges in to the centre line again - the dart.':
		'Plie encore les bords inclinés vers la ligne médiane - la flèche.',
	'Fold the dart in half along the centre line, away from you.':
		'Plie la flèche en deux le long de la ligne médiane, vers l’arrière.',
	'Fold the near wing down to the keel, the far wing behind.':
		'Plie l’aile proche vers le bas jusqu’à la quille, l’aile lointaine vers l’arrière.',
	'Open the wings out - ready for the maiden flight.':
		'Déploie les ailes - prêt pour le premier vol.',
	'Samurai helmet': 'Casque de samouraï',
	Horns: 'Cornes',
	Brim: 'Visière',
	Helmet: 'Casque',
	'Fold both corners down to the chin point.':
		'Plie les deux coins vers le bas jusqu’à la pointe du menton.',
	'Fold both hanging tips back up to the crown.':
		'Replie les deux pointes pendantes vers le haut jusqu’à la couronne.',
	'Fold the tips out at an angle - the horns.':
		'Plie les pointes en biais vers l’extérieur - les cornes.',
	'Fold the front layer up over the horns - the brim.':
		'Plie la couche avant vers le haut par-dessus les cornes - la visière.',
	'Fold the back layer up behind - the helmet closes.':
		'Plie la couche arrière vers le haut derrière - le casque se ferme.',
	Fish: 'Poisson',
	Tail: 'Queue',
	'Fold the thin end up across the back - the tail.':
		'Plie l’extrémité fine vers le haut sur le dos - la queue.',
	'Fold the nose tip behind - the mouth.':
		'Plie le bout du nez vers l’arrière - la bouche.',
	Tulip: 'Tulipe',
	Bloom: 'Fleur',
	Petals: 'Pétales',
	'Fold both corners up across the middle, tips past the edges - the petals.':
		'Plie les deux coins vers le haut en travers du milieu, les pointes au-delà des bords - les pétales.',
	'Open the bloom a little - it stands.':
		'Ouvre un peu la fleur - elle tient debout.',
	'Dog face': 'Tête de chien',
	'Fold the front corners down over the face - the floppy ears.':
		'Plie les coins avant vers le bas sur le visage - les oreilles tombantes.',
	'Fold the front chin tip up, the back tip behind - the snout.':
		'Plie la pointe avant du menton vers le haut, la pointe arrière vers l’arrière - le museau.',
	'Cat face': 'Tête de chat',
	'Fold both corners up past the top edge - the pointy ears.':
		'Plie les deux coins vers le haut au-delà du bord supérieur - les oreilles pointues.',
	'Fold the chin tip behind - the cat looks at you.':
		'Plie la pointe du menton vers l’arrière - le chat te regarde.',
	Penguin: 'Pingouin',
	Chest: 'Poitrine',
	Beak: 'Bec',
	'Fold both edges at the head corner in to the diagonal - the dark back.':
		'Plie les deux bords du coin de la tête vers la diagonale - le dos sombre.',
	'Fold it in half along the diagonal, away from you.':
		'Plie-le en deux le long de la diagonale, vers l’arrière.',
	'Open the body a little - the penguin stands.':
		'Ouvre un peu le corps - le pingouin se tient debout.',
	Cup: 'Gobelet',
	Rim: 'Bord',
	'Fold the right corner across, its tip onto the left edge.':
		'Plie le coin droit en travers, sa pointe sur le bord gauche.',
	'Fold the left corner across over it - the band locks.':
		'Plie le coin gauche par-dessus - la bande se verrouille.',
	'Fold the front tip down over the band, the back tip behind.':
		'Plie la pointe avant vers le bas sur la bande, la pointe arrière vers l’arrière.',
	'Open the cup a little - it stands.':
		'Ouvre un peu le gobelet - il tient debout.',
	'The paper': 'Le papier',
	'Front side': 'Recto',
	'Back side': 'Verso',
	Colour: 'Couleur',
	'Pick a picture': 'Choisir une image',
	'Remove picture': 'Retirer l’image',
	Pattern: 'Motif',
	'Pattern colour': 'Couleur du motif',
	Plain: 'Uni',
	Dots: 'Pois',
	Stripes: 'Rayures',
	Zigzag: 'Zigzag',
	Stars: 'Étoiles',
	Checks: 'Carreaux',
	'Show where things land': 'Montrer où tout atterrit',
	'Print fold lines on the sheet':
		'Imprimer les lignes de pliage sur la feuille',
	Scene: 'Scène',
	Lighting: 'Éclairage',
	Ground: 'Sol',
	Soft: 'Doux',
	Warm: 'Chaud',
	Dramatic: 'Dramatique',
	Studio: 'Studio',
	'Shadow only': 'Ombre seule',
	Table: 'Table',
	Mirror: 'Miroir',
	None: 'Aucun',
	Background: 'Arrière-plan',
	Instructions: 'Instructions',
	Play: 'Lecture',
	'The sheet': 'La feuille',
	'Step %1$s of %2$s': 'Étape %1$s sur %2$s',
	'Finished!': 'Terminé !',
	Angled: 'De biais',
	Front: 'De face',
	'Three-quarter': 'Trois quarts',
	'From above': 'Du dessus',
	'Insert as picture': 'Insérer comme image',
	'Insert sheet + instructions': 'Insérer feuille + instructions',
	Cancel: 'Annuler',
	'Rendering the pages': 'Génération des pages',
	'Inserted.': 'Inséré.',
	'Could not insert.': 'Insertion impossible.',
	'Folding sheet - front': 'Feuille de pliage - recto',
	'Folding sheet - back, mirrored for duplex print':
		'Feuille de pliage - verso, en miroir pour l’impression recto verso',
	'Folding instructions': 'Instructions de pliage',
	'Origami picture': 'Image d’origami',
	'Folding sheet': 'Feuille de pliage',
	'Insert pages': 'Insérer les pages',
	'Drag to turn the scene, wheel to zoom.':
		'Glisse pour tourner la scène, la molette zoome.',
	'Use brand colors': 'Utiliser les couleurs de marque',
	'Brand kit': 'Kit de marque',
};

const PT = {
	'Design the paper, watch it fold itself, print sheet and instructions.':
		'Crie o papel, veja-o se dobrar sozinho, imprima a folha e as instruções.',
	Figure: 'Figura',
	Fox: 'Raposa',
	Heart: 'Coração',
	Face: 'Rosto',
	Ears: 'Orelhas',
	Snout: 'Focinho',
	'Fold the sheet in half along the diagonal, away from you.':
		'Dobre a folha ao meio ao longo da diagonal, para trás.',
	'Fold both corners up over the front - the ears.':
		'Dobre os dois cantos para cima sobre a frente - as orelhas.',
	'Fold the front point up across the face - the snout.':
		'Dobre a ponta da frente para cima sobre o rosto - o focinho.',
	'Fold the top corner behind, down to the middle of the sheet.':
		'Dobre o canto superior para trás, até o meio da folha.',
	'Fold the bottom corner behind, well past the folded edge.':
		'Dobre o canto inferior para trás, bem além da borda dobrada.',
	'Fold both sides behind so their edges meet in the middle of the back.':
		'Dobre os dois lados para trás, de modo que as bordas se encontrem no meio das costas.',
	'Fold the four little corners behind to round the lobes.':
		'Dobre os quatro cantinhos para trás para arredondar os lóbulos.',
	'Turn the heart over - the smooth side is the front.':
		'Vire o coração - o lado liso é a frente.',
	Sailboat: 'Veleiro',
	Sail: 'Vela',
	Hull: 'Casco',
	'Fold the sheet in half along the diagonal, away from you - the sail.':
		'Dobre a folha ao meio ao longo da diagonal, para trás - a vela.',
	'Fold the bottom strip of the front layer up - the hull.':
		'Dobre a faixa de baixo da camada da frente para cima - o casco.',
	'Fold the tip of the front layer down - the pennant.':
		'Dobre a ponta da camada da frente para baixo - a flâmula.',
	'Fortune teller': 'Come-come',
	'Inside flaps': 'Abas internas',
	Pockets: 'Bolsos',
	'Fold all four corners to the middle of the sheet.':
		'Dobre os quatro cantos até o meio da folha.',
	'Turn the whole thing over.': 'Vire tudo.',
	'Fold all four corners to the middle again.':
		'Dobre de novo os quatro cantos até o meio.',
	'Slide your fingers into the four pockets and push them together - it opens.':
		'Enfie os dedos nos quatro bolsos e junte-os - ele se abre.',
	Butterfly: 'Borboleta',
	Wings: 'Asas',
	'Fold the sheet in half backward, top edge behind the bottom edge.':
		'Dobre a folha ao meio para trás, a borda de cima atrás da borda de baixo.',
	'Push both sides in between the layers - the sheet collapses into a triangle.':
		'Empurre os dois lados para dentro, entre as camadas - a folha se fecha num triângulo.',
	'Fold the front corners up to the top point - the upper wings.':
		'Dobre os cantos da frente até a ponta de cima - as asas superiores.',
	'Bend the wings up along the middle - and it flies.':
		'Dobre as asas para cima ao longo do meio - e ela voa.',
	'Jumping frog': 'Sapo saltador',
	Back: 'Dorso',
	Head: 'Cabeça',
	'Fold the sheet in half backward, left behind right.':
		'Dobre a folha ao meio para trás, a esquerda atrás da direita.',
	'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.':
		'Dobre a borda de cima para trás e para baixo, depois empurre os dois lados para dentro - em cima forma-se um triângulo.',
	'Fold the front corners up to the top point.':
		'Dobre os cantos da frente até a ponta de cima.',
	'Fold the little triangles down and out - the front legs.':
		'Dobre os triângulos pequenos para baixo e para fora - as patas dianteiras.',
	'Fold the bottom edge up, then its half back down - the spring.':
		'Dobre a borda de baixo para cima e a metade dela de volta para baixo - a mola.',
	'Let the spring open a little - the frog crouches, ready to jump.':
		'Deixe a mola se abrir um pouco - o sapo se agacha, pronto para pular.',
	Crane: 'Tsuru',
	Body: 'Corpo',
	'Tuck the left half between the layers: front to the front, back to the back - the square base.':
		'Enfie a metade esquerda entre as camadas: a da frente para a frente, a de trás para trás - a base quadrada.',
	'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.':
		'Dobre as bordas das abas da frente até o meio e levante a ponta da frente bem acima do topo - a pétala.',
	'The same on the back - the bird base, two long points below.':
		'O mesmo atrás - a base do pássaro, duas pontas longas embaixo.',
	'Reverse-fold the front point up and out - the neck.':
		'Faça uma dobra invertida da ponta da frente para cima e para fora - o pescoço.',
	'Reverse-fold the back point up the other way - the tail.':
		'Faça uma dobra invertida da ponta de trás para cima, para o outro lado - a cauda.',
	'A small reverse fold at the top of the neck - the head.':
		'Uma pequena dobra invertida no alto do pescoço - a cabeça.',
	'Fan the wings up - the crane is done.':
		'Abra as asas para cima em leque - o tsuru está pronto.',
	'Masu box': 'Caixa masu',
	Floor: 'Fundo',
	Walls: 'Paredes',
	'Raise all four walls along the edges of the floor.':
		'Levante as quatro paredes ao longo das bordas do fundo.',
	'Unfold each corner out over the rim - the lining shows.':
		'Desdobre cada canto para fora, por cima da borda - o forro aparece.',
	Swan: 'Cisne',
	Neck: 'Pescoço',
	'Fold both edges at the nose corner in to the diagonal - the kite.':
		'Dobre as duas bordas do canto do nariz até a diagonal - a pipa.',
	'Fold the kite in half along the diagonal, away from you.':
		'Dobre a pipa ao meio ao longo da diagonal, para trás.',
	'Reverse-fold the long point up between the layers - the neck.':
		'Faça uma dobra invertida da ponta longa para cima, entre as camadas - o pescoço.',
	'A small reverse fold at the top - the head looks forward.':
		'Uma pequena dobra invertida no alto - a cabeça olha para a frente.',
	Dove: 'Pomba',
	'Fold the front layer up past the ridge - the near wing.':
		'Dobre a camada da frente para cima, além do dorso - a asa de cá.',
	'Fold the back layer behind, the same way - the far wing.':
		'Dobre a camada de trás para trás, do mesmo jeito - a asa de lá.',
	'Bend the head tip down through both layers - the beak.':
		'Dobre a ponta da cabeça para baixo, através das duas camadas - o bico.',
	'Let the wings open - the dove flies.':
		'Deixe as asas se abrirem - a pomba voa.',
	'Paper plane': 'Avião de papel',
	Nose: 'Nariz',
	'Fold both edges at the nose corner in to the centre line.':
		'Dobre as duas bordas do canto do nariz até a linha do meio.',
	'Fold the slanted edges in to the centre line again - the dart.':
		'Dobre as bordas inclinadas de novo até a linha do meio - o dardo.',
	'Fold the dart in half along the centre line, away from you.':
		'Dobre o dardo ao meio ao longo da linha do meio, para trás.',
	'Fold the near wing down to the keel, the far wing behind.':
		'Dobre a asa de cá para baixo até a quilha, a asa de lá para trás.',
	'Open the wings out - ready for the maiden flight.':
		'Abra as asas - pronto para o primeiro voo.',
	'Samurai helmet': 'Capacete de samurai',
	Horns: 'Chifres',
	Brim: 'Aba',
	Helmet: 'Capacete',
	'Fold both corners down to the chin point.':
		'Dobre os dois cantos para baixo até a ponta do queixo.',
	'Fold both hanging tips back up to the crown.':
		'Dobre as duas pontas penduradas de volta para cima, até a coroa.',
	'Fold the tips out at an angle - the horns.':
		'Dobre as pontas para fora, em ângulo - os chifres.',
	'Fold the front layer up over the horns - the brim.':
		'Dobre a camada da frente para cima, sobre os chifres - a aba.',
	'Fold the back layer up behind - the helmet closes.':
		'Dobre a camada de trás para cima, por trás - o capacete se fecha.',
	Fish: 'Peixe',
	Tail: 'Cauda',
	'Fold the thin end up across the back - the tail.':
		'Dobre a ponta fina para cima sobre o dorso - a cauda.',
	'Fold the nose tip behind - the mouth.':
		'Dobre a ponta do nariz para trás - a boca.',
	Tulip: 'Tulipa',
	Bloom: 'Flor',
	Petals: 'Pétalas',
	'Fold both corners up across the middle, tips past the edges - the petals.':
		'Dobre os dois cantos para cima cruzando o meio, com as pontas além das bordas - as pétalas.',
	'Open the bloom a little - it stands.':
		'Abra um pouco a flor - ela fica de pé.',
	'Dog face': 'Cara de cachorro',
	'Fold the front corners down over the face - the floppy ears.':
		'Dobre os cantos da frente para baixo sobre o rosto - as orelhas caídas.',
	'Fold the front chin tip up, the back tip behind - the snout.':
		'Dobre a ponta da frente do queixo para cima, a de trás para trás - o focinho.',
	'Cat face': 'Cara de gato',
	'Fold both corners up past the top edge - the pointy ears.':
		'Dobre os dois cantos para cima, além da borda superior - as orelhas pontudas.',
	'Fold the chin tip behind - the cat looks at you.':
		'Dobre a ponta do queixo para trás - o gato olha para você.',
	Penguin: 'Pinguim',
	Chest: 'Peito',
	Beak: 'Bico',
	'Fold both edges at the head corner in to the diagonal - the dark back.':
		'Dobre as duas bordas do canto da cabeça até a diagonal - o dorso escuro.',
	'Fold it in half along the diagonal, away from you.':
		'Dobre ao meio ao longo da diagonal, para trás.',
	'Open the body a little - the penguin stands.':
		'Abra um pouco o corpo - o pinguim fica de pé.',
	Cup: 'Copo',
	Rim: 'Borda',
	'Fold the right corner across, its tip onto the left edge.':
		'Dobre o canto direito atravessando, com a ponta na borda esquerda.',
	'Fold the left corner across over it - the band locks.':
		'Dobre o canto esquerdo por cima - a faixa se trava.',
	'Fold the front tip down over the band, the back tip behind.':
		'Dobre a ponta da frente para baixo sobre a faixa, a de trás para trás.',
	'Open the cup a little - it stands.':
		'Abra um pouco o copo - ele fica de pé.',
	'The paper': 'O papel',
	'Front side': 'Frente',
	'Back side': 'Verso',
	Colour: 'Cor',
	'Pick a picture': 'Escolher imagem',
	'Remove picture': 'Remover imagem',
	Pattern: 'Padrão',
	'Pattern colour': 'Cor do padrão',
	Plain: 'Liso',
	Dots: 'Bolinhas',
	Stripes: 'Listras',
	Zigzag: 'Ziguezague',
	Stars: 'Estrelas',
	Checks: 'Xadrez',
	'Show where things land': 'Mostrar onde cada coisa fica',
	'Print fold lines on the sheet': 'Imprimir as linhas de dobra na folha',
	Scene: 'Cena',
	Lighting: 'Iluminação',
	Ground: 'Piso',
	Soft: 'Suave',
	Warm: 'Quente',
	Dramatic: 'Dramática',
	Studio: 'Estúdio',
	'Shadow only': 'Só sombra',
	Table: 'Mesa',
	Mirror: 'Espelhado',
	None: 'Nenhum',
	Background: 'Fundo',
	Instructions: 'Instruções',
	Play: 'Reproduzir',
	'The sheet': 'A folha',
	'Step %1$s of %2$s': 'Passo %1$s de %2$s',
	'Finished!': 'Pronto!',
	Angled: 'Inclinado',
	Front: 'De frente',
	'Three-quarter': 'Três quartos',
	'From above': 'De cima',
	'Insert as picture': 'Inserir como imagem',
	'Insert sheet + instructions': 'Inserir folha + instruções',
	Cancel: 'Cancelar',
	'Rendering the pages': 'Gerando as páginas',
	'Inserted.': 'Inserido.',
	'Could not insert.': 'Não foi possível inserir.',
	'Folding sheet - front': 'Folha de dobradura - frente',
	'Folding sheet - back, mirrored for duplex print':
		'Folha de dobradura - verso, espelhado para impressão frente e verso',
	'Folding instructions': 'Instruções de dobradura',
	'Origami picture': 'Imagem de origami',
	'Folding sheet': 'Folha de dobradura',
	'Insert pages': 'Inserir páginas',
	'Drag to turn the scene, wheel to zoom.':
		'Arraste para girar a cena, a rodinha dá zoom.',
	'Use brand colors': 'Usar cores da marca',
	'Brand kit': 'Kit da marca',
};

const IT = {
	'Design the paper, watch it fold itself, print sheet and instructions.':
		'Disegna la carta, guardala piegarsi da sola, stampa il foglio e le istruzioni.',
	Figure: 'Figura',
	Fox: 'Volpe',
	Heart: 'Cuore',
	Face: 'Viso',
	Ears: 'Orecchie',
	Snout: 'Muso',
	'Fold the sheet in half along the diagonal, away from you.':
		'Piega il foglio a metà lungo la diagonale, all’indietro.',
	'Fold both corners up over the front - the ears.':
		'Piega entrambi gli angoli in su sopra il davanti - le orecchie.',
	'Fold the front point up across the face - the snout.':
		'Piega la punta davanti in su sopra il viso - il muso.',
	'Fold the top corner behind, down to the middle of the sheet.':
		'Piega l’angolo in alto all’indietro, fino al centro del foglio.',
	'Fold the bottom corner behind, well past the folded edge.':
		'Piega l’angolo in basso all’indietro, ben oltre il bordo piegato.',
	'Fold both sides behind so their edges meet in the middle of the back.':
		'Piega entrambi i lati all’indietro, così che i bordi si incontrino al centro del retro.',
	'Fold the four little corners behind to round the lobes.':
		'Piega i quattro angolini all’indietro per arrotondare i lobi.',
	'Turn the heart over - the smooth side is the front.':
		'Gira il cuore - il lato liscio è il davanti.',
	Sailboat: 'Barca a vela',
	Sail: 'Vela',
	Hull: 'Scafo',
	'Fold the sheet in half along the diagonal, away from you - the sail.':
		'Piega il foglio a metà lungo la diagonale, all’indietro - la vela.',
	'Fold the bottom strip of the front layer up - the hull.':
		'Piega in su la striscia in basso dello strato davanti - lo scafo.',
	'Fold the tip of the front layer down - the pennant.':
		'Piega in giù la punta dello strato davanti - il gagliardetto.',
	'Fortune teller': 'Inferno e paradiso',
	'Inside flaps': 'Alette interne',
	Pockets: 'Tasche',
	'Fold all four corners to the middle of the sheet.':
		'Piega i quattro angoli verso il centro del foglio.',
	'Turn the whole thing over.': 'Gira tutto.',
	'Fold all four corners to the middle again.':
		'Piega di nuovo i quattro angoli verso il centro.',
	'Slide your fingers into the four pockets and push them together - it opens.':
		'Infila le dita nelle quattro tasche e avvicinale - si apre.',
	Butterfly: 'Farfalla',
	Wings: 'Ali',
	'Fold the sheet in half backward, top edge behind the bottom edge.':
		'Piega il foglio a metà all’indietro, il bordo in alto dietro quello in basso.',
	'Push both sides in between the layers - the sheet collapses into a triangle.':
		'Spingi i due lati in dentro tra gli strati - il foglio si chiude in un triangolo.',
	'Fold the front corners up to the top point - the upper wings.':
		'Piega gli angoli davanti verso la punta in alto - le ali superiori.',
	'Bend the wings up along the middle - and it flies.':
		'Piega le ali in su lungo il centro - e vola.',
	'Jumping frog': 'Rana saltellante',
	Back: 'Dorso',
	Head: 'Testa',
	'Fold the sheet in half backward, left behind right.':
		'Piega il foglio a metà all’indietro, la sinistra dietro la destra.',
	'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.':
		'Piega il bordo in alto all’indietro e in giù, poi spingi i due lati in dentro - in alto si forma un triangolo.',
	'Fold the front corners up to the top point.':
		'Piega gli angoli davanti verso la punta in alto.',
	'Fold the little triangles down and out - the front legs.':
		'Piega i triangolini in giù e in fuori - le zampe davanti.',
	'Fold the bottom edge up, then its half back down - the spring.':
		'Piega il bordo in basso in su e la sua metà di nuovo in giù - la molla.',
	'Let the spring open a little - the frog crouches, ready to jump.':
		'Lascia che la molla si apra un poco - la rana si acquatta, pronta a saltare.',
	Crane: 'Gru',
	Body: 'Corpo',
	'Tuck the left half between the layers: front to the front, back to the back - the square base.':
		'Infila la metà sinistra tra gli strati: il davanti in avanti, il retro all’indietro - la base quadrata.',
	'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.':
		'Piega i bordi delle alette davanti verso il centro e solleva la punta davanti ben oltre l’estremità in alto - la piega a petalo.',
	'The same on the back - the bird base, two long points below.':
		'Lo stesso sul retro - la base dell’uccello, due punte lunghe in basso.',
	'Reverse-fold the front point up and out - the neck.':
		'Piega la punta davanti in su e in fuori con una piega inversa - il collo.',
	'Reverse-fold the back point up the other way - the tail.':
		'Piega la punta dietro in su dall’altra parte con una piega inversa - la coda.',
	'A small reverse fold at the top of the neck - the head.':
		'Una piccola piega inversa in cima al collo - la testa.',
	'Fan the wings up - the crane is done.':
		'Apri le ali a ventaglio verso l’alto - la gru è pronta.',
	'Masu box': 'Scatola masu',
	Floor: 'Fondo',
	Walls: 'Pareti',
	'Raise all four walls along the edges of the floor.':
		'Solleva le quattro pareti lungo i bordi del fondo.',
	'Unfold each corner out over the rim - the lining shows.':
		'Ripiega ogni angolo in fuori sopra il bordo - la fodera si mostra.',
	Swan: 'Cigno',
	Neck: 'Collo',
	'Fold both edges at the nose corner in to the diagonal - the kite.':
		'Piega i due bordi dell’angolo del naso verso la diagonale - l’aquilone.',
	'Fold the kite in half along the diagonal, away from you.':
		'Piega l’aquilone a metà lungo la diagonale, all’indietro.',
	'Reverse-fold the long point up between the layers - the neck.':
		'Piega la punta lunga in su tra gli strati con una piega inversa - il collo.',
	'A small reverse fold at the top - the head looks forward.':
		'Una piccola piega inversa in cima - la testa guarda avanti.',
	Dove: 'Colomba',
	'Fold the front layer up past the ridge - the near wing.':
		'Piega lo strato davanti in su oltre il dorso - l’ala vicina.',
	'Fold the back layer behind, the same way - the far wing.':
		'Piega lo strato dietro all’indietro, allo stesso modo - l’ala lontana.',
	'Bend the head tip down through both layers - the beak.':
		'Piega la punta della testa in giù attraverso entrambi gli strati - il becco.',
	'Let the wings open - the dove flies.':
		'Lascia che le ali si aprano - la colomba vola.',
	'Paper plane': 'Aeroplano di carta',
	Nose: 'Muso',
	'Fold both edges at the nose corner in to the centre line.':
		'Piega i due bordi dell’angolo del muso verso la linea di mezzo.',
	'Fold the slanted edges in to the centre line again - the dart.':
		'Piega di nuovo i bordi obliqui verso la linea di mezzo - il dardo.',
	'Fold the dart in half along the centre line, away from you.':
		'Piega il dardo a metà lungo la linea di mezzo, all’indietro.',
	'Fold the near wing down to the keel, the far wing behind.':
		'Piega l’ala vicina in giù fino alla chiglia, l’ala lontana all’indietro.',
	'Open the wings out - ready for the maiden flight.':
		'Apri le ali - pronto per il primo volo.',
	'Samurai helmet': 'Elmo da samurai',
	Horns: 'Corna',
	Brim: 'Falda',
	Helmet: 'Elmo',
	'Fold both corners down to the chin point.':
		'Piega i due angoli in giù fino alla punta del mento.',
	'Fold both hanging tips back up to the crown.':
		'Ripiega le due punte pendenti in su fino alla corona.',
	'Fold the tips out at an angle - the horns.':
		'Piega le punte in fuori, oblique - le corna.',
	'Fold the front layer up over the horns - the brim.':
		'Piega lo strato davanti in su sopra le corna - la falda.',
	'Fold the back layer up behind - the helmet closes.':
		'Piega lo strato dietro in su sul retro - l’elmo si chiude.',
	Fish: 'Pesce',
	Tail: 'Coda',
	'Fold the thin end up across the back - the tail.':
		'Piega l’estremità sottile in su sopra il dorso - la coda.',
	'Fold the nose tip behind - the mouth.':
		'Piega la punta del naso all’indietro - la bocca.',
	Tulip: 'Tulipano',
	Bloom: 'Fiore',
	Petals: 'Petali',
	'Fold both corners up across the middle, tips past the edges - the petals.':
		'Piega i due angoli in su attraverso il centro, le punte oltre i bordi - i petali.',
	'Open the bloom a little - it stands.':
		'Apri un poco il fiore - sta in piedi.',
	'Dog face': 'Muso di cane',
	'Fold the front corners down over the face - the floppy ears.':
		'Piega gli angoli davanti in giù sopra il viso - le orecchie pendenti.',
	'Fold the front chin tip up, the back tip behind - the snout.':
		'Piega la punta davanti del mento in su, quella dietro all’indietro - il muso.',
	'Cat face': 'Muso di gatto',
	'Fold both corners up past the top edge - the pointy ears.':
		'Piega i due angoli in su oltre il bordo superiore - le orecchie a punta.',
	'Fold the chin tip behind - the cat looks at you.':
		'Piega la punta del mento all’indietro - il gatto ti guarda.',
	Penguin: 'Pinguino',
	Chest: 'Petto',
	Beak: 'Becco',
	'Fold both edges at the head corner in to the diagonal - the dark back.':
		'Piega i due bordi dell’angolo della testa verso la diagonale - il dorso scuro.',
	'Fold it in half along the diagonal, away from you.':
		'Piegalo a metà lungo la diagonale, all’indietro.',
	'Open the body a little - the penguin stands.':
		'Apri un poco il corpo - il pinguino sta in piedi.',
	Cup: 'Bicchiere',
	Rim: 'Orlo',
	'Fold the right corner across, its tip onto the left edge.':
		'Piega l’angolo destro di traverso, la punta sul bordo sinistro.',
	'Fold the left corner across over it - the band locks.':
		'Piega l’angolo sinistro sopra di esso - la fascia si blocca.',
	'Fold the front tip down over the band, the back tip behind.':
		'Piega la punta davanti in giù sopra la fascia, quella dietro all’indietro.',
	'Open the cup a little - it stands.':
		'Apri un poco il bicchiere - sta in piedi.',
	'The paper': 'La carta',
	'Front side': 'Lato davanti',
	'Back side': 'Lato dietro',
	Colour: 'Colore',
	'Pick a picture': 'Scegli immagine',
	'Remove picture': 'Rimuovi immagine',
	Pattern: 'Motivo',
	'Pattern colour': 'Colore del motivo',
	Plain: 'Tinta unita',
	Dots: 'Pois',
	Stripes: 'Righe',
	Zigzag: 'Zigzag',
	Stars: 'Stelle',
	Checks: 'Quadretti',
	'Show where things land': 'Mostra dove finisce ogni cosa',
	'Print fold lines on the sheet': 'Stampa le linee di piega sul foglio',
	Scene: 'Scena',
	Lighting: 'Illuminazione',
	Ground: 'Piano',
	Soft: 'Morbida',
	Warm: 'Calda',
	Dramatic: 'Drammatica',
	Studio: 'Studio',
	'Shadow only': 'Solo ombra',
	Table: 'Tavolo',
	Mirror: 'Specchio',
	None: 'Nessuno',
	Background: 'Sfondo',
	Instructions: 'Istruzioni',
	Play: 'Riproduci',
	'The sheet': 'Il foglio',
	'Step %1$s of %2$s': 'Passo %1$s di %2$s',
	'Finished!': 'Fatto!',
	Angled: 'Obliquo',
	Front: 'Frontale',
	'Three-quarter': 'Tre quarti',
	'From above': 'Dall’alto',
	'Insert as picture': 'Inserisci come immagine',
	'Insert sheet + instructions': 'Inserisci foglio + istruzioni',
	Cancel: 'Annulla',
	'Rendering the pages': 'Genero le pagine',
	'Inserted.': 'Inserito.',
	'Could not insert.': 'Impossibile inserire.',
	'Folding sheet - front': 'Foglio di piegatura - davanti',
	'Folding sheet - back, mirrored for duplex print':
		'Foglio di piegatura - retro, specchiato per la stampa fronte-retro',
	'Folding instructions': 'Istruzioni di piegatura',
	'Origami picture': 'Immagine origami',
	'Folding sheet': 'Foglio di piegatura',
	'Insert pages': 'Inserisci pagine',
	'Drag to turn the scene, wheel to zoom.':
		'Trascina per ruotare la scena, la rotellina fa lo zoom.',
	'Use brand colors': 'Usa i colori del brand',
	'Brand kit': 'Kit del brand',
};

const NL = {
	'Design the paper, watch it fold itself, print sheet and instructions.':
		'Ontwerp het papier, kijk hoe het zichzelf vouwt, print het vouwvel en de instructies.',
	Figure: 'Figuur',
	Fox: 'Vos',
	Heart: 'Hart',
	Face: 'Gezicht',
	Ears: 'Oren',
	Snout: 'Snuit',
	'Fold the sheet in half along the diagonal, away from you.':
		'Vouw het vel dubbel langs de diagonaal, van je af.',
	'Fold both corners up over the front - the ears.':
		'Vouw beide hoeken omhoog over de voorkant - de oren.',
	'Fold the front point up across the face - the snout.':
		'Vouw de voorste punt omhoog over het gezicht - de snuit.',
	'Fold the top corner behind, down to the middle of the sheet.':
		'Vouw de bovenste hoek naar achteren, omlaag tot het midden van het vel.',
	'Fold the bottom corner behind, well past the folded edge.':
		'Vouw de onderste hoek naar achteren, ruim voorbij de vouwrand.',
	'Fold both sides behind so their edges meet in the middle of the back.':
		'Vouw beide zijkanten naar achteren zodat hun randen elkaar achter in het midden raken.',
	'Fold the four little corners behind to round the lobes.':
		'Vouw de vier hoekjes naar achteren om de bollingen af te ronden.',
	'Turn the heart over - the smooth side is the front.':
		'Draai het hart om - de gladde kant is de voorkant.',
	Sailboat: 'Zeilboot',
	Sail: 'Zeil',
	Hull: 'Romp',
	'Fold the sheet in half along the diagonal, away from you - the sail.':
		'Vouw het vel dubbel langs de diagonaal, van je af - het zeil.',
	'Fold the bottom strip of the front layer up - the hull.':
		'Vouw de onderste strook van de voorste laag omhoog - de romp.',
	'Fold the tip of the front layer down - the pennant.':
		'Vouw de punt van de voorste laag omlaag - de wimpel.',
	'Fortune teller': 'Happertje',
	'Inside flaps': 'Binnenflappen',
	Pockets: 'Vakjes',
	'Fold all four corners to the middle of the sheet.':
		'Vouw alle vier de hoeken naar het midden van het vel.',
	'Turn the whole thing over.': 'Draai het geheel om.',
	'Fold all four corners to the middle again.':
		'Vouw alle vier de hoeken opnieuw naar het midden.',
	'Slide your fingers into the four pockets and push them together - it opens.':
		'Steek je vingers in de vier vakjes en duw ze naar elkaar toe - het gaat open.',
	Butterfly: 'Vlinder',
	Wings: 'Vleugels',
	'Fold the sheet in half backward, top edge behind the bottom edge.':
		'Vouw het vel naar achteren dubbel, bovenrand achter de onderrand.',
	'Push both sides in between the layers - the sheet collapses into a triangle.':
		'Duw beide zijkanten tussen de lagen - het vel klapt samen tot een driehoek.',
	'Fold the front corners up to the top point - the upper wings.':
		'Vouw de voorste hoeken omhoog naar de bovenste punt - de bovenvleugels.',
	'Bend the wings up along the middle - and it flies.':
		'Buig de vleugels omhoog langs het midden - en hij vliegt.',
	'Jumping frog': 'Springkikker',
	Back: 'Rug',
	Head: 'Kop',
	'Fold the sheet in half backward, left behind right.':
		'Vouw het vel naar achteren dubbel, links achter rechts.',
	'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.':
		'Vouw de bovenrand naar achteren omlaag, duw dan beide zijkanten naar binnen - bovenaan ontstaat een driehoek.',
	'Fold the front corners up to the top point.':
		'Vouw de voorste hoeken omhoog naar de bovenste punt.',
	'Fold the little triangles down and out - the front legs.':
		'Vouw de driehoekjes schuin omlaag naar buiten - de voorpoten.',
	'Fold the bottom edge up, then its half back down - the spring.':
		'Vouw de onderrand omhoog en de helft daarvan weer omlaag - de veer.',
	'Let the spring open a little - the frog crouches, ready to jump.':
		'Laat de veer een beetje opengaan - de kikker zit gehurkt, klaar om te springen.',
	Crane: 'Kraanvogel',
	Body: 'Lichaam',
	'Tuck the left half between the layers: front to the front, back to the back - the square base.':
		'Stop de linkerhelft tussen de lagen: voor naar voren, achter naar achteren - de vierkante basis.',
	'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.':
		'Vouw de randen van de voorste flappen naar het midden en til de voorste punt hoog over de bovenkant - de bloemblaadvouw.',
	'The same on the back - the bird base, two long points below.':
		'Hetzelfde aan de achterkant - de vogelbasis, met twee lange punten onderaan.',
	'Reverse-fold the front point up and out - the neck.':
		'Vouw de voorste punt met een omkeervouw omhoog naar buiten - de hals.',
	'Reverse-fold the back point up the other way - the tail.':
		'Vouw de achterste punt met een omkeervouw de andere kant op omhoog - de staart.',
	'A small reverse fold at the top of the neck - the head.':
		'Een kleine omkeervouw boven aan de hals - de kop.',
	'Fan the wings up - the crane is done.':
		'Waaier de vleugels omhoog - de kraanvogel is klaar.',
	'Masu box': 'Masu-doosje',
	Floor: 'Bodem',
	Walls: 'Wanden',
	'Raise all four walls along the edges of the floor.':
		'Zet alle vier de wanden rechtop langs de randen van de bodem.',
	'Unfold each corner out over the rim - the lining shows.':
		'Vouw elke hoek naar buiten over de rand open - de voering wordt zichtbaar.',
	Swan: 'Zwaan',
	Neck: 'Hals',
	'Fold both edges at the nose corner in to the diagonal - the kite.':
		'Vouw beide randen bij de neushoek naar de diagonaal toe - de vlieger.',
	'Fold the kite in half along the diagonal, away from you.':
		'Vouw de vlieger dubbel langs de diagonaal, van je af.',
	'Reverse-fold the long point up between the layers - the neck.':
		'Vouw de lange punt met een omkeervouw omhoog tussen de lagen - de hals.',
	'A small reverse fold at the top - the head looks forward.':
		'Een kleine omkeervouw bovenaan - de kop kijkt naar voren.',
	Dove: 'Duif',
	'Fold the front layer up past the ridge - the near wing.':
		'Vouw de voorste laag omhoog voorbij de rug - de nabije vleugel.',
	'Fold the back layer behind, the same way - the far wing.':
		'Vouw de achterste laag op dezelfde manier naar achteren - de verre vleugel.',
	'Bend the head tip down through both layers - the beak.':
		'Knik de punt van de kop door beide lagen omlaag - de snavel.',
	'Let the wings open - the dove flies.':
		'Laat de vleugels opengaan - de duif vliegt.',
	'Paper plane': 'Papieren vliegtuigje',
	Nose: 'Neus',
	'Fold both edges at the nose corner in to the centre line.':
		'Vouw beide randen bij de neushoek naar de middellijn toe.',
	'Fold the slanted edges in to the centre line again - the dart.':
		'Vouw de schuine randen opnieuw naar de middellijn - de pijl.',
	'Fold the dart in half along the centre line, away from you.':
		'Vouw de pijl dubbel langs de middellijn, van je af.',
	'Fold the near wing down to the keel, the far wing behind.':
		'Vouw de nabije vleugel omlaag tot de kiel, de verre naar achteren.',
	'Open the wings out - ready for the maiden flight.':
		'Klap de vleugels open - klaar voor de eerste vlucht.',
	'Samurai helmet': 'Samoeraihelm',
	Horns: 'Hoorns',
	Brim: 'Rand',
	Helmet: 'Helm',
	'Fold both corners down to the chin point.':
		'Vouw beide hoeken omlaag naar de kinpunt.',
	'Fold both hanging tips back up to the crown.':
		'Vouw beide hangende punten weer omhoog naar de kruin.',
	'Fold the tips out at an angle - the horns.':
		'Vouw de punten schuin naar buiten - de hoorns.',
	'Fold the front layer up over the horns - the brim.':
		'Vouw de voorste laag omhoog over de hoorns - de rand.',
	'Fold the back layer up behind - the helmet closes.':
		'Vouw de achterste laag naar achteren omhoog - de helm sluit.',
	Fish: 'Vis',
	Tail: 'Staart',
	'Fold the thin end up across the back - the tail.':
		'Vouw het smalle uiteinde omhoog over de rug - de staart.',
	'Fold the nose tip behind - the mouth.':
		'Vouw de neuspunt naar achteren - de bek.',
	Tulip: 'Tulp',
	Bloom: 'Bloem',
	Petals: 'Bloemblaadjes',
	'Fold both corners up across the middle, tips past the edges - the petals.':
		'Vouw beide hoeken omhoog over het midden, de punten voorbij de randen - de bloemblaadjes.',
	'Open the bloom a little - it stands.':
		'Open de bloem een beetje - hij staat.',
	'Dog face': 'Hondenkop',
	'Fold the front corners down over the face - the floppy ears.':
		'Vouw de voorste hoeken omlaag over het gezicht - de flaporen.',
	'Fold the front chin tip up, the back tip behind - the snout.':
		'Vouw de voorste kinpunt omhoog, de achterste naar achteren - de snuit.',
	'Cat face': 'Kattenkop',
	'Fold both corners up past the top edge - the pointy ears.':
		'Vouw beide hoeken omhoog voorbij de bovenrand - de spitse oren.',
	'Fold the chin tip behind - the cat looks at you.':
		'Vouw de kinpunt naar achteren - de kat kijkt je aan.',
	Penguin: 'Pinguïn',
	Chest: 'Borst',
	Beak: 'Snavel',
	'Fold both edges at the head corner in to the diagonal - the dark back.':
		'Vouw beide randen bij de kophoek naar de diagonaal toe - de donkere rug.',
	'Fold it in half along the diagonal, away from you.':
		'Vouw het dubbel langs de diagonaal, van je af.',
	'Open the body a little - the penguin stands.':
		'Open het lichaam een beetje - de pinguïn staat.',
	Cup: 'Beker',
	Rim: 'Rand',
	'Fold the right corner across, its tip onto the left edge.':
		'Vouw de rechterhoek eroverheen, de punt op de linkerrand.',
	'Fold the left corner across over it - the band locks.':
		'Vouw de linkerhoek er weer overheen - de band zit vast.',
	'Fold the front tip down over the band, the back tip behind.':
		'Vouw de voorste punt omlaag over de band, de achterste naar achteren.',
	'Open the cup a little - it stands.':
		'Open de beker een beetje - hij staat.',
	'The paper': 'Het papier',
	'Front side': 'Voorkant',
	'Back side': 'Achterkant',
	Colour: 'Kleur',
	'Pick a picture': 'Afbeelding kiezen',
	'Remove picture': 'Afbeelding verwijderen',
	Pattern: 'Patroon',
	'Pattern colour': 'Patroonkleur',
	Plain: 'Effen',
	Dots: 'Stippen',
	Stripes: 'Strepen',
	Zigzag: 'Zigzag',
	Stars: 'Sterren',
	Checks: 'Ruiten',
	'Show where things land': 'Tonen waar alles terechtkomt',
	'Print fold lines on the sheet': 'Vouwlijnen op het vel afdrukken',
	Scene: 'Scène',
	Lighting: 'Verlichting',
	Ground: 'Ondergrond',
	Soft: 'Zacht',
	Warm: 'Warm',
	Dramatic: 'Dramatisch',
	Studio: 'Studio',
	'Shadow only': 'Alleen schaduw',
	Table: 'Tafel',
	Mirror: 'Spiegelend',
	None: 'Geen',
	Background: 'Achtergrond',
	Instructions: 'Instructies',
	Play: 'Afspelen',
	'The sheet': 'Het vel',
	'Step %1$s of %2$s': 'Stap %1$s van %2$s',
	'Finished!': 'Klaar!',
	Angled: 'Schuin',
	Front: 'Frontaal',
	'Three-quarter': 'Driekwart',
	'From above': 'Van boven',
	'Insert as picture': 'Invoegen als afbeelding',
	'Insert sheet + instructions': 'Vouwvel + instructies invoegen',
	Cancel: 'Annuleren',
	'Rendering the pages': 'Pagina’s worden gemaakt',
	'Inserted.': 'Ingevoegd.',
	'Could not insert.': 'Invoegen mislukt.',
	'Folding sheet - front': 'Vouwvel - voorkant',
	'Folding sheet - back, mirrored for duplex print':
		'Vouwvel - achterkant, gespiegeld voor dubbelzijdig afdrukken',
	'Folding instructions': 'Vouwinstructies',
	'Origami picture': 'Origami-afbeelding',
	'Folding sheet': 'Vouwvel',
	'Insert pages': 'Pagina’s invoegen',
	'Drag to turn the scene, wheel to zoom.':
		'Sleep om de scène te draaien, scrollwiel om te zoomen.',
	'Use brand colors': 'Merkkleuren gebruiken',
	'Brand kit': 'Merkkit',
};

const DICTS = { de: DE, es: ES, fr: FR, pt: PT, it: IT, nl: NL };
const DICT = DICTS[ LOCALE.slice( 0, 2 ) ] || null;
export const t = ( s ) => ( DICT && DICT[ s ] ) || s;
