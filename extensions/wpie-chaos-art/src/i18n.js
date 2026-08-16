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
};

export const TABLES = { de: DE, es: ES, fr: FR, pt: PT, it: IT };

const TABLE = TABLES[ LOCALE.slice( 0, 2 ).toLowerCase() ] || null;

/** Translate, falling back to the English source string. */
export function t( s ) {
	return ( TABLE && TABLE[ s ] ) || s;
}
