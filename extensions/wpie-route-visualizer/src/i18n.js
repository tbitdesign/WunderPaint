/**
 * Translations for this extension.
 *
 * Moved out of main.js in the 27.07.2026 refactoring round: 389 of its
 * 1671 lines were dictionary literals, which made the file look far more
 * complicated than it is. Pure data - esbuild inlines it exactly as before.
 */

export const LOCALE = (
	( window.WPIE && window.WPIE.locale ) ||
	document.documentElement.lang ||
	'en'
).toLowerCase();

const DE = {
	'Turn a GPX file into a route poster.':
		'Aus einer GPX-Datei wird ein Routen-Poster.',
	'Adjust the poster, the layer updates in place.':
		'Poster anpassen, die Ebene wird direkt aktualisiert.',
	'Load a GPX file to start your poster.':
		'GPX-Datei laden, um das Poster zu starten.',
	Route: 'Route',
	'Load GPX file…': 'GPX-Datei laden…',
	'Could not read that file.': 'Diese Datei konnte nicht gelesen werden.',
	'That GPX file is too large to open.':
		'Diese GPX-Datei ist zu groß zum Öffnen.',
	'No track points in that file.': 'Keine Trackpunkte in dieser Datei.',
	points: 'Punkte',
	Design: 'Design',
	Theme: 'Design',
	Layout: 'Layout',
	Classic: 'Klassisch',
	Corner: 'Ecke',
	'No text': 'Ohne Text',
	'Text size': 'Textgröße',
	'Route line': 'Routenlinie',
	'Line width': 'Linienstärke',
	'Route color': 'Routenfarbe',
	Auto: 'Auto',
	'Start / finish markers': 'Start-/Ziel-Marker',
	'Elevation profile': 'Höhenprofil',
	'No elevation data in this file.':
		'Keine Höhendaten in dieser Datei.',
	Map: 'Karte',
	'Street map background': 'Straßenkarte als Hintergrund',
	'Streets from OpenStreetMap, fetched through your own server and cached there.':
		'Straßen von OpenStreetMap, über deinen eigenen Server geladen und dort gecacht.',
	'Loading map data': 'Kartendaten werden geladen',
	'The map service is busy, retrying': 'Kartendienst ausgelastet, neuer Versuch',
	'Very large area: showing fewer details.':
		'Sehr großes Gebiet: weniger Details.',
	'Very dense area: some detail was skipped.':
		'Sehr dichtes Gebiet: einige Details übersprungen.',
	'Could not load map data.': 'Kartendaten konnten nicht geladen werden.',
	Text: 'Text',
	Font: 'Schrift',
	'Default (Montserrat)': 'Standard (Montserrat)',
	Title: 'Titel',
	Subtitle: 'Untertitel',
	'Stats line': 'Statistik-Zeile',
	Distance: 'Distanz',
	'Elevation gain': 'Höhenmeter',
	Time: 'Zeit',
	Pace: 'Pace',
	Date: 'Datum',
	Divider: 'Trennlinie',
	Stats: 'Statistik',
	Attribution: 'Quellenangabe',
	'Inserts the route as an image plus real text layers, grouped.':
		'Fügt die Route als Bild plus echte Text-Ebenen als Gruppe ein.',
	Cancel: 'Abbrechen',
	'Insert Route': 'Route einfügen',
	'Update Route': 'Route aktualisieren',
	'Route poster': 'Routen-Poster',
	'Color mode': 'Farbmodus',
	Solid: 'Einfarbig',
	'Heart rate': 'Puls',
	Elevation: 'Höhe',
	'Km markers': 'Km-Marker',
	Off: 'Aus',
	'Corner top left': 'Ecke oben links',
	'Corner top right': 'Ecke oben rechts',
	'Route too large for the street map.':
		'Route zu groß für die Straßenkarte.',
	'No map data returned for this area.':
		'Keine Kartendaten für dieses Gebiet erhalten.',
	'Demo route - load your own GPX file to replace it.':
		'Demo-Route - lade deine eigene GPX-Datei, um sie zu ersetzen.',
	'Brand colors': 'Markenfarben',
	'Use brand colors': 'Markenfarben nutzen',
};

const ES = {
	'Turn a GPX file into a route poster.':
		'Convierte un archivo GPX en un póster de ruta.',
	'Adjust the poster, the layer updates in place.':
		'Ajusta el póster; la capa se actualiza al momento.',
	'Load a GPX file to start your poster.':
		'Carga un archivo GPX para empezar tu póster.',
	Route: 'Ruta',
	'Load GPX file…': 'Cargar archivo GPX…',
	'Could not read that file.': 'No se pudo leer ese archivo.',
	'That GPX file is too large to open.':
		'Ese archivo GPX es demasiado grande para abrirlo.',
	'No track points in that file.': 'No hay puntos de track en ese archivo.',
	points: 'puntos',
	Design: 'Diseño',
	Theme: 'Tema',
	Layout: 'Composición',
	Classic: 'Clásico',
	Corner: 'Esquina',
	'No text': 'Sin texto',
	'Text size': 'Tamaño del texto',
	'Route line': 'Línea de la ruta',
	'Line width': 'Grosor de línea',
	'Route color': 'Color de la ruta',
	Auto: 'Auto',
	'Start / finish markers': 'Marcadores de salida y llegada',
	'Elevation profile': 'Perfil de altitud',
	'No elevation data in this file.': 'No hay datos de altitud en este archivo.',
	Map: 'Mapa',
	'Street map background': 'Mapa de calles como fondo',
	'Streets from OpenStreetMap, fetched through your own server and cached there.':
		'Calles de OpenStreetMap, obtenidas a través de tu propio servidor y cacheadas allí.',
	'Loading map data': 'Cargando datos del mapa',
	'The map service is busy, retrying':
		'El servicio de mapas está saturado; reintentando',
	'Very large area: showing fewer details.':
		'Zona muy grande: se muestran menos detalles.',
	'Very dense area: some detail was skipped.':
		'Zona muy densa: se omitieron algunos detalles.',
	'Could not load map data.': 'No se pudieron cargar los datos del mapa.',
	Text: 'Texto',
	Font: 'Fuente',
	'Default (Montserrat)': 'Por defecto (Montserrat)',
	Title: 'Título',
	Subtitle: 'Subtítulo',
	'Stats line': 'Línea de estadísticas',
	Distance: 'Distancia',
	'Elevation gain': 'Desnivel positivo',
	Time: 'Tiempo',
	Pace: 'Ritmo',
	Date: 'Fecha',
	Divider: 'Separador',
	Stats: 'Estadísticas',
	Attribution: 'Atribución',
	'Inserts the route as an image plus real text layers, grouped.':
		'Inserta la ruta como imagen más capas de texto reales, agrupadas.',
	Cancel: 'Cancelar',
	'Insert Route': 'Insertar ruta',
	'Update Route': 'Actualizar ruta',
	'Route poster': 'Póster de ruta',
	'Color mode': 'Modo de color',
	Solid: 'Sólido',
	'Heart rate': 'Pulsaciones',
	Elevation: 'Altitud',
	'Km markers': 'Marcadores de km',
	Off: 'Desactivado',
	'Corner top left': 'Esquina superior izquierda',
	'Corner top right': 'Esquina superior derecha',
	'Route too large for the street map.':
		'Ruta demasiado grande para el mapa de calles.',
	'No map data returned for this area.':
		'No se recibieron datos de mapa para esta zona.',
	'Demo route - load your own GPX file to replace it.':
		'Ruta de demostración: carga tu propio archivo GPX para reemplazarla.',
	'Brand colors': 'Colores de marca',
	'Use brand colors': 'Usar colores de marca',
};

const FR = {
	'Turn a GPX file into a route poster.':
		'Transforme un fichier GPX en affiche d\'itinéraire.',
	'Adjust the poster, the layer updates in place.':
		'Ajuste l\'affiche ; le calque se met à jour sur place.',
	'Load a GPX file to start your poster.':
		'Charge un fichier GPX pour démarrer ton affiche.',
	Route: 'Itinéraire',
	'Load GPX file…': 'Charger un fichier GPX…',
	'Could not read that file.': 'Impossible de lire ce fichier.',
	'That GPX file is too large to open.':
		'Ce fichier GPX est trop volumineux pour être ouvert.',
	'No track points in that file.': 'Aucun point de trace dans ce fichier.',
	points: 'points',
	Design: 'Design',
	Theme: 'Thème',
	Layout: 'Mise en page',
	Classic: 'Classique',
	Corner: 'Coin',
	'No text': 'Sans texte',
	'Text size': 'Taille du texte',
	'Route line': 'Ligne de l\'itinéraire',
	'Line width': 'Épaisseur de ligne',
	'Route color': 'Couleur de l\'itinéraire',
	Auto: 'Auto',
	'Start / finish markers': 'Marqueurs de départ et d\'arrivée',
	'Elevation profile': 'Profil d\'altitude',
	'No elevation data in this file.':
		'Aucune donnée d\'altitude dans ce fichier.',
	Map: 'Carte',
	'Street map background': 'Plan des rues en arrière-plan',
	'Streets from OpenStreetMap, fetched through your own server and cached there.':
		'Des rues d\'OpenStreetMap, récupérées via ton propre serveur et mises en cache là-bas.',
	'Loading map data': 'Chargement des données de la carte',
	'The map service is busy, retrying':
		'Le service de cartes est saturé ; nouvelle tentative',
	'Very large area: showing fewer details.':
		'Zone très grande : moins de détails affichés.',
	'Very dense area: some detail was skipped.':
		'Zone très dense : certains détails ont été omis.',
	'Could not load map data.': 'Impossible de charger les données de la carte.',
	Text: 'Texte',
	Font: 'Police',
	'Default (Montserrat)': 'Par défaut (Montserrat)',
	Title: 'Titre',
	Subtitle: 'Sous-titre',
	'Stats line': 'Ligne de statistiques',
	Distance: 'Distance',
	'Elevation gain': 'Dénivelé positif',
	Time: 'Temps',
	Pace: 'Allure',
	Date: 'Date',
	Divider: 'Séparateur',
	Stats: 'Statistiques',
	Attribution: 'Attribution',
	'Inserts the route as an image plus real text layers, grouped.':
		'Insère l\'itinéraire comme image plus de vrais calques de texte, groupés.',
	Cancel: 'Annuler',
	'Insert Route': 'Insérer l\'itinéraire',
	'Update Route': 'Mettre à jour l\'itinéraire',
	'Route poster': 'Affiche d\'itinéraire',
	'Color mode': 'Mode de couleur',
	Solid: 'Uni',
	'Heart rate': 'Fréquence cardiaque',
	Elevation: 'Altitude',
	'Km markers': 'Marqueurs de km',
	Off: 'Désactivé',
	'Corner top left': 'Coin supérieur gauche',
	'Corner top right': 'Coin supérieur droit',
	'Route too large for the street map.':
		'Itinéraire trop grand pour le plan des rues.',
	'No map data returned for this area.':
		'Aucune donnée de carte reçue pour cette zone.',
	'Demo route - load your own GPX file to replace it.':
		'Itinéraire de démonstration : charge ton propre fichier GPX pour le remplacer.',
	'Brand colors': 'Couleurs de marque',
	'Use brand colors': 'Utiliser les couleurs de marque',
};

const PT = {
	'Turn a GPX file into a route poster.':
		'Transforme um arquivo GPX em um pôster de rota.',
	'Adjust the poster, the layer updates in place.':
		'Ajuste o pôster; a camada se atualiza na hora.',
	'Load a GPX file to start your poster.':
		'Carregue um arquivo GPX para começar seu pôster.',
	Route: 'Rota',
	'Load GPX file…': 'Carregar arquivo GPX…',
	'Could not read that file.': 'Não foi possível ler esse arquivo.',
	'That GPX file is too large to open.':
		'Esse arquivo GPX é grande demais para abrir.',
	'No track points in that file.': 'Nenhum ponto de trajeto nesse arquivo.',
	points: 'pontos',
	Design: 'Design',
	Theme: 'Tema',
	Layout: 'Layout',
	Classic: 'Clássico',
	Corner: 'Canto',
	'No text': 'Sem texto',
	'Text size': 'Tamanho do texto',
	'Route line': 'Linha da rota',
	'Line width': 'Espessura da linha',
	'Route color': 'Cor da rota',
	Auto: 'Auto',
	'Start / finish markers': 'Marcadores de largada e chegada',
	'Elevation profile': 'Perfil de elevação',
	'No elevation data in this file.': 'Nenhum dado de elevação neste arquivo.',
	Map: 'Mapa',
	'Street map background': 'Mapa de ruas como fundo',
	'Streets from OpenStreetMap, fetched through your own server and cached there.':
		'Ruas do OpenStreetMap, obtidas pelo seu próprio servidor e armazenadas em cache lá.',
	'Loading map data': 'Carregando dados do mapa',
	'The map service is busy, retrying':
		'O serviço de mapas está sobrecarregado; tentando de novo',
	'Very large area: showing fewer details.':
		'Área muito grande: mostrando menos detalhes.',
	'Very dense area: some detail was skipped.':
		'Área muito densa: alguns detalhes foram omitidos.',
	'Could not load map data.': 'Não foi possível carregar os dados do mapa.',
	Text: 'Texto',
	Font: 'Fonte',
	'Default (Montserrat)': 'Padrão (Montserrat)',
	Title: 'Título',
	Subtitle: 'Subtítulo',
	'Stats line': 'Linha de estatísticas',
	Distance: 'Distância',
	'Elevation gain': 'Ganho de elevação',
	Time: 'Tempo',
	Pace: 'Ritmo',
	Date: 'Data',
	Divider: 'Divisor',
	Stats: 'Estatísticas',
	Attribution: 'Atribuição',
	'Inserts the route as an image plus real text layers, grouped.':
		'Insere a rota como imagem mais camadas de texto reais, agrupadas.',
	Cancel: 'Cancelar',
	'Insert Route': 'Inserir rota',
	'Update Route': 'Atualizar rota',
	'Route poster': 'Pôster de rota',
	'Color mode': 'Modo de cor',
	Solid: 'Sólido',
	'Heart rate': 'Frequência cardíaca',
	Elevation: 'Elevação',
	'Km markers': 'Marcadores de km',
	Off: 'Desligado',
	'Corner top left': 'Canto superior esquerdo',
	'Corner top right': 'Canto superior direito',
	'Route too large for the street map.':
		'Rota grande demais para o mapa de ruas.',
	'No map data returned for this area.':
		'Nenhum dado de mapa retornado para esta área.',
	'Demo route - load your own GPX file to replace it.':
		'Rota de demonstração: carregue seu próprio arquivo GPX para substituí-la.',
	'Brand colors': 'Cores da marca',
	'Use brand colors': 'Usar cores da marca',
};

const IT = {
	'Turn a GPX file into a route poster.':
		'Trasforma un file GPX in un poster del percorso.',
	'Adjust the poster, the layer updates in place.':
		'Regola il poster; il livello si aggiorna al volo.',
	'Load a GPX file to start your poster.':
		'Carica un file GPX per iniziare il tuo poster.',
	Route: 'Percorso',
	'Load GPX file…': 'Carica file GPX…',
	'Could not read that file.': 'Impossibile leggere quel file.',
	'That GPX file is too large to open.':
		'Questo file GPX è troppo grande per essere aperto.',
	'No track points in that file.': 'Nessun punto traccia in quel file.',
	points: 'punti',
	Design: 'Design',
	Theme: 'Tema',
	Layout: 'Layout',
	Classic: 'Classico',
	Corner: 'Angolo',
	'No text': 'Senza testo',
	'Text size': 'Dimensione del testo',
	'Route line': 'Linea del percorso',
	'Line width': 'Spessore della linea',
	'Route color': 'Colore del percorso',
	Auto: 'Auto',
	'Start / finish markers': 'Marcatori di partenza e arrivo',
	'Elevation profile': 'Profilo altimetrico',
	'No elevation data in this file.': 'Nessun dato di quota in questo file.',
	Map: 'Mappa',
	'Street map background': 'Mappa stradale come sfondo',
	'Streets from OpenStreetMap, fetched through your own server and cached there.':
		'Strade da OpenStreetMap, recuperate tramite il tuo server e lì messe in cache.',
	'Loading map data': 'Caricamento dei dati della mappa',
	'The map service is busy, retrying':
		'Il servizio mappe è sovraccarico; nuovo tentativo',
	'Very large area: showing fewer details.':
		'Area molto grande: vengono mostrati meno dettagli.',
	'Very dense area: some detail was skipped.':
		'Area molto densa: alcuni dettagli sono stati omessi.',
	'Could not load map data.': 'Impossibile caricare i dati della mappa.',
	Text: 'Testo',
	Font: 'Font',
	'Default (Montserrat)': 'Predefinito (Montserrat)',
	Title: 'Titolo',
	Subtitle: 'Sottotitolo',
	'Stats line': 'Riga delle statistiche',
	Distance: 'Distanza',
	'Elevation gain': 'Dislivello positivo',
	Time: 'Tempo',
	Pace: 'Passo',
	Date: 'Data',
	Divider: 'Divisore',
	Stats: 'Statistiche',
	Attribution: 'Attribuzione',
	'Inserts the route as an image plus real text layers, grouped.':
		'Inserisce il percorso come immagine più veri livelli di testo, raggruppati.',
	Cancel: 'Annulla',
	'Insert Route': 'Inserisci percorso',
	'Update Route': 'Aggiorna percorso',
	'Route poster': 'Poster del percorso',
	'Color mode': 'Modalità colore',
	Solid: 'Tinta unita',
	'Heart rate': 'Frequenza cardiaca',
	Elevation: 'Quota',
	'Km markers': 'Marcatori dei km',
	Off: 'Spento',
	'Corner top left': 'Angolo in alto a sinistra',
	'Corner top right': 'Angolo in alto a destra',
	'Route too large for the street map.':
		'Percorso troppo grande per la mappa stradale.',
	'No map data returned for this area.':
		'Nessun dato di mappa restituito per quest\'area.',
	'Demo route - load your own GPX file to replace it.':
		'Percorso demo: carica il tuo file GPX per sostituirlo.',
	'Brand colors': 'Colori del brand',
	'Use brand colors': 'Usa i colori del brand',
};
const NL = {
	'Turn a GPX file into a route poster.':
		'Maak van een GPX-bestand een routeposter.',
	'Adjust the poster, the layer updates in place.':
		'Pas de poster aan, de laag wordt direct bijgewerkt.',
	'Load a GPX file to start your poster.':
		'Laad een GPX-bestand om je poster te starten.',
	Route: 'Route',
	'Load GPX file…': 'GPX-bestand laden…',
	'Could not read that file.': 'Dat bestand kon niet worden gelezen.',
	'That GPX file is too large to open.':
		'Dat GPX-bestand is te groot om te openen.',
	'No track points in that file.': 'Geen trackpunten in dat bestand.',
	points: 'punten',
	Design: 'Ontwerp',
	Theme: 'Thema',
	Layout: 'Lay-out',
	Classic: 'Klassiek',
	Corner: 'Hoek',
	'No text': 'Geen tekst',
	'Text size': 'Tekstgrootte',
	'Route line': 'Routelijn',
	'Line width': 'Lijndikte',
	'Route color': 'Routekleur',
	Auto: 'Auto',
	'Start / finish markers': 'Start-/finishmarkeringen',
	'Elevation profile': 'Hoogteprofiel',
	'No elevation data in this file.': 'Geen hoogtegegevens in dit bestand.',
	Map: 'Kaart',
	'Street map background': 'Stratenkaart als achtergrond',
	'Streets from OpenStreetMap, fetched through your own server and cached there.':
		'Straten van OpenStreetMap, opgehaald via je eigen server en daar gecachet.',
	'Loading map data': 'Kaartgegevens laden',
	'The map service is busy, retrying':
		'De kaartdienst is bezet, nieuwe poging',
	'Very large area: showing fewer details.':
		'Zeer groot gebied: minder details.',
	'Very dense area: some detail was skipped.':
		'Zeer dicht gebied: sommige details zijn overgeslagen.',
	'Could not load map data.': 'Kaartgegevens konden niet worden geladen.',
	Text: 'Tekst',
	Font: 'Lettertype',
	'Default (Montserrat)': 'Standaard (Montserrat)',
	Title: 'Titel',
	Subtitle: 'Ondertitel',
	'Stats line': 'Statistiekregel',
	Distance: 'Afstand',
	'Elevation gain': 'Hoogtemeters',
	Time: 'Tijd',
	Pace: 'Tempo',
	Date: 'Datum',
	Divider: 'Scheidingslijn',
	Stats: 'Statistiek',
	Attribution: 'Bronvermelding',
	'Inserts the route as an image plus real text layers, grouped.':
		'Voegt de route in als afbeelding plus echte tekstlagen, gegroepeerd.',
	Cancel: 'Annuleren',
	'Insert Route': 'Route invoegen',
	'Update Route': 'Route bijwerken',
	'Route poster': 'Routeposter',
	'Color mode': 'Kleurmodus',
	Solid: 'Effen',
	'Heart rate': 'Hartslag',
	Elevation: 'Hoogte',
	'Km markers': 'Km-markeringen',
	Off: 'Uit',
	'Corner top left': 'Hoek linksboven',
	'Corner top right': 'Hoek rechtsboven',
	'Route too large for the street map.':
		'Route te groot voor de stratenkaart.',
	'No map data returned for this area.':
		'Geen kaartgegevens ontvangen voor dit gebied.',
	'Demo route - load your own GPX file to replace it.':
		'Demoroute - laad je eigen GPX-bestand om hem te vervangen.',
	'Brand colors': 'Merkkleuren',
	'Use brand colors': 'Merkkleuren gebruiken',
};

const DICTS = { de: DE, es: ES, fr: FR, pt: PT, it: IT, nl: NL };
const DICT = DICTS[ LOCALE.slice( 0, 2 ) ] || null;
export const t = ( s ) => ( DICT && DICT[ s ] ) || s;
