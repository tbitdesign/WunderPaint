/**
 * The studio in five languages.
 *
 * Same shape as its siblings: one table per language, a lookup that falls
 * back to the English source string, so a missing entry shows English
 * rather than a key. tests/i18n.test.js compares the tables key by key
 * and scans the dialog for every string it can ask for.
 */

const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	( document.documentElement && document.documentElement.lang ) ||
	'en'
).replace( '-', '_' );

const DE = {
	'A water bath: drop ink, pull combs, marble like on real water.':
		'Ein Wasserbad: Tinte tropfen, Kämme ziehen, marmorieren wie auf echtem Wasser.',
	'Click to drop ink · hold to let it grow · drag a tool through':
		'Klicken = Tropfen · Halten = wachsen lassen · Ziehen = Werkzeug durchs Wasser',
	'Show document': 'Dokument zeigen',
	'Preview on your current design.': 'Vorschau auf Deinem aktuellen Design.',
	'Could not render the document.':
		'Das Dokument konnte nicht gerendert werden.',
	Patterns: 'Muster',
	'A seeded start over your inks - keep marbling on top of it.':
		'Ein gewürfelter Start mit Deinen Tinten, danach einfach weitermarmorieren.',
	Stone: 'Steinmuster',
	'Gel-git': 'Gel-git',
	Nonpareil: 'Nonpareil',
	Chevron: 'Fischgrät',
	Bouquet: 'Bouquet',
	'French curls': 'Locken',
	Peacock: 'Pfau',
	Seed: 'Saat',
	'New seed': 'Neue Saat',
	Bath: 'Becken',
	'Sprinkle drops': 'Tropfen streuen',
	'Undo last move': 'Letzten Zug zurück',
	'Empty the bath': 'Becken leeren',
	'Really empty?': 'Wirklich leeren?',
	Tool: 'Werkzeug',
	'Ink drop': 'Tintentropfen',
	Needle: 'Nadel',
	Comb: 'Kamm',
	Wave: 'Welle',
	Curl: 'Wirbel',
	'Drop size': 'Tropfengröße',
	Rings: 'Ringe',
	'Single drop': 'Einzelner Tropfen',
	'Hold to grow the drop; drag to scatter a trail.':
		'Halten lässt den Tropfen wachsen, Ziehen streut eine Spur.',
	'Tooth spacing': 'Zinkenabstand',
	Softness: 'Weichheit',
	'Drag through the bath; the pull length is the force.':
		'Durchs Becken ziehen; die Zuglänge ist die Kraft.',
	Sway: 'Schwung',
	Wavelength: 'Wellenlänge',
	'Drag along the direction the water should sway.':
		'In die Richtung ziehen, in die das Wasser schwingen soll.',
	'Curl radius': 'Wirbelradius',
	'Drag right to curl clockwise, left to curl the other way.':
		'Nach rechts ziehen dreht im Uhrzeigersinn, nach links andersherum.',
	Inks: 'Tinten',
	Ink: 'Tinte',
	'Active ink': 'Aktive Tinte',
	'Use brand colors': 'Markenfarben verwenden',
	Water: 'Wasser',
	'Water color': 'Wasserfarbe',
	'Clear water (transparent)': 'Klares Wasser (transparent)',
	'Clear water marbles veins straight over your design.':
		'Klares Wasser marmoriert die Adern direkt über Dein Design.',
	Film: 'Film',
	Motion: 'Bewegung',
	'The making, replayed': 'Die Entstehung, abgespielt',
	'Living water loop': 'Lebendiges Wasser (Loop)',
	Loop: 'Loop',
	Preview: 'Vorschau',
	'Video export needs WebGL2, which this browser lacks.':
		'Der Video-Export braucht WebGL2, das dieser Browser nicht hat.',
	'Video (WebM)': 'Video (WebM)',
	'To Media Library': 'In die Mediathek',
	'Recording…': 'Nimmt auf…',
	'Recording failed.': 'Aufnahme fehlgeschlagen.',
	'Could not save to the Media Library.':
		'Konnte nicht in der Mediathek gespeichert werden.',
	'Saved to Media Library.': 'In der Mediathek gespeichert.',
	Cancel: 'Abbrechen',
	Update: 'Aktualisieren',
	Insert: 'Einfügen',
	moves: 'Züge',
	'CPU mode': 'CPU-Modus',
	'Update marbling': 'Marmorierung aktualisieren',
	'Insert marbling': 'Marmorierung einfügen',
	'Could not insert.': 'Einfügen fehlgeschlagen.',
	'The bath is full - undo a move first.':
		'Das Becken ist voll, bitte erst einen Zug zurücknehmen.',
	Flower: 'Blume',
	Tulip: 'Tulpe',
	Carnation: 'Nelke',
	Daisy: 'Gänseblümchen',
	Size: 'Größe',
	Petals: 'Blätter',
	'With stem': 'Mit Stiel',
	'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.':
		'Klick pflanzt die Blume; Ziehen dreht sie und bestimmt die Größe. Der Stiel nutzt den letzten Tintennapf.',
	Arc: 'Bogen',
	'Ring comb': 'Ringkamm',
	Splatter: 'Spritzer',
	Force: 'Kraft',
	'Press at the centre, drag out to the radius; right pulls clockwise.':
		'Im Zentrum ansetzen, bis zum Radius ziehen; rechts zieht im Uhrzeigersinn.',
	'Flick across the bath to spray a fan of tiny drops.':
		'Übers Becken schnippen, um einen Fächer feiner Tröpfchen zu sprühen.',
	'Gall (clear drop)': 'Galle (Klartropfen)',
	'The gall drop pushes the colours aside and leaves open water.':
		'Der Galletropfen schiebt die Farben beiseite und hinterlässt offenes Wasser.',
	Pigment: 'Pigment',
	'Paper grain': 'Papierkorn',
};

const ES = {
	'A water bath: drop ink, pull combs, marble like on real water.':
		'Un baño de agua: gotea tinta, arrastra peines, marmolea como en agua real.',
	'Click to drop ink · hold to let it grow · drag a tool through':
		'Clic = gota · mantener = crece · arrastrar = herramienta por el agua',
	'Show document': 'Mostrar documento',
	'Preview on your current design.': 'Vista previa sobre tu diseño actual.',
	'Could not render the document.': 'No se pudo renderizar el documento.',
	Patterns: 'Patrones',
	'A seeded start over your inks - keep marbling on top of it.':
		'Un comienzo aleatorio con tus tintas; sigue marmoleando encima.',
	Stone: 'Piedra',
	'Gel-git': 'Gel-git',
	Nonpareil: 'Nonpareil',
	Chevron: 'Espiga',
	Bouquet: 'Bouquet',
	'French curls': 'Rizos franceses',
	Peacock: 'Pavo real',
	Seed: 'Semilla',
	'New seed': 'Nueva semilla',
	Bath: 'Baño',
	'Sprinkle drops': 'Esparcir gotas',
	'Undo last move': 'Deshacer el último gesto',
	'Empty the bath': 'Vaciar el baño',
	'Really empty?': '¿Vaciar de verdad?',
	Tool: 'Herramienta',
	'Ink drop': 'Gota de tinta',
	Needle: 'Aguja',
	Comb: 'Peine',
	Wave: 'Ola',
	Curl: 'Remolino',
	'Drop size': 'Tamaño de gota',
	Rings: 'Anillos',
	'Single drop': 'Gota única',
	'Hold to grow the drop; drag to scatter a trail.':
		'Mantén para que crezca la gota; arrastra para esparcir un rastro.',
	'Tooth spacing': 'Separación de púas',
	Softness: 'Suavidad',
	'Drag through the bath; the pull length is the force.':
		'Arrastra por el baño; la longitud del tirón es la fuerza.',
	Sway: 'Vaivén',
	Wavelength: 'Longitud de onda',
	'Drag along the direction the water should sway.':
		'Arrastra en la dirección en que debe mecerse el agua.',
	'Curl radius': 'Radio del remolino',
	'Drag right to curl clockwise, left to curl the other way.':
		'Arrastra a la derecha para girar en sentido horario, a la izquierda al contrario.',
	Inks: 'Tintas',
	Ink: 'Tinta',
	'Active ink': 'Tinta activa',
	'Use brand colors': 'Usar colores de marca',
	Water: 'Agua',
	'Water color': 'Color del agua',
	'Clear water (transparent)': 'Agua clara (transparente)',
	'Clear water marbles veins straight over your design.':
		'El agua clara marmolea las vetas directamente sobre tu diseño.',
	Film: 'Película',
	Motion: 'Movimiento',
	'The making, replayed': 'La creación, reproducida',
	'Living water loop': 'Agua viva (bucle)',
	Loop: 'Bucle',
	Preview: 'Vista previa',
	'Video export needs WebGL2, which this browser lacks.':
		'La exportación de vídeo necesita WebGL2, que este navegador no tiene.',
	'Video (WebM)': 'Vídeo (WebM)',
	'To Media Library': 'A la biblioteca de medios',
	'Recording…': 'Grabando…',
	'Recording failed.': 'La grabación falló.',
	'Could not save to the Media Library.':
		'No se pudo guardar en la biblioteca de medios.',
	'Saved to Media Library.': 'Guardado en la biblioteca de medios.',
	Cancel: 'Cancelar',
	Update: 'Actualizar',
	Insert: 'Insertar',
	moves: 'gestos',
	'CPU mode': 'Modo CPU',
	'Update marbling': 'Actualizar marmoleado',
	'Insert marbling': 'Insertar marmoleado',
	'Could not insert.': 'No se pudo insertar.',
	'The bath is full - undo a move first.':
		'El baño está lleno; deshaz antes un gesto.',
	Flower: 'Flor',
	Tulip: 'Tulipán',
	Carnation: 'Clavel',
	Daisy: 'Margarita',
	Size: 'Tamaño',
	Petals: 'Pétalos',
	'With stem': 'Con tallo',
	'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.':
		'Un clic planta la flor; arrastrar la gira y fija su tamaño. El tallo usa el último pocillo de tinta.',
	Arc: 'Arco',
	'Ring comb': 'Peine circular',
	Splatter: 'Salpicadura',
	Force: 'Fuerza',
	'Press at the centre, drag out to the radius; right pulls clockwise.':
		'Pulsa en el centro y arrastra hasta el radio; a la derecha gira en sentido horario.',
	'Flick across the bath to spray a fan of tiny drops.':
		'Sacude sobre el baño para rociar un abanico de gotitas.',
	'Gall (clear drop)': 'Hiel (gota clara)',
	'The gall drop pushes the colours aside and leaves open water.':
		'La gota de hiel aparta los colores y deja agua abierta.',
	Pigment: 'Pigmento',
	'Paper grain': 'Grano del papel',
};

const FR = {
	'A water bath: drop ink, pull combs, marble like on real water.':
		"Un bain d'eau : déposez l'encre, tirez les peignes, marbrez comme sur l'eau.",
	'Click to drop ink · hold to let it grow · drag a tool through':
		"Clic = goutte · maintenir = elle grandit · glisser = l'outil traverse l'eau",
	'Show document': 'Afficher le document',
	'Preview on your current design.': 'Aperçu sur votre design actuel.',
	'Could not render the document.': 'Impossible de rendre le document.',
	Patterns: 'Motifs',
	'A seeded start over your inks - keep marbling on top of it.':
		'Un départ aléatoire avec vos encres ; continuez à marbrer par-dessus.',
	Stone: 'Pierre',
	'Gel-git': 'Gel-git',
	Nonpareil: 'Nonpareil',
	Chevron: 'Chevron',
	Bouquet: 'Bouquet',
	'French curls': 'Boucles françaises',
	Peacock: 'Paon',
	Seed: 'Graine',
	'New seed': 'Nouvelle graine',
	Bath: 'Bain',
	'Sprinkle drops': 'Parsemer des gouttes',
	'Undo last move': 'Annuler le dernier geste',
	'Empty the bath': 'Vider le bain',
	'Really empty?': 'Vraiment vider ?',
	Tool: 'Outil',
	'Ink drop': "Goutte d'encre",
	Needle: 'Aiguille',
	Comb: 'Peigne',
	Wave: 'Vague',
	Curl: 'Tourbillon',
	'Drop size': 'Taille de goutte',
	Rings: 'Anneaux',
	'Single drop': 'Goutte simple',
	'Hold to grow the drop; drag to scatter a trail.':
		'Maintenez pour faire grandir la goutte ; glissez pour semer une traînée.',
	'Tooth spacing': 'Écart des dents',
	Softness: 'Douceur',
	'Drag through the bath; the pull length is the force.':
		'Glissez dans le bain ; la longueur du geste fait la force.',
	Sway: 'Balancement',
	Wavelength: "Longueur d'onde",
	'Drag along the direction the water should sway.':
		"Glissez dans la direction où l'eau doit se balancer.",
	'Curl radius': 'Rayon du tourbillon',
	'Drag right to curl clockwise, left to curl the other way.':
		"Glissez à droite pour tourner dans le sens horaire, à gauche pour l'inverse.",
	Inks: 'Encres',
	Ink: 'Encre',
	'Active ink': 'Encre active',
	'Use brand colors': 'Utiliser les couleurs de marque',
	Water: 'Eau',
	'Water color': "Couleur de l'eau",
	'Clear water (transparent)': 'Eau claire (transparente)',
	'Clear water marbles veins straight over your design.':
		"L'eau claire marbre les veines directement sur votre design.",
	Film: 'Film',
	Motion: 'Mouvement',
	'The making, replayed': 'La fabrication, rejouée',
	'Living water loop': 'Eau vivante (boucle)',
	Loop: 'Boucle',
	Preview: 'Aperçu',
	'Video export needs WebGL2, which this browser lacks.':
		"L'export vidéo demande WebGL2, absent de ce navigateur.",
	'Video (WebM)': 'Vidéo (WebM)',
	'To Media Library': 'Vers la médiathèque',
	'Recording…': 'Enregistrement…',
	'Recording failed.': "L'enregistrement a échoué.",
	'Could not save to the Media Library.':
		"Impossible d'enregistrer dans la médiathèque.",
	'Saved to Media Library.': 'Enregistré dans la médiathèque.',
	Cancel: 'Annuler',
	Update: 'Mettre à jour',
	Insert: 'Insérer',
	moves: 'gestes',
	'CPU mode': 'Mode CPU',
	'Update marbling': 'Mettre à jour la marbrure',
	'Insert marbling': 'Insérer la marbrure',
	'Could not insert.': "Impossible d'insérer.",
	'The bath is full - undo a move first.':
		"Le bain est plein ; annulez d'abord un geste.",
	Flower: 'Fleur',
	Tulip: 'Tulipe',
	Carnation: 'Œillet',
	Daisy: 'Marguerite',
	Size: 'Taille',
	Petals: 'Pétales',
	'With stem': 'Avec tige',
	'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.':
		"Un clic plante la fleur ; glisser la tourne et règle sa taille. La tige utilise le dernier godet d'encre.",
	Arc: 'Arc',
	'Ring comb': 'Peigne circulaire',
	Splatter: 'Éclaboussure',
	Force: 'Force',
	'Press at the centre, drag out to the radius; right pulls clockwise.':
		"Appuyez au centre, glissez jusqu'au rayon ; à droite, rotation horaire.",
	'Flick across the bath to spray a fan of tiny drops.':
		'Fouettez le bain pour projeter un éventail de gouttelettes.',
	'Gall (clear drop)': 'Fiel (goutte claire)',
	'The gall drop pushes the colours aside and leaves open water.':
		"La goutte de fiel écarte les couleurs et laisse l'eau libre.",
	Pigment: 'Pigment',
	'Paper grain': 'Grain du papier',
};

const PT = {
	'A water bath: drop ink, pull combs, marble like on real water.':
		'Um banho de água: pingue tinta, puxe pentes, marmorize como na água de verdade.',
	'Click to drop ink · hold to let it grow · drag a tool through':
		'Clique = gota · segurar = ela cresce · arrastar = ferramenta pela água',
	'Show document': 'Mostrar documento',
	'Preview on your current design.': 'Prévia sobre o seu design atual.',
	'Could not render the document.':
		'Não foi possível renderizar o documento.',
	Patterns: 'Padrões',
	'A seeded start over your inks - keep marbling on top of it.':
		'Um começo sorteado com as suas tintas; continue marmorizando por cima.',
	Stone: 'Pedra',
	'Gel-git': 'Gel-git',
	Nonpareil: 'Nonpareil',
	Chevron: 'Espinha de peixe',
	Bouquet: 'Buquê',
	'French curls': 'Cachos franceses',
	Peacock: 'Pavão',
	Seed: 'Semente',
	'New seed': 'Nova semente',
	Bath: 'Banho',
	'Sprinkle drops': 'Espalhar gotas',
	'Undo last move': 'Desfazer o último gesto',
	'Empty the bath': 'Esvaziar o banho',
	'Really empty?': 'Esvaziar mesmo?',
	Tool: 'Ferramenta',
	'Ink drop': 'Gota de tinta',
	Needle: 'Agulha',
	Comb: 'Pente',
	Wave: 'Onda',
	Curl: 'Redemoinho',
	'Drop size': 'Tamanho da gota',
	Rings: 'Anéis',
	'Single drop': 'Gota única',
	'Hold to grow the drop; drag to scatter a trail.':
		'Segure para a gota crescer; arraste para espalhar um rastro.',
	'Tooth spacing': 'Espaço entre dentes',
	Softness: 'Suavidade',
	'Drag through the bath; the pull length is the force.':
		'Arraste pelo banho; o comprimento do gesto é a força.',
	Sway: 'Balanço',
	Wavelength: 'Comprimento de onda',
	'Drag along the direction the water should sway.':
		'Arraste na direção em que a água deve balançar.',
	'Curl radius': 'Raio do redemoinho',
	'Drag right to curl clockwise, left to curl the other way.':
		'Arraste para a direita para girar no sentido horário, para a esquerda ao contrário.',
	Inks: 'Tintas',
	Ink: 'Tinta',
	'Active ink': 'Tinta ativa',
	'Use brand colors': 'Usar cores da marca',
	Water: 'Água',
	'Water color': 'Cor da água',
	'Clear water (transparent)': 'Água limpa (transparente)',
	'Clear water marbles veins straight over your design.':
		'Água limpa marmoriza os veios direto sobre o seu design.',
	Film: 'Filme',
	Motion: 'Movimento',
	'The making, replayed': 'A criação, reproduzida',
	'Living water loop': 'Água viva (loop)',
	Loop: 'Loop',
	Preview: 'Prévia',
	'Video export needs WebGL2, which this browser lacks.':
		'A exportação de vídeo precisa de WebGL2, que este navegador não tem.',
	'Video (WebM)': 'Vídeo (WebM)',
	'To Media Library': 'Para a biblioteca de mídia',
	'Recording…': 'Gravando…',
	'Recording failed.': 'A gravação falhou.',
	'Could not save to the Media Library.':
		'Não foi possível salvar na biblioteca de mídia.',
	'Saved to Media Library.': 'Salvo na biblioteca de mídia.',
	Cancel: 'Cancelar',
	Update: 'Atualizar',
	Insert: 'Inserir',
	moves: 'gestos',
	'CPU mode': 'Modo CPU',
	'Update marbling': 'Atualizar marmorização',
	'Insert marbling': 'Inserir marmorização',
	'Could not insert.': 'Não foi possível inserir.',
	'The bath is full - undo a move first.':
		'O banho está cheio; desfaça um gesto primeiro.',
	Flower: 'Flor',
	Tulip: 'Tulipa',
	Carnation: 'Cravo',
	Daisy: 'Margarida',
	Size: 'Tamanho',
	Petals: 'Pétalas',
	'With stem': 'Com caule',
	'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.':
		'Um clique planta a flor; arrastar gira e define o tamanho. O caule usa o último poço de tinta.',
	Arc: 'Arco',
	'Ring comb': 'Pente circular',
	Splatter: 'Respingo',
	Force: 'Força',
	'Press at the centre, drag out to the radius; right pulls clockwise.':
		'Pressione no centro e arraste até o raio; à direita gira em sentido horário.',
	'Flick across the bath to spray a fan of tiny drops.':
		'Sacuda sobre o banho para borrifar um leque de gotinhas.',
	'Gall (clear drop)': 'Fel (gota clara)',
	'The gall drop pushes the colours aside and leaves open water.':
		'A gota de fel afasta as cores e deixa água aberta.',
	Pigment: 'Pigmento',
	'Paper grain': 'Grão do papel',
};

const IT = {
	'A water bath: drop ink, pull combs, marble like on real water.':
		"Una vasca d'acqua: gocciola inchiostro, tira i pettini, marmorizza come sull'acqua vera.",
	'Click to drop ink · hold to let it grow · drag a tool through':
		"Clic = goccia · tieni premuto = cresce · trascina = lo strumento nell'acqua",
	'Show document': 'Mostra documento',
	'Preview on your current design.': 'Anteprima sul tuo design attuale.',
	'Could not render the document.': 'Impossibile renderizzare il documento.',
	Patterns: 'Motivi',
	'A seeded start over your inks - keep marbling on top of it.':
		'Un inizio sorteggiato con i tuoi inchiostri; continua a marmorizzare sopra.',
	Stone: 'Pietra',
	'Gel-git': 'Gel-git',
	Nonpareil: 'Nonpareil',
	Chevron: 'Spina di pesce',
	Bouquet: 'Bouquet',
	'French curls': 'Ricci francesi',
	Peacock: 'Pavone',
	Seed: 'Seme',
	'New seed': 'Nuovo seme',
	Bath: 'Vasca',
	'Sprinkle drops': 'Spargere gocce',
	'Undo last move': "Annulla l'ultimo gesto",
	'Empty the bath': 'Svuota la vasca',
	'Really empty?': 'Svuotare davvero?',
	Tool: 'Strumento',
	'Ink drop': "Goccia d'inchiostro",
	Needle: 'Ago',
	Comb: 'Pettine',
	Wave: 'Onda',
	Curl: 'Vortice',
	'Drop size': 'Dimensione goccia',
	Rings: 'Anelli',
	'Single drop': 'Goccia singola',
	'Hold to grow the drop; drag to scatter a trail.':
		'Tieni premuto per far crescere la goccia; trascina per seminare una scia.',
	'Tooth spacing': 'Distanza dei denti',
	Softness: 'Morbidezza',
	'Drag through the bath; the pull length is the force.':
		'Trascina nella vasca; la lunghezza del gesto è la forza.',
	Sway: 'Oscillazione',
	Wavelength: "Lunghezza d'onda",
	'Drag along the direction the water should sway.':
		"Trascina nella direzione in cui l'acqua deve oscillare.",
	'Curl radius': 'Raggio del vortice',
	'Drag right to curl clockwise, left to curl the other way.':
		'Trascina a destra per ruotare in senso orario, a sinistra per il contrario.',
	Inks: 'Inchiostri',
	Ink: 'Inchiostro',
	'Active ink': 'Inchiostro attivo',
	'Use brand colors': 'Usa i colori del brand',
	Water: 'Acqua',
	'Water color': "Colore dell'acqua",
	'Clear water (transparent)': 'Acqua limpida (trasparente)',
	'Clear water marbles veins straight over your design.':
		"L'acqua limpida marmorizza le venature direttamente sul tuo design.",
	Film: 'Film',
	Motion: 'Movimento',
	'The making, replayed': 'La creazione, riprodotta',
	'Living water loop': 'Acqua viva (loop)',
	Loop: 'Loop',
	Preview: 'Anteprima',
	'Video export needs WebGL2, which this browser lacks.':
		"L'esportazione video richiede WebGL2, assente in questo browser.",
	'Video (WebM)': 'Video (WebM)',
	'To Media Library': 'Nella libreria media',
	'Recording…': 'Registrazione…',
	'Recording failed.': 'Registrazione non riuscita.',
	'Could not save to the Media Library.':
		'Impossibile salvare nella libreria media.',
	'Saved to Media Library.': 'Salvato nella libreria media.',
	Cancel: 'Annulla',
	Update: 'Aggiorna',
	Insert: 'Inserisci',
	moves: 'gesti',
	'CPU mode': 'Modalità CPU',
	'Update marbling': 'Aggiorna marmorizzazione',
	'Insert marbling': 'Inserisci marmorizzazione',
	'Could not insert.': 'Impossibile inserire.',
	'The bath is full - undo a move first.':
		'La vasca è piena; annulla prima un gesto.',
	Flower: 'Fiore',
	Tulip: 'Tulipano',
	Carnation: 'Garofano',
	Daisy: 'Margherita',
	Size: 'Dimensione',
	Petals: 'Petali',
	'With stem': 'Con stelo',
	'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.':
		"Un clic pianta il fiore; trascinare lo ruota e ne fissa la dimensione. Lo stelo usa l'ultimo pozzetto d'inchiostro.",
	Arc: 'Arco',
	'Ring comb': 'Pettine circolare',
	Splatter: 'Schizzo',
	Force: 'Forza',
	'Press at the centre, drag out to the radius; right pulls clockwise.':
		'Premi al centro e trascina fino al raggio; a destra ruota in senso orario.',
	'Flick across the bath to spray a fan of tiny drops.':
		'Scuoti sulla vasca per spruzzare un ventaglio di goccioline.',
	'Gall (clear drop)': 'Fiele (goccia chiara)',
	'The gall drop pushes the colours aside and leaves open water.':
		'La goccia di fiele scosta i colori e lascia acqua aperta.',
	Pigment: 'Pigmento',
	'Paper grain': 'Grana della carta',
};

export const NL = {
	'A water bath: drop ink, pull combs, marble like on real water.':
		'Een waterbad: druppel inkt, haal kammen door, marmer als op echt water.',
	'Click to drop ink · hold to let it grow · drag a tool through':
		'Klik om inkt te druppelen · houd vast om te laten groeien · sleep een gereedschap erdoorheen',
	'Show document': 'Document tonen',
	'Preview on your current design.': 'Voorbeeld op je huidige ontwerp.',
	'Could not render the document.': 'Het document kon niet worden gerenderd.',
	Patterns: 'Patronen',
	'A seeded start over your inks - keep marbling on top of it.':
		'Een willekeurige start met je inkten - marmer daar gewoon op verder.',
	Stone: 'Steen',
	'Gel-git': 'Gel-git',
	Nonpareil: 'Nonpareil',
	Chevron: 'Visgraat',
	Bouquet: 'Bouquet',
	'French curls': 'Franse krullen',
	Peacock: 'Pauw',
	Seed: 'Seed',
	'New seed': 'Nieuwe seed',
	Bath: 'Bad',
	'Sprinkle drops': 'Druppels strooien',
	'Undo last move': 'Laatste zet ongedaan maken',
	'Empty the bath': 'Bad leegmaken',
	'Really empty?': 'Echt leegmaken?',
	Tool: 'Gereedschap',
	'Ink drop': 'Inktdruppel',
	Needle: 'Naald',
	Comb: 'Kam',
	Wave: 'Golf',
	Curl: 'Krul',
	'Drop size': 'Druppelgrootte',
	Rings: 'Ringen',
	'Single drop': 'Eén druppel',
	'Hold to grow the drop; drag to scatter a trail.':
		'Houd vast om de druppel te laten groeien; sleep om een spoor te strooien.',
	'Tooth spacing': 'Tandafstand',
	Softness: 'Zachtheid',
	'Drag through the bath; the pull length is the force.':
		'Sleep door het bad; de lengte van de haal bepaalt de kracht.',
	Sway: 'Zwaai',
	Wavelength: 'Golflengte',
	'Drag along the direction the water should sway.':
		'Sleep in de richting waarin het water moet zwaaien.',
	'Curl radius': 'Krulradius',
	'Drag right to curl clockwise, left to curl the other way.':
		'Sleep naar rechts om met de klok mee te krullen, naar links de andere kant op.',
	Inks: 'Inkten',
	Ink: 'Inkt',
	'Active ink': 'Actieve inkt',
	'Use brand colors': 'Merkkleuren gebruiken',
	Water: 'Water',
	'Water color': 'Waterkleur',
	'Clear water (transparent)': 'Helder water (transparant)',
	'Clear water marbles veins straight over your design.':
		'Helder water marmert de aderen direct over je ontwerp.',
	Film: 'Film',
	Motion: 'Beweging',
	'The making, replayed': 'Het ontstaan, opnieuw afgespeeld',
	'Living water loop': 'Levend water (herhaling)',
	Loop: 'Herhaling',
	Preview: 'Voorbeeld',
	'Video export needs WebGL2, which this browser lacks.':
		'Video-export vereist WebGL2, dat deze browser niet heeft.',
	'Video (WebM)': 'Video (WebM)',
	'To Media Library': 'Naar mediabibliotheek',
	'Recording…': 'Opnemen…',
	'Recording failed.': 'Opname mislukt.',
	'Could not save to the Media Library.':
		'Kon niet worden opgeslagen in de mediabibliotheek.',
	'Saved to Media Library.': 'Opgeslagen in de mediabibliotheek.',
	Cancel: 'Annuleren',
	Update: 'Bijwerken',
	Insert: 'Invoegen',
	moves: 'zetten',
	'CPU mode': 'CPU-modus',
	'Update marbling': 'Marmering bijwerken',
	'Insert marbling': 'Marmering invoegen',
	'Could not insert.': 'Invoegen mislukt.',
	'The bath is full - undo a move first.':
		'Het bad is vol - maak eerst een zet ongedaan.',
	Flower: 'Bloem',
	Tulip: 'Tulp',
	Carnation: 'Anjer',
	Daisy: 'Madeliefje',
	Size: 'Grootte',
	Petals: 'Bloemblaadjes',
	'With stem': 'Met steel',
	'Click plants the flower; drag turns it and sets its size. The stem uses the last ink well.':
		'Klikken plant de bloem; slepen draait haar en bepaalt de grootte. De steel gebruikt het laatste inktpotje.',
	Arc: 'Boog',
	'Ring comb': 'Ringkam',
	Splatter: 'Spetter',
	Force: 'Kracht',
	'Press at the centre, drag out to the radius; right pulls clockwise.':
		'Druk in het midden en sleep naar buiten tot de straal; naar rechts draait met de klok mee.',
	'Flick across the bath to spray a fan of tiny drops.':
		'Zwiep over het bad om een waaier van fijne druppeltjes te sproeien.',
	'Gall (clear drop)': 'Gal (heldere druppel)',
	'The gall drop pushes the colours aside and leaves open water.':
		'De galdruppel duwt de kleuren opzij en laat open water achter.',
	Pigment: 'Pigment',
	'Paper grain': 'Papierkorrel',
};

const DICTS = { de: DE, es: ES, fr: FR, pt: PT, it: IT, nl: NL };
const DICT = DICTS[ LOCALE.slice( 0, 2 ).toLowerCase() ] || null;

export function t( s ) {
	return ( DICT && DICT[ s ] ) || s;
}
